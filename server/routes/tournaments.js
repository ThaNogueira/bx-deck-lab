import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { prisma } from '../db.js';
import { requireUser, publicUser, isStaff } from '../auth.js';
import { moderateFields, getSetting } from '../settings.js';
import { audit } from '../audit.js';
import { siteUrl, uniqueSlug } from '../util.js';

const router = Router();
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const canManage = (t, user) => !!user && (t.organizerId === user.id || isStaff(user));

function tournamentDto(t, user) {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    storeName: t.storeName,
    address: t.address,
    startsAt: t.startsAt,
    format: t.format,
    roundsPlanned: t.roundsPlanned,
    description: t.description,
    status: t.status,
    currentRound: t.currentRound,
    organizer: t.organizer ? publicUser(t.organizer) : undefined,
    playersCount: t.players?.length,
    canManage: canManage(t, user),
    joinUrl: `${siteUrl()}/t/${t.slug}`,
    whatsappShareUrl: `https://wa.me/?text=${encodeURIComponent(
      `🌀 Torneio de Beyblade X: ${t.name}${t.storeName ? ` @ ${t.storeName}` : ''}!\nInscreva-se: ${siteUrl()}/t/${t.slug}`,
    )}`,
  };
}

const playerDto = (p) => ({
  id: p.id,
  dropped: p.dropped,
  user: publicUser(p.user),
});

function matchDto(m) {
  return {
    id: m.id,
    round: m.round,
    tableNo: m.tableNo,
    status: m.status,
    resolvedBy: m.resolvedBy,
    winnerId: m.winnerId,
    p1: m.p1 ? playerDto(m.p1) : null,
    p2: m.p2 ? playerDto(m.p2) : null,
    p1Reported: m.p1Report != null,
    p2Reported: m.p2Report != null,
    p1Score: m.p1Score ?? 0,
    p2Score: m.p2Score ?? 0,
    bye: !m.p2Id,
  };
}

async function loadTournament(slug) {
  return prisma.tournament.findUnique({
    where: { slug },
    include: {
      organizer: true,
      players: { include: { user: true } },
      matches: { include: { p1: { include: { user: true } }, p2: { include: { user: true } } }, orderBy: [{ round: 'asc' }, { tableNo: 'asc' }] },
    },
  });
}

/** Vitórias por jogador (BYE conta como vitória). */
function winsMap(t) {
  const wins = new Map(t.players.map((p) => [p.id, 0]));
  for (const m of t.matches) {
    if (m.status === 'DONE' && m.winnerId) wins.set(m.winnerId, (wins.get(m.winnerId) ?? 0) + 1);
  }
  return wins;
}

function standingsOf(t) {
  const wins = winsMap(t);
  const losses = new Map(t.players.map((p) => [p.id, 0]));
  const oppIds = new Map(t.players.map((p) => [p.id, []]));
  for (const m of t.matches) {
    if (m.status !== 'DONE') continue;
    if (m.p2Id) {
      oppIds.get(m.p1Id)?.push(m.p2Id);
      oppIds.get(m.p2Id)?.push(m.p1Id);
      const loser = m.winnerId === m.p1Id ? m.p2Id : m.p1Id;
      losses.set(loser, (losses.get(loser) ?? 0) + 1);
    }
  }
  // Desempate: força dos oponentes (soma de vitórias dos adversários enfrentados)
  const sos = (pid) => (oppIds.get(pid) ?? []).reduce((acc, o) => acc + (wins.get(o) ?? 0), 0);
  return t.players
    .map((p) => ({ player: playerDto(p), wins: wins.get(p.id) ?? 0, losses: losses.get(p.id) ?? 0, sos: sos(p.id) }))
    .sort((a, b) => b.wins - a.wins || b.sos - a.sos || a.player.user.name.localeCompare(b.player.user.name));
}

/** Pareia a próxima rodada (suíço simples, evitando rematches; BYE p/ quem nunca teve). */
async function pairRound(t, round) {
  const active = t.players.filter((p) => !p.dropped);
  const wins = winsMap(t);
  const played = new Set();
  const hadBye = new Set();
  for (const m of t.matches) {
    if (m.p2Id) {
      played.add(`${m.p1Id}|${m.p2Id}`);
      played.add(`${m.p2Id}|${m.p1Id}`);
    } else hadBye.add(m.p1Id);
  }

  let pool = [...active].sort((a, b) => (wins.get(b.id) ?? 0) - (wins.get(a.id) ?? 0) || Math.random() - 0.5);

  let bye = null;
  if (pool.length % 2 === 1) {
    // BYE vai para o pior colocado que ainda não teve BYE
    bye = [...pool].reverse().find((p) => !hadBye.has(p.id)) ?? pool[pool.length - 1];
    pool = pool.filter((p) => p.id !== bye.id);
  }

  const pairs = [];
  while (pool.length) {
    const a = pool.shift();
    let idx = pool.findIndex((b) => !played.has(`${a.id}|${b.id}`));
    if (idx < 0) idx = 0;
    const b = pool.splice(idx, 1)[0];
    pairs.push([a, b]);
  }

  let tableNo = 1;
  for (const [a, b] of pairs) {
    await prisma.tMatch.create({
      data: { tournamentId: t.id, round, tableNo: tableNo++, p1Id: a.id, p2Id: b.id },
    });
  }
  if (bye) {
    await prisma.tMatch.create({
      data: {
        tournamentId: t.id, round, tableNo: tableNo, p1Id: bye.id, p2Id: null,
        winnerId: bye.id, status: 'DONE', resolvedBy: 'AUTO',
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Listagem, criação e inscrição
// ---------------------------------------------------------------------------

router.get('/api/tournaments', ah(async (req, res) => {
  const { status = '', query = '' } = req.query;
  const where = {};
  if (status) where.status = String(status);
  else where.status = { in: ['OPEN', 'RUNNING', 'FINISHED'] };
  let list = await prisma.tournament.findMany({
    where,
    include: { organizer: true, players: true },
    orderBy: { startsAt: 'asc' },
    take: 200,
  });
  const q = String(query).toLowerCase().trim();
  if (q) list = list.filter((t) => [t.name, t.storeName, t.address].some((v) => v && v.toLowerCase().includes(q)));
  res.json({ tournaments: list.map((t) => tournamentDto(t, req.user)) });
}));

router.post('/api/tournaments', requireUser, moderateFields('name', 'description'), ah(async (req, res) => {
  const flags = await getSetting('flags');
  if (flags.tournaments === false) return res.status(403).json({ error: 'Criação de torneios está temporariamente desativada.' });
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 80);
  const startsAt = new Date(b.startsAt || '');
  if (!name) return res.status(422).json({ error: 'Dê um nome ao torneio.' });
  if (Number.isNaN(startsAt.getTime())) return res.status(422).json({ error: 'Data/horário inválidos.' });
  const t = await prisma.tournament.create({
    data: {
      slug: await uniqueSlug(prisma.tournament, name),
      name,
      storeName: String(b.storeName || '').slice(0, 80) || null,
      address: String(b.address || '').slice(0, 160) || null,
      startsAt,
      format: b.format === 'POINTS4' ? 'POINTS4' : 'MD3',
      roundsPlanned: Math.max(1, Math.min(12, parseInt(b.roundsPlanned, 10) || 4)),
      description: String(b.description || '').slice(0, 2000) || null,
      organizerId: req.user.id,
    },
    include: { organizer: true, players: true },
  });
  await audit(req.user, 'tournament.create', 'TOURNAMENT', t.id, { name });
  res.json({ tournament: tournamentDto(t, req.user) });
}));

router.get('/api/tournaments/:slug', ah(async (req, res) => {
  const t = await loadTournament(req.params.slug);
  if (!t) return res.status(404).json({ error: 'Torneio não encontrado.' });
  const me = req.user ? t.players.find((p) => p.userId === req.user.id) : null;
  res.json({
    tournament: tournamentDto(t, req.user),
    players: t.players.map(playerDto),
    matches: t.matches.map(matchDto),
    standings: t.status === 'OPEN' ? [] : standingsOf(t),
    me: me ? { playerId: me.id, dropped: me.dropped } : null,
  });
}));

router.post('/api/tournaments/:slug/join', requireUser, ah(async (req, res) => {
  const t = await loadTournament(req.params.slug);
  if (!t) return res.status(404).json({ error: 'Torneio não encontrado.' });
  if (t.status !== 'OPEN') return res.status(403).json({ error: 'As inscrições deste torneio estão fechadas.' });
  if (t.players.length >= 64) return res.status(403).json({ error: 'Torneio lotado (64 jogadores).' });
  await prisma.tournamentPlayer.upsert({
    where: { tournamentId_userId: { tournamentId: t.id, userId: req.user.id } },
    update: { dropped: false },
    create: { tournamentId: t.id, userId: req.user.id },
  });
  res.json({ ok: true });
}));

router.post('/api/tournaments/:slug/leave', requireUser, ah(async (req, res) => {
  const t = await loadTournament(req.params.slug);
  if (!t) return res.status(404).json({ error: 'Torneio não encontrado.' });
  if (t.status === 'OPEN') {
    await prisma.tournamentPlayer.deleteMany({ where: { tournamentId: t.id, userId: req.user.id } });
  } else {
    await prisma.tournamentPlayer.updateMany({
      where: { tournamentId: t.id, userId: req.user.id },
      data: { dropped: true },
    });
  }
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Jogador: minha partida e reporte (verde = vitória / vermelho = derrota)
// ---------------------------------------------------------------------------

router.get('/api/tournaments/:slug/me', requireUser, ah(async (req, res) => {
  const t = await loadTournament(req.params.slug);
  if (!t) return res.status(404).json({ error: 'Torneio não encontrado.' });
  const me = t.players.find((p) => p.userId === req.user.id);
  if (!me) return res.json({ joined: false });
  const match = t.matches.find(
    (m) => m.round === t.currentRound && (m.p1Id === me.id || m.p2Id === me.id),
  );
  if (!match) return res.json({ joined: true, match: null, round: t.currentRound });
  const iAmP1 = match.p1Id === me.id;
  const opponent = iAmP1 ? match.p2 : match.p1;
  res.json({
    joined: true,
    round: t.currentRound,
    match: {
      id: match.id,
      tableNo: match.tableNo,
      status: match.status,
      bye: !match.p2Id,
      opponent: opponent ? publicUser(opponent.user) : null,
      myReport: iAmP1 ? match.p1Report : match.p2Report,
      opponentReported: (iAmP1 ? match.p2Report : match.p1Report) != null,
      won: match.status === 'DONE' ? match.winnerId === me.id : null,
      myScore: iAmP1 ? match.p1Score : match.p2Score,
      oppScore: iAmP1 ? match.p2Score : match.p1Score,
      format: t.format,
    },
  });
}));

router.post('/api/tournaments/:slug/report', requireUser, ah(async (req, res) => {
  const t = await loadTournament(req.params.slug);
  if (!t) return res.status(404).json({ error: 'Torneio não encontrado.' });
  if (t.status !== 'RUNNING') return res.status(403).json({ error: 'O torneio não está em andamento.' });
  const me = t.players.find((p) => p.userId === req.user.id);
  if (!me) return res.status(403).json({ error: 'Você não está inscrito.' });
  const result = req.body?.result === 'WIN' ? 'WIN' : req.body?.result === 'LOSS' ? 'LOSS' : null;
  if (!result) return res.status(422).json({ error: 'Resultado inválido.' });

  const match = t.matches.find(
    (m) => m.id === req.body?.matchId && m.round === t.currentRound && (m.p1Id === me.id || m.p2Id === me.id),
  );
  if (!match || !match.p2Id) return res.status(404).json({ error: 'Partida não encontrada nesta rodada.' });
  if (match.status === 'DONE') return res.status(403).json({ error: 'Esta partida já foi fechada.' });

  const iAmP1 = match.p1Id === me.id;
  const data = iAmP1 ? { p1Report: result } : { p2Report: result };
  const p1Report = iAmP1 ? result : match.p1Report;
  const p2Report = iAmP1 ? match.p2Report : result;

  if (p1Report && p2Report) {
    if (p1Report !== p2Report) {
      // Reportes coerentes (um WIN e um LOSS): consolida automaticamente.
      data.winnerId = p1Report === 'WIN' ? match.p1Id : match.p2Id;
      data.status = 'DONE';
      data.resolvedBy = 'AUTO';
    } else {
      // Os dois disseram a mesma coisa (dois WIN ou dois LOSS): conflito.
      data.status = 'CONFLICT';
    }
  }
  const updated = await prisma.tMatch.update({
    where: { id: match.id },
    data,
    include: { p1: { include: { user: true } }, p2: { include: { user: true } } },
  });
  res.json({ match: matchDto(updated), conflict: updated.status === 'CONFLICT' });
}));

// ---------------------------------------------------------------------------
// Organizador (e admins como "super organizador" — 2.5)
// ---------------------------------------------------------------------------

function requireManage(loader) {
  return ah(async (req, res, next) => {
    const t = await loader(req);
    if (!t) return res.status(404).json({ error: 'Torneio não encontrado.' });
    if (!req.user || !canManage(t, req.user)) return res.status(403).json({ error: 'Só o organizador (ou um admin) pode fazer isso.' });
    req.tournament = t;
    next();
  });
}
const bySlug = (req) => loadTournament(req.params.slug);

router.patch('/api/tournaments/:slug', requireManage(bySlug), moderateFields('name', 'description'), ah(async (req, res) => {
  const b = req.body || {};
  const data = {};
  if (typeof b.name === 'string' && b.name.trim()) data.name = b.name.trim().slice(0, 80);
  if ('storeName' in b) data.storeName = String(b.storeName || '').slice(0, 80) || null;
  if ('address' in b) data.address = String(b.address || '').slice(0, 160) || null;
  if ('description' in b) data.description = String(b.description || '').slice(0, 2000) || null;
  if (b.startsAt) {
    const d = new Date(b.startsAt);
    if (!Number.isNaN(d.getTime())) data.startsAt = d;
  }
  if (b.format) data.format = b.format === 'POINTS4' ? 'POINTS4' : 'MD3';
  if (b.roundsPlanned) data.roundsPlanned = Math.max(1, Math.min(12, parseInt(b.roundsPlanned, 10) || 4));
  const t = await prisma.tournament.update({ where: { id: req.tournament.id }, data, include: { organizer: true, players: true } });
  await audit(req.user, 'tournament.update', 'TOURNAMENT', t.id);
  res.json({ tournament: tournamentDto(t, req.user) });
}));

router.post('/api/tournaments/:slug/start', requireManage(bySlug), ah(async (req, res) => {
  const t = req.tournament;
  if (t.status !== 'OPEN') return res.status(403).json({ error: 'O torneio já começou.' });
  if (t.players.filter((p) => !p.dropped).length < 2) return res.status(422).json({ error: 'É preciso ter ao menos 2 jogadores.' });
  await pairRound(t, 1);
  await prisma.tournament.update({ where: { id: t.id }, data: { status: 'RUNNING', currentRound: 1 } });
  await audit(req.user, 'tournament.start', 'TOURNAMENT', t.id);
  res.json({ ok: true, round: 1 });
}));

router.post('/api/tournaments/:slug/next-round', requireManage(bySlug), ah(async (req, res) => {
  const t = req.tournament;
  if (t.status !== 'RUNNING') return res.status(403).json({ error: 'O torneio não está em andamento.' });
  const open = t.matches.filter((m) => m.round === t.currentRound && m.status !== 'DONE');
  if (open.length) return res.status(422).json({ error: `Ainda há ${open.length} partida(s) sem resultado nesta rodada.` });
  if (t.currentRound >= t.roundsPlanned) return res.status(422).json({ error: 'Todas as rodadas planejadas já foram jogadas — encerre o torneio.' });
  const round = t.currentRound + 1;
  await pairRound(t, round);
  await prisma.tournament.update({ where: { id: t.id }, data: { currentRound: round } });
  res.json({ ok: true, round });
}));

router.post('/api/tournaments/:slug/finish', requireManage(bySlug), ah(async (req, res) => {
  await prisma.tournament.update({ where: { id: req.tournament.id }, data: { status: 'FINISHED' } });
  await audit(req.user, 'tournament.finish', 'TOURNAMENT', req.tournament.id);
  res.json({ ok: true });
}));

router.post('/api/tournaments/:slug/cancel', requireManage(bySlug), ah(async (req, res) => {
  await prisma.tournament.update({ where: { id: req.tournament.id }, data: { status: 'CANCELED' } });
  await audit(req.user, 'tournament.cancel', 'TOURNAMENT', req.tournament.id);
  res.json({ ok: true });
}));

/** Fecha uma partida com um único reporte, ou resolve conflito manualmente. */
router.post('/api/tournaments/:slug/matches/:matchId/resolve', requireManage(bySlug), ah(async (req, res) => {
  const t = req.tournament;
  const match = t.matches.find((m) => m.id === req.params.matchId);
  if (!match || !match.p2Id) return res.status(404).json({ error: 'Partida não encontrada.' });

  let winnerId = req.body?.winnerId ?? null;
  if (!winnerId) {
    // Sem winnerId explícito: aceitar o único reporte existente (não vale em conflito).
    if (match.status === 'CONFLICT') return res.status(422).json({ error: 'Conflito: os dois jogadores reportaram o mesmo resultado — escolha o vencedor.' });
    if (match.p1Report && !match.p2Report) winnerId = match.p1Report === 'WIN' ? match.p1Id : match.p2Id;
    else if (match.p2Report && !match.p1Report) winnerId = match.p2Report === 'WIN' ? match.p2Id : match.p1Id;
    else return res.status(422).json({ error: 'Nenhum reporte para aceitar — escolha o vencedor manualmente.' });
  }
  if (![match.p1Id, match.p2Id].includes(winnerId)) return res.status(422).json({ error: 'Vencedor inválido.' });

  const updated = await prisma.tMatch.update({
    where: { id: match.id },
    data: { winnerId, status: 'DONE', resolvedBy: 'ORGANIZER' },
    include: { p1: { include: { user: true } }, p2: { include: { user: true } } },
  });
  await audit(req.user, 'tournament.match.resolve', 'TOURNAMENT', t.id, { matchId: match.id, winnerId });
  res.json({ match: matchDto(updated) });
}));

router.post('/api/tournaments/:slug/matches/:matchId/reopen', requireManage(bySlug), ah(async (req, res) => {
  const match = req.tournament.matches.find((m) => m.id === req.params.matchId);
  if (!match || !match.p2Id) return res.status(404).json({ error: 'Partida não encontrada.' });
  const updated = await prisma.tMatch.update({
    where: { id: match.id },
    data: { winnerId: null, status: 'PENDING', resolvedBy: null, p1Report: null, p2Report: null, p1Score: 0, p2Score: 0 },
    include: { p1: { include: { user: true } }, p2: { include: { user: true } } },
  });
  // Rounds anteriores ficam no histórico como anulados
  await prisma.matchRound.updateMany({ where: { matchId: match.id, status: { in: ['PENDING', 'CONFIRMED', 'DISPUTED'] } }, data: { status: 'VOID', resolvedBy: 'ORGANIZER' } });
  await audit(req.user, 'tournament.match.reopen', 'TOURNAMENT', req.tournament.id, { matchId: match.id });
  res.json({ match: matchDto(updated) });
}));

router.delete('/api/tournaments/:slug/players/:playerId', requireManage(bySlug), ah(async (req, res) => {
  const t = req.tournament;
  const player = t.players.find((p) => p.id === req.params.playerId);
  if (!player) return res.status(404).json({ error: 'Jogador não encontrado.' });
  if (t.status === 'OPEN') await prisma.tournamentPlayer.delete({ where: { id: player.id } });
  else await prisma.tournamentPlayer.update({ where: { id: player.id }, data: { dropped: true } });
  await audit(req.user, 'tournament.player.remove', 'TOURNAMENT', t.id, { player: player.user.name });
  res.json({ ok: true });
}));

router.post('/api/tournaments/:slug/transfer', requireManage(bySlug), ah(async (req, res) => {
  const target = await prisma.user.findFirst({
    where: { OR: [{ slug: String(req.body?.user || '') }, { email: String(req.body?.user || '').toLowerCase() }] },
  });
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado (use o @ do perfil ou o e-mail).' });
  await prisma.tournament.update({ where: { id: req.tournament.id }, data: { organizerId: target.id } });
  await audit(req.user, 'tournament.transfer', 'TOURNAMENT', req.tournament.id, { to: target.slug });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Tela de mesa (companion): rounds com reporte de um lado + confirmação do outro
// ---------------------------------------------------------------------------

const FORMAT_RULES = {
  MD3: { key: 'MD3', label: 'Melhor de 3', roundsToWin: 2, maxRounds: 3, perRound: true },
  POINTS4: { key: 'POINTS4', label: 'Partida única · até 4 pontos', roundsToWin: 1, maxRounds: 1, perRound: false },
};
const rulesOf = (t) => FORMAT_RULES[t.format] || FORMAT_RULES.MD3;
const roundDto = (r) => ({ id: r.id, no: r.no, winnerId: r.winnerId, claimedBy: r.claimedBy, status: r.status, resolvedBy: r.resolvedBy, createdAt: r.createdAt, confirmedAt: r.confirmedAt });
const other = (side) => (side === 'p1' ? 'p2' : 'p1');
const sideId = (match, side) => (side === 'p1' ? match.p1Id : match.p2Id);

async function loadMatch(t, matchId) {
  return prisma.tMatch.findFirst({
    where: { id: matchId, tournamentId: t.id },
    include: { p1: { include: { user: true } }, p2: { include: { user: true } }, rounds: { orderBy: { createdAt: 'asc' } } },
  });
}

/** Quem pode agir por cada lado: organizador/staff (juiz), dispositivo da mesa (token) ou o próprio jogador. */
function actorSides(req, t, match) {
  const token = String(req.query.t || req.body?.token || '');
  const organizer = !!req.user && canManage(t, req.user);
  const table = !!match.tableToken && token === match.tableToken;
  const me = req.user ? t.players.find((p) => p.userId === req.user.id) : null;
  const viewerSide = me ? (me.id === match.p1Id ? 'p1' : me.id === match.p2Id ? 'p2' : null) : null;
  return {
    p1: organizer || table || viewerSide === 'p1',
    p2: organizer || table || viewerSide === 'p2',
    organizer,
    table,
    viewerSide,
  };
}

/** Recalcula placar/status da partida a partir dos rounds confirmados. */
async function applyRounds(match, rules) {
  const rounds = await prisma.matchRound.findMany({ where: { matchId: match.id } });
  const confirmed = rounds.filter((r) => r.status === 'CONFIRMED');
  const p1Score = confirmed.filter((r) => r.winnerId === match.p1Id).length;
  const p2Score = confirmed.filter((r) => r.winnerId === match.p2Id).length;
  const disputed = rounds.some((r) => r.status === 'DISPUTED');
  const ownsResult = !match.resolvedBy || match.resolvedBy === 'ROUNDS';
  const data = { p1Score, p2Score };
  if (p1Score >= rules.roundsToWin || p2Score >= rules.roundsToWin) {
    if (ownsResult || match.status !== 'DONE') { data.winnerId = p1Score > p2Score ? match.p1Id : match.p2Id; data.status = 'DONE'; data.resolvedBy = 'ROUNDS'; }
  } else if (ownsResult) {
    const reportConflict = match.p1Report && match.p1Report === match.p2Report;
    data.status = disputed || reportConflict ? 'CONFLICT' : 'PENDING';
    data.winnerId = null;
    data.resolvedBy = null;
  }
  return prisma.tMatch.update({ where: { id: match.id }, data });
}

async function matchView(req, t, match) {
  const can = actorSides(req, t, match);
  const rounds = match.rounds.map(roundDto);
  return {
    tournament: { slug: t.slug, name: t.name, storeName: t.storeName, format: t.format, rules: rulesOf(t), currentRound: t.currentRound, status: t.status },
    match: {
      ...matchDto(match),
      rounds,
      pending: rounds.find((r) => r.status === 'PENDING') || null,
      disputed: rounds.find((r) => r.status === 'DISPUTED') || null,
    },
    can: { p1: can.p1, p2: can.p2, organizer: can.organizer, table: can.table },
    viewerSide: can.viewerSide,
  };
}

router.get('/api/tournaments/:slug/matches/:matchId', ah(async (req, res) => {
  const t = await loadTournament(req.params.slug);
  if (!t) return res.status(404).json({ error: 'Torneio não encontrado.' });
  const match = await loadMatch(t, req.params.matchId);
  if (!match) return res.status(404).json({ error: 'Partida não encontrada.' });
  res.json(await matchView(req, t, match));
}));

/** Executa uma ação de round validando lado/permissão e devolve a partida atualizada. */
function roundAction(fn) {
  return ah(async (req, res) => {
    const t = await loadTournament(req.params.slug);
    if (!t) return res.status(404).json({ error: 'Torneio não encontrado.' });
    const match = await loadMatch(t, req.params.matchId);
    if (!match) return res.status(404).json({ error: 'Partida não encontrada.' });
    if (!match.p2Id) return res.status(422).json({ error: 'BYE não tem rounds.' });
    if (t.status !== 'RUNNING') return res.status(403).json({ error: 'O torneio não está em andamento.' });
    const can = actorSides(req, t, match);
    const side = req.body?.side === 'p2' ? 'p2' : 'p1';
    const judge = !!req.body?.judge && can.organizer;
    if (!judge && !can[side]) return res.status(403).json({ error: 'Só quem está na partida (ou a mesa do organizador) pode reportar por este lado.' });
    const rules = rulesOf(t);
    const err = await fn({ t, match, can, side, judge, rules, req });
    if (err) return res.status(err.code || 422).json({ error: err.error });
    await applyRounds(match, rules);
    const fresh = await loadMatch(t, match.id);
    res.json(await matchView(req, t, fresh));
  });
}

// Reporta um round: quem diz que perdeu confirma na hora; quem diz que venceu espera o adversário.
router.post('/api/tournaments/:slug/matches/:matchId/rounds', roundAction(async ({ t, match, side, judge, rules, req }) => {
  if (match.status === 'DONE') return { code: 403, error: 'Esta partida já foi fechada.' };
  if (match.round !== t.currentRound) return { code: 403, error: 'Esta partida não é da rodada atual.' };
  if (match.rounds.some((r) => r.status === 'PENDING')) return { code: 409, error: 'Já existe um round aguardando confirmação.' };
  if (match.rounds.some((r) => r.status === 'DISPUTED')) return { code: 409, error: 'Há um round contestado — o organizador precisa resolver antes.' };
  const played = match.rounds.filter((r) => r.status === 'CONFIRMED').length;
  if (played >= rules.maxRounds) return { error: 'Todos os rounds desta partida já foram jogados.' };
  const winnerSide = req.body?.winnerSide === 'p2' ? 'p2' : 'p1';
  const selfLoss = !judge && winnerSide !== side;
  const auto = judge || selfLoss;
  await prisma.matchRound.create({
    data: {
      matchId: match.id, no: played + 1, winnerId: sideId(match, winnerSide),
      claimedBy: judge ? 'ORGANIZER' : side.toUpperCase(),
      status: auto ? 'CONFIRMED' : 'PENDING',
      resolvedBy: judge ? 'ORGANIZER' : selfLoss ? 'AUTO' : null,
      confirmedAt: auto ? new Date() : null,
    },
  });
  if (judge) await audit(req.user, 'tournament.round.judge', 'TOURNAMENT', t.id, { matchId: match.id, winnerSide });
  return null;
}));

router.post('/api/tournaments/:slug/matches/:matchId/rounds/:roundId/confirm', roundAction(async ({ match, side, judge, req }) => {
  const round = match.rounds.find((r) => r.id === req.params.roundId);
  if (!round || round.status !== 'PENDING') return { code: 404, error: 'Nenhum round aguardando confirmação.' };
  const claimant = round.claimedBy === 'P1' ? 'p1' : 'p2';
  if (!judge && side !== other(claimant)) return { code: 403, error: 'Só o adversário pode confirmar este round.' };
  await prisma.matchRound.update({ where: { id: round.id }, data: { status: 'CONFIRMED', resolvedBy: judge ? 'ORGANIZER' : 'OPPONENT', confirmedAt: new Date() } });
  return null;
}));

router.post('/api/tournaments/:slug/matches/:matchId/rounds/:roundId/dispute', roundAction(async ({ match, side, judge, req }) => {
  const round = match.rounds.find((r) => r.id === req.params.roundId);
  if (!round || round.status !== 'PENDING') return { code: 404, error: 'Nenhum round aguardando confirmação.' };
  const claimant = round.claimedBy === 'P1' ? 'p1' : 'p2';
  if (!judge && side !== other(claimant)) return { code: 403, error: 'Só o adversário pode contestar este round.' };
  await prisma.matchRound.update({ where: { id: round.id }, data: { status: 'DISPUTED' } });
  return null;
}));

router.post('/api/tournaments/:slug/matches/:matchId/rounds/:roundId/cancel', roundAction(async ({ match, side, judge, req }) => {
  const round = match.rounds.find((r) => r.id === req.params.roundId);
  if (!round || round.status !== 'PENDING') return { code: 404, error: 'Nenhum round aguardando confirmação.' };
  const claimant = round.claimedBy === 'P1' ? 'p1' : 'p2';
  if (!judge && side !== claimant) return { code: 403, error: 'Só quem reportou pode cancelar.' };
  await prisma.matchRound.update({ where: { id: round.id }, data: { status: 'VOID', resolvedBy: judge ? 'ORGANIZER' : 'AUTO' } });
  return null;
}));

// Organizador resolve um round contestado (ou pendente): escolhe o vencedor ou anula.
router.post('/api/tournaments/:slug/matches/:matchId/rounds/:roundId/resolve', requireManage(bySlug), ah(async (req, res) => {
  const t = req.tournament;
  const match = await loadMatch(t, req.params.matchId);
  if (!match || !match.p2Id) return res.status(404).json({ error: 'Partida não encontrada.' });
  const round = match.rounds.find((r) => r.id === req.params.roundId);
  if (!round || !['DISPUTED', 'PENDING', 'CONFIRMED'].includes(round.status)) return res.status(404).json({ error: 'Round não encontrado.' });
  const w = req.body?.winnerSide;
  if (w === 'void') await prisma.matchRound.update({ where: { id: round.id }, data: { status: 'VOID', resolvedBy: 'ORGANIZER' } });
  else if (w === 'p1' || w === 'p2') await prisma.matchRound.update({ where: { id: round.id }, data: { status: 'CONFIRMED', winnerId: sideId(match, w), resolvedBy: 'ORGANIZER', confirmedAt: new Date() } });
  else return res.status(422).json({ error: 'Informe winnerSide: p1, p2 ou void.' });
  await applyRounds(match, rulesOf(t));
  await audit(req.user, 'tournament.round.resolve', 'TOURNAMENT', t.id, { matchId: match.id, roundId: round.id, winnerSide: w });
  res.json(await matchView(req, t, await loadMatch(t, match.id)));
}));

// Link da mesa: o dispositivo do organizador apoiado na mesa pode reportar pelos dois lados.
router.post('/api/tournaments/:slug/matches/:matchId/table-token', requireManage(bySlug), ah(async (req, res) => {
  const t = req.tournament;
  const match = t.matches.find((m) => m.id === req.params.matchId);
  if (!match || !match.p2Id) return res.status(404).json({ error: 'Partida não encontrada.' });
  const token = match.tableToken || randomBytes(12).toString('base64url');
  if (!match.tableToken) await prisma.tMatch.update({ where: { id: match.id }, data: { tableToken: token } });
  res.json({ token, url: `${siteUrl()}/mesa/${t.slug}/${match.id}?t=${token}` });
}));

// ---------------------------------------------------------------------------
// QR Code (inscrição) — usado na arte de impressão e no compartilhamento
// ---------------------------------------------------------------------------

router.get('/api/tournaments/:slug/qr.svg', ah(async (req, res) => {
  const t = await prisma.tournament.findUnique({ where: { slug: req.params.slug } });
  if (!t) return res.status(404).end();
  const svg = await QRCode.toString(`${siteUrl()}/t/${t.slug}`, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: { dark: '#0b0c11', light: '#ffffff' },
  });
  res.set('Content-Type', 'image/svg+xml').set('Cache-Control', 'public, max-age=3600').send(svg);
}));

export default router;
