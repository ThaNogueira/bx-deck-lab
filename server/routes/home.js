import { Router } from 'express';
import { prisma } from '../db.js';
import { publicUser } from '../auth.js';
import { json } from '../util.js';
import { getMetaState } from '../meta.js';
import { standingsOf, loadTournament } from './tournaments.js';
import { HOME_TAGS, listPosts } from './community.js';

/**
 * Home híbrida: Estado do Meta + destaques da semana + feed curado (posts competitivos,
 * cards do sistema e decks compartilhados) + barra lateral (torneios, ranking de jogadores).
 * Tudo com cache curto em memória — a home é a página mais acessada.
 */
const router = Router();
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && hit.at + ttlMs > Date.now()) return hit.value;
  const value = await fn();
  cache.set(key, { value, at: Date.now() });
  return value;
}
export const bustHomeCache = () => cache.clear();

router.get('/api/home/meta', ah(async (_req, res) => {
  res.json(await cached('meta', 120_000, () => getMetaState(5)));
}));

router.get('/api/home/highlights', ah(async (_req, res) => {
  const data = await cached('highlights', 120_000, async () => {
    const since = new Date(Date.now() - 7 * 864e5);
    const now = new Date();
    // Deck mais copiado (últimos 7 dias; fallback: copyCount geral)
    const recentCopies = await prisma.deckCopy.groupBy({ by: ['deckId'], where: { createdAt: { gt: since } }, _count: { deckId: true }, orderBy: { _count: { deckId: 'desc' } }, take: 5 });
    let topDeck = null;
    for (const rc of recentCopies) {
      const d = await prisma.communityDeck.findFirst({ where: { id: rc.deckId, status: 'VISIBLE', isPublic: true }, include: { author: true } });
      if (d) { topDeck = { deck: d, copies7d: rc._count.deckId }; break; }
    }
    if (!topDeck) {
      const d = await prisma.communityDeck.findFirst({ where: { status: 'VISIBLE', isPublic: true, copyCount: { gt: 0 } }, orderBy: [{ copyCount: 'desc' }, { updatedAt: 'desc' }], include: { author: true } });
      if (d) topDeck = { deck: d, copies7d: 0 };
    }
    const deckOut = topDeck ? await (async () => {
      const beys = json(topDeck.deck.beysJson, []);
      const ids = [...new Set(beys.flat())];
      const parts = await prisma.part.findMany({ where: { id: { in: ids } } });
      const { partDto } = await import('./catalog.js');
      return { slug: topDeck.deck.slug, title: topDeck.deck.title, copyCount: topDeck.deck.copyCount, copies7d: topDeck.copies7d, author: publicUser(topDeck.deck.author), beys, parts: Object.fromEntries(parts.map((p) => [p.id, partDto(p)])) };
    })() : null;

    // Clipe mais curtido da semana
    const clip = await prisma.post.findFirst({ where: { tag: 'CLIP', status: 'VISIBLE', kind: 'USER', createdAt: { gt: since } }, orderBy: [{ reactionCount: 'desc' }, { commentCount: 'desc' }, { createdAt: 'desc' }], include: { author: true } })
      || await prisma.post.findFirst({ where: { tag: 'CLIP', status: 'VISIBLE', kind: 'USER' }, orderBy: [{ reactionCount: 'desc' }, { createdAt: 'desc' }], include: { author: true } });
    const clipMedia = clip ? json(clip.mediaJson, []) : [];
    const clipThumb = clipMedia.find((m) => m.type === 'embed')?.id ? `https://i.ytimg.com/vi/${clipMedia.find((m) => m.type === 'embed').id}/hqdefault.jpg` : clipMedia.find((m) => m.type === 'image' || m.type === 'gif')?.url || null;

    // Próximo torneio agendado
    const next = await prisma.tournament.findFirst({ where: { status: 'OPEN', startsAt: { gte: now } }, orderBy: { startsAt: 'asc' }, include: { players: true } })
      || await prisma.tournament.findFirst({ where: { status: { in: ['OPEN', 'RUNNING'] } }, orderBy: { startsAt: 'asc' }, include: { players: true } });

    // Último campeão (com deck)
    const lastFinished = await prisma.tournament.findFirst({ where: { status: 'FINISHED' }, orderBy: { startsAt: 'desc' } });
    let champion = null;
    if (lastFinished) {
      const full = await loadTournament(lastFinished.slug);
      const st = standingsOf(full)[0];
      if (st) {
        const player = full.players.find((p) => p.id === st.player.id);
        const deck = player?.deckId ? await prisma.communityDeck.findUnique({ where: { id: player.deckId } }) : null;
        champion = { tournament: { slug: lastFinished.slug, name: full.name, startsAt: full.startsAt }, user: st.player.user, wins: st.wins, deck: deck ? { slug: deck.slug, title: deck.title, beys: json(deck.beysJson, []) } : null };
      }
    }
    return {
      topDeck: deckOut,
      topClip: clip ? { id: clip.id, title: clip.title, reactions: clip.reactionCount, comments: clip.commentCount, author: publicUser(clip.author), thumb: clipThumb, url: `/comunidade/p/${clip.id}` } : null,
      nextTournament: next ? { slug: next.slug, name: next.name, storeName: next.storeName, startsAt: next.startsAt, format: next.format, players: next.players.length, status: next.status } : null,
      champion,
    };
  });
  res.json(data);
}));

/** Feed híbrido: cards do sistema + decks compartilhados + posts de usuário com tags competitivas. */
router.get('/api/home/feed', ah(async (req, res) => {
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const limit = Math.min(30, Math.max(1, parseInt(req.query.limit, 10) || 12));
  const where = {
    status: 'VISIBLE',
    OR: [{ kind: 'SYSTEM' }, { kind: 'DECK' }, { kind: 'USER', tag: { in: HOME_TAGS } }],
  };
  const out = await listPosts({ where, sort: 'hot', skip: offset, take: limit, me: req.user || null, windowDays: 30 });
  res.json(out);
}));

router.get('/api/home/side', ah(async (_req, res) => {
  const data = await cached('side', 120_000, async () => {
    const now = new Date();
    const upcoming = await prisma.tournament.findMany({ where: { status: { in: ['OPEN', 'RUNNING'] }, startsAt: { gte: new Date(now.getTime() - 864e5) } }, orderBy: { startsAt: 'asc' }, take: 5, include: { players: true } });
    // Ranking de jogadores: títulos e vitórias em torneios encerrados nos últimos 180 dias
    const since = new Date(Date.now() - 180 * 864e5);
    const finished = await prisma.tournament.findMany({ where: { status: 'FINISHED', startsAt: { gt: since } }, select: { slug: true }, take: 60, orderBy: { startsAt: 'desc' } });
    const players = new Map();
    for (const t of finished) {
      const full = await loadTournament(t.slug);
      if (!full) continue;
      standingsOf(full).forEach((s, i) => {
        const u = s.player.user;
        const r = players.get(u.id) || { user: u, titles: 0, top4: 0, wins: 0, events: 0, points: 0 };
        r.events++; r.wins += s.wins;
        if (i === 0) r.titles++;
        if (i < 4) r.top4++;
        r.points += (i === 0 ? 10 : i < 4 ? 5 : 1) + s.wins;
        players.set(u.id, r);
      });
    }
    const ranking = [...players.values()].sort((a, b) => b.points - a.points || b.titles - a.titles || b.wins - a.wins).slice(0, 10);
    return {
      upcoming: upcoming.map((t) => ({ slug: t.slug, name: t.name, storeName: t.storeName, startsAt: t.startsAt, format: t.format, status: t.status, players: t.players.length })),
      ranking,
    };
  });
  res.json(data);
}));

export default router;
