import { Router } from 'express';
import { prisma } from '../db.js';
import { requireUser, publicUser, isStaff } from '../auth.js';
import { moderateFields, getSetting } from '../settings.js';
import { json, uniqueSlug } from '../util.js';
import { partDto } from './catalog.js';

const router = Router();
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const YT_RE = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)[\w-]{6,}([&?#].*)?$/i;

async function deckDto(d, { withParts = false } = {}) {
  const beys = json(d.beysJson, []);
  const base = {
    id: d.id,
    slug: d.slug,
    title: d.title,
    description: d.description,
    launchGuide: d.launchGuide,
    youtubeUrl: d.youtubeUrl,
    status: d.status,
    isPublic: d.isPublic,
    folder: d.folder,
    updatedAt: d.updatedAt,
    featured: d.featuredOrder != null,
    createdAt: d.createdAt,
    author: d.author ? publicUser(d.author) : undefined,
    beys,
  };
  if (withParts) {
    const ids = [...new Set(beys.flat())];
    const parts = await prisma.part.findMany({ where: { id: { in: ids } } });
    base.parts = Object.fromEntries(parts.map((p) => [p.id, partDto(p)]));
  }
  return base;
}

async function validateBeys(beysInput) {
  if (!Array.isArray(beysInput) || beysInput.length < 1 || beysInput.length > 3) return null;
  const beys = beysInput.map((b) => (Array.isArray(b) ? b.map(String).slice(0, 7) : [])).filter((b) => b.length);
  if (!beys.length) return null;
  const ids = [...new Set(beys.flat())];
  const found = await prisma.part.count({ where: { id: { in: ids } } });
  if (found !== ids.length) return null;
  return beys;
}

router.get('/api/decks', ah(async (req, res) => {
  const { query = '', author = '', featured = '', mine = '' } = req.query;
  const where = { status: 'VISIBLE', isPublic: true };
  if (isStaff(req.user) && req.query.all === '1') { delete where.status; delete where.isPublic; }
  if (featured === '1') where.featuredOrder = { not: null };
  if (author) {
    where.author = { slug: String(author) };
    // o próprio autor (ou a staff) enxerga os decks privados na sua listagem
    if (req.user && (req.user.slug === String(author) || isStaff(req.user))) delete where.isPublic;
  }
  if (mine === '1') {
    if (!req.user) return res.json({ decks: [] });
    where.authorId = req.user.id;
    delete where.author;
    delete where.isPublic;
  }
  let decks = await prisma.communityDeck.findMany({
    where,
    include: { author: true },
    orderBy: featured === '1'
      ? [{ featuredOrder: 'asc' }]
      : String(req.query.sort) === 'title'
        ? [{ title: 'asc' }]
        : String(req.query.sort) === 'updated'
          ? [{ updatedAt: 'desc' }]
          : [{ createdAt: 'desc' }],
    take: 200,
  });
  const q = String(query).toLowerCase().trim();
  if (q) decks = decks.filter((d) => [d.title, d.description, d.author?.name].some((v) => v && v.toLowerCase().includes(q)));
  res.json({ decks: await Promise.all(decks.map((d) => deckDto(d))) });
}));

/** Destaques da home (item 8): fixados pelo admin primeiro, depois recentes. */
router.get('/api/decks-featured', ah(async (_req, res) => {
  const pinned = await prisma.communityDeck.findMany({
    where: { status: 'VISIBLE', isPublic: true, featuredOrder: { not: null } },
    include: { author: true },
    orderBy: { featuredOrder: 'asc' },
    take: 6,
  });
  const fill = pinned.length < 6
    ? await prisma.communityDeck.findMany({
        where: { status: 'VISIBLE', isPublic: true, featuredOrder: null },
        include: { author: true },
        orderBy: { createdAt: 'desc' },
        take: 6 - pinned.length,
      })
    : [];
  res.json({ decks: await Promise.all([...pinned, ...fill].map((d) => deckDto(d, { withParts: true }))) });
}));

router.get('/api/decks/:slug', ah(async (req, res) => {
  const deck = await prisma.communityDeck.findUnique({
    where: { slug: req.params.slug },
    include: { author: true },
  });
  const isOwner = deck && req.user && deck.authorId === req.user.id;
  const restrito = deck && (deck.status !== 'VISIBLE' || !deck.isPublic);
  if (!deck || (restrito && !isOwner && !isStaff(req.user))) {
    return res.status(404).json({ error: 'Deck não encontrado.' });
  }
  const frame = deck.author.frameId ? await prisma.cosmetic.findUnique({ where: { id: deck.author.frameId } }) : null;
  const dto = await deckDto(deck, { withParts: true });
  dto.author = publicUser(deck.author, { cosmetics: { frame, stickers: [] } });
  res.json({ deck: dto });
}));

router.post('/api/decks', requireUser, moderateFields('title', 'description', 'launchGuide'), ah(async (req, res) => {
  const flags = await getSetting('flags');
  if (flags.decks === false) return res.status(403).json({ error: 'Publicação de decks está temporariamente desativada.' });
  const b = req.body || {};
  const title = String(b.title || '').trim().slice(0, 80);
  if (!title) return res.status(422).json({ error: 'Dê um título ao deck.' });
  const beys = await validateBeys(b.beys);
  if (!beys) return res.status(422).json({ error: 'Deck inválido — monte de 1 a 3 Beys com peças do catálogo.' });
  const youtubeUrl = String(b.youtubeUrl || '').trim();
  if (youtubeUrl && !YT_RE.test(youtubeUrl)) return res.status(422).json({ error: 'Link do YouTube inválido.' });

  const deck = await prisma.communityDeck.create({
    data: {
      slug: await uniqueSlug(prisma.communityDeck, title),
      authorId: req.user.id,
      title,
      description: String(b.description || '').slice(0, 2000) || null,
      launchGuide: String(b.launchGuide || '').slice(0, 2000) || null,
      youtubeUrl: youtubeUrl || null,
      beysJson: JSON.stringify(beys),
      isPublic: b.isPublic !== false,
      folder: String(b.folder || '').trim().slice(0, 40) || null,
    },
  });
  res.json({ deck: await deckDto(deck) });
}));

router.patch('/api/decks/:id', requireUser, moderateFields('title', 'description', 'launchGuide'), ah(async (req, res) => {
  const deck = await prisma.communityDeck.findUnique({ where: { id: req.params.id } });
  if (!deck) return res.status(404).json({ error: 'Deck não encontrado.' });
  if (deck.authorId !== req.user.id && !isStaff(req.user)) return res.status(403).json({ error: 'Sem permissão.' });
  const b = req.body || {};
  const data = {};
  if (typeof b.title === 'string' && b.title.trim()) data.title = b.title.trim().slice(0, 80);
  if ('description' in b) data.description = String(b.description || '').slice(0, 2000) || null;
  if ('launchGuide' in b) data.launchGuide = String(b.launchGuide || '').slice(0, 2000) || null;
  if ('youtubeUrl' in b) {
    const url = String(b.youtubeUrl || '').trim();
    if (url && !YT_RE.test(url)) return res.status(422).json({ error: 'Link do YouTube inválido.' });
    data.youtubeUrl = url || null;
  }
  if (b.beys) {
    const beys = await validateBeys(b.beys);
    if (!beys) return res.status(422).json({ error: 'Deck inválido.' });
    data.beysJson = JSON.stringify(beys);
  }
  if ('folder' in b) data.folder = String(b.folder || '').trim().slice(0, 40) || null;
  if ('isPublic' in b) {
    data.isPublic = !!b.isPublic;
    // um deck que vira privado sai dos destaques da home
    if (!data.isPublic) data.featuredOrder = null;
  }
  const updated = await prisma.communityDeck.update({ where: { id: deck.id }, data, include: { author: true } });
  res.json({ deck: await deckDto(updated) });
}));

/** Duplica um deck do próprio usuário (a cópia nasce privada). */
router.post('/api/decks/:id/duplicate', requireUser, ah(async (req, res) => {
  const src = await prisma.communityDeck.findUnique({ where: { id: req.params.id } });
  if (!src) return res.status(404).json({ error: 'Deck não encontrado.' });
  if (src.authorId !== req.user.id && (!src.isPublic || src.status !== 'VISIBLE')) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }
  const title = `${src.title} (cópia)`.slice(0, 80);
  const deck = await prisma.communityDeck.create({
    data: {
      slug: await uniqueSlug(prisma.communityDeck, title),
      authorId: req.user.id,
      title,
      description: src.description,
      launchGuide: src.launchGuide,
      youtubeUrl: src.youtubeUrl,
      beysJson: src.beysJson,
      folder: src.authorId === req.user.id ? src.folder : null,
      isPublic: false,
    },
  });
  res.json({ deck: await deckDto(deck) });
}));

/** Renomeia (ou esvazia) uma pasta inteira do arquivo pessoal. */
router.post('/api/me/deck-folders/rename', requireUser, ah(async (req, res) => {
  const from = String(req.body?.from || '').trim();
  const to = String(req.body?.to || '').trim().slice(0, 40) || null;
  if (!from) return res.status(422).json({ error: 'Pasta inválida.' });
  const r = await prisma.communityDeck.updateMany({
    where: { authorId: req.user.id, folder: from },
    data: { folder: to },
  });
  res.json({ ok: true, count: r.count });
}));

router.delete('/api/decks/:id', requireUser, ah(async (req, res) => {
  const deck = await prisma.communityDeck.findUnique({ where: { id: req.params.id } });
  if (!deck) return res.status(404).json({ error: 'Deck não encontrado.' });
  if (deck.authorId !== req.user.id && !isStaff(req.user)) return res.status(403).json({ error: 'Sem permissão.' });
  await prisma.communityDeck.delete({ where: { id: deck.id } });
  res.json({ ok: true });
}));

export default router;
