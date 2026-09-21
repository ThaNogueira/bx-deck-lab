import { Router } from 'express';
import { prisma } from '../db.js';
import { publicUser } from '../auth.js';
import { json } from '../util.js';
import { partDto } from './catalog.js';
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

/** Ranking público: somente torneios concluídos, sem as arenas privadas de teste. */
async function buildPlayerRanking({ limit = null } = {}) {
  const finished = await prisma.tournament.findMany({
    where: { status: 'FINISHED', visibility: { in: ['PUBLIC', 'LINK_ONLY'] }, OR: [{ description: null }, { NOT: { description: { startsWith: '[ADMIN TEST]' } } }] },
    select: { slug: true }, orderBy: { startsAt: 'desc' }, take: 150,
  });
  const players = new Map();
  let matches = 0;
  for (const event of finished) {
    const full = await loadTournament(event.slug);
    if (!full) continue;
    matches += full.matches.filter((m) => m.status === 'DONE' && !!m.p2Id).length;
    standingsOf(full).forEach((s, place) => {
      const u = s.player.user;
      const row = players.get(u.id) || { user: u, gold: 0, silver: 0, bronze: 0, titles: 0, top4: 0, wins: 0, losses: 0, events: 0, points: 0, beyMap: new Map() };
      row.events++; row.wins += s.wins; row.losses += s.losses;
      if (place === 0) { row.gold++; row.titles++; }
      if (place === 1) row.silver++;
      if (place === 2) row.bronze++;
      if (place < 4) row.top4++;
      row.points += (place === 0 ? 10 : place < 4 ? 5 : 1) + s.wins;
      players.set(u.id, row);

      const enrolled = full.players.find((p) => p.id === s.player.id);
      const deck = enrolled?.manualDeckJson ? json(enrolled.manualDeckJson, []) : json(enrolled?.deck?.beysJson, []);
      deck.forEach((bey) => {
        if (!Array.isArray(bey) || !bey.length) return;
        const key = bey.join('|');
        const item = row.beyMap.get(key) || { ids: bey, uses: 0 };
        item.uses++; row.beyMap.set(key, item);
      });
    });
  }
  const allPartIds = [...new Set([...players.values()].flatMap((player) => [...player.beyMap.values()].flatMap((bey) => bey.ids)))];
  const allParts = allPartIds.length ? await prisma.part.findMany({ where: { id: { in: allPartIds } } }) : [];
  const partById = new Map(allParts.map((part) => [part.id, part]));
  const mostUsedPart = (entries, predicate) => {
    const counts = new Map();
    entries.forEach((entry) => entry.ids.forEach((id) => {
      const part = partById.get(id);
      if (part && predicate(part)) counts.set(id, (counts.get(id) || 0) + entry.uses);
    }));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
  };
  // Lê o histórico como o jogador realmente montou: Blade mais frequente,
  // depois a Ratchet mais frequente com ela, depois o Bit desse par.
  const favoriteBey = (beyMap) => {
    const entries = [...beyMap.values()];
    const blade = mostUsedPart(entries, (part) => part.kind === 'BLADE' || part.kind === 'MAIN_BLADE');
    if (!blade) return null;
    let narrowed = entries.filter((entry) => entry.ids.includes(blade[0]));
    const ratchet = mostUsedPart(narrowed, (part) => part.kind === 'RATCHET');
    if (ratchet) narrowed = narrowed.filter((entry) => entry.ids.includes(ratchet[0]));
    const bit = mostUsedPart(narrowed, (part) => part.kind === 'BIT');
    if (bit) narrowed = narrowed.filter((entry) => entry.ids.includes(bit[0]));
    const exact = narrowed.sort((a, b) => b.uses - a.uses || a.ids.join('|').localeCompare(b.ids.join('|')))[0];
    return {
      ids: exact?.ids || [blade[0], ratchet?.[0], bit?.[0]].filter(Boolean),
      uses: bit?.[1] || ratchet?.[1] || blade[1],
      path: [blade, ratchet, bit].filter(Boolean).map(([id, uses]) => ({ id, uses })),
    };
  };
  const ranking = [...players.values()]
    .sort((a, b) => b.points - a.points || b.gold - a.gold || b.wins - a.wins || a.user.name.localeCompare(b.user.name))
    .map(({ beyMap, ...row }) => ({ ...row, favoriteBey: favoriteBey(beyMap) }));
  const publishedRanking = limit ? ranking.slice(0, limit) : ranking;
  const partIds = [...new Set(publishedRanking.flatMap((player) => player.favoriteBey?.ids || []))];
  const parts = partIds.map((id) => partById.get(id)).filter(Boolean);
  return {
    ranking: publishedRanking,
    parts: Object.fromEntries(parts.map((p) => [p.id, partDto(p)])),
    totals: { tournaments: finished.length, players: players.size, matches },
  };
}

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
    const next = await prisma.tournament.findFirst({ where: { status: 'OPEN', visibility: 'PUBLIC', startsAt: { gte: now } }, orderBy: { startsAt: 'asc' }, include: { players: true } })
      || await prisma.tournament.findFirst({ where: { status: { in: ['OPEN', 'RUNNING'] }, visibility: 'PUBLIC' }, orderBy: { startsAt: 'asc' }, include: { players: true } });

    // Campeões recentes e os decks declarados: material para a vitrine da home.
    const finished = await prisma.tournament.findMany({ where: { status: 'FINISHED', visibility: { in: ['PUBLIC', 'LINK_ONLY'] } }, orderBy: { startsAt: 'desc' }, take: 4 });
    const recentChampions = (await Promise.all(finished.map(async (event) => {
      const full = await loadTournament(event.slug);
      const st = full && standingsOf(full)[0];
      if (!st) return null;
      const player = full.players.find((p) => p.id === st.player.id);
      const deck = player?.manualDeckJson
        ? { slug: null, title: player.manualDeckTitle || 'Deck definido pelo gestor', beysJson: player.manualDeckJson }
        : player?.deck;
      return {
        tournament: { slug: event.slug, name: full.name, startsAt: full.startsAt, storeName: full.storeName },
        user: st.player.user, wins: st.wins, points: st.points,
        deck: deck ? { slug: deck.slug, title: deck.title, beys: json(deck.beysJson, []) } : null,
      };
    }))).filter(Boolean);
    const championPartIds = [...new Set(recentChampions.flatMap((c) => c.deck?.beys.flat() || []))];
    const championParts = championPartIds.length ? await prisma.part.findMany({ where: { id: { in: championPartIds } } }) : [];
    const champion = recentChampions[0] || null;
    return {
      topDeck: deckOut,
      topClip: clip ? { id: clip.id, title: clip.title, reactions: clip.reactionCount, comments: clip.commentCount, author: publicUser(clip.author), thumb: clipThumb, url: `/comunidade/p/${clip.id}` } : null,
      nextTournament: next ? { slug: next.slug, name: next.name, storeName: next.storeName, startsAt: next.startsAt, format: next.format, players: next.players.length, status: next.status } : null,
      champion,
      recentChampions,
      championParts: Object.fromEntries(championParts.map((p) => [p.id, partDto(p)])),
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
    const upcoming = await prisma.tournament.findMany({ where: { status: { in: ['OPEN', 'RUNNING'] }, visibility: 'PUBLIC', startsAt: { gte: new Date(now.getTime() - 864e5) } }, orderBy: { startsAt: 'asc' }, take: 5, include: { players: true } });
    const { ranking } = await buildPlayerRanking({ limit: 10 });
    return {
      upcoming: upcoming.map((t) => ({ slug: t.slug, name: t.name, storeName: t.storeName, startsAt: t.startsAt, format: t.format, status: t.status, players: t.players.length })),
      ranking,
    };
  });
  res.json(data);
}));

router.get('/api/ranking', ah(async (_req, res) => {
  res.json(await cached('ranking', 120_000, () => buildPlayerRanking()));
}));

export default router;
