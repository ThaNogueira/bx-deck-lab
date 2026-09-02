import { prisma } from './db.js';
import { json } from './util.js';
import { publicUser } from './auth.js';
import { partDto } from './routes/catalog.js';
import { standingsOf, loadTournament } from './routes/tournaments.js';

/**
 * Meta do site = o que a comunidade está jogando de verdade:
 *  - decks declarados por jogadores em torneios (peso por colocação),
 *  - decks copiados no builder (copyCount / DeckCopy),
 *  - decks compartilhados na comunidade (reações).
 * O ranking é recalculado por rotina (a cada 6h e após um torneio encerrar) e
 * guardado em MetaSnapshot por semana ISO, para mostrar "subiu/caiu" vs. a semana anterior.
 * Cards automáticos (posts kind=SYSTEM) nascem daqui e dos eventos de torneio.
 */

const WINDOW_DAYS = 90;
const TOP_N = 10;

export function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 864e5 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
function prevWeekKey(d = new Date()) { return isoWeekKey(new Date(d.getTime() - 7 * 864e5)); }

const comboKey = (partIds) => [...partIds].map(String).sort().join('+');

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

export async function computeMeta() {
  const since = new Date(Date.now() - WINDOW_DAYS * 864e5);
  const parts = new Map(); // partId -> score
  const combos = new Map(); // key -> {parts, score, deckIds:Set, uses}
  const sources = { tournamentDecks: 0, copies: 0, sharedDecks: 0 };
  const bump = (map, key, w, extra) => { const r = map.get(key) || { score: 0, ...extra }; r.score += w; map.set(key, r); return r; };
  const addDeck = (beys, w, deckId) => {
    for (const bey of beys || []) {
      if (!Array.isArray(bey) || !bey.length) continue;
      for (const pid of bey) bump(parts, String(pid), w, {});
      const r = bump(combos, comboKey(bey), w, { parts: bey.map(String), deckIds: new Set(), uses: 0 });
      r.uses++;
      if (deckId) r.deckIds.add(deckId);
    }
  };

  // 1) Decks em torneios (colocação pesa): campeão 4, top 4 = 2.5, resto 1.2; torneio em andamento 1
  const tours = await prisma.tournament.findMany({ where: { status: { in: ['RUNNING', 'FINISHED'] }, startsAt: { gt: since } }, select: { slug: true, status: true } });
  for (const t of tours) {
    const full = await loadTournament(t.slug);
    if (!full) continue;
    const withDeck = full.players.filter((p) => p.deckId);
    if (!withDeck.length) continue;
    const decks = await prisma.communityDeck.findMany({ where: { id: { in: withDeck.map((p) => p.deckId) } } });
    const byId = new Map(decks.map((d) => [d.id, d]));
    const standings = full.status === 'FINISHED' ? standingsOf(full) : [];
    for (const p of withDeck) {
      const d = byId.get(p.deckId); if (!d) continue;
      const pos = standings.findIndex((s) => s.player.id === p.id);
      const w = full.status !== 'FINISHED' ? 1 : pos === 0 ? 4 : pos >= 0 && pos < 4 ? 2.5 : 1.2;
      addDeck(json(d.beysJson, []), w, d.id);
      sources.tournamentDecks++;
    }
  }

  // 2) Cópias de decks públicos (cada cópia recente = 0.6; o próprio copyCount histórico entra com 0.2)
  const copies = await prisma.deckCopy.findMany({ where: { createdAt: { gt: since } }, include: { deck: true } });
  for (const c of copies) {
    if (!c.deck || c.deck.status !== 'VISIBLE' || !c.deck.isPublic) continue;
    addDeck(json(c.deck.beysJson, []), 0.6, c.deck.id);
    sources.copies++;
  }

  // 3) Decks compartilhados na comunidade (post kind DECK): 0.4 + 0.15 por reação
  const shared = await prisma.post.findMany({ where: { kind: 'DECK', status: 'VISIBLE', createdAt: { gt: since }, deckId: { not: null } }, include: { deck: true } });
  for (const p of shared) {
    if (!p.deck) continue;
    addDeck(json(p.deck.beysJson, []), 0.4 + 0.15 * (p.reactionCount || 0), p.deck.id);
    sources.sharedDecks++;
  }

  const rank = (map, mapFn) => [...map.entries()]
    .map(([key, r]) => ({ key, score: +r.score.toFixed(2), ...mapFn(r) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map((x, i) => ({ ...x, rank: i + 1 }));

  return {
    computedAt: new Date().toISOString(),
    sources,
    parts: rank(parts, () => ({})).map((x) => ({ id: x.key, score: x.score, rank: x.rank })),
    combos: rank(combos, (r) => ({ parts: r.parts, uses: r.uses, deckIds: [...r.deckIds].slice(0, 5) })),
  };
}

let refreshing = null;
/** Recalcula e grava o snapshot da semana atual (idempotente). Devolve o snapshot + o anterior. */
export async function refreshMeta({ reason = 'schedule' } = {}) {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const data = await computeMeta();
      const weekKey = isoWeekKey();
      await prisma.metaSnapshot.upsert({ where: { weekKey }, update: { dataJson: JSON.stringify(data), computedAt: new Date() }, create: { weekKey, dataJson: JSON.stringify(data) } });
      await generateMetaCards(data).catch((e) => console.warn('[meta] cards:', e.message));
      console.log(`[meta] ranking atualizado (${reason}): ${data.combos.length} combos, ${data.parts.length} peças`);
      return data;
    } finally { refreshing = null; }
  })();
  return refreshing;
}

// ---------------------------------------------------------------------------
// Leitura: Estado do Meta (top 5 com variação semanal)
// ---------------------------------------------------------------------------

async function snapshot(weekKey) {
  const s = await prisma.metaSnapshot.findUnique({ where: { weekKey } });
  return s ? json(s.dataJson, null) : null;
}

async function enrichCombos(combos) {
  const ids = [...new Set(combos.flatMap((c) => c.parts))];
  const parts = ids.length ? await prisma.part.findMany({ where: { id: { in: ids } } }) : [];
  const byId = new Map(parts.map((p) => [p.id, partDto(p)]));
  const deckIds = [...new Set(combos.flatMap((c) => c.deckIds || []))];
  const decks = deckIds.length ? await prisma.communityDeck.findMany({ where: { id: { in: deckIds }, status: 'VISIBLE', isPublic: true }, include: { author: true } }) : [];
  const deckById = new Map(decks.map((d) => [d.id, d]));
  return combos.map((c) => {
    const ps = c.parts.map((id) => byId.get(id)).filter(Boolean);
    const deck = (c.deckIds || []).map((id) => deckById.get(id)).find(Boolean);
    return {
      key: c.key, rank: c.rank, prevRank: c.prevRank ?? null, delta: c.delta ?? null, isNew: !!c.isNew, score: c.score, uses: c.uses,
      label: ps.map((p) => p.displayName).join(' ') || 'Combo',
      parts: ps,
      deck: deck ? { slug: deck.slug, title: deck.title, copyCount: deck.copyCount, author: publicUser(deck.author) } : null,
    };
  });
}

function withDeltas(list, prevList) {
  const prev = new Map((prevList || []).map((x) => [x.key || x.id, x.rank]));
  return list.map((x) => {
    const k = x.key || x.id;
    const pr = prev.get(k) ?? null;
    return { ...x, prevRank: pr, delta: pr == null ? null : pr - x.rank, isNew: pr == null && prevList?.length > 0 };
  });
}

/** Top N combos com variação vs. semana anterior. Se a semana atual ainda não foi calculada, calcula. */
export async function getMetaState(n = 5) {
  let cur = await snapshot(isoWeekKey());
  if (!cur) cur = await refreshMeta({ reason: 'first-read' });
  const prev = await snapshot(prevWeekKey());
  const combos = withDeltas(cur.combos.slice(0, n), prev?.combos);
  const parts = withDeltas(cur.parts.slice(0, n), prev?.parts);
  const partRows = parts.length ? await prisma.part.findMany({ where: { id: { in: parts.map((p) => p.id) } } }) : [];
  const pById = new Map(partRows.map((p) => [p.id, partDto(p)]));
  return {
    weekKey: isoWeekKey(),
    prevWeekKey: prev ? prevWeekKey() : null,
    computedAt: cur.computedAt,
    sources: cur.sources,
    combos: await enrichCombos(combos),
    parts: parts.map((p) => ({ ...p, part: pById.get(p.id) || null })).filter((p) => p.part),
    thin: cur.combos.length < n, // pouca amostra: o front complementa com o índice BBX Weekly
  };
}

// ---------------------------------------------------------------------------
// Cards automáticos (posts do sistema)
// ---------------------------------------------------------------------------

export const SYSTEM_TAG_BY_EVENT = { 't-open': 'RESULT', 't-finished': 'CHAMPION', 'meta-up': 'DECK', 'meta-new': 'DECK' };

/** Cria (ou atualiza) um post do sistema, idempotente por systemKey. */
export async function ensureSystemPost(systemKey, { title, body = null, tag = 'RESULT', deckId = null, data = null }) {
  const existing = await prisma.post.findUnique({ where: { systemKey } });
  const payload = { title: title.slice(0, 140), body: body ? String(body).slice(0, 2000) : null, tag, deckId, dataJson: data ? JSON.stringify(data) : null };
  if (existing) return prisma.post.update({ where: { id: existing.id }, data: payload });
  return prisma.post.create({ data: { ...payload, systemKey, kind: 'SYSTEM', authorId: null, status: 'VISIBLE' } });
}

export async function onTournamentCreated(t) {
  await ensureSystemPost(`t-open:${t.slug}`, {
    title: `Novo torneio aberto para inscrições: ${t.name}`,
    body: [t.storeName ? `Local: ${t.storeName}.` : null, `Formato ${t.format === 'POINTS4' ? 'partida única (4 pontos)' : 'melhor de 3'}.`, 'Garanta sua vaga pelo link de inscrição.'].filter(Boolean).join(' '),
    tag: 'RESULT',
    data: { icon: 'calendar', event: 't-open', tournamentSlug: t.slug, startsAt: t.startsAt, cta: { label: 'Ver torneio', url: `/torneio/${t.slug}` } },
  }).catch(() => {});
}

export async function onTournamentFinished(slug) {
  const full = await loadTournament(slug);
  if (!full || full.status !== 'FINISHED') return;
  const standings = standingsOf(full);
  const champ = standings[0];
  if (!champ) return;
  const player = full.players.find((p) => p.id === champ.player.id);
  const deck = player?.deckId ? await prisma.communityDeck.findUnique({ where: { id: player.deckId }, include: { author: true } }) : null;
  const name = champ.player.user.name;
  await ensureSystemPost(`t-finished:${slug}`, {
    title: `Torneio ${full.name} finalizado — campeão: ${name}${deck ? ` com o deck ${deck.title}` : ''}`,
    body: `${champ.wins} vitória(s) em ${full.currentRound} rodada(s)${full.storeName ? ` • ${full.storeName}` : ''}.${deck ? ' O deck usado está no card: abra no builder ou copie para a sua conta.' : ''}`,
    tag: 'CHAMPION',
    deckId: deck?.id ?? null,
    data: { icon: 'trophy', event: 't-finished', tournamentSlug: slug, champion: publicUser(champ.player.user), cta: { label: 'Ver resultado', url: `/torneio/${slug}` } },
  }).catch(() => {});
  await refreshMeta({ reason: `torneio ${slug} encerrado` }).catch(() => {});
}

/** "Deck X subiu N posições" / "entrou no top 10" — 1 card por combo por semana. */
async function generateMetaCards(data) {
  const prev = await snapshot(prevWeekKey());
  if (!prev?.combos?.length) return; // sem semana anterior não há variação para anunciar
  const week = isoWeekKey();
  const combos = withDeltas(data.combos.slice(0, TOP_N), prev.combos);
  const enriched = await enrichCombos(combos);
  for (const c of enriched) {
    if (c.isNew) {
      await ensureSystemPost(`meta-new:${week}:${c.key}`, {
        title: `${c.label} entrou no top ${TOP_N} do meta`,
        body: `Estreou em #${c.rank} no ranking desta semana, puxado por torneios e cópias no builder.`,
        tag: 'DECK', deckId: c.deck ? (await prisma.communityDeck.findUnique({ where: { slug: c.deck.slug } }))?.id ?? null : null,
        data: { icon: 'sparkle', event: 'meta-new', rank: c.rank, comboKey: c.key, cta: { label: 'Ver meta', url: '/#meta' } },
      });
    } else if (c.delta != null && c.delta >= 2) {
      await ensureSystemPost(`meta-up:${week}:${c.key}`, {
        title: `${c.label} subiu ${c.delta} posições no meta`,
        body: `De #${c.prevRank} para #${c.rank} nesta semana.`,
        tag: 'DECK', deckId: c.deck ? (await prisma.communityDeck.findUnique({ where: { slug: c.deck.slug } }))?.id ?? null : null,
        data: { icon: 'top', event: 'meta-up', rank: c.rank, prevRank: c.prevRank, delta: c.delta, comboKey: c.key, cta: { label: 'Ver meta', url: '/#meta' } },
      });
    }
  }
}

/** Rotina periódica: recalcula a cada 6h (e no boot, 30s depois de subir). */
export function scheduleMetaJobs() {
  setTimeout(() => refreshMeta({ reason: 'boot' }).catch((e) => console.warn('[meta]', e.message)), 30_000);
  setInterval(() => refreshMeta({ reason: 'schedule' }).catch((e) => console.warn('[meta]', e.message)), 6 * 3_600_000);
}
