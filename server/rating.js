// BX Ladder v2. Pure replay: editing/removing a tournament never leaves stale points.
// A player's provisional rating is deliberately less influential as an opponent until
// the player has a real sample. This prevents one upset by an unrated/new player from
// dragging an established competitor down, while still rewarding the upset itself.
export const RATING_RULES = Object.freeze({ version: 2, initial: 1000, k: 28, provisionalK: 36, scale: 400, maxGap: 250, provisionalOpponentWeight: 0.35, placementMatches: 10, placementEvents: 3, minimumPlayers: 4 });
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

export function ratingChange(a, b, score, options = {}) {
  // Provisional players remain anchored to the starting point until their form is
  // proven. Their own climb is preserved; only their weight as an opponent is damped.
  const opponent = options.opponentProvisional
    ? RATING_RULES.initial + (b - RATING_RULES.initial) * RATING_RULES.provisionalOpponentWeight
    : b;
  const gap = Math.max(-RATING_RULES.maxGap, Math.min(RATING_RULES.maxGap, opponent - a));
  const expected = 1 / (1 + 10 ** (gap / RATING_RULES.scale));
  const k = options.provisional ? RATING_RULES.provisionalK : RATING_RULES.k;
  return Math.round(k * (score - expected));
}
const tierIndexForPoints = points => Math.max(0, RANK_TIERS.findLastIndex(t => points >= t.min));
const eventModifier = (a, b, score, records) => {
  if (score === 0.5) return 1;
  const aTier = tierIndexForPoints(a.points), bTier = tierIndexForPoints(b.points);
  const lowerWon = score === 1 ? aTier < bTier : bTier < aTier;
  const gap = Math.abs(aTier - bTier);
  if (!lowerWon || gap < 2) return 1;
  const higher = score === 1 ? b : a;
  const higherRecord = records.get(higher.userId) || { wins: 0, losses: 0 };
  // Two+ tiers apart is an upset: reward the lower player, but keep the bonus
  // bounded. A favorite with a positive event still gets a softer correction.
  const upsetBonus = Math.min(1.25, 1 + 0.12 * (gap - 1));
  const campaign = higherRecord.wins - higherRecord.losses;
  return campaign > 0 ? 1 : campaign < 0 ? upsetBonus * 1.08 : upsetBonus;
};
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
    const eventRecords = new Map([...active].map(id => [id, { wins: 0, losses: 0, ties: 0 }]));
    for (const m of matches) {
      const a = players.get(m.p1Id), b = players.get(m.p2Id), ra = eventRecords.get(a), rb = eventRecords.get(b);
      if (!ra || !rb) continue;
      if (m.winnerId === m.p1Id) { ra.wins++; rb.losses++; }
      else if (m.winnerId === m.p2Id) { rb.wins++; ra.losses++; }
      else { ra.ties++; rb.ties++; }
    }
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
        const aProvisional = sa.matches < RATING_RULES.placementMatches || sa.events < RATING_RULES.placementEvents;
        const bProvisional = sb.matches < RATING_RULES.placementMatches || sb.events < RATING_RULES.placementEvents;
        const rawDelta = ratingChange(sa.points, sb.points, score, { provisional: aProvisional, opponentProvisional: bProvisional });
        const delta = Math.round(rawDelta * eventModifier(sa, sb, score, eventRecords));
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
