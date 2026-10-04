// BX Elo v1. Pure replay: editing/removing a tournament never leaves stale points.
export const RATING_RULES = Object.freeze({ version: 1, initial: 1000, k: 32, scale: 400, placementMatches: 5, placementEvents: 2, minimumPlayers: 4 });
export const RANK_TIERS = [
  { id: 'ferro', name: 'Ferro de Forja', min: 0, color: '#a6afb9' },
  { id: 'bronze', name: 'Bronze de Giro', min: 900, color: '#d39b69' },
  { id: 'prata', name: 'Prata de Arena', min: 1050, color: '#d8e5ee' },
  { id: 'ouro', name: 'Ouro de Impacto', min: 1200, color: '#f4d36a' },
  { id: 'platina', name: 'Platina de Aço', min: 1350, color: '#71dcd1' },
  { id: 'diamante', name: 'Diamante X', min: 1500, color: '#83c6ff' },
  { id: 'mestre', name: 'Mestre Blader', min: 1650, color: '#c4a0ff' },
  { id: 'lenda', name: 'Lenda X', min: 1800, color: '#c2f970' },
].map(t => Object.freeze({ ...t, icon: `/assets/ranks/${t.id}.png` }));

export const rankableEvent = t => t.status === 'FINISHED'
  && ['PUBLIC', 'LINK_ONLY'].includes(t.visibility)
  && !t.description?.startsWith('[ADMIN TEST]');

export function ratingChange(a, b, score) {
  const expected = 1 / (1 + 10 ** ((b - a) / RATING_RULES.scale));
  return Math.round(RATING_RULES.k * (score - expected));
}
const fresh = userId => ({ userId, points: RATING_RULES.initial, peak: RATING_RULES.initial, matches: 0, events: 0, wins: 0, losses: 0, ties: 0, history: [] });

export function ratingDto(state = fresh(null)) {
  const provisional = state.matches < RATING_RULES.placementMatches || state.events < RATING_RULES.placementEvents;
  const index = RANK_TIERS.findLastIndex(t => state.points >= t.min);
  const tier = RANK_TIERS[Math.max(0, index)];
  const next = RANK_TIERS[index + 1] || null;
  return { points: state.points, peak: state.peak, matches: state.matches, events: state.events,
    wins: state.wins, losses: state.losses, ties: state.ties, provisional,
    matchesRemaining: Math.max(0, RATING_RULES.placementMatches - state.matches),
    eventsRemaining: Math.max(0, RATING_RULES.placementEvents - state.events),
    tier: provisional ? null : tier, next: provisional ? null : next,
    progress: provisional ? Math.round(Math.min(state.matches / RATING_RULES.placementMatches, state.events / RATING_RULES.placementEvents, 1) * 100)
      : next ? Math.round((state.points - tier.min) / (next.min - tier.min) * 100) : 100,
    pointsToNext: !provisional && next ? next.min - state.points : null,
    lastChange: state.history.at(-1)?.delta ?? null, history: state.history.slice(-12), version: RATING_RULES.version };
}

export function calculateRatings(tournaments) {
  const states = new Map();
  const get = id => { if (!states.has(id)) states.set(id, fresh(id)); return states.get(id); };
  let ratedEvents = 0, ratedMatches = 0;
  for (const t of [...tournaments].filter(rankableEvent).sort((a,b) => new Date(a.startsAt) - new Date(b.startsAt) || a.id.localeCompare(b.id))) {
    const players = new Map(t.players.map(p => [p.id, p.userId]));
    const matches = t.matches.filter(m => m.status === 'DONE' && m.p2Id && players.has(m.p1Id) && players.has(m.p2Id)
      && players.get(m.p1Id) !== players.get(m.p2Id) && (!m.winnerId || [m.p1Id, m.p2Id].includes(m.winnerId)))
      .sort((a,b) => a.round - b.round || a.tableNo - b.tableNo || a.id.localeCompare(b.id));
    // Entries alone are not enough: four distinct players must actually play.
    const active = new Set(matches.flatMap(m => [players.get(m.p1Id), players.get(m.p2Id)]));
    if (active.size < RATING_RULES.minimumPlayers) continue;
    const before = new Map([...active].map(id => { const s = get(id); return [id, { points: s.points, matches: s.matches, wins: s.wins, losses: s.losses, ties: s.ties }]; }));
    const rounds = new Map();
    for (const m of matches) { if (!rounds.has(m.round)) rounds.set(m.round, []); rounds.get(m.round).push(m); }
    for (const list of rounds.values()) {
      const played = new Set(), changes = new Map();
      for (const m of list) {
        const a = players.get(m.p1Id), b = players.get(m.p2Id);
        // Defensive against duplicate pairings/results for the same round.
        if (played.has(a) || played.has(b)) continue;
        played.add(a); played.add(b);
        const sa = get(a), sb = get(b);
        const score = m.winnerId === m.p1Id ? 1 : m.winnerId === m.p2Id ? 0 : 0.5;
        const delta = ratingChange(sa.points, sb.points, score);
        changes.set(a, delta); changes.set(b, -delta);
        sa.matches++; sb.matches++; ratedMatches++;
        if (score === 1) { sa.wins++; sb.losses++; }
        else if (score === 0) { sb.wins++; sa.losses++; }
        else { sa.ties++; sb.ties++; }
      }
      // Round snapshot prevents table ordering from changing the result.
      for (const [id, delta] of changes) { const s = get(id); s.points = Math.max(0, s.points + delta); s.peak = Math.max(s.peak, s.points); }
    }
    let counted = false;
    for (const [id, previous] of before) {
      const s = get(id);
      if (s.matches === previous.matches) continue;
      counted = true; s.events++;
      s.history.push({ slug: t.slug, name: t.name, startsAt: t.startsAt, before: previous.points, points: s.points, delta: s.points - previous.points,
        wins: s.wins - previous.wins, losses: s.losses - previous.losses, ties: s.ties - previous.ties });
    }
    if (counted) ratedEvents++;
  }
  return { byUser: new Map([...states].map(([id, s]) => [id, ratingDto(s)])), totals: { events: ratedEvents, matches: ratedMatches }, tiers: RANK_TIERS, rules: RATING_RULES };
}
