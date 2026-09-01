import { Router } from 'express';
import { prisma } from '../db.js';
import { requireUser, publicUser, isStaff } from '../auth.js';
import { moderateFields, getSetting } from '../settings.js';
import { upload, uploadedUrl } from '../uploads.js';
import { audit } from '../audit.js';
import { json, waLink } from '../util.js';
import { partDto } from './catalog.js';

const router = Router();
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/** Cosmético pode ser usado se for padrão ativo ou concedido ao usuário. */
async function canUseCosmetic(userId, cosmeticId) {
  const c = await prisma.cosmetic.findUnique({ where: { id: cosmeticId } });
  if (!c || !c.active) return false;
  if (c.isDefault) return true;
  return !!(await prisma.cosmeticGrant.findUnique({
    where: { userId_cosmeticId: { userId, cosmeticId } },
  }));
}

/** Cosméticos disponíveis para escolher (padrão + concedidos). */
router.get('/api/cosmetics', requireUser, ah(async (req, res) => {
  const defaults = await prisma.cosmetic.findMany({ where: { active: true, isDefault: true } });
  const granted = await prisma.cosmeticGrant.findMany({
    where: { userId: req.user.id },
    include: { cosmetic: true },
  });
  const all = [...defaults, ...granted.map((g) => g.cosmetic).filter((c) => c.active)];
  const unique = [...new Map(all.map((c) => [c.id, c])).values()];
  res.json({ cosmetics: unique });
}));

router.patch('/api/me', requireUser, moderateFields('name', 'bio'), ah(async (req, res) => {
  const b = req.body || {};
  const data = {};
  if (typeof b.name === 'string' && b.name.trim()) data.name = b.name.trim().slice(0, 40);
  if (typeof b.bio === 'string') data.bio = b.bio.slice(0, 500);
  if (typeof b.whatsapp === 'string') data.whatsapp = b.whatsapp.replace(/\D/g, '').slice(0, 15) || null;
  if ('favoritePartId' in b) {
    if (b.favoritePartId) {
      const part = await prisma.part.findUnique({ where: { id: b.favoritePartId } });
      if (!part) return res.status(422).json({ error: 'Peça favorita inválida.' });
      data.favoritePartId = part.id;
    } else data.favoritePartId = null;
  }
  if ('frameId' in b) {
    if (b.frameId) {
      if (!(await canUseCosmetic(req.user.id, b.frameId))) return res.status(422).json({ error: 'Moldura indisponível.' });
      data.frameId = b.frameId;
    } else data.frameId = null;
  }
  if (Array.isArray(b.stickers)) {
    const ids = b.stickers.slice(0, 8);
    for (const id of ids) {
      if (!(await canUseCosmetic(req.user.id, id))) return res.status(422).json({ error: 'Sticker indisponível.' });
    }
    data.stickersJson = JSON.stringify(ids);
  }
  const user = await prisma.user.update({ where: { id: req.user.id }, data });
  res.json({ user: publicUser(user) });
}));

for (const field of ['avatar', 'banner']) {
  router.post(`/api/me/${field}`, requireUser, upload.single('file'), ah(async (req, res) => {
    if (!req.file) return res.status(422).json({ error: 'Envie um arquivo.' });
    const url = uploadedUrl(req.file);
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: field === 'avatar' ? { avatarUrl: url } : { bannerUrl: url },
    });
    res.json({ user: publicUser(user), url });
  }));
}

// ---------------------------------------------------------------------------
// Coleção (item 9) — sincroniza com o inventário local do montador
// ---------------------------------------------------------------------------

router.get('/api/me/collection', requireUser, ah(async (req, res) => {
  const items = await prisma.collectionItem.findMany({ where: { userId: req.user.id } });
  const parts = await prisma.part.findMany({ where: { id: { in: items.map((i) => i.partId) } } });
  const byId = new Map(parts.map((p) => [p.id, partDto(p)]));
  res.json({
    items: items.map((i) => ({
      partId: i.partId, qty: i.qty, forSale: i.forSale, condition: i.condition,
      priceCents: i.priceCents, hidden: i.hidden, part: byId.get(i.partId) ?? null,
    })),
  });
}));

/** Importa/mescla a coleção (bulk) — usado pelo botão "enviar coleção" do montador. */
router.put('/api/me/collection', requireUser, ah(async (req, res) => {
  const entries = Array.isArray(req.body?.items) ? req.body.items : [];
  if (entries.length > 2000) return res.status(422).json({ error: 'Coleção grande demais.' });
  const valid = await prisma.part.findMany({
    where: { id: { in: entries.map((e) => String(e.partId)) } },
    select: { id: true },
  });
  const validIds = new Set(valid.map((v) => v.id));
  let count = 0;
  for (const e of entries) {
    const partId = String(e.partId);
    const qty = Math.max(0, Math.min(99, parseInt(e.qty, 10) || 0));
    if (!validIds.has(partId)) continue;
    if (qty === 0) {
      await prisma.collectionItem.deleteMany({ where: { userId: req.user.id, partId, forSale: false } });
      continue;
    }
    await prisma.collectionItem.upsert({
      where: { userId_partId: { userId: req.user.id, partId } },
      update: { qty },
      create: { userId: req.user.id, partId, qty },
    });
    count++;
  }
  res.json({ ok: true, count });
}));

router.patch('/api/me/collection/:partId', requireUser, ah(async (req, res) => {
  const b = req.body || {};
  const where = { userId_partId: { userId: req.user.id, partId: req.params.partId } };
  const existing = await prisma.collectionItem.findUnique({ where });
  if (!existing && !(parseInt(b.qty, 10) > 0)) return res.status(404).json({ error: 'Peça fora da coleção.' });

  const data = {};
  if ('qty' in b) data.qty = Math.max(1, Math.min(99, parseInt(b.qty, 10) || 1));
  if ('condition' in b) data.condition = String(b.condition || '').slice(0, 60) || null;
  if ('priceCents' in b) data.priceCents = b.priceCents == null ? null : Math.max(0, parseInt(b.priceCents, 10) || 0);
  if ('forSale' in b) {
    const flags = await getSetting('flags');
    if (b.forSale && flags.sales === false) return res.status(403).json({ error: 'Vendas estão temporariamente desativadas no site.' });
    if (b.forSale && !req.user.canSell) return res.status(403).json({ error: 'Sua conta está sem permissão de venda.' });
    data.forSale = !!b.forSale;
    if (data.forSale) data.hidden = false;
  }
  const item = existing
    ? await prisma.collectionItem.update({ where, data })
    : await prisma.collectionItem.create({ data: { userId: req.user.id, partId: req.params.partId, ...data } });
  res.json({ item });
}));

router.delete('/api/me/collection/:partId', requireUser, ah(async (req, res) => {
  await prisma.collectionItem.deleteMany({ where: { userId: req.user.id, partId: req.params.partId } });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Combos (item 9)
// ---------------------------------------------------------------------------

router.post('/api/combos', requireUser, moderateFields('title', 'description'), ah(async (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim().slice(0, 80);
  if (!title) return res.status(422).json({ error: 'Dê um nome ao combo.' });
  const partIds = Array.isArray(b.partIds) ? b.partIds.map(String).slice(0, 8) : [];
  const found = await prisma.part.count({ where: { id: { in: partIds } } });
  if (!partIds.length || found !== partIds.length) return res.status(422).json({ error: 'Peças do combo inválidas.' });
  if (b.forSale) {
    const flags = await getSetting('flags');
    if (flags.sales === false) return res.status(403).json({ error: 'Vendas estão temporariamente desativadas.' });
    if (!req.user.canSell) return res.status(403).json({ error: 'Sua conta está sem permissão de venda.' });
  }
  const combo = await prisma.combo.create({
    data: {
      userId: req.user.id,
      title,
      description: String(b.description || '').slice(0, 1000) || null,
      partsJson: JSON.stringify(partIds),
      forSale: !!b.forSale,
      condition: String(b.condition || '').slice(0, 60) || null,
      priceCents: b.priceCents == null ? null : Math.max(0, parseInt(b.priceCents, 10) || 0),
    },
  });
  res.json({ combo });
}));

router.patch('/api/combos/:id', requireUser, moderateFields('title', 'description'), ah(async (req, res) => {
  const combo = await prisma.combo.findUnique({ where: { id: req.params.id } });
  if (!combo) return res.status(404).json({ error: 'Combo não encontrado.' });
  if (combo.userId !== req.user.id && !isStaff(req.user)) return res.status(403).json({ error: 'Sem permissão.' });
  const b = req.body || {};
  const data = {};
  if (typeof b.title === 'string' && b.title.trim()) data.title = b.title.trim().slice(0, 80);
  if ('description' in b) data.description = String(b.description || '').slice(0, 1000) || null;
  if ('condition' in b) data.condition = String(b.condition || '').slice(0, 60) || null;
  if ('priceCents' in b) data.priceCents = b.priceCents == null ? null : Math.max(0, parseInt(b.priceCents, 10) || 0);
  if ('forSale' in b) data.forSale = !!b.forSale;
  if (Array.isArray(b.partIds)) {
    const partIds = b.partIds.map(String).slice(0, 8);
    const found = await prisma.part.count({ where: { id: { in: partIds } } });
    if (!partIds.length || found !== partIds.length) return res.status(422).json({ error: 'Peças inválidas.' });
    data.partsJson = JSON.stringify(partIds);
  }
  const updated = await prisma.combo.update({ where: { id: combo.id }, data });
  res.json({ combo: updated });
}));

router.delete('/api/combos/:id', requireUser, ah(async (req, res) => {
  const combo = await prisma.combo.findUnique({ where: { id: req.params.id } });
  if (!combo) return res.status(404).json({ error: 'Combo não encontrado.' });
  if (combo.userId !== req.user.id && !isStaff(req.user)) return res.status(403).json({ error: 'Sem permissão.' });
  await prisma.combo.delete({ where: { id: combo.id } });
  if (combo.userId !== req.user.id) await audit(req.user, 'combo.delete', 'COMBO', combo.id);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Perfil público
// ---------------------------------------------------------------------------

router.get('/api/users/:slug', ah(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { slug: req.params.slug },
    include: { favoritePart: true },
  });
  if (!user || user.status === 'BANNED') return res.status(404).json({ error: 'Perfil não encontrado.' });

  const [items, combos, decks, frame] = await Promise.all([
    prisma.collectionItem.findMany({ where: { userId: user.id } }),
    prisma.combo.findMany({ where: { userId: user.id, status: 'VISIBLE' }, orderBy: { createdAt: 'desc' } }),
    prisma.communityDeck.findMany({ where: { authorId: user.id, status: 'VISIBLE' }, orderBy: { createdAt: 'desc' } }),
    user.frameId ? prisma.cosmetic.findUnique({ where: { id: user.frameId } }) : null,
  ]);
  const stickerIds = json(user.stickersJson, []);
  const stickers = stickerIds.length
    ? await prisma.cosmetic.findMany({ where: { id: { in: stickerIds } } })
    : [];

  const partIds = [...new Set([...items.map((i) => i.partId), ...combos.flatMap((c) => json(c.partsJson, []))])];
  const parts = await prisma.part.findMany({ where: { id: { in: partIds } } });
  const byId = new Map(parts.map((p) => [p.id, partDto(p)]));

  const saleActive = user.status === 'ACTIVE' && user.canSell;
  const waMsgFor = (label) => user.whatsapp ? waLink(user.whatsapp, `Olá! Tenho interesse na peça ${label} que você anunciou no BX Deck Lab.`) : null;

  res.json({
    user: publicUser(user, { cosmetics: { frame, stickers } }),
    favoritePart: user.favoritePart ? partDto(user.favoritePart) : null,
    collection: items.filter((i) => !i.hidden).map((i) => ({
      partId: i.partId, qty: i.qty, part: byId.get(i.partId) ?? null,
      forSale: saleActive && i.forSale,
      condition: i.forSale ? i.condition : null,
      priceCents: i.forSale ? i.priceCents : null,
      whatsappUrl: saleActive && i.forSale ? waMsgFor(byId.get(i.partId)?.displayName ?? 'peça') : null,
    })),
    combos: combos.map((c) => ({
      id: c.id, title: c.title, description: c.description,
      parts: json(c.partsJson, []).map((id) => byId.get(id)).filter(Boolean),
      forSale: saleActive && c.forSale,
      condition: c.forSale ? c.condition : null,
      priceCents: c.forSale ? c.priceCents : null,
      whatsappUrl: saleActive && c.forSale && user.whatsapp
        ? waLink(user.whatsapp, `Olá! Tenho interesse no combo "${c.title}" que você anunciou no BX Deck Lab.`)
        : null,
    })),
    decks: decks.map((d) => ({ slug: d.slug, title: d.title, createdAt: d.createdAt })),
  });
}));

export default router;
