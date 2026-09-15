const ENDPOINT = process.env.TAMERLEAGUE_ENDPOINT || 'https://www.tamerclub.com.br/api/tournaments/beybladex';
const status = (value) => ({ OPEN: 'DRAFT', RUNNING: 'IN_PROGRESS', FINISHED: 'FINISHED' }[value] || null);
const date = (value) => new Date(value).toISOString();
const json = (value, fallback = []) => { try { return JSON.parse(value || '[]'); } catch { return fallback; } };

const user = (value) => ({ id: value.id, slug: value.slug, name: value.name, avatarUrl: value.avatarUrl ?? null, bannerUrl: value.bannerUrl ?? null, bio: value.bio ?? null, verified: value.verified, role: ['ADMIN', 'MOD'].includes(value.role) ? value.role : 'USER', frameId: value.frameId ?? null, stickers: json(value.stickersJson), favoritePartId: value.favoritePartId ?? null, createdAt: date(value.createdAt) });
const player = (value) => ({
  id: value.id, dropped: value.dropped, lateLosses: value.lateLosses ?? 0, user: user(value.user),
  deckDeclared: Boolean(value.deckId || value.manualDeckJson),
  deck: value.manualDeckJson ? { id: null, slug: null, managed: true, title: value.manualDeckTitle || 'Deck definido pelo gestor', beys: json(value.manualDeckJson) } : value.deck ? { id: value.deck.id, slug: value.deck.slug, managed: false, title: value.deck.title, beys: json(value.deck.beysJson) } : null,
});

export function buildTamerLeaguePayload(t, standings) {
  const mappedStatus = status(t.status);
  if (!mappedStatus) throw new Error(`O status ${t.status} não pode ser enviado ao TamerLeague.`);
  const players = t.players.map(player);
  const byId = new Map(players.map((p) => [p.id, p]));
  return {
    exportedAt: new Date().toISOString(),
    tournament: { id: t.id, slug: t.slug, name: t.name, storeName: t.storeName || '', address: t.address ?? null, startsAt: date(t.startsAt), format: t.format, roundsPlanned: t.roundsPlanned, description: t.description ?? null, status: mappedStatus, currentRound: t.currentRound, organizer: user(t.organizer), playersCount: players.length, joinUrl: `${process.env.SITE_URL || 'http://localhost:3000'}/t/${t.slug}`, whatsappShareUrl: `https://wa.me/?text=${encodeURIComponent(`Torneio de Beyblade X: ${t.name}`)}` },
    players,
    matches: t.matches.map((m) => ({ id: m.id, round: m.round, tableNo: m.tableNo, status: m.status, resolvedBy: m.resolvedBy || 'AUTO', winnerId: m.winnerId ?? null, p1: byId.get(m.p1Id), p2: m.p2Id ? byId.get(m.p2Id) : null, p1Reported: m.p1Report != null, p2Reported: m.p2Report != null, p1Score: m.p1Score ?? 0, p2Score: m.p2Score ?? 0, bye: !m.p2Id })),
    standings: standings.map((row) => ({ player: byId.get(row.player.id), wins: row.wins, losses: row.losses, points: row.points ?? row.wins * 3, omw: row.omw ?? row.sos ?? 0, oomw: row.oomw ?? 0 })),
  };
}

export async function pushTamerLeagueTournament(tournament, standings) {
  const token = process.env.TAMERLEAGUE_API_KEY;
  if (!token) throw new Error('A integração TamerLeague não está configurada (TAMERLEAGUE_API_KEY).');
  const response = await fetch(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(buildTamerLeaguePayload(tournament, standings)), signal: AbortSignal.timeout(15_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`TamerLeague respondeu ${response.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return { received: true }; }
}
