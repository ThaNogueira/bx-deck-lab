import { Router } from 'express';
import { prisma } from '../db.js';
import { requireRole, publicUser } from '../auth.js';
import { audit } from '../audit.js';
import { getSetting, setSetting, DEFAULTS } from '../settings.js';
import { upload, uploadedUrl } from '../uploads.js';
import { syncAll } from '../sync.js';
import { isValidKind, json, slugify, uniqueSlug } from '../util.js';
import { invalidatePartsIndex, partDto, productDto } from './catalog.js';

/**
 * Painel de admin (item 2). Moderação de conteúdo/denúncias exige MOD;
 * gestão de usuários, catálogo, configurações e afins exige ADMIN.
 */

const router = Router();
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const MOD = requireRole('MOD');
const ADMIN = requireRole('ADMIN');

// ---------------------------------------------------------------------------
// 2.1 Dashboard
// ---------------------------------------------------------------------------

router.get('/api/admin/stats', MOD, ah(async (_req, res) => {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [users, newUsers, decks, tournamentsActive, listings, combosForSale, reportsOpen, recentUsers, recentDecks, traffic] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gt: since } } }),
      prisma.communityDeck.count(),
      prisma.tournament.count({ where: { status: { in: ['OPEN', 'RUNNING'] } } }),
      prisma.collectionItem.count({ where: { forSale: true, hidden: false } }),
      prisma.combo.count({ where: { forSale: true, status: 'VISIBLE' } }),
      prisma.report.count({ where: { status: 'OPEN' } }),
      prisma.user.findMany({ where: { createdAt: { gt: since } }, select: { createdAt: true } }),
      prisma.communityDeck.findMany({ where: { createdAt: { gt: since } }, select: { createdAt: true } }),
      getSetting('traffic'),
    ]);

  // Séries diárias (30 dias) para os gráficos do dashboard
  const days = [...Array(30)].map((_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86_400_000);
    return d.toISOString().slice(0, 10);
  });
  const bucket = (rows) => {
    const map = Object.fromEntries(days.map((d) => [d, 0]));
    rows.forEach((r) => {
      const k = r.createdAt.toISOString().slice(0, 10);
      if (k in map) map[k]++;
    });
    return days.map((d) => ({ day: d, count: map[d] }));
  };

  res.json({
    totals: { users, newUsers30d: newUsers, decks, tournamentsActive, listings: listings + combosForSale, reportsOpen },
    signupsSeries: bucket(recentUsers),
    decksSeries: bucket(recentDecks),
    trafficSeries: days.map((d) => ({ day: d, count: traffic?.[d] ?? 0 })),
  });
}));

// ---------------------------------------------------------------------------
// 2.2 Usuários
// ---------------------------------------------------------------------------

const adminUserDto = (u) => ({
  ...publicUser(u),
  email: u.email,
  whatsapp: u.whatsapp,
  status: u.status,
  statusReason: u.statusReason,
  suspendedUntil: u.suspendedUntil,
  canSell: u.canSell,
  lastLoginAt: u.lastLoginAt,
});

router.get('/api/admin/users', ADMIN, ah(async (req, res) => {
  const { query = '', role = '', status = '' } = req.query;
  const where = {};
  if (role) where.role = String(role);
  if (status) where.status = String(status);
  let users = await prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
  const q = String(query).toLowerCase().trim();
  if (q) users = users.filter((u) => [u.name, u.email, u.slug].some((v) => v && v.toLowerCase().includes(q)));
  res.json({ users: users.map(adminUserDto) });
}));

router.get('/api/admin/users/:id', ADMIN, ah(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const [decks, combos, saleItems, entries] = await Promise.all([
    prisma.communityDeck.count({ where: { authorId: u.id } }),
    prisma.combo.count({ where: { userId: u.id } }),
    prisma.collectionItem.count({ where: { userId: u.id, forSale: true } }),
    prisma.tournamentPlayer.count({ where: { userId: u.id } }),
  ]);
  res.json({ user: adminUserDto(u), counts: { decks, combos, saleItems, tournaments: entries } });
}));

router.patch('/api/admin/users/:id', ADMIN, ah(async (req, res) => {
  const b = req.body || {};
  const data = {};
  for (const f of ['name', 'bio', 'whatsapp', 'avatarUrl', 'bannerUrl']) {
    if (f in b) data[f] = b[f] == null ? null : String(b[f]).slice(0, f === 'bio' ? 500 : 300) || null;
  }
  if (b.name) data.name = String(b.name).trim().slice(0, 40);
  if ('verified' in b) data.verified = !!b.verified;
  if ('canSell' in b) data.canSell = !!b.canSell;
  if (b.role && ['USER', 'ORGANIZER', 'MOD', 'ADMIN'].includes(b.role)) data.role = b.role;
  const u = await prisma.user.update({ where: { id: req.params.id }, data });
  await audit(req.user, 'admin.user.update', 'USER', u.id, { fields: Object.keys(data) });
  res.json({ user: adminUserDto(u) });
}));

/** Banir / suspender / reativar (2.2). */
router.post('/api/admin/users/:id/status', ADMIN, ah(async (req, res) => {
  const { status, reason = '', days = 7 } = req.body || {};
  if (!['ACTIVE', 'SUSPENDED', 'BANNED'].includes(status)) return res.status(422).json({ error: 'Status inválido.' });
  if (req.params.id === req.user.id) return res.status(422).json({ error: 'Você não pode alterar o próprio status.' });
  const data = { status, statusReason: String(reason).slice(0, 300) || null, suspendedUntil: null };
  if (status === 'SUSPENDED') data.suspendedUntil = new Date(Date.now() + Math.max(1, Math.min(365, parseInt(days, 10) || 7)) * 86_400_000);
  if (status === 'ACTIVE') data.statusReason = null;
  const u = await prisma.user.update({ where: { id: req.params.id }, data });
  if (status !== 'ACTIVE') await prisma.authSession.deleteMany({ where: { userId: u.id } });
  await audit(req.user, `admin.user.${status.toLowerCase()}`, 'USER', u.id, { reason, days });
  res.json({ user: adminUserDto(u) });
}));

/** Resetar avatar/banner/nome com conteúdo impróprio (2.2). */
router.post('/api/admin/users/:id/reset-media', ADMIN, ah(async (req, res) => {
  const { avatar, banner, name } = req.body || {};
  const data = {};
  if (avatar) data.avatarUrl = null;
  if (banner) data.bannerUrl = null;
  if (name) data.name = `Blader ${req.params.id.slice(-4)}`;
  const u = await prisma.user.update({ where: { id: req.params.id }, data });
  await audit(req.user, 'admin.user.reset-media', 'USER', u.id, { avatar: !!avatar, banner: !!banner, name: !!name });
  res.json({ user: adminUserDto(u) });
}));

router.delete('/api/admin/users/:id', ADMIN, ah(async (req, res) => {
  if (req.params.id === req.user.id) return res.status(422).json({ error: 'Você não pode excluir a própria conta por aqui.' });
  const u = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (req.body?.confirmEmail !== u.email) {
    return res.status(422).json({ error: 'Confirmação dupla: envie confirmEmail com o e-mail exato da conta.' });
  }
  await prisma.user.delete({ where: { id: u.id } });
  await audit(req.user, 'admin.user.delete', 'USER', u.id, { email: u.email });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// 2.3 Moderação de conteúdo e denúncias
// ---------------------------------------------------------------------------

router.get('/api/admin/moderation/queue', MOD, ah(async (_req, res) => {
  const [decks, combos, listings, users] = await Promise.all([
    prisma.communityDeck.findMany({ include: { author: true }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.combo.findMany({ include: { user: true }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.collectionItem.findMany({ where: { forSale: true }, include: { user: true }, take: 50 }),
    prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  const partIds = [...new Set(listings.map((l) => l.partId))];
  const parts = await prisma.part.findMany({ where: { id: { in: partIds } } });
  const partName = new Map(parts.map((p) => [p.id, p.displayName]));
  res.json({
    decks: decks.map((d) => ({ id: d.id, slug: d.slug, title: d.title, status: d.status, author: publicUser(d.author), createdAt: d.createdAt, description: d.description })),
    combos: combos.map((c) => ({ id: c.id, title: c.title, status: c.status, forSale: c.forSale, author: publicUser(c.user), createdAt: c.createdAt })),
    listings: listings.map((l) => ({ id: l.id, part: partName.get(l.partId) ?? l.partId, hidden: l.hidden, priceCents: l.priceCents, seller: publicUser(l.user) })),
    newUsers: users.map((u) => ({ id: u.id, name: u.name, slug: u.slug, bio: u.bio, avatarUrl: u.avatarUrl, createdAt: u.createdAt })),
  });
}));

router.get('/api/admin/reports', MOD, ah(async (req, res) => {
  const status = String(req.query.status || 'OPEN');
  const reports = await prisma.report.findMany({
    where: status === 'ALL' ? {} : { status },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const reporterIds = [...new Set(reports.map((r) => r.reporterId).filter(Boolean))];
  const reporters = await prisma.user.findMany({ where: { id: { in: reporterIds } } });
  const byId = new Map(reporters.map((u) => [u.id, publicUser(u)]));
  res.json({ reports: reports.map((r) => ({ ...r, reporter: byId.get(r.reporterId) ?? null })) });
}));

router.post('/api/admin/reports/:id/resolve', MOD, ah(async (req, res) => {
  const { status = 'RESOLVED', resolution = '' } = req.body || {};
  if (!['RESOLVED', 'IGNORED'].includes(status)) return res.status(422).json({ error: 'Status inválido.' });
  const r = await prisma.report.update({
    where: { id: req.params.id },
    data: { status, resolution: String(resolution).slice(0, 500) || null, handledById: req.user.id, handledAt: new Date() },
  });
  await audit(req.user, 'admin.report.resolve', r.targetType, r.targetId, { reportId: r.id, status });
  res.json({ report: r });
}));

/** Ocultar/mostrar ou excluir qualquer conteúdo (2.3). */
router.post('/api/admin/content/:type/:id/visibility', MOD, ah(async (req, res) => {
  const hidden = !!req.body?.hidden;
  const { type, id } = req.params;
  if (type === 'deck') await prisma.communityDeck.update({ where: { id }, data: { status: hidden ? 'HIDDEN' : 'VISIBLE' } });
  else if (type === 'combo') await prisma.combo.update({ where: { id }, data: { status: hidden ? 'HIDDEN' : 'VISIBLE' } });
  else if (type === 'listing') await prisma.collectionItem.update({ where: { id }, data: { hidden } });
  else return res.status(422).json({ error: 'Tipo inválido.' });
  await audit(req.user, `admin.content.${hidden ? 'hide' : 'show'}`, type.toUpperCase(), id);
  res.json({ ok: true });
}));

router.delete('/api/admin/content/:type/:id', MOD, ah(async (req, res) => {
  const { type, id } = req.params;
  if (type === 'deck') await prisma.communityDeck.delete({ where: { id } });
  else if (type === 'combo') await prisma.combo.delete({ where: { id } });
  else if (type === 'listing') await prisma.collectionItem.update({ where: { id }, data: { forSale: false, hidden: true } });
  else return res.status(422).json({ error: 'Tipo inválido.' });
  await audit(req.user, 'admin.content.delete', type.toUpperCase(), id);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// 2.4 Catálogo (peças e produtos)
// ---------------------------------------------------------------------------

router.post('/api/admin/parts', ADMIN, ah(async (req, res) => {
  const b = req.body || {};
  if (!isValidKind(b.kind)) return res.status(422).json({ error: 'Categoria inválida.' });
  const name = String(b.name || '').trim().slice(0, 80);
  if (!name) return res.status(422).json({ error: 'Nome obrigatório.' });
  const part = await prisma.part.create({
    data: {
      slug: await uniqueSlug(prisma.part, b.displayName || name),
      kind: b.kind,
      subKind: ['INTEGRATED', 'RIB'].includes(b.subKind) ? b.subKind : null,
      name,
      displayName: String(b.displayName || name).trim().slice(0, 80),
      aliasesJson: JSON.stringify(Array.isArray(b.aliases) ? b.aliases.slice(0, 10) : []),
      abbrev: String(b.abbrev || '').slice(0, 12) || null,
      type: ['Attack', 'Defense', 'Stamina', 'Balance'].includes(b.type) ? b.type : null,
      statsJson: b.stats ? JSON.stringify(b.stats) : null,
      note: String(b.note || '').slice(0, 1000) || null,
      behavior: String(b.behavior || '').slice(0, 1000) || null,
      banned: !!b.banned,
      source: 'admin',
    },
  });
  invalidatePartsIndex();
  await audit(req.user, 'admin.part.create', 'PART', part.id, { name });
  res.json({ part: partDto(part) });
}));

router.patch('/api/admin/parts/:id', ADMIN, ah(async (req, res) => {
  const b = req.body || {};
  const data = {};
  if (b.kind && isValidKind(b.kind)) data.kind = b.kind; // mover de categoria (2.4)
  if ('subKind' in b) data.subKind = ['INTEGRATED', 'RIB'].includes(b.subKind) ? b.subKind : null;
  if (typeof b.name === 'string' && b.name.trim()) data.name = b.name.trim().slice(0, 80);
  if (typeof b.displayName === 'string' && b.displayName.trim()) data.displayName = b.displayName.trim().slice(0, 80);
  if (Array.isArray(b.aliases)) data.aliasesJson = JSON.stringify(b.aliases.slice(0, 10));
  if ('abbrev' in b) data.abbrev = String(b.abbrev || '').slice(0, 12) || null;
  if ('type' in b) data.type = ['Attack', 'Defense', 'Stamina', 'Balance'].includes(b.type) ? b.type : null;
  if ('stats' in b) data.statsJson = b.stats ? JSON.stringify(b.stats) : null;
  if ('note' in b) data.note = String(b.note || '').slice(0, 1000) || null;
  if ('behavior' in b) data.behavior = String(b.behavior || '').slice(0, 1000) || null;
  if ('banned' in b) data.banned = !!b.banned;
  if ('hidden' in b) data.hidden = !!b.hidden;
  if ('imageUrl' in b) data.imageUrl = String(b.imageUrl || '').slice(0, 500) || null;
  const part = await prisma.part.update({ where: { id: req.params.id }, data });
  invalidatePartsIndex();
  await audit(req.user, 'admin.part.update', 'PART', part.id, { fields: Object.keys(data) });
  res.json({ part: partDto(part) });
}));

router.post('/api/admin/parts/:id/image', ADMIN, upload.single('file'), ah(async (req, res) => {
  if (!req.file) return res.status(422).json({ error: 'Envie um arquivo.' });
  const part = await prisma.part.update({ where: { id: req.params.id }, data: { imageUrl: uploadedUrl(req.file) } });
  invalidatePartsIndex();
  await audit(req.user, 'admin.part.image', 'PART', part.id);
  res.json({ part: partDto(part) });
}));

router.delete('/api/admin/parts/:id', ADMIN, ah(async (req, res) => {
  const part = await prisma.part.delete({ where: { id: req.params.id } });
  invalidatePartsIndex();
  await audit(req.user, 'admin.part.delete', 'PART', part.id, { name: part.displayName });
  res.json({ ok: true });
}));

/** Mesclar peças duplicadas (2.4): move relações e apaga a duplicada. */
router.post('/api/admin/parts/merge', ADMIN, ah(async (req, res) => {
  const { fromId, toId } = req.body || {};
  if (!fromId || !toId || fromId === toId) return res.status(422).json({ error: 'Escolha duas peças diferentes.' });
  const [from, to] = await Promise.all([
    prisma.part.findUnique({ where: { id: fromId } }),
    prisma.part.findUnique({ where: { id: toId } }),
  ]);
  if (!from || !to) return res.status(404).json({ error: 'Peça não encontrada.' });

  // Relações produto↔peça
  const links = await prisma.productPart.findMany({ where: { partId: from.id } });
  for (const link of links) {
    await prisma.productPart.upsert({
      where: { productId_partId: { productId: link.productId, partId: to.id } },
      update: {},
      create: { productId: link.productId, partId: to.id, qty: link.qty },
    });
  }
  // Coleções (somando quantidades)
  const items = await prisma.collectionItem.findMany({ where: { partId: from.id } });
  for (const item of items) {
    const existing = await prisma.collectionItem.findUnique({
      where: { userId_partId: { userId: item.userId, partId: to.id } },
    });
    if (existing) await prisma.collectionItem.update({ where: { id: existing.id }, data: { qty: existing.qty + item.qty } });
    else await prisma.collectionItem.create({ data: { userId: item.userId, partId: to.id, qty: item.qty, forSale: item.forSale, condition: item.condition, priceCents: item.priceCents } });
  }
  // Referências em JSON (decks e combos)
  const decks = await prisma.communityDeck.findMany({ where: { beysJson: { contains: from.id } } });
  for (const d of decks) {
    const beys = json(d.beysJson, []).map((bey) => bey.map((id) => (id === from.id ? to.id : id)));
    await prisma.communityDeck.update({ where: { id: d.id }, data: { beysJson: JSON.stringify(beys) } });
  }
  const combos = await prisma.combo.findMany({ where: { partsJson: { contains: from.id } } });
  for (const c of combos) {
    const parts = json(c.partsJson, []).map((id) => (id === from.id ? to.id : id));
    await prisma.combo.update({ where: { id: c.id }, data: { partsJson: JSON.stringify(parts) } });
  }
  await prisma.user.updateMany({ where: { favoritePartId: from.id }, data: { favoritePartId: to.id } });

  // Preserva aliases e apaga a duplicada
  const aliases = [...new Set([...json(to.aliasesJson, []), from.name, from.displayName, ...json(from.aliasesJson, [])])]
    .filter((a) => a && a !== to.name && a !== to.displayName);
  await prisma.part.update({ where: { id: to.id }, data: { aliasesJson: JSON.stringify(aliases) } });
  await prisma.part.delete({ where: { id: from.id } });
  invalidatePartsIndex();
  await audit(req.user, 'admin.part.merge', 'PART', to.id, { merged: from.displayName });
  res.json({ ok: true, part: partDto(await prisma.part.findUnique({ where: { id: to.id } })) });
}));

router.post('/api/admin/products', ADMIN, ah(async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 120);
  if (!name) return res.status(422).json({ error: 'Nome obrigatório.' });
  const product = await prisma.product.create({
    data: {
      slug: await uniqueSlug(prisma.product, `${b.code || ''} ${name}`),
      code: String(b.code || '').toUpperCase().slice(0, 20) || null,
      line: ['BX', 'UX', 'CX', 'HASBRO', 'OTHER'].includes(b.line) ? b.line : null,
      name,
      brand: ['TAKARA_TOMY', 'HASBRO', 'OTHER'].includes(b.brand) ? b.brand : 'TAKARA_TOMY',
      category: String(b.category || '').slice(0, 30) || null,
      beyType: String(b.beyType || '').slice(0, 20) || null,
      releaseDate: b.releaseDate ? new Date(b.releaseDate) : null,
      notes: String(b.notes || '').slice(0, 500) || null,
    },
  });
  await audit(req.user, 'admin.product.create', 'PRODUCT', product.id, { name });
  res.json({ product: productDto(product) });
}));

router.patch('/api/admin/products/:id', ADMIN, ah(async (req, res) => {
  const b = req.body || {};
  const data = {};
  if (typeof b.name === 'string' && b.name.trim()) data.name = b.name.trim().slice(0, 120);
  if ('code' in b) data.code = String(b.code || '').toUpperCase().slice(0, 20) || null;
  if ('line' in b) data.line = ['BX', 'UX', 'CX', 'HASBRO', 'OTHER'].includes(b.line) ? b.line : null;
  if ('brand' in b && ['TAKARA_TOMY', 'HASBRO', 'OTHER'].includes(b.brand)) data.brand = b.brand;
  if ('category' in b) data.category = String(b.category || '').slice(0, 30) || null;
  if ('beyType' in b) data.beyType = String(b.beyType || '').slice(0, 20) || null;
  if ('releaseDate' in b) data.releaseDate = b.releaseDate ? new Date(b.releaseDate) : null;
  if ('notes' in b) data.notes = String(b.notes || '').slice(0, 500) || null;
  if ('hidden' in b) data.hidden = !!b.hidden;
  if ('imageUrl' in b) data.imageUrl = String(b.imageUrl || '').slice(0, 500) || null;
  const product = await prisma.product.update({ where: { id: req.params.id }, data });
  await audit(req.user, 'admin.product.update', 'PRODUCT', product.id, { fields: Object.keys(data) });
  res.json({ product: productDto(product) });
}));

router.post('/api/admin/products/:id/image', ADMIN, upload.single('file'), ah(async (req, res) => {
  if (!req.file) return res.status(422).json({ error: 'Envie um arquivo.' });
  const product = await prisma.product.update({ where: { id: req.params.id }, data: { imageUrl: uploadedUrl(req.file) } });
  await audit(req.user, 'admin.product.image', 'PRODUCT', product.id);
  res.json({ product: productDto(product) });
}));

router.delete('/api/admin/products/:id', ADMIN, ah(async (req, res) => {
  const product = await prisma.product.delete({ where: { id: req.params.id } });
  await audit(req.user, 'admin.product.delete', 'PRODUCT', product.id, { name: product.name });
  res.json({ ok: true });
}));

/** Relação peça ↔ produto (base do item 5). */
router.put('/api/admin/products/:id/parts', ADMIN, ah(async (req, res) => {
  const partIds = Array.isArray(req.body?.partIds) ? [...new Set(req.body.partIds.map(String))].slice(0, 30) : [];
  const found = await prisma.part.count({ where: { id: { in: partIds } } });
  if (found !== partIds.length) return res.status(422).json({ error: 'Alguma peça não existe.' });
  await prisma.productPart.deleteMany({ where: { productId: req.params.id } });
  for (const partId of partIds) {
    await prisma.productPart.create({ data: { productId: req.params.id, partId } });
  }
  await audit(req.user, 'admin.product.parts', 'PRODUCT', req.params.id, { count: partIds.length });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// 2.5 Torneios / 2.6 Marketplace
// ---------------------------------------------------------------------------

router.get('/api/admin/tournaments', MOD, ah(async (_req, res) => {
  const list = await prisma.tournament.findMany({
    include: { organizer: true, players: true },
    orderBy: { startsAt: 'desc' },
    take: 300,
  });
  res.json({
    tournaments: list.map((t) => ({
      id: t.id, slug: t.slug, name: t.name, status: t.status, startsAt: t.startsAt,
      storeName: t.storeName, currentRound: t.currentRound, roundsPlanned: t.roundsPlanned,
      playersCount: t.players.length, organizer: publicUser(t.organizer),
    })),
  });
}));

router.get('/api/admin/market', MOD, ah(async (_req, res) => {
  const [items, combos] = await Promise.all([
    prisma.collectionItem.findMany({ where: { forSale: true }, include: { user: true }, take: 500 }),
    prisma.combo.findMany({ where: { forSale: true }, include: { user: true }, take: 300 }),
  ]);
  const parts = await prisma.part.findMany({ where: { id: { in: items.map((i) => i.partId) } } });
  const partName = new Map(parts.map((p) => [p.id, p.displayName]));
  res.json({
    items: items.map((i) => ({
      id: i.id, part: partName.get(i.partId) ?? i.partId, qty: i.qty, priceCents: i.priceCents,
      condition: i.condition, hidden: i.hidden, seller: { ...publicUser(i.user), canSell: i.user.canSell },
    })),
    combos: combos.map((c) => ({
      id: c.id, title: c.title, priceCents: c.priceCents, status: c.status,
      seller: { ...publicUser(c.user), canSell: c.user.canSell },
    })),
  });
}));

// ---------------------------------------------------------------------------
// 2.7 Cosméticos
// ---------------------------------------------------------------------------

router.get('/api/admin/cosmetics', ADMIN, ah(async (_req, res) => {
  const cosmetics = await prisma.cosmetic.findMany({ orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }] });
  res.json({ cosmetics });
}));

router.post('/api/admin/cosmetics', ADMIN, upload.single('file'), ah(async (req, res) => {
  const b = req.body || {};
  const kind = b.kind === 'STICKER' ? 'STICKER' : 'FRAME';
  const name = String(b.name || '').trim().slice(0, 60);
  if (!name) return res.status(422).json({ error: 'Nome obrigatório.' });
  const cosmetic = await prisma.cosmetic.create({
    data: {
      kind,
      name,
      imageUrl: uploadedUrl(req.file),
      styleKey: String(b.styleKey || '').slice(0, 30) || null,
      isDefault: b.isDefault === 'true' || b.isDefault === true,
    },
  });
  await audit(req.user, 'admin.cosmetic.create', 'COSMETIC', cosmetic.id, { name });
  res.json({ cosmetic });
}));

router.patch('/api/admin/cosmetics/:id', ADMIN, ah(async (req, res) => {
  const b = req.body || {};
  const data = {};
  if (typeof b.name === 'string' && b.name.trim()) data.name = b.name.trim().slice(0, 60);
  if ('active' in b) data.active = !!b.active;
  if ('isDefault' in b) data.isDefault = !!b.isDefault;
  if ('styleKey' in b) data.styleKey = String(b.styleKey || '').slice(0, 30) || null;
  const cosmetic = await prisma.cosmetic.update({ where: { id: req.params.id }, data });
  await audit(req.user, 'admin.cosmetic.update', 'COSMETIC', cosmetic.id);
  res.json({ cosmetic });
}));

router.delete('/api/admin/cosmetics/:id', ADMIN, ah(async (req, res) => {
  await prisma.cosmetic.delete({ where: { id: req.params.id } });
  await audit(req.user, 'admin.cosmetic.delete', 'COSMETIC', req.params.id);
  res.json({ ok: true });
}));

/** Conceder cosmético exclusivo (ex.: prêmio de torneio — 2.7). */
router.post('/api/admin/cosmetics/:id/grant', ADMIN, ah(async (req, res) => {
  const target = await prisma.user.findFirst({
    where: { OR: [{ slug: String(req.body?.user || '') }, { email: String(req.body?.user || '').toLowerCase() }] },
  });
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });
  await prisma.cosmeticGrant.upsert({
    where: { userId_cosmeticId: { userId: target.id, cosmeticId: req.params.id } },
    update: {},
    create: { userId: target.id, cosmeticId: req.params.id, grantedById: req.user.id },
  });
  await audit(req.user, 'admin.cosmetic.grant', 'USER', target.id, { cosmeticId: req.params.id });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// 2.8 Home e meta
// ---------------------------------------------------------------------------

router.post('/api/admin/decks/:id/feature', ADMIN, ah(async (req, res) => {
  const order = req.body?.order == null ? null : Math.max(0, parseInt(req.body.order, 10) || 0);
  const deck = await prisma.communityDeck.update({ where: { id: req.params.id }, data: { featuredOrder: order } });
  await audit(req.user, order == null ? 'admin.deck.unfeature' : 'admin.deck.feature', 'DECK', deck.id, { order });
  res.json({ ok: true });
}));

router.post('/api/admin/sync/products', ADMIN, ah(async (req, res) => {
  const result = await syncAll(req.user);
  await audit(req.user, 'admin.sync.catalog', null, null, result);
  res.json(result);
}));

router.get('/api/admin/sync/logs', MOD, ah(async (_req, res) => {
  const logs = await prisma.syncLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ logs });
}));

router.get('/api/admin/announcements', ADMIN, ah(async (_req, res) => {
  res.json({ announcements: await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }) });
}));

router.post('/api/admin/announcements', ADMIN, ah(async (req, res) => {
  const b = req.body || {};
  const message = String(b.message || '').trim().slice(0, 300);
  if (!message) return res.status(422).json({ error: 'Mensagem obrigatória.' });
  const a = await prisma.announcement.create({
    data: {
      message,
      href: String(b.href || '').slice(0, 300) || null,
      startsAt: b.startsAt ? new Date(b.startsAt) : null,
      endsAt: b.endsAt ? new Date(b.endsAt) : null,
    },
  });
  await audit(req.user, 'admin.announcement.create', 'ANNOUNCEMENT', a.id);
  res.json({ announcement: a });
}));

router.patch('/api/admin/announcements/:id', ADMIN, ah(async (req, res) => {
  const b = req.body || {};
  const data = {};
  if (typeof b.message === 'string' && b.message.trim()) data.message = b.message.trim().slice(0, 300);
  if ('href' in b) data.href = String(b.href || '').slice(0, 300) || null;
  if ('active' in b) data.active = !!b.active;
  if ('startsAt' in b) data.startsAt = b.startsAt ? new Date(b.startsAt) : null;
  if ('endsAt' in b) data.endsAt = b.endsAt ? new Date(b.endsAt) : null;
  const a = await prisma.announcement.update({ where: { id: req.params.id }, data });
  res.json({ announcement: a });
}));

router.delete('/api/admin/announcements/:id', ADMIN, ah(async (req, res) => {
  await prisma.announcement.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// 2.9 Configurações, manutenção e feature flags / 2.10 Logs
// ---------------------------------------------------------------------------

const EDITABLE_SETTINGS = ['site', 'flags', 'maintenance', 'bannedWords'];

router.get('/api/admin/settings', ADMIN, ah(async (_req, res) => {
  const out = {};
  for (const key of EDITABLE_SETTINGS) out[key] = await getSetting(key);
  res.json({ settings: out });
}));

router.put('/api/admin/settings/:key', ADMIN, ah(async (req, res) => {
  const key = req.params.key;
  if (!EDITABLE_SETTINGS.includes(key)) return res.status(422).json({ error: 'Configuração desconhecida.' });
  const base = DEFAULTS[key];
  let value = req.body?.value;
  if (Array.isArray(base)) {
    if (!Array.isArray(value)) return res.status(422).json({ error: 'Formato inválido (esperado lista).' });
    value = value.map((v) => String(v).trim()).filter(Boolean).slice(0, 500);
  } else if (typeof base === 'object') {
    if (typeof value !== 'object' || value == null || Array.isArray(value)) return res.status(422).json({ error: 'Formato inválido.' });
    value = { ...base, ...value };
  }
  await setSetting(key, value);
  await audit(req.user, 'admin.settings.update', 'SETTING', key);
  res.json({ key, value });
}));

router.get('/api/admin/audit', MOD, ah(async (req, res) => {
  const q = String(req.query.query || '').toLowerCase().trim();
  let logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 300 });
  if (q) logs = logs.filter((l) => [l.action, l.actorName, l.targetType, l.targetId, l.details].some((v) => v && String(v).toLowerCase().includes(q)));
  res.json({ logs });
}));

router.get('/api/admin/errors', MOD, ah(async (_req, res) => {
  const errors = await prisma.errorLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  res.json({ errors });
}));

export default router;
