import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { prisma } from '../db.js';
import { requireUser, publicUser, isStaff } from '../auth.js';
import { moderateFields, getSetting } from '../settings.js';
import { audit } from '../audit.js';
import { siteUrl, uniqueSlug } from '../util.js';
import { UPLOADS_DIR } from '../uploads.js';

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
  lateLosses: p.lateLosses ?? 0,
  user: publicUser(p.user),
  deck: p.deck ? { id: p.deck.id, slug: p.deck.slug, title: p.deck.title, beys: (() => { try { return JSON.parse(p.deck.beysJson || '[]'); } catch { return []; } })() } : (p.deckId ? { id: p.deckId } : null),
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

export async function loadTournament(slug) {
  return prisma.tournament.findUnique({
    where: { slug },
    include: {
      organizer: true,
      players: { include: { user: true, deck: true } },
      matches: { include: { p1: { include: { user: true, deck: true } }, p2: { include: { user: true, deck: true } } }, orderBy: [{ round: 'asc' }, { tableNo: 'asc' }] },
    },
  });
}

export function standingsOf(t) {
  const stats = new Map(t.players.map((p) => [p.id, { wins: 0, nonByeWins: 0, losses: p.lateLosses ?? 0, points: 0, opponents: [] }]));
  for (const m of t.matches) {
    if (m.status !== 'DONE') continue;
    const winner = stats.get(m.winnerId);
    if (winner) { winner.wins += 1; winner.points += 3; if (m.p2Id) winner.nonByeWins += 1; }
    if (!m.p2Id) continue; // BYE dá pontos, mas não entra em OPP%.
    stats.get(m.p1Id)?.opponents.push(m.p2Id);
    stats.get(m.p2Id)?.opponents.push(m.p1Id);
    const loserId = m.winnerId === m.p1Id ? m.p2Id : m.p1Id;
    const loser = stats.get(loserId);
    if (loser) loser.losses += 1;
  }
  // Pokémon TCG: pontos de partida, OMW% (mínimo 25%) e OOMW%.
  const rate = (id) => {
    const s = stats.get(id);
    // Derrotas tardias contam no percentual próprio, sem inventar um oponente.
    const denominator = s.opponents.length + (t.players.find((p) => p.id === id)?.lateLosses ?? 0);
    return denominator ? s.nonByeWins / denominator : 0;
  };
  const omw = (id) => {
    const opponents = stats.get(id)?.opponents ?? [];
    return opponents.length ? opponents.reduce((sum, oid) => sum + Math.max(.25, rate(oid)), 0) / opponents.length : 0;
  };
  const oomw = (id) => {
    const opponents = stats.get(id)?.opponents ?? [];
    return opponents.length ? opponents.reduce((sum, oid) => sum + omw(oid), 0) / opponents.length : 0;
  };
  return t.players
    .map((p) => { const { nonByeWins, opponents, ...row } = stats.get(p.id); return { player: playerDto(p), ...row, omw: omw(p.id), oomw: oomw(p.id) }; })
    .sort((a, b) => b.points - a.points || b.omw - a.omw || b.oomw - a.oomw || a.player.user.name.localeCompare(b.player.user.name));
}

/** Pareamento suíço: procura uma combinação inteira sem revanche antes de aceitá-la. */
async function pairRound(t, round) {
  const active = t.players.filter((p) => !p.dropped);
  const played = new Set();
  const hadBye = new Set();
  for (const m of t.matches) {
    if (m.p2Id) {
      played.add(`${m.p1Id}|${m.p2Id}`);
      played.add(`${m.p2Id}|${m.p1Id}`);
    } else hadBye.add(m.p1Id);
  }

  const standing = standingsOf(t);
  const rank = new Map(standing.map((s, i) => [s.player.id, i]));
  let pool = [...active].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));

  const pairKey = (a, b) => `${a.id}|${b.id}`;
  const solve = (rest) => {
    if (!rest.length) return [];
    const a = rest[0];
    const candidates = rest.slice(1).filter((b) => !played.has(pairKey(a, b)))
      .sort((x, y) => Math.abs((rank.get(a.id) ?? 0) - (rank.get(x.id) ?? 0)) - Math.abs((rank.get(a.id) ?? 0) - (rank.get(y.id) ?? 0)));
    for (const b of candidates) {
      const tail = solve(rest.filter((p) => p.id !== a.id && p.id !== b.id));
      if (tail) return [[a, b], ...tail];
    }
    return null;
  };
  let bye = null;
  let pairs = null;
  if (pool.length % 2 === 1) {
    // Testa cada candidato a BYE: assim uma escolha ruim não cria revanche desnecessária.
    const byeOptions = [...pool].reverse().sort((a, b) => Number(hadBye.has(a.id)) - Number(hadBye.has(b.id)));
    for (const candidate of byeOptions) {
      const candidatePairs = solve(pool.filter((p) => p.id !== candidate.id));
      if (candidatePairs) { bye = candidate; pairs = candidatePairs; pool = pool.filter((p) => p.id !== bye.id); break; }
    }
    if (!bye) { bye = byeOptions[0]; pool = pool.filter((p) => p.id !== bye.id); }
  } else pairs = solve(pool);
  if (!pairs) {
    // Depois de esgotar todas as combinações inéditas, revanche é inevitável.
    pairs = [];
    while (pool.length) { const a = pool.shift(); pairs.push([a, pool.shift()]); }
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
  import('../meta.js').then((m) => m.onTournamentCreated(t)).catch(() => {});
  res.json({ tournament: tournamentDto(t, req.user) });
}));

/** Jogador inscrito declara (ou remove) o deck que vai usar — alimenta o meta e o card do campeão. */
router.post('/api/tournaments/:slug/my-deck', requireUser, ah(async (req, res) => {
  const t = await loadTournament(req.params.slug);
  if (!t) return res.status(404).json({ error: 'Torneio não encontrado.' });
  const me = t.players.find((p) => p.userId === req.user.id);
  if (!me) return res.status(403).json({ error: 'Você não está inscrito neste torneio.' });
  const deckId = req.body?.deckId ? String(req.body.deckId) : null;
  if (deckId) {
    const deck = await prisma.communityDeck.findUnique({ where: { id: deckId } });
    if (!deck || deck.authorId !== req.user.id) return res.status(403).json({ error: 'Escolha um deck seu.' });
  }
  const p = await prisma.tournamentPlayer.update({ where: { id: me.id }, data: { deckId }, include: { user: true, deck: true } });
  res.json({ player: playerDto(p) });
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
  if (t.players.length >= 64) return res.status(403).json({ error: 'Torneio lotado (64 jogadores).' });
  const lateToken = String(req.body?.lateToken || '');
  if (t.status === 'RUNNING' && lateToken) {
    if (t.players.some((p) => p.userId === req.user.id)) return res.status(422).json({ error: 'Você já tem uma inscrição neste torneio.' });
    const result = await prisma.$transaction(async (tx) => {
      const invite = await tx.tournamentLateEntryInvite.findUnique({ where: { token: lateToken } });
      if (!invite || invite.tournamentId !== t.id || invite.usedAt || (invite.expiresAt && invite.expiresAt <= new Date())) return null;
      const claimed = await tx.tournamentLateEntryInvite.updateMany({ where: { id: invite.id, usedAt: null }, data: { usedAt: new Date(), usedByUserId: req.user.id } });
      if (!claimed.count) return null;
      await tx.tournamentPlayer.create({ data: { tournamentId: t.id, userId: req.user.id, lateLosses: t.currentRound } });
      return { lateLosses: t.currentRound };
    });
    if (!result) return res.status(403).json({ error: 'Este convite de entrada tardia expirou ou já foi usado.' });
    await audit(req.user, 'tournament.player.late_join', 'TOURNAMENT', t.id, result);
    return res.json({ ok: true, ...result });
  }
  if (t.status !== 'OPEN') return res.status(403).json({ error: 'As inscrições deste torneio estão fechadas.' });
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

const xml = (value = '') => String(value).replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' }[ch]));
const imageDataUri = async (url, size = 72) => {
  try {
    let source;
    if (String(url || '').startsWith('/uploads/')) source = await fs.readFile(path.join(UPLOADS_DIR, path.basename(url)));
    else if (/^https?:\/\//i.test(String(url || ''))) {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'BX-Deck-Lab/1.0' } });
      if (!response.ok) return null;
      source = Buffer.from(await response.arrayBuffer());
    } else return null;
    return `data:image/png;base64,${(await sharp(source, { animated: false }).resize(size, size, { fit: 'cover' }).png().toBuffer()).toString('base64')}`;
  } catch { return null; }
};

/** Arte de classificação: é renderizada sob demanda, portanto sempre reflete os decks atuais. */
export async function renderStandingsImage(t) {
  const standings = standingsOf(t);
  const ids = [...new Set(standings.flatMap((s) => s.player.deck?.beys?.flat?.() || []))];
  const parts = ids.length ? await prisma.part.findMany({ where: { id: { in: ids } } }) : [];
  const byId = new Map(parts.map((p) => [p.id, p]));
  const combo = (deck, pos) => {
    const pieces = (deck?.beys?.[pos] || []).map((id) => byId.get(id)).filter(Boolean);
    const main = pieces.find((p) => ['BLADE', 'MAIN_BLADE'].includes(p.kind)) || pieces[0];
    // Um combo CX pode ter Lock, Main, Assist e Over além de Ratchet e Bit.
    // A arte conserva todas as peças complementares, não só Ratchet/Bit.
    const small = pieces.filter((p) => p !== main && ['LOCK_CHIP', 'ASSIST_BLADE', 'OVER_BLADE', 'RATCHET', 'BIT'].includes(p.kind)).slice(0, 4);
    return { main, small };
  };
  const urls = new Set(standings.flatMap((s) => [s.player.user.avatarUrl, ...[0, 1, 2].flatMap((n) => { const c = combo(s.player.deck, n); return [c.main?.imageUrl, ...c.small.map((p) => p.imageUrl)]; })]).filter(Boolean));
  const assets = new Map(await Promise.all([...urls].map(async (url) => [url, await imageDataUri(url, 72)])));
  const asset = (p) => assets.get(p?.imageUrl) || null;
  const rows = standings.map((s, i) => {
    const avatar = assets.get(s.player.user.avatarUrl) || null;
    const y = 196 + i * 98; const rankColor = i === 0 ? '#ffd452' : i === 1 ? '#c3d2df' : i === 2 ? '#e59765' : '#263349';
    const initials = xml((s.player.user.name || '?').slice(0, 1).toUpperCase());
    const avatarArt = avatar ? `<image href="${avatar}" x="92" y="${y + 12}" width="62" height="62" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip${i})"/>` : `<text x="123" y="${y + 51}" text-anchor="middle" class="initial">${initials}</text>`;
    const deckArt = [0, 1, 2].map((n) => {
      const c = combo(s.player.deck, n); const x = 386 + n * 90; const fallback = xml((c.main?.abbrev || c.main?.name || '?').slice(0, 4).toUpperCase());
      const primary = `<circle cx="${x}" cy="${y + 43}" r="22" class="blade-ring"/>${asset(c.main) ? `<image href="${asset(c.main)}" x="${x - 22}" y="${y + 21}" width="44" height="44" preserveAspectRatio="xMidYMid meet" clip-path="url(#bladeClip${i}-${n})"/>` : `<text x="${x}" y="${y + 47}" text-anchor="middle" class="blade-fallback">${fallback}</text>`}`;
      const extras = c.small.slice(0, 4).map((p, k) => { const sx = x + 25 + (k % 2) * 22; const sy = y + 31 + Math.floor(k / 2) * 24; const label = xml((p.abbrev || p.name || '?').slice(0, 2).toUpperCase()); return `<circle cx="${sx}" cy="${sy}" r="10" class="piece-ring"/>${asset(p) ? `<image href="${asset(p)}" x="${sx - 10}" y="${sy - 10}" width="20" height="20" preserveAspectRatio="xMidYMid meet" clip-path="url(#pieceClip${i}-${n}-${k})"/>` : `<text x="${sx}" y="${sy + 3}" text-anchor="middle" class="piece-fallback">${label}</text>`}`; }).join('');
      return primary + extras;
    }).join('');
    return `<g><rect x="24" y="${y}" width="932" height="86" rx="14" class="row ${i % 2 ? 'row-alt' : ''}"/><circle cx="54" cy="${y + 43}" r="18" fill="${rankColor}"/><text x="54" y="${y + 49}" text-anchor="middle" class="rank">${i + 1}</text><circle cx="123" cy="${y + 43}" r="31" class="avatar-ring"/>${avatarArt}<text x="174" y="${y + 35}" class="name">${xml(s.player.user.name)}</text><text x="174" y="${y + 58}" class="handle">@${xml(s.player.user.slug)}</text>${deckArt}<text x="687" y="${y + 49}" text-anchor="middle" class="stat-main">${s.points}</text><text x="750" y="${y + 49}" text-anchor="middle" class="stat">${s.wins}</text><text x="804" y="${y + 49}" text-anchor="middle" class="stat">${s.losses}</text><text x="864" y="${y + 49}" text-anchor="middle" class="stat">${Math.round(s.omw * 100)}%</text><text x="928" y="${y + 49}" text-anchor="middle" class="stat">${Math.round(s.oomw * 100)}%</text></g>`;
  }).join('');
  const height = 310 + standings.length * 98;
  const defs = standings.map((_, i) => `<clipPath id="avatarClip${i}"><circle cx="123" cy="${208 + i * 98}" r="31"/></clipPath>${[0, 1, 2].map((n) => `<clipPath id="bladeClip${i}-${n}"><circle cx="${386 + n * 90}" cy="${239 + i * 98}" r="22"/></clipPath>${[0, 1, 2, 3].map((k) => `<clipPath id="pieceClip${i}-${n}-${k}"><circle cx="${411 + n * 90 + (k % 2) * 22}" cy="${227 + i * 98 + Math.floor(k / 2) * 24}" r="10"/></clipPath>`).join('')}`).join('')}`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="980" height="${height}" viewBox="0 0 980 ${height}"><defs>${defs}<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#111b2d"/><stop offset=".55" stop-color="#090d15"/><stop offset="1" stop-color="#15101d"/></linearGradient><style>.title{font-family:'DejaVu Sans';font-weight:800;font-size:35px;fill:#f4f8ff}.subtitle{font-family:'DejaVu Sans';font-weight:600;font-size:16px;fill:#8fa1ba}.head{font-family:'DejaVu Sans';font-weight:800;font-size:12px;letter-spacing:1px;fill:#13d9ff}.row{fill:#121b2a;stroke:#273852;stroke-width:1}.row-alt{fill:#0d1522}.rank{font-family:'DejaVu Sans';font-weight:800;font-size:16px;fill:#08101a}.avatar-ring{fill:#22314a;stroke:#13d9ff;stroke-width:2}.initial{font-family:'DejaVu Sans';font-weight:800;font-size:24px;fill:#fff}.name{font-family:'DejaVu Sans';font-weight:800;font-size:19px;fill:#f4f8ff}.handle{font-family:'DejaVu Sans';font-weight:500;font-size:12px;fill:#91a0b5}.blade-ring{fill:#1d2b42;stroke:#3a5377;stroke-width:1}.piece-ring{fill:#16233a;stroke:#557195;stroke-width:1}.blade-fallback{font-family:'DejaVu Sans';font-weight:800;font-size:9px;fill:#e7f2ff}.piece-fallback{font-family:'DejaVu Sans';font-weight:800;font-size:6px;fill:#e7f2ff}.stat-main{font-family:'DejaVu Sans';font-weight:800;font-size:22px;fill:#ffd452}.stat{font-family:'DejaVu Sans';font-weight:700;font-size:17px;fill:#e9f1fc}</style></defs><rect width="980" height="${height}" fill="url(#bg)"/><rect width="980" height="8" fill="#13d9ff"/><path d="M0 110H980" stroke="#263852"/><text x="34" y="57" class="title">${xml(t.name)}</text><text x="34" y="85" class="subtitle">CLASSIFICAÇÃO ${t.status === 'FINISHED' ? 'FINAL' : `• RODADA ${t.currentRound}`}</text><text x="42" y="164" class="head">#</text><text x="174" y="164" class="head">JOGADOR</text><text x="372" y="164" class="head">DECKS</text><text x="666" y="164" class="head">PTS</text><text x="741" y="164" class="head">V</text><text x="796" y="164" class="head">D</text><text x="838" y="164" class="head">OPP%</text><text x="897" y="164" class="head">OPP OPP%</text>${rows}<text x="34" y="${height - 24}" class="subtitle">BX DECK LAB • torneio suíço • 3 pontos por vitória</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

router.get('/api/tournaments/:slug/standings-image.png', requireManage(bySlug), ah(async (req, res) => {
  const t = req.tournament;
  const png = await renderStandingsImage(t);
  res.type('png').set('Content-Disposition', `attachment; filename="${t.slug}-classificacao.png"`).send(png);
}));

/** O gestor pode selecionar, para cada inscrito, um deck que realmente pertença àquele jogador. */
router.get('/api/tournaments/:slug/player-decks', requireManage(bySlug), ah(async (req, res) => {
  const players = req.tournament.players;
  const decks = await prisma.communityDeck.findMany({
    where: { authorId: { in: players.map((p) => p.userId) } },
    select: { id: true, title: true, authorId: true, isPublic: true, beysJson: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
  const byPlayer = Object.fromEntries(players.map((p) => [p.id, decks.filter((d) => d.authorId === p.userId).map((d) => ({ ...d, beys: (() => { try { return JSON.parse(d.beysJson || '[]'); } catch { return []; } })() }))]));
  res.json({ decksByPlayer: byPlayer });
}));

router.post('/api/tournaments/:slug/players/:playerId/deck', requireManage(bySlug), ah(async (req, res) => {
  const player = req.tournament.players.find((p) => p.id === req.params.playerId);
  if (!player) return res.status(404).json({ error: 'Jogador não encontrado.' });
  const deckId = req.body?.deckId ? String(req.body.deckId) : null;
  if (deckId) {
    const deck = await prisma.communityDeck.findUnique({ where: { id: deckId } });
    if (!deck || deck.authorId !== player.userId) return res.status(422).json({ error: 'Escolha um deck que pertença a este jogador.' });
  }
  const updated = await prisma.tournamentPlayer.update({ where: { id: player.id }, data: { deckId }, include: { user: true, deck: true } });
  await audit(req.user, 'tournament.player.deck.set', 'TOURNAMENT', req.tournament.id, { playerId: player.id, deckId });
  res.json({ player: playerDto(updated) });
}));

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

router.post('/api/tournaments/:slug/late-entry-invites', requireManage(bySlug), ah(async (req, res) => {
  const t = req.tournament;
  if (t.status !== 'RUNNING') return res.status(422).json({ error: 'A entrada tardia só pode ser liberada durante o torneio.' });
  const invite = await prisma.tournamentLateEntryInvite.create({
    data: { tournamentId: t.id, token: randomBytes(24).toString('base64url'), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  const url = `${siteUrl()}/t/${t.slug}?late=${encodeURIComponent(invite.token)}`;
  await audit(req.user, 'tournament.late_invite.create', 'TOURNAMENT', t.id, { expiresAt: invite.expiresAt, lateLosses: t.currentRound });
  res.json({ url, expiresAt: invite.expiresAt, lateLosses: t.currentRound });
}));

router.post('/api/tournaments/:slug/finish', requireManage(bySlug), ah(async (req, res) => {
  await prisma.tournament.update({ where: { id: req.tournament.id }, data: { status: 'FINISHED' } });
  await audit(req.user, 'tournament.finish', 'TOURNAMENT', req.tournament.id);
  import('../meta.js').then((m) => m.onTournamentFinished(req.tournament.slug)).catch(() => {});
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
  else {
    // Um drop no meio da rodada encerra a partida pendente por forfeit, sem travar a próxima rodada.
    const current = t.matches.find((m) => m.round === t.currentRound && m.status !== 'DONE' && (m.p1Id === player.id || m.p2Id === player.id));
    if (current?.p2Id) {
      const opponentId = current.p1Id === player.id ? current.p2Id : current.p1Id;
      await prisma.tMatch.update({ where: { id: current.id }, data: { winnerId: opponentId, status: 'DONE', resolvedBy: 'ORGANIZER' } });
    }
    await prisma.tournamentPlayer.update({ where: { id: player.id }, data: { dropped: true } });
  }
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
