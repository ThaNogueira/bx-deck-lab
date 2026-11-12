import { prisma } from './db.js';
import { getCompetitiveLadder } from './competitive-ladder.js';
import { audit } from './audit.js';

const TABLES = 4;
const TICK_MS = 1000;
const EVENT_LIFETIME_MS = 25_000;
let ladder;
let ladderUntil = 0;
let ladderPending;

async function broadcastRatings() {
  if (Date.now() < ladderUntil) return ladder;
  ladderPending ??= getCompetitiveLadder().then(result => {
    ladder = result.byUser;
    ladderUntil = Date.now() + 30_000;
    return ladder;
  }).catch(() => {
    ladder ??= new Map();
    ladderUntil = Date.now() + 5000;
    return ladder;
  }).finally(() => { ladderPending = null; });
  return ladderPending;
}

const tournamentQuery = slug => ({
  where: { slug },
  select: {
    id: true, slug: true, name: true, storeName: true, startsAt: true,
    organizerId: true, visibility: true, description: true, format: true,
    status: true, currentRound: true, roundsPlanned: true, entryFeeCents: true,
    players: { select: {
      id: true, userId: true, dropped: true, lateLosses: true, paymentConfirmed: true,
      user: { select: { id: true, name: true, avatarUrl: true } },
    } },
    matches: { orderBy: [{ round: 'asc' }, { tableNo: 'asc' }], select: {
      id: true, round: true, tableNo: true, liveTableNo: true, liveStartedAt: true,
      status: true, winnerId: true, p1Id: true, p2Id: true, p1Score: true, p2Score: true,
    } },
    broadcastEvents: { orderBy: { id: 'desc' }, take: 64, select: {
      id: true, kind: true, round: true, matchId: true, createdAt: true,
    } },
  },
});

export function registerTournamentBroadcast(router, { standingsOf, canView, isTestTournament, isStaff, requireManage, bySlug }) {
  const channels = new Map();
  const allowed = (t, user) => t && (!isTestTournament(t) || isStaff(user)) && canView(t, user);
  const unavailable = res => res.status(404).json({ error: 'Painel do torneio indisponível.' });

  async function project(t) {
    const ratings = await broadcastRatings();
    const players = t.players.map(p => {
      const rating = ratings.get(p.userId);
      return {
        id: p.id, name: p.user.name, photo: p.user.avatarUrl,
        elo: rating && !rating.provisional ? rating.points : null,
      };
    });
    const matches = t.status === 'RUNNING' ? t.matches.filter(m => m.round === t.currentRound) : [];
    const openMatches = matches.filter(m => m.p2Id && m.status !== 'DONE');
    const events = t.broadcastEvents;
    const cutoff = Date.now() - EVENT_LIFETIME_MS;
    return {
      tournament: {
        name: t.name, storeName: t.storeName, startsAt: t.startsAt, status: t.status,
        round: t.currentRound, roundsPlanned: t.roundsPlanned, format: t.format,
      },
      players,
      participants: t.players.filter(p => !p.dropped && (!t.entryFeeCents || p.paymentConfirmed)).map(p => p.id),
      standings: ['RUNNING', 'FINISHED'].includes(t.status) ? standingsOf(t).map(row => ({
        playerId: row.player.id, points: row.points, wins: row.wins, losses: row.losses,
        ties: row.ties, dropped: row.player.dropped,
      })) : [],
      live: openMatches.filter(m => m.liveTableNo !== null).sort((a, b) => a.liveTableNo - b.liveTableNo),
      waiting: openMatches.filter(m => m.liveTableNo === null),
      completed: matches.filter(m => m.p2Id && m.status === 'DONE').length,
      cursor: events[0]?.id ?? 0,
      events: events.filter(event => event.createdAt.getTime() >= cutoff).reverse(),
    };
  }

  router.get('/api/tournaments/:slug/broadcast', async (req, res, next) => {
    try {
      const t = await prisma.tournament.findUnique(tournamentQuery(req.params.slug));
      res.set('Cache-Control', 'no-store');
      if (!allowed(t, req.user)) return unavailable(res);
      res.json(await project(t));
    } catch (error) { next(error); }
  });

  router.get('/api/tournaments/:slug/broadcast/stream', async (req, res, next) => {
    try {
      const slug = req.params.slug;
      const access = await prisma.tournament.findUnique({
        where: { slug },
        select: { organizerId: true, visibility: true, description: true, players: { select: { userId: true } } },
      });
      if (!allowed(access, req.user)) return unavailable(res);
      if (res.destroyed) return;
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, no-transform',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
      res.write('retry: 1500\n\n');
      let channel = channels.get(slug);
      if (!channel) {
        channel = { listeners: new Set(), timer: null, busy: false };
        channels.set(slug, channel);
      }
      const client = { user: req.user, res, last: '', sentAt: 0 };
      channel.listeners.add(client);
      res.once('close', () => {
        channel.listeners.delete(client);
        if (!channel.listeners.size) {
          clearInterval(channel.timer);
          channels.delete(slug);
        }
      });
      const tick = async () => {
        if (channel.busy || !channel.listeners.size) return;
        channel.busy = true;
        try {
          const t = await prisma.tournament.findUnique(tournamentQuery(slug));
          const json = t ? JSON.stringify(await project(t)) : '';
          for (const viewer of channel.listeners) {
            if (viewer.res.writableEnded || viewer.res.destroyed) continue;
            if (!allowed(t, viewer.user)) {
              viewer.res.end('event: unavailable\ndata: {}\n\n');
              continue;
            }
            const now = Date.now();
            if (viewer.res.writableNeedDrain) {
              if (now - viewer.sentAt >= 5000) viewer.res.destroy();
              continue;
            }
            if (viewer.last !== json) {
              const type = viewer.last ? 'state' : 'snapshot';
              viewer.last = json;
              viewer.sentAt = now;
              viewer.res.write('event: ' + type + '\ndata: ' + json + '\n\n');
            } else if (now - viewer.sentAt >= 15_000) {
              viewer.sentAt = now;
              viewer.res.write(': heartbeat\n\n');
            }
          }
        } catch {
          // EventSource reconecta e recebe uma nova base sem repetir anúncios.
          for (const viewer of channel.listeners) viewer.res.end();
        } finally { channel.busy = false; }
      };
      channel.timer ??= setInterval(tick, TICK_MS);
      void tick();
    } catch (error) { next(error); }
  });

  router.put('/api/tournaments/:slug/matches/:matchId/broadcast', requireManage(bySlug), async (req, res, next) => {
    const table = req.body?.table;
    if (table !== null && (!Number.isInteger(table) || table < 1 || table > TABLES)) {
      return res.status(422).json({ error: 'Selecione uma mesa de 1 a 4.' });
    }
    try {
      const result = await prisma.$transaction(async tx => {
        const t = await tx.tournament.findUnique({
          where: { id: req.tournament.id }, select: { id: true, status: true, currentRound: true },
        });
        const match = await tx.tMatch.findFirst({
          where: { id: req.params.matchId, tournamentId: req.tournament.id },
        });
        if (!match || !match.p2Id) return { code: 404, error: 'Partida não encontrada.' };
        if (t?.status !== 'RUNNING' || match.round !== t.currentRound || match.status === 'DONE') {
          return { code: 409, error: 'A transmissão está disponível para partidas em aberto da rodada atual.' };
        }
        if (match.liveTableNo === table) return { changed: false, table };
        if (table !== null && await tx.tMatch.findFirst({
          where: { tournamentId: t.id, liveTableNo: table, id: { not: match.id } },
          select: { id: true },
        })) return { code: 409, error: 'Esta mesa já está ocupada.' };
        await tx.tMatch.update({
          where: { id: match.id },
          data: { liveTableNo: table, liveStartedAt: table === null ? null : match.liveStartedAt ?? new Date() },
        });
        return { changed: true, table };
      });
      if (result.code) return res.status(result.code).json({ error: result.error });
      if (result.changed) await audit(req.user, 'tournament.broadcast.table', 'TOURNAMENT', req.tournament.id, {
        matchId: req.params.matchId, table,
      });
      res.json({ ok: true, table });
    } catch (error) {
      if (error.code === 'P2002') return res.status(409).json({ error: 'Esta mesa já está ocupada.' });
      next(error);
    }
  });
}
