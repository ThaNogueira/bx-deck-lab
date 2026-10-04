// Public competitive history: no test/private/canceled events, no arbitrary cap.
export const competitionWhere = {
  status: { in: ['OPEN', 'RUNNING', 'FINISHED'] },
  visibility: { in: ['PUBLIC', 'LINK_ONLY'] },
  OR: [{ description: null }, { NOT: { description: { startsWith: '[ADMIN TEST]' } } }],
};

export const eligibleTournament = (t) => ['PUBLIC', 'LINK_ONLY'].includes(t.visibility)
  && ['OPEN', 'RUNNING', 'FINISHED'].includes(t.status)
  && !t.description?.startsWith('[ADMIN TEST]');

export function tournamentBeys(player) {
  try {
    const value = JSON.parse(player.manualDeckJson || player.deck?.beysJson || '[]');
    return Array.isArray(value) ? value.filter(Array.isArray).map(b => b.filter(id => typeof id === 'string')).filter(b => b.length) : [];
  } catch { return []; }
}

const percent = (n, total) => total ? Math.round(n / total * 1000) / 10 : null;
const mostFrequent = (values) => [...values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map())]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];

/** Standings placement is supplied by the same official sorter as the tournament. */
export function buildCompetitionStats(userId, tournaments, parts) {
  const catalog = new Map(parts.map(p => [p.id, p]));
  const canonical = id => catalog.get(id)?.parentId || id;
  const bladeOf = ids => ids.find(id => ['BLADE', 'MAIN_BLADE'].includes(catalog.get(id)?.kind));
  const summary = { events: 0, wins: 0, losses: 0, ties: 0, matches: 0, byes: 0, administrativeLosses: 0,
    gold: 0, silver: 0, bronze: 0, top4: 0, bestStreak: 0, currentStreak: 0, decksRecorded: 0 };
  const history = [], results = [], blades = new Map(), months = new Map();
  const sorted = tournaments.filter(eligibleTournament).sort((a,b) => new Date(a.startsAt) - new Date(b.startsAt) || a.id.localeCompare(b.id));
  for (const t of sorted) {
    const player = t.players.find(p => p.userId === userId);
    if (!player) continue;
    const finished = t.status === 'FINISHED';
    const record = { slug: t.slug, name: t.name, storeName: t.storeName, startsAt: t.startsAt, status: t.status,
      format: t.format, players: t.players.length, dropped: player.dropped, placement: t.placement || null,
      wins: 0, losses: 0, ties: 0, matches: 0, byes: 0, champion: finished && t.placement === 1 };
    const eventResults = [];
    for (const m of [...t.matches].sort((a,b) => a.round - b.round || a.tableNo - b.tableNo)) {
      if (m.status !== 'DONE' || (m.p1Id !== player.id && m.p2Id !== player.id)) continue;
      if (!m.p2Id) { record.byes++; continue; }
      if (m.winnerId && m.winnerId !== m.p1Id && m.winnerId !== m.p2Id) continue;
      const outcome = !m.winnerId ? 'D' : m.winnerId === player.id ? 'W' : 'L';
      record.matches++;
      record[outcome === 'W' ? 'wins' : outcome === 'L' ? 'losses' : 'ties']++;
      eventResults.push({ outcome, round: m.round, tournament: t.name, slug: t.slug, date: t.startsAt });
    }
    record.winRate = percent(record.wins, record.matches);
    history.push(record);
    if (!finished) continue;
    summary.events++;
    for (const key of ['wins', 'losses', 'ties', 'matches', 'byes']) summary[key] += record[key];
    summary.administrativeLosses += player.lateLosses || 0;
    if (t.placement >= 1 && t.placement <= 3) summary[['gold', 'silver', 'bronze'][t.placement - 1]]++;
    if (t.placement >= 1 && t.placement <= 4) summary.top4++;
    for (const result of eventResults) {
      summary.currentStreak = result.outcome === 'W' ? summary.currentStreak + 1 : 0;
      summary.bestStreak = Math.max(summary.bestStreak, summary.currentStreak);
      results.push(result);
    }
    const month = new Date(t.startsAt).toISOString().slice(0, 7);
    const monthly = months.get(month) || { month, wins: 0, matches: 0, events: 0 };
    monthly.wins += record.wins; monthly.matches += record.matches; monthly.events++;
    months.set(month, monthly);
    const beys = tournamentBeys(player);
    if (!beys.length) continue;
    summary.decksRecorded++;
    const seen = new Set();
    for (const ids of beys) {
      const blade = bladeOf(ids);
      if (!blade) continue;
      const key = canonical(blade);
      if (seen.has(key)) continue;
      seen.add(key);
      const row = blades.get(key) || { bladeId: key, uses: 0, combos: [] };
      row.uses++; row.combos.push(ids);
      blades.set(key, row);
    }
  }
  const favoriteBeys = [...blades.values()].sort((a,b) => b.uses - a.uses || a.bladeId.localeCompare(b.bladeId)).slice(0,3).map(row => {
    // Choose a combo actually registered: blade -> most common ratchet -> bit.
    let candidates = row.combos;
    for (const kind of ['RATCHET', 'BIT']) {
      const keyOf = ids => { const id = ids.find(id => catalog.get(id)?.kind === kind); return id ? canonical(id) : ''; };
      const chosen = mostFrequent(candidates.map(keyOf));
      candidates = candidates.filter(ids => keyOf(ids) === chosen);
    }
    const composition = mostFrequent(candidates.map(ids => ids.map(canonical).sort().join('|')));
    const ids = candidates.find(ids => ids.map(canonical).sort().join('|') === composition);
    const blade = catalog.get(row.bladeId) || catalog.get(bladeOf(ids));
    return { bladeId: row.bladeId, name: blade?.displayName || blade?.name || 'Bey', ids,
      uses: row.uses, usageRate: percent(row.uses, summary.decksRecorded) };
  });
  summary.winRate = percent(summary.wins, summary.matches);
  summary.podiums = summary.gold + summary.silver + summary.bronze;
  summary.podiumRate = percent(summary.podiums, summary.events);
  const lastTen = results.slice(-10);
  summary.recentWinRate = percent(lastTen.filter(r => r.outcome === 'W').length, lastTen.length);
  return { summary, favoriteBeys, recent: lastTen, tournaments: history.reverse(),
    monthly: [...months.values()].slice(-6).map(m => ({ ...m, winRate: percent(m.wins, m.matches) })) };
}
