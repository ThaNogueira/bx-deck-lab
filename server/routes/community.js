import { Router } from 'express';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import { requireUser, publicUser, isStaff } from '../auth.js';
import { moderateFields, getSetting } from '../settings.js';
import { audit } from '../audit.js';
import { siteUrl } from '../util.js';
import { uploadPost, uploadedUrl } from '../uploads.js';
import { scanUploads } from '../moderation.js';
import { standingsOf, loadTournament } from './tournaments.js';
import { partDto } from './catalog.js';
import { UPLOADS_DIR } from '../uploads.js';
import path from 'node:path';

const router = Router();
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const json = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };

// ---------------------------------------------------------------------------
// Vocabulário fixo: tags (flairs), reações, categorias de denúncia
// ---------------------------------------------------------------------------

export const TAGS = {
  CLIP: { label: 'Clipe de Partida', icon: 'clip' },
  UNBOXING: { label: 'Unboxing', icon: 'unboxing' },
  CHANNEL: { label: 'Divulgação de Canal', icon: 'channel' },
  SALE: { label: 'Venda / Troca de Bey', icon: 'sale' },
  RESULT: { label: 'Resultado de Torneio', icon: 'result' },
  CHAMPION: { label: 'Campeão', icon: 'champion' },
  HELP: { label: 'Dúvida / Ajuda', icon: 'help' },
  OFFTOPIC: { label: 'Off-topic', icon: 'offtopic' },
  ANNOUNCE: { label: 'Anúncio', icon: 'megaphone', staff: true }, // só MOD/ADMIN; post ganha destaque visual e vai para a home
  DECK: { label: 'Deck', icon: 'decks', auto: true }, // aplicada automaticamente ao compartilhar um deck do builder
};
/** Tags que aparecem na home (feed curado, foco competitivo). Fixo: o usuário não configura. */
export const HOME_TAGS = ['ANNOUNCE', 'DECK', 'RESULT', 'CLIP', 'CHAMPION'];
/** Inclusões padrão de um post (autor pode ser null nos cards do sistema). */
const POST_INCLUDE = { author: true, deck: { include: { author: true } } };
export const REACTIONS = ['FIRE', 'TOP', 'LOL', 'WOW'];
export const REPORT_CATEGORIES = {
  INAPPROPRIATE: 'Conteúdo impróprio',
  SPAM: 'Spam / propaganda',
  SCAM: 'Golpe / venda falsa',
  HARASSMENT: 'Assédio / ofensa',
  OTHER: 'Outro',
};
const SALE_CONDITIONS = ['Nova', 'Usada — ótima', 'Usada — com marcas', 'Só a peça'];

const canModerate = (user) => !!user && isStaff(user);

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

const ytId = (url) => {
  const m = String(url || '').match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{6,})/);
  return m ? m[1] : null;
};

function pollDto(post, votes, me) {
  const poll = json(post.pollJson, null);
  if (!poll?.options?.length) return null;
  const counts = Object.fromEntries(poll.options.map((o) => [o.id, 0]));
  for (const v of votes) if (v.optionId in counts) counts[v.optionId]++;
  const total = votes.length;
  const ended = poll.endsAt ? new Date(poll.endsAt) <= new Date() : false;
  const mine = me ? votes.find((v) => v.userId === me.id)?.optionId ?? null : null;
  return {
    endsAt: poll.endsAt || null,
    ended,
    total,
    myVote: mine,
    options: poll.options.map((o) => ({ id: o.id, text: o.text, votes: counts[o.id], pct: total ? Math.round((counts[o.id] / total) * 100) : 0 })),
  };
}

function saleDto(post) {
  const s = json(post.saleJson, null);
  if (!s) return null;
  const digits = String(s.contact || '').replace(/\D/g, '');
  return {
    priceCents: s.priceCents ?? null,
    condition: s.condition || null,
    trade: !!s.trade,
    contact: s.contact || null,
    whatsappUrl: digits.length >= 10 ? `https://wa.me/${digits}?text=${encodeURIComponent(`Olá! Vi seu anúncio "${post.title}" na comunidade BX Deck Lab.`)}` : null,
  };
}

function reactionsSummary(rows, targetId, me) {
  const mine = rows.filter((r) => r.targetId === targetId);
  const counts = Object.fromEntries(REACTIONS.map((k) => [k, 0]));
  let my = null;
  for (const r of mine) { counts[r.kind] = (counts[r.kind] || 0) + 1; if (me && r.userId === me.id) my = r.kind; }
  return { counts, total: mine.length, mine: my };
}

function deckSummary(d, partsMap) {
  if (!d) return null;
  const beys = json(d.beysJson, []);
  const ids = [...new Set(beys.flat())];
  return {
    id: d.id, slug: d.slug, title: d.title, description: d.description || null, copyCount: d.copyCount ?? 0,
    isPublic: d.isPublic, status: d.status,
    author: d.author ? publicUser(d.author) : null,
    beys,
    parts: partsMap ? Object.fromEntries(ids.filter((id) => partsMap.has(id)).map((id) => [id, partsMap.get(id)])) : undefined,
  };
}

function postDto(p, { me = null, reactions = [], votes = [], partsMap = null } = {}) {
  const media = json(p.mediaJson, []);
  return {
    id: p.id,
    kind: p.kind || 'USER',
    data: json(p.dataJson, null),
    deck: p.deck ? deckSummary(p.deck, partsMap) : null,
    tag: p.tag,
    tagLabel: TAGS[p.tag]?.label || p.tag,
    title: p.title,
    body: p.body,
    media,
    poll: pollDto(p, votes, me),
    sale: p.tag === 'SALE' ? saleDto(p) : null,
    status: p.status,
    flagged: p.status === 'PENDING',
    reactions: reactionsSummary(reactions, p.id, me),
    commentCount: p.commentCount,
    createdAt: p.createdAt,
    pinnedAt: p.pinnedAt || null,
    editedAt: p.editedAt || null,
    author: p.author ? publicUser(p.author) : null,
    mine: !!me && !!p.authorId && me.id === p.authorId,
    canModerate: canModerate(me),
    url: `${siteUrl()}/comunidade/p/${p.id}`,
  };
}

/** Reações, votos e peças dos decks de um lote de posts -> DTOs prontos. */
async function hydratePosts(posts, me) {
  const ids = posts.map((p) => p.id);
  const partIds = [...new Set(posts.flatMap((p) => (p.deck ? json(p.deck.beysJson, []).flat() : [])))];
  const [reactions, votes, parts] = await Promise.all([
    reactionsFor('POST', ids),
    ids.length ? prisma.pollVote.findMany({ where: { postId: { in: ids } } }) : [],
    partIds.length ? prisma.part.findMany({ where: { id: { in: partIds } } }) : [],
  ]);
  const partsMap = new Map(parts.map((x) => [x.id, partDto(x)]));
  return posts.map((p) => postDto(p, { me, reactions, votes: votes.filter((v) => v.postId === p.id), partsMap }));
}

/**
 * Lista paginada com ordenação recent|top|hot. Usada pelo feed da comunidade e pela home.
 * hot = score de engajamento × recência dentro de uma janela (dias).
 */
export async function listPosts({ where, sort = 'recent', skip = 0, take = 20, me = null, windowDays = 14 }) {
  let posts;
  let total;
  if (sort === 'hot') {
    const since = new Date(Date.now() - windowDays * 864e5);
    const pool = await prisma.post.findMany({ where: { ...where, createdAt: { gt: since } }, include: POST_INCLUDE, take: 400, orderBy: { createdAt: 'desc' } });
    pool.sort((a, b) => hotScore(b) - hotScore(a));
    total = pool.length;
    posts = pool.slice(skip, skip + take);
  } else {
    const orderBy = sort === 'top' ? [{ reactionCount: 'desc' }, { commentCount: 'desc' }, { createdAt: 'desc' }] : { createdAt: 'desc' };
    [posts, total] = await Promise.all([
      prisma.post.findMany({ where, include: POST_INCLUDE, orderBy, skip, take }),
      prisma.post.count({ where }),
    ]);
  }
  return { posts: await hydratePosts(posts, me), total, nextOffset: skip + posts.length < total ? skip + posts.length : null };
}

function commentDto(c, { me = null, reactions = [] } = {}) {
  return {
    id: c.id,
    postId: c.postId,
    parentId: c.parentId,
    body: c.status === 'VISIBLE' ? c.body : null,
    status: c.status,
    createdAt: c.createdAt,
    author: c.status === 'VISIBLE' ? publicUser(c.author) : null,
    reactions: reactionsSummary(reactions, c.id, me),
    mine: !!me && me.id === c.authorId,
  };
}

async function reactionsFor(targetType, ids) {
  if (!ids.length) return [];
  return prisma.reaction.findMany({ where: { targetType, targetId: { in: ids } } });
}

const hotScore = (p) => {
  const hours = (Date.now() - new Date(p.createdAt).getTime()) / 3_600_000;
  const base = p.tag === 'ANNOUNCE' ? 6 : p.kind === 'SYSTEM' ? 4 : p.kind === 'DECK' ? 2 : 1;
  return (p.reactionCount * 3 + p.commentCount * 2 + base) / Math.pow(hours + 2, 1.4);
};

// ---------------------------------------------------------------------------
// Notificações
// ---------------------------------------------------------------------------

export async function notify(userId, data) {
  if (!userId || userId === data.actorId) return;
  await prisma.notification.create({ data: { userId, ...data } }).catch(() => {});
}

/** Avisa toda a equipe (MOD/ADMIN): denúncias, posts pendentes, tudo que pede atenção imediata. */
export async function notifyStaff(type, { text, url = '/admin', postId = null, actorId = null } = {}) {
  const staff = await prisma.user.findMany({ where: { role: { in: ['MOD', 'ADMIN'] }, status: 'ACTIVE' }, select: { id: true } });
  if (!staff.length) return;
  await prisma.notification.createMany({ data: staff.map((u) => ({ userId: u.id, type, text, url, postId, actorId })) }).catch(() => {});
}

/** Exclusão definitiva: post, comentários, reações, votos, notificações, arquivos e denúncias ligadas. */
export async function hardDeletePost(p, actor, { reason = 'author' } = {}) {
  const comments = await prisma.comment.findMany({ where: { postId: p.id }, select: { id: true } });
  const cids = comments.map((x) => x.id);
  await prisma.reaction.deleteMany({ where: { OR: [{ targetType: 'POST', targetId: p.id }, ...(cids.length ? [{ targetType: 'COMMENT', targetId: { in: cids } }] : [])] } });
  await prisma.notification.deleteMany({ where: { postId: p.id } });
  await prisma.report.updateMany({ where: { OR: [{ targetType: 'POST', targetId: p.id }, ...(cids.length ? [{ targetType: 'COMMENT', targetId: { in: cids } }] : [])], status: 'OPEN' }, data: { status: 'RESOLVED', resolution: reason === 'author' ? 'Post excluído pelo autor.' : 'Post excluído pela moderação.' } });
  for (const m of json(p.mediaJson, [])) {
    if (m.type === 'embed' || !String(m.url || '').startsWith('/uploads/')) continue;
    const file = path.join(UPLOADS_DIR, path.basename(m.url));
    await fs.promises.unlink(file).catch(() => {});
  }
  await prisma.post.delete({ where: { id: p.id } }); // cascade: comentários e votos
  await audit(actor, 'post.delete', 'POST', p.id, { reason, title: p.title });
}

const MENTION_RE = /@([a-z0-9][a-z0-9-]{1,40})/gi;
async function mentionedUsers(text, exceptId) {
  const slugs = [...new Set([...String(text || '').matchAll(MENTION_RE)].map((m) => m[1].toLowerCase()))].slice(0, 8);
  if (!slugs.length) return [];
  const users = await prisma.user.findMany({ where: { slug: { in: slugs }, status: 'ACTIVE' } });
  return users.filter((u) => u.id !== exceptId);
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

router.get('/api/community/meta', (_req, res) => {
  res.json({ tags: TAGS, reactions: REACTIONS, reportCategories: REPORT_CATEGORIES, saleConditions: SALE_CONDITIONS });
});

router.get('/api/posts', ah(async (req, res) => {
  const { sort = 'recent', tag = '', author = '', offset = '0', limit = '20', q = '' } = req.query;
  const me = req.user || null;
  const take = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const skip = Math.max(0, parseInt(offset, 10) || 0);
  const where = { OR: [{ status: 'VISIBLE' }] };
  if (me) where.OR.push({ authorId: me.id, status: { in: ['PENDING', 'SCANNING'] } });
  if (tag && TAGS[tag]) where.tag = tag;
  if (author) where.author = { slug: String(author) };
  const query = String(q || '').trim().toLowerCase();
  if (query) where.AND = [{ OR: [{ title: { contains: query } }, { body: { contains: query } }] }];

  if (req.query.kind === 'USER') where.kind = 'USER';
  res.json(await listPosts({ where, sort, skip, take, me }));
}));

const MAX_PINNED = 6;
/** Posts fixados pela moderação (faixa compacta). Qualquer post visível pode ser fixado. */
router.get('/api/posts/pinned', ah(async (req, res) => {
  const rows = await prisma.post.findMany({ where: { status: 'VISIBLE', pinnedAt: { not: null } }, include: POST_INCLUDE, orderBy: { pinnedAt: 'desc' }, take: MAX_PINNED });
  res.json({
    posts: rows.map((p) => {
      const media = json(p.mediaJson, []);
      const img = media.find((m) => m.type === 'image');
      return {
        id: p.id, kind: p.kind || 'USER', tag: p.tag, tagLabel: TAGS[p.tag]?.label || p.tag, title: p.title,
        author: p.author ? publicUser(p.author) : null, createdAt: p.createdAt, pinnedAt: p.pinnedAt,
        thumb: img ? img.url : null, deckTitle: p.deck?.title || null, url: `/comunidade/p/${p.id}`,
      };
    }),
    max: MAX_PINNED,
  });
}));

/** Fixar/desafixar (MOD/ADMIN). Limite pequeno para a faixa não virar spam. */
router.post('/api/posts/:id/pin', requireUser, ah(async (req, res) => {
  if (!canModerate(req.user)) return res.status(403).json({ error: 'Só a moderação pode fixar posts.' });
  const p = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!p) return res.status(404).json({ error: 'Post não encontrado.' });
  const pinned = req.body?.pinned !== false && !p.pinnedAt;
  if (pinned) {
    const n = await prisma.post.count({ where: { pinnedAt: { not: null } } });
    if (n >= MAX_PINNED) return res.status(409).json({ error: `Já existem ${MAX_PINNED} posts fixados. Desafixe um antes.` });
  }
  await prisma.post.update({ where: { id: p.id }, data: { pinnedAt: pinned ? new Date() : null } });
  await audit(req.user.id, pinned ? 'POST_PIN' : 'POST_UNPIN', 'Post', p.id, { title: p.title });
  res.json({ ok: true, pinned });
}));

/** Editar título/texto/tag: autor ou moderação. Mídia, enquete e venda não mudam. */
router.patch('/api/posts/:id', requireUser, moderateFields('title', 'body'), ah(async (req, res) => {
  const p = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!p) return res.status(404).json({ error: 'Post não encontrado.' });
  const mine = p.authorId && p.authorId === req.user.id;
  if (!mine && !canModerate(req.user)) return res.status(403).json({ error: 'Você só pode editar os seus posts.' });
  if (p.kind === 'SYSTEM') return res.status(422).json({ error: 'Cards automáticos não são editáveis.' });
  const b = req.body || {};
  const data = {};
  if (b.title != null) { const t = String(b.title).trim().slice(0, 140); if (t.length < 3) return res.status(422).json({ error: 'Título muito curto.' }); data.title = t; }
  if (b.body != null) data.body = String(b.body).trim().slice(0, 5000) || null;
  if (b.tag != null && b.tag !== p.tag) {
    if (p.kind !== 'USER') return res.status(422).json({ error: 'A tag deste post não pode ser alterada.' });
    if (!TAGS[b.tag] || TAGS[b.tag].auto) return res.status(422).json({ error: 'Tag inválida.' });
    if (TAGS[b.tag].staff && !canModerate(req.user)) return res.status(403).json({ error: 'Só a equipe do site pode usar a tag Anúncio.' });
    if (p.tag === 'SALE' || b.tag === 'SALE') return res.status(422).json({ error: 'Posts de venda não podem trocar de tag.' });
    data.tag = b.tag;
  }
  if (data.body === null && !json(p.mediaJson, []).length && !p.pollJson) return res.status(422).json({ error: 'O post precisa de texto, mídia ou enquete.' });
  if (!Object.keys(data).length) return res.json({ ok: true, post: (await hydratePosts([await prisma.post.findUnique({ where: { id: p.id }, include: POST_INCLUDE })], req.user))[0] });
  data.editedAt = new Date();
  const up = await prisma.post.update({ where: { id: p.id }, data, include: POST_INCLUDE });
  if (!mine) await audit(req.user.id, 'POST_EDIT', 'Post', p.id, { fields: Object.keys(data) });
  res.json({ ok: true, post: (await hydratePosts([up], req.user))[0] });
}));

router.get('/api/posts/:id', ah(async (req, res) => {
  const me = req.user || null;
  const p = await prisma.post.findUnique({ where: { id: req.params.id }, include: POST_INCLUDE });
  if (!p) return res.status(404).json({ error: 'Post não encontrado.' });
  const visible = p.status === 'VISIBLE' || (me && ((p.authorId && me.id === p.authorId) || canModerate(me)));
  if (!visible) return res.status(404).json({ error: 'Post não disponível.' });
  const [comments, [post]] = await Promise.all([
    prisma.comment.findMany({ where: { postId: p.id, status: { not: 'REMOVED' } }, include: { author: true }, orderBy: { createdAt: 'asc' } }),
    hydratePosts([p], me),
  ]);
  const cr = await reactionsFor('COMMENT', comments.map((c) => c.id));
  res.json({
    post,
    comments: comments.map((c) => commentDto(c, { me, reactions: cr })),
    flag: canModerate(me) ? json(p.flagJson, null) : undefined,
  });
}));

// ---------------------------------------------------------------------------
// Publicar
// ---------------------------------------------------------------------------

const mediaType = (f) => (f.mimetype === 'image/gif' ? 'gif' : f.mimetype.startsWith('video/') ? 'video' : 'image');

async function runScan(postId, files) {
  try {
    const result = await scanUploads(files);
    const status = result.flagged ? 'PENDING' : 'VISIBLE';
    await prisma.post.update({ where: { id: postId }, data: { status, flagJson: JSON.stringify(result) } });
    if (result.flagged) {
      const p = await prisma.post.findUnique({ where: { id: postId } });
      if (p) {
        const why = (result.reasons || []).join('; ');
        await notify(p.authorId, { type: 'POST_PENDING', postId, text: `Seu post "${p.title}" ficou em revisão (${why || 'triagem automática'}). A moderação vai avaliar.` });
        await notifyStaff('MOD_PENDING', { text: `Post pendente de revisão: "${p.title}" — ${why || 'triagem automática'}.`, url: '/admin#community', postId });
      }
    }
  } catch (e) {
    // Política restritiva: se a triagem quebrou, o post NÃO publica sozinho.
    await prisma.post.update({ where: { id: postId }, data: { status: 'PENDING', flagJson: JSON.stringify({ error: e.message, flagged: true, reasons: ['falha na triagem'] }) } }).catch(() => {});
    await notifyStaff('MOD_PENDING', { text: 'Um post ficou pendente porque a triagem automática falhou.', url: '/admin#community', postId });
  }
}

router.post('/api/posts', requireUser, uploadPost.array('media', 6), moderateFields('title', 'body'), ah(async (req, res) => {
  const flags = await getSetting('flags');
  if (flags.community === false) return res.status(403).json({ error: 'A comunidade está temporariamente fechada para novos posts.' });
  const b = req.body || {};
  const files = req.files || [];
  const cleanup = () => files.forEach((f) => fs.promises.unlink(f.path).catch(() => {}));

  const tag = TAGS[b.tag] && !TAGS[b.tag].auto ? b.tag : null;
  const title = String(b.title || '').trim().slice(0, 140);
  const body = String(b.body || '').trim().slice(0, 5000) || null;
  if (tag && TAGS[tag].staff && !canModerate(req.user)) { cleanup(); return res.status(403).json({ error: 'Só a equipe do site pode usar a tag Anúncio.' }); }
  if (!tag) { cleanup(); return res.status(422).json({ error: b.tag === 'DECK' ? 'Para postar um deck, use "Compartilhar na comunidade" na página do deck ou no builder.' : 'Escolha uma tag.' }); }
  if (title.length < 3) { cleanup(); return res.status(422).json({ error: 'Dê um título (mínimo 3 letras).' }); }

  const recent = await prisma.post.count({ where: { authorId: req.user.id, createdAt: { gt: new Date(Date.now() - 3_600_000) } } });
  if (recent >= 10) { cleanup(); return res.status(429).json({ error: 'Muitos posts na última hora — respira um pouco.' }); }

  const media = files.map((f) => ({ type: mediaType(f), url: uploadedUrl(f) }));
  const yt = ytId(b.embedUrl);
  if (yt) media.push({ type: 'embed', provider: 'youtube', id: yt, url: `https://www.youtube.com/watch?v=${yt}` });
  else if (b.embedUrl && String(b.embedUrl).trim()) { cleanup(); return res.status(422).json({ error: 'Só links do YouTube são aceitos como vídeo externo.' }); }

  let pollJson = null;
  const poll = json(b.poll, null);
  if (poll && Array.isArray(poll.options)) {
    const options = poll.options.map((t) => String(t || '').trim().slice(0, 80)).filter(Boolean).slice(0, 8);
    if (options.length < 2) { cleanup(); return res.status(422).json({ error: 'A enquete precisa de pelo menos 2 opções.' }); }
    const hours = Math.min(24 * 14, Math.max(1, parseInt(poll.hours, 10) || 72));
    pollJson = JSON.stringify({ options: options.map((text) => ({ id: randomBytes(4).toString('hex'), text })), endsAt: new Date(Date.now() + hours * 3_600_000).toISOString() });
  }

  let saleJson = null;
  if (tag === 'SALE') {
    const s = json(b.sale, null) || {};
    const price = Math.round(parseFloat(String(s.price || '').replace(',', '.')) * 100);
    saleJson = JSON.stringify({
      priceCents: Number.isFinite(price) && price > 0 ? price : null,
      condition: SALE_CONDITIONS.includes(s.condition) ? s.condition : null,
      trade: !!s.trade,
      contact: String(s.contact || req.user.whatsapp || '').slice(0, 80) || null,
    });
  }

  if (!body && !media.length && !pollJson) { cleanup(); return res.status(422).json({ error: 'O post precisa de texto, mídia ou enquete.' }); }

  const hasMedia = files.length > 0; // imagens passam pela triagem; vídeo sempre fica para aprovação manual
  const post = await prisma.post.create({
    data: {
      authorId: req.user.id, tag, title, body, mediaJson: JSON.stringify(media), pollJson, saleJson,
      status: hasMedia ? 'SCANNING' : 'VISIBLE',
    },
    include: POST_INCLUDE,
  });
  if (hasMedia) setImmediate(() => runScan(post.id, files));

  for (const u of await mentionedUsers(`${title} ${body || ''}`, req.user.id)) {
    await notify(u.id, { type: 'MENTION', actorId: req.user.id, postId: post.id, text: `${req.user.name} mencionou você em "${title}".` });
  }
  await audit(req.user, 'post.create', 'POST', post.id, { tag });
  res.json({ post: postDto(post, { me: req.user }) });
}));

router.delete('/api/posts/:id', requireUser, ah(async (req, res) => {
  const p = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!p) return res.status(404).json({ error: 'Post não encontrado.' });
  if (p.authorId !== req.user.id && !canModerate(req.user)) return res.status(403).json({ error: 'Só o autor (ou a moderação) pode apagar.' });
  const byAuthor = p.authorId === req.user.id;
  await hardDeletePost(p, req.user, { reason: byAuthor ? 'author' : 'moderation' });
  if (!byAuthor && p.authorId) await notify(p.authorId, { type: 'POST_DELETED', text: `Seu post "${p.title}" foi excluído pela moderação.`, url: '/comunidade' });
  res.json({ ok: true, deleted: true });
}));

// ---------------------------------------------------------------------------
// Reações, votos, comentários
// ---------------------------------------------------------------------------

async function toggleReaction(req, res, targetType, target) {
  const kind = REACTIONS.includes(req.body?.kind) ? req.body.kind : 'FIRE';
  const key = { userId: req.user.id, targetType, targetId: target.id };
  const existing = await prisma.reaction.findUnique({ where: { userId_targetType_targetId: key } });
  let mine = null;
  if (existing && existing.kind === kind) {
    await prisma.reaction.delete({ where: { id: existing.id } });
  } else if (existing) {
    await prisma.reaction.update({ where: { id: existing.id }, data: { kind } });
    mine = kind;
  } else {
    await prisma.reaction.create({ data: { ...key, kind } });
    mine = kind;
  }
  const total = await prisma.reaction.count({ where: { targetType, targetId: target.id } });
  if (targetType === 'POST') await prisma.post.update({ where: { id: target.id }, data: { reactionCount: total } });
  else await prisma.comment.update({ where: { id: target.id }, data: { reactionCount: total } });
  if (!existing && target.authorId !== req.user.id) {
    await notify(target.authorId, { type: 'REACTION', actorId: req.user.id, postId: targetType === 'POST' ? target.id : target.postId, commentId: targetType === 'COMMENT' ? target.id : null, text: `${req.user.name} reagiu ${targetType === 'POST' ? 'ao seu post' : 'ao seu comentário'}.` });
  }
  const rows = await prisma.reaction.findMany({ where: { targetType, targetId: target.id } });
  res.json({ reactions: reactionsSummary(rows, target.id, req.user), mine });
}

router.post('/api/posts/:id/react', requireUser, ah(async (req, res) => {
  const p = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!p || p.status !== 'VISIBLE') return res.status(404).json({ error: 'Post não encontrado.' });
  await toggleReaction(req, res, 'POST', p);
}));

router.post('/api/comments/:id/react', requireUser, ah(async (req, res) => {
  const c = await prisma.comment.findUnique({ where: { id: req.params.id } });
  if (!c || c.status !== 'VISIBLE') return res.status(404).json({ error: 'Comentário não encontrado.' });
  await toggleReaction(req, res, 'COMMENT', c);
}));

router.post('/api/posts/:id/vote', requireUser, ah(async (req, res) => {
  const p = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!p || p.status !== 'VISIBLE') return res.status(404).json({ error: 'Post não encontrado.' });
  const poll = json(p.pollJson, null);
  if (!poll) return res.status(422).json({ error: 'Este post não tem enquete.' });
  if (poll.endsAt && new Date(poll.endsAt) <= new Date()) return res.status(403).json({ error: 'A enquete já encerrou.' });
  const optionId = String(req.body?.optionId || '');
  if (!poll.options.some((o) => o.id === optionId)) return res.status(422).json({ error: 'Opção inválida.' });
  await prisma.pollVote.upsert({
    where: { postId_userId: { postId: p.id, userId: req.user.id } },
    update: { optionId },
    create: { postId: p.id, userId: req.user.id, optionId },
  });
  const votes = await prisma.pollVote.findMany({ where: { postId: p.id } });
  res.json({ poll: pollDto(p, votes, req.user) });
}));

router.post('/api/posts/:id/comments', requireUser, moderateFields('body'), ah(async (req, res) => {
  const p = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!p || p.status !== 'VISIBLE') return res.status(404).json({ error: 'Post não encontrado.' });
  const body = String(req.body?.body || '').trim().slice(0, 2000);
  if (!body) return res.status(422).json({ error: 'Escreva algo.' });
  const recent = await prisma.comment.count({ where: { authorId: req.user.id, createdAt: { gt: new Date(Date.now() - 3_600_000) } } });
  if (recent >= 60) return res.status(429).json({ error: 'Muitos comentários na última hora.' });
  let parent = null;
  if (req.body?.parentId) {
    parent = await prisma.comment.findFirst({ where: { id: String(req.body.parentId), postId: p.id, status: 'VISIBLE' } });
    if (!parent) return res.status(404).json({ error: 'Comentário pai não encontrado.' });
  }
  const c = await prisma.comment.create({ data: { postId: p.id, authorId: req.user.id, parentId: parent?.id ?? null, body }, include: { author: true } });
  const count = await prisma.comment.count({ where: { postId: p.id, status: 'VISIBLE' } });
  await prisma.post.update({ where: { id: p.id }, data: { commentCount: count } });

  const notified = new Set();
  if (parent && parent.authorId !== req.user.id) { notified.add(parent.authorId); await notify(parent.authorId, { type: 'REPLY', actorId: req.user.id, postId: p.id, commentId: c.id, text: `${req.user.name} respondeu seu comentário em "${p.title}".` }); }
  if (!notified.has(p.authorId)) { notified.add(p.authorId); await notify(p.authorId, { type: 'COMMENT', actorId: req.user.id, postId: p.id, commentId: c.id, text: `${req.user.name} comentou em "${p.title}".` }); }
  for (const u of await mentionedUsers(body, req.user.id)) {
    if (notified.has(u.id)) continue;
    await notify(u.id, { type: 'MENTION', actorId: req.user.id, postId: p.id, commentId: c.id, text: `${req.user.name} mencionou você em "${p.title}".` });
  }
  res.json({ comment: commentDto(c, { me: req.user }), commentCount: count });
}));

router.delete('/api/comments/:id', requireUser, ah(async (req, res) => {
  const c = await prisma.comment.findUnique({ where: { id: req.params.id } });
  if (!c) return res.status(404).json({ error: 'Comentário não encontrado.' });
  if (c.authorId !== req.user.id && !canModerate(req.user)) return res.status(403).json({ error: 'Sem permissão.' });
  await prisma.comment.update({ where: { id: c.id }, data: { status: 'REMOVED' } });
  const count = await prisma.comment.count({ where: { postId: c.postId, status: 'VISIBLE' } });
  await prisma.post.update({ where: { id: c.postId }, data: { commentCount: count } });
  res.json({ ok: true, commentCount: count });
}));

// ---------------------------------------------------------------------------
// Busca de usuários (menções) e perfil: posts e torneios
// ---------------------------------------------------------------------------

router.get('/api/users/search', ah(async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json({ users: [] });
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE', OR: [{ slug: { contains: q } }, { name: { contains: q } }] },
    take: 8,
    orderBy: { lastLoginAt: 'desc' },
  });
  res.json({ users: users.map(publicUser) });
}));

router.get('/api/users/:slug/posts', ah(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { slug: req.params.slug } });
  if (!user) return res.status(404).json({ error: 'Perfil não encontrado.' });
  const posts = await prisma.post.findMany({ where: { authorId: user.id, status: 'VISIBLE' }, include: POST_INCLUDE, orderBy: { createdAt: 'desc' }, take: 30 });
  res.json({ posts: await hydratePosts(posts, req.user || null) });
}));

router.get('/api/users/:slug/tournaments', ah(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { slug: req.params.slug } });
  if (!user) return res.status(404).json({ error: 'Perfil não encontrado.' });
  const entries = await prisma.tournamentPlayer.findMany({ where: { userId: user.id }, include: { tournament: true }, orderBy: { joinedAt: 'desc' }, take: 40 });
  const out = [];
  for (const e of entries) {
    const t = e.tournament;
    if (t.status === 'CANCELED') continue;
    let placement = null;
    let wins = null;
    let champion = false;
    if (t.status !== 'OPEN') {
      const full = await loadTournament(t.slug);
      const standings = standingsOf(full);
      const idx = standings.findIndex((s) => s.player.id === e.id);
      if (idx >= 0) { placement = idx + 1; wins = standings[idx].wins; champion = t.status === 'FINISHED' && idx === 0; }
    }
    out.push({ slug: t.slug, name: t.name, storeName: t.storeName, startsAt: t.startsAt, status: t.status, format: t.format, players: undefined, placement, wins, champion, dropped: e.dropped });
  }
  res.json({ tournaments: out, titles: out.filter((t) => t.champion).length });
}));

// ---------------------------------------------------------------------------
// Notificações
// ---------------------------------------------------------------------------

router.get('/api/notifications', requireUser, ah(async (req, res) => {
  const list = await prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 30 });
  const actorIds = [...new Set(list.map((n) => n.actorId).filter(Boolean))];
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } } }) : [];
  const byId = new Map(actors.map((a) => [a.id, publicUser(a)]));
  const unread = await prisma.notification.count({ where: { userId: req.user.id, readAt: null } });
  res.json({
    unread,
    notifications: list.map((n) => ({
      id: n.id, type: n.type, text: n.text, readAt: n.readAt, createdAt: n.createdAt,
      actor: n.actorId ? byId.get(n.actorId) ?? null : null,
      url: n.url || (n.postId ? `/comunidade/p/${n.postId}${n.commentId ? `#c-${n.commentId}` : ''}` : '/comunidade'),
    })),
  });
}));

router.get('/api/notifications/unread-count', requireUser, ah(async (req, res) => {
  const unread = await prisma.notification.count({ where: { userId: req.user.id, readAt: null } });
  res.json({ unread });
}));

router.post('/api/notifications/read', requireUser, ah(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 100) : null;
  await prisma.notification.updateMany({ where: { userId: req.user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Moderação (staff): fila de posts pendentes / ocultar / aprovar
// ---------------------------------------------------------------------------

const MOD = (req, res, next) => { if (!canModerate(req.user)) return res.status(403).json({ error: 'Acesso restrito à moderação.' }); next(); };

router.get('/api/admin/posts', requireUser, MOD, ah(async (req, res) => {
  const status = String(req.query.status || 'PENDING');
  const where = status === 'ALL' ? {} : { status };
  const posts = await prisma.post.findMany({ where, include: POST_INCLUDE, orderBy: { createdAt: 'desc' }, take: 100 });
  const dtos = await hydratePosts(posts, req.user);
  res.json({ posts: dtos.map((d, i) => ({ ...d, flag: json(posts[i].flagJson, null) })) });
}));

/** Exclusão definitiva pela moderação (some do banco na hora; autor é avisado). */
router.delete('/api/admin/posts/:id', requireUser, MOD, ah(async (req, res) => {
  const p = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!p) return res.status(404).json({ error: 'Post não encontrado.' });
  await hardDeletePost(p, req.user, { reason: 'moderation' });
  if (p.authorId) await notify(p.authorId, { type: 'POST_DELETED', text: `Seu post "${p.title}" foi excluído pela moderação${req.body?.reason ? `: ${String(req.body.reason).slice(0, 200)}` : '.'}`, url: '/comunidade' });
  res.json({ ok: true, deleted: true });
}));

router.delete('/api/admin/comments/:id', requireUser, MOD, ah(async (req, res) => {
  const cm = await prisma.comment.findUnique({ where: { id: req.params.id } });
  if (!cm) return res.status(404).json({ error: 'Comentário não encontrado.' });
  await prisma.reaction.deleteMany({ where: { targetType: 'COMMENT', targetId: cm.id } });
  await prisma.report.updateMany({ where: { targetType: 'COMMENT', targetId: cm.id, status: 'OPEN' }, data: { status: 'RESOLVED', resolution: 'Comentário excluído pela moderação.' } });
  await prisma.comment.updateMany({ where: { parentId: cm.id }, data: { parentId: null } });
  await prisma.comment.delete({ where: { id: cm.id } });
  const count = await prisma.comment.count({ where: { postId: cm.postId, status: 'VISIBLE' } });
  await prisma.post.update({ where: { id: cm.postId }, data: { commentCount: count } }).catch(() => {});
  await audit(req.user, 'comment.delete', 'COMMENT', cm.id);
  res.json({ ok: true, deleted: true, commentCount: count });
}));

router.post('/api/admin/posts/:id/status', requireUser, MOD, ah(async (req, res) => {
  const status = ['VISIBLE', 'HIDDEN', 'REMOVED', 'PENDING'].includes(req.body?.status) ? req.body.status : null;
  if (!status) return res.status(422).json({ error: 'Status inválido.' });
  const p = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!p) return res.status(404).json({ error: 'Post não encontrado.' });
  await prisma.post.update({ where: { id: p.id }, data: { status } });
  if (status === 'VISIBLE' && p.status !== 'VISIBLE') await notify(p.authorId, { type: 'POST_APPROVED', postId: p.id, text: `Seu post "${p.title}" foi aprovado pela moderação.` });
  if (status === 'HIDDEN' || status === 'REMOVED') await notify(p.authorId, { type: 'POST_HIDDEN', postId: p.id, text: `Seu post "${p.title}" foi ${status === 'HIDDEN' ? 'ocultado' : 'removido'} pela moderação.` });
  await audit(req.user, 'post.status', 'POST', p.id, { status });
  res.json({ ok: true });
}));

router.post('/api/admin/comments/:id/status', requireUser, MOD, ah(async (req, res) => {
  const status = ['VISIBLE', 'HIDDEN', 'REMOVED'].includes(req.body?.status) ? req.body.status : null;
  if (!status) return res.status(422).json({ error: 'Status inválido.' });
  const c = await prisma.comment.findUnique({ where: { id: req.params.id } });
  if (!c) return res.status(404).json({ error: 'Comentário não encontrado.' });
  await prisma.comment.update({ where: { id: c.id }, data: { status } });
  const count = await prisma.comment.count({ where: { postId: c.postId, status: 'VISIBLE' } });
  await prisma.post.update({ where: { id: c.postId }, data: { commentCount: count } });
  await audit(req.user, 'comment.status', 'COMMENT', c.id, { status });
  res.json({ ok: true });
}));

export default router;
