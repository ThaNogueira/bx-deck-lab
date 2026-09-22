import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { prisma } from '../db.js';
import { requireUser, publicUser, isStaff } from '../auth.js';
import { moderateFields, getSetting } from '../settings.js';
import { json, uniqueSlug } from '../util.js';
import { partDto } from './catalog.js';
import { audit } from '../audit.js';
import { getStoredDeckAnalysis, queueDeckAnalysis, isDeckAnalysisPending } from '../deck-analysis.js';
import { standingsOf } from './tournaments.js';
import { UPLOADS_DIR } from '../uploads.js';

const router = Router();
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const YT_RE = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)[\w-]{6,}([&?#].*)?$/i;
const xml = (value = '') => String(value).replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' }[ch]));
const cut = (value, size) => String(value || '').length > size ? `${String(value).slice(0, size - 1)}…` : String(value || '');

async function deckImageAsset(url, size, circle = false) {
  try {
    let source;
    if (String(url || '').startsWith('/uploads/')) source = await fs.readFile(path.join(UPLOADS_DIR, path.basename(url)));
    else if (String(url || '').startsWith('/assets/')) source = await fs.readFile(path.resolve('public', `.${url}`));
    else if (/^https?:\/\//i.test(String(url || ''))) {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'BeyXLab deck image/1.0' } });
      if (!response.ok) return null;
      source = Buffer.from(await response.arrayBuffer());
    } else return null;
    let image = sharp(source, { animated: false }).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png();
    if (circle) image = image.composite([{ input: Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="white"/></svg>`), blend: 'dest-in' }]);
    return `data:image/png;base64,${(await image.toBuffer()).toString('base64')}`;
  } catch { return null; }
}

function radarPoints(stats, cx, cy, radius) {
  const keys = ['atk', 'def', 'sta', 'burst', 'dash'];
  return keys.map((key, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / keys.length);
    const value = Math.min(1, Math.max(.05, Number(stats[key]) / 100));
    return `${(cx + Math.cos(angle) * radius * value).toFixed(1)},${(cy + Math.sin(angle) * radius * value).toFixed(1)}`;
  }).join(' ');
}

async function renderDeckShareImage(deck) {
  const beys = json(deck.beysJson, []);
  const ids = [...new Set(beys.flat())];
  const parts = ids.length ? await prisma.part.findMany({ where: { id: { in: ids } } }) : [];
  const byId = new Map(parts.map((part) => [part.id, partDto(part)]));
  const combos = beys.map((ids) => ids.map((id) => byId.get(id)).filter(Boolean));
  const urls = new Set([deck.author?.avatarUrl, ...combos.flatMap((combo) => combo.map((part) => part.imageUrl))].filter(Boolean));
  const assets = new Map(await Promise.all([...urls].map(async (url) => [url, await deckImageAsset(url, 170, url === deck.author?.avatarUrl)])));
  const allParts = combos.flat();
  const stats = Object.fromEntries(['atk', 'def', 'sta', 'burst', 'dash'].map((key) => [key, Math.min(100, Math.round(allParts.reduce((sum, part) => sum + (Number(part.stats?.[key]) || 0), 0) / Math.max(1, beys.length)))]));
  const cx = 1010; const cy = 430; const radarRadius = 94;
  const labels = [['ATK', -90], ['DEF', -18], ['STA', 54], ['BURST', 126], ['X-DASH', 198]];
  const radarGrid = [1, .75, .5, .25].map((scale) => `<polygon points="${radarPoints(Object.fromEntries(Object.keys(stats).map((key) => [key, 100 * scale])), cx, cy, radarRadius)}" class="radar-grid"/>`).join('');
  const radarLabels = labels.map(([label, degrees]) => { const angle = Number(degrees) * Math.PI / 180; const x = cx + Math.cos(angle) * (radarRadius + 34); const y = cy + Math.sin(angle) * (radarRadius + 34); return `<text x="${x}" y="${y}" text-anchor="middle" class="radar-label">${label}<tspan x="${x}" dy="15" class="radar-value">${stats[label === 'ATK' ? 'atk' : label === 'DEF' ? 'def' : label === 'STA' ? 'sta' : label === 'BURST' ? 'burst' : 'dash']}</tspan></text>`; }).join('');
  const comboArt = combos.map((combo, index) => {
    const x = 62 + index * 282; const centerX = x + 102;
    const main = combo.find((part) => ['BLADE', 'MAIN_BLADE'].includes(part.kind)) || combo[0];
    const leftKinds = ['LOCK_CHIP', 'ASSIST_BLADE', 'OVER_BLADE'];
    const left = combo.filter((part) => part !== main && leftKinds.includes(part.kind));
    const right = combo.filter((part) => part !== main && ['RATCHET', 'BIT'].includes(part.kind));
    const remaining = combo.filter((part) => part !== main && !left.includes(part) && !right.includes(part));
    left.push(...remaining);
    const mainArt = main ? `<circle cx="${centerX}" cy="300" r="78" class="main-ring"/>${assets.get(main.imageUrl) ? `<image href="${assets.get(main.imageUrl)}" x="${centerX - 78}" y="222" width="156" height="156" preserveAspectRatio="xMidYMid meet"/>` : `<text x="${centerX}" y="306" text-anchor="middle" class="fallback">${xml(cut(main.displayName || main.name, 8))}</text>`}<text x="${centerX}" y="400" text-anchor="middle" class="part-name">${xml(cut(main.displayName || main.name, 21))}</text>` : '';
    const partArt = (part, itemIndex, side) => { const px = centerX + (side === 'left' ? -76 : 76); const py = 455 + itemIndex * 92; return `<circle cx="${px}" cy="${py}" r="31" class="piece-ring"/>${assets.get(part.imageUrl) ? `<image href="${assets.get(part.imageUrl)}" x="${px - 31}" y="${py - 31}" width="62" height="62" preserveAspectRatio="xMidYMid meet"/>` : `<text x="${px}" y="${py + 4}" text-anchor="middle" class="fallback small">${xml(cut(part.abbrev || part.displayName || part.name, 4))}</text>`}<text x="${px}" y="${py + 49}" text-anchor="middle" class="part-name small-name">${xml(cut(part.displayName || part.name, 15))}</text>`; };
    return `<g><text x="${x + 18}" y="211" class="combo-head">BEY ${index + 1}</text>${mainArt}${left.map((part, itemIndex) => partArt(part, itemIndex, 'left')).join('')}${right.map((part, itemIndex) => partArt(part, itemIndex, 'right')).join('')}</g>`;
  }).join('');
  const deckLines = combos.map((combo, index) => `<text x="88" y="${834 + index * 25}" class="deck-line">${xml(`Bey ${index + 1}: ${combo.map((part) => part.displayName || part.name).join(' ')}`)}</text>`).join('');
  const avatar = assets.get(deck.author?.avatarUrl);
  const avatarMarkup = avatar ? `<image href="${avatar}" x="885" y="62" width="58" height="58" preserveAspectRatio="xMidYMid meet"/>` : `<circle cx="914" cy="91" r="28" class="avatar-ring"/><text x="914" y="99" text-anchor="middle" class="avatar-letter">${xml((deck.author?.name || '?').slice(0, 1).toUpperCase())}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1010" viewBox="0 0 1200 1010"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#122016"/><stop offset=".55" stop-color="#090d0b"/><stop offset="1" stop-color="#10151b"/></linearGradient><radialGradient id="glow"><stop stop-color="#a6ef70" stop-opacity=".18"/><stop offset="1" stop-color="#a6ef70" stop-opacity="0"/></radialGradient><style>.title{font-family:'Barlow Condensed','DejaVu Sans';font-weight:800;font-size:54px;fill:#f5faef}.intro{font-family:'DejaVu Sans';font-size:17px;fill:#acb8ac}.author{font-family:'DejaVu Sans';font-size:15px;fill:#d7e5d6}.brand{font-family:'Barlow Condensed','DejaVu Sans';font-weight:800;font-size:15px;letter-spacing:2px;fill:#a6ef70}.combo-head{font-family:'Barlow Condensed','DejaVu Sans';font-weight:800;font-size:21px;letter-spacing:1px;fill:#a6ef70}.main-ring{fill:#18251b;stroke:#a6ef70;stroke-opacity:.68;stroke-width:2}.piece-ring{fill:#141d16;stroke:#526a58;stroke-width:1}.part-name{font-family:'Barlow Condensed','DejaVu Sans';font-weight:700;font-size:14px;fill:#e7efe5}.small-name{font-size:12px;fill:#c2cec2}.fallback{font-family:'Barlow Condensed','DejaVu Sans';font-weight:800;font-size:15px;fill:#e8f4e7}.small{font-size:10px}.radar-grid{fill:none;stroke:#36503d;stroke-width:1}.radar-shape{fill:#a6ef70;fill-opacity:.22;stroke:#baff72;stroke-width:3}.radar-label{font-family:'Barlow Condensed','DejaVu Sans';font-weight:800;font-size:13px;fill:#9da99e}.radar-value{font-size:16px;fill:#f1fbef}.deck-line{font-family:'DejaVu Sans';font-size:14px;fill:#d1dbd0}.footer{font-family:'DejaVu Sans';font-size:15px;fill:#d1dbd0}.avatar-ring{fill:#17221a;stroke:#a6ef70;stroke-width:2}.avatar-letter{font-family:'Barlow Condensed','DejaVu Sans';font-weight:800;font-size:27px;fill:#efffed}</style></defs><rect width="1200" height="1010" fill="url(#bg)"/><circle cx="820" cy="190" r="440" fill="url(#glow)"/><rect width="1200" height="8" fill="#a6ef70"/><text x="62" y="73" class="brand">BEYXLAB • DECK LIST</text><text x="62" y="132" class="title">${xml(cut(deck.title, 42))}</text>${deck.description ? `<text x="62" y="162" class="intro">${xml(cut(deck.description, 130))}</text>` : ''}${avatarMarkup}<text x="960" y="86" class="author">Criado por</text><text x="960" y="109" class="author">${xml(cut(deck.author?.name || 'BeyXLab', 18))}</text><text x="1010" y="194" text-anchor="middle" class="brand">PERFORMANCE</text>${radarGrid}<polygon points="${radarPoints(stats, cx, cy, radarRadius)}" class="radar-shape"/>${radarLabels}${comboArt}<rect x="62" y="756" width="1076" height="160" rx="18" fill="#0b110c" stroke="#314638"/><text x="88" y="794" class="brand">LISTA DO DECK</text>${deckLines}<text x="62" y="966" class="brand">BEYXLAB.COM.BR</text><text x="1138" y="966" text-anchor="end" class="footer">Compartilhe seu setup</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function deckDto(d, { withParts = false, achievements = null } = {}) {
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
    copyCount: d.copyCount ?? 0,
    sharedPostId: d.posts?.find?.((p) => p.kind === 'DECK' && p.status === 'VISIBLE')?.id ?? null,
    createdAt: d.createdAt,
    author: d.author ? publicUser(d.author) : undefined,
    beys,
    achievements: achievements?.get(d.id) || [],
  };
  if (withParts) {
    const ids = [...new Set(beys.flat())];
    const parts = await prisma.part.findMany({ where: { id: { in: ids } } });
    base.parts = Object.fromEntries(parts.map((p) => [p.id, partDto(p)]));
  }
  return base;
}

/** Pódios de torneios que efetivamente usam este deck. Privados e arenas de teste
 * nunca aparecem como conquista pública. */
async function achievementsForDecks(deckIds) {
  const ids = [...new Set(deckIds.filter(Boolean))];
  const out = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return out;
  const tournaments = await prisma.tournament.findMany({
    where: {
      status: 'FINISHED',
      visibility: { in: ['PUBLIC', 'LINK_ONLY'] },
      players: { some: { deckId: { in: ids } } },
      OR: [{ description: null }, { NOT: { description: { startsWith: '[ADMIN TEST]' } } }],
    },
    include: {
      players: { include: { user: true, deck: true } },
      matches: { include: { p1: { include: { user: true, deck: true } }, p2: { include: { user: true, deck: true } } } },
    },
  });
  for (const tournament of tournaments) {
    const deckByPlayer = new Map(tournament.players.map((player) => [player.id, player.deckId]));
    standingsOf(tournament).slice(0, 3).forEach((row, index) => {
      const deckId = deckByPlayer.get(row.player.id);
      if (!deckId || !out.has(deckId)) return;
      out.get(deckId).push({ place: index + 1, tournament: { name: tournament.name, slug: tournament.slug, startsAt: tournament.startsAt } });
    });
  }
  for (const list of out.values()) list.sort((a, b) => a.place - b.place || new Date(b.tournament.startsAt) - new Date(a.tournament.startsAt));
  return out;
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

async function enqueueAnalysis(beys) {
  const ids = [...new Set((beys || []).flat())];
  const parts = ids.length ? await prisma.part.findMany({ where: { id: { in: ids } } }) : [];
  const partMap = Object.fromEntries(parts.map((part) => [part.id, partDto(part)]));
  return queueDeckAnalysis(beys, partMap);
}
async function beyXLabAuthor() {
  const email = 'decks@beyxlab.local';
  const found = await prisma.user.findUnique({ where: { email } });
  if (found) return found.avatarUrl === '/assets/profiles/beyxlab-avatar.png' ? found : prisma.user.update({ where: { id: found.id }, data: { avatarUrl: '/assets/profiles/beyxlab-avatar.png' } });
  return prisma.user.create({ data: { email, name: 'BeyXLab', slug: await uniqueSlug(prisma.user, 'beyxlab'), bio: 'Decks publicados pela equipe BeyXLab.', avatarUrl: '/assets/profiles/beyxlab-avatar.png', verified: true } });
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
  const achievements = await achievementsForDecks(decks.map((deck) => deck.id));
  res.json({ decks: await Promise.all(decks.map((d) => deckDto(d, { achievements }))) });
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

router.get('/api/decks/:slug/share-image.png', ah(async (req, res) => {
  const deck = await prisma.communityDeck.findUnique({ where: { slug: req.params.slug }, include: { author: true } });
  const isOwner = deck && req.user && deck.authorId === req.user.id;
  const restricted = deck && (deck.status !== 'VISIBLE' || !deck.isPublic);
  if (!deck || (restricted && !isOwner && !isStaff(req.user))) return res.status(404).json({ error: 'Deck não encontrado.' });
  const png = await renderDeckShareImage(deck);
  res.type('png').set('Content-Disposition', `attachment; filename="${deck.slug}-beyxlab.png"`).send(png);
}));

router.get('/api/decks/:slug', ah(async (req, res) => {
  const deck = await prisma.communityDeck.findUnique({
    where: { slug: req.params.slug },
    include: { author: true, posts: { where: { kind: 'DECK', status: 'VISIBLE' }, select: { id: true, kind: true, status: true }, take: 1 } },
  });
  const isOwner = deck && req.user && deck.authorId === req.user.id;
  const restrito = deck && (deck.status !== 'VISIBLE' || !deck.isPublic);
  if (!deck || (restrito && !isOwner && !isStaff(req.user))) {
    return res.status(404).json({ error: 'Deck não encontrado.' });
  }
  const frame = deck.author.frameId ? await prisma.cosmetic.findUnique({ where: { id: deck.author.frameId } }) : null;
  const dto = await deckDto(deck, { withParts: true });
  dto.achievements = (await achievementsForDecks([deck.id])).get(deck.id) || [];
  dto.author = publicUser(deck.author, { cosmetics: { frame, stickers: [] } });
  res.json({ deck: dto });
}));

/** Leitura competitiva: cruza o deck com a amostra pública de pódios, sem expor chave de IA ao navegador. */
router.get('/api/decks/:slug/analysis', ah(async (req, res) => {
  const deck = await prisma.communityDeck.findUnique({ where: { slug: req.params.slug } });
  const isOwner = deck && req.user && deck.authorId === req.user.id;
  const restricted = deck && (deck.status !== 'VISIBLE' || !deck.isPublic);
  if (!deck || (restricted && !isOwner && !isStaff(req.user))) return res.status(404).json({ error: 'Deck não encontrado.' });
  const beys = json(deck.beysJson, []);
  if (isDeckAnalysisPending(beys)) return res.json({ analysis: null, pending: true });
  const analysis = await getStoredDeckAnalysis(beys);
  res.json({ analysis, pending: !analysis });
}));

/** Releitura manual reservada ao administrador. A chave de IA permanece no
 * servidor; o resultado é gravado e passa a ser reutilizado por todos. */
router.post('/api/decks/:id/analysis/refresh', requireUser, ah(async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Apenas administradores podem atualizar a análise.' });
  const deck = await prisma.communityDeck.findUnique({ where: { id: req.params.id } });
  if (!deck) return res.status(404).json({ error: 'Deck não encontrado.' });
  const beys = json(deck.beysJson, []);
  const ids = [...new Set(beys.flat())];
  const parts = ids.length ? await prisma.part.findMany({ where: { id: { in: ids } } }) : [];
  const partMap = Object.fromEntries(parts.map((part) => [part.id, partDto(part)]));
  // Não prende a requisição HTTP durante alguns minutos: a página acompanha a
  // fila pelo endpoint de leitura e atualiza quando o resultado for salvo.
  void queueDeckAnalysis(beys, partMap, { force: true }).catch((error) => console.warn('[deck analysis] atualização manual:', error.message));
  res.status(202).json({ queued: true });
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

  const authorId = b.asBeyXLab === true && req.user.role === 'ADMIN' ? (await beyXLabAuthor()).id : req.user.id;
  const deck = await prisma.communityDeck.create({
    data: {
      slug: await uniqueSlug(prisma.communityDeck, title),
      authorId,
      title,
      description: String(b.description || '').slice(0, 2000) || null,
      launchGuide: String(b.launchGuide || '').slice(0, 2000) || null,
      youtubeUrl: youtubeUrl || null,
      beysJson: JSON.stringify(beys),
      isPublic: b.isPublic !== false,
      folder: String(b.folder || '').trim().slice(0, 40) || null,
    },
  });
  // Não bloqueia o salvamento: a fila gera uma vez e a página apenas lê o
  // resultado persistido quando estiver pronto.
  void enqueueAnalysis(beys).catch((error) => console.warn('[deck analysis] criação:', error.message));
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
  if (data.beysJson && data.beysJson !== deck.beysJson) {
    void enqueueAnalysis(json(data.beysJson, [])).catch((error) => console.warn('[deck analysis] edição:', error.message));
  }
  res.json({ deck: await deckDto(updated) });
}));

/**
 * Compartilhar na comunidade: cria (uma vez) o post kind=DECK com a tag Deck.
 * Só o autor; o deck precisa estar público. Texto opcional descreve a build.
 */
router.post('/api/decks/:id/share', requireUser, moderateFields('body'), ah(async (req, res) => {
  const deck = await prisma.communityDeck.findUnique({ where: { id: req.params.id }, include: { author: true } });
  if (!deck) return res.status(404).json({ error: 'Deck não encontrado.' });
  if (deck.authorId !== req.user.id && !isStaff(req.user)) return res.status(403).json({ error: 'Só o autor pode compartilhar o deck.' });
  if (deck.status !== 'VISIBLE') return res.status(403).json({ error: 'Este deck está oculto pela moderação.' });
  const existing = await prisma.post.findFirst({ where: { deckId: deck.id, kind: 'DECK', status: { in: ['VISIBLE', 'PENDING', 'SCANNING'] } } });
  if (existing) return res.json({ post: { id: existing.id }, already: true });
  if (!deck.isPublic) await prisma.communityDeck.update({ where: { id: deck.id }, data: { isPublic: true } });
  const body = String(req.body?.body || '').trim().slice(0, 3000) || deck.description || null;
  const post = await prisma.post.create({
    data: { authorId: req.user.id, kind: 'DECK', deckId: deck.id, tag: 'DECK', title: deck.title.slice(0, 140), body, status: 'VISIBLE', dataJson: JSON.stringify({ icon: 'decks' }) },
  });
  await audit(req.user, 'deck.share', 'DECK', deck.id, { postId: post.id });
  res.json({ post: { id: post.id }, already: false });
}));

/**
 * Copiar deck: registra a cópia (1 por pessoa; alimenta copyCount e o meta) e duplica
 * o deck na conta de quem copiou (privado, pasta "Copiados"). Devolve a cópia.
 */
router.post('/api/decks/:id/copy', requireUser, ah(async (req, res) => {
  const src = await prisma.communityDeck.findUnique({ where: { id: req.params.id } });
  if (!src) return res.status(404).json({ error: 'Deck não encontrado.' });
  const own = src.authorId === req.user.id;
  if (!own && (!src.isPublic || src.status !== 'VISIBLE')) return res.status(403).json({ error: 'Sem permissão.' });
  let counted = false;
  if (!own) {
    const already = await prisma.deckCopy.findUnique({ where: { deckId_userId: { deckId: src.id, userId: req.user.id } } });
    if (!already) {
      await prisma.deckCopy.create({ data: { deckId: src.id, userId: req.user.id } });
      await prisma.communityDeck.update({ where: { id: src.id }, data: { copyCount: { increment: 1 } } });
      counted = true;
    }
  }
  const title = own ? `${src.title} (cópia)`.slice(0, 80) : src.title.slice(0, 80);
  const deck = await prisma.communityDeck.create({
    data: {
      slug: await uniqueSlug(prisma.communityDeck, title),
      authorId: req.user.id, title,
      description: src.description, launchGuide: src.launchGuide, youtubeUrl: src.youtubeUrl, beysJson: src.beysJson,
      folder: own ? src.folder : 'Copiados', isPublic: false,
    },
  });
  const fresh = await prisma.communityDeck.findUnique({ where: { id: src.id } });
  res.json({ deck: await deckDto(deck), copyCount: fresh?.copyCount ?? src.copyCount, counted });
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
