import { createBroadcastAudio } from './tournament-broadcast-audio.mjs';

const byId = id => document.getElementById(id);
const el = Object.fromEntries([
  'tv', 'eventName', 'roundLabel', 'roundNumber', 'arenaLabel', 'arenaCount', 'arenaStage',
  'waiting', 'waitingGrid', 'waitingCount', 'standingLabel', 'standingCount', 'standingCols',
  'standingList', 'standingPage', 'connection', 'eventLocation', 'scene', 'soundToggle',
  'testSound', 'volume', 'motionToggle', 'fullscreen',
].map(id => [id, byId(id)]));
const audio = createBroadcastAudio();
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const two = value => String(value).padStart(2, '0');
const medals = ['gold', 'silver', 'bronze'];
const slug = location.pathname.split('/').filter(Boolean)[1];
const url = '/api/tournaments/' + (slug || '') + '/broadcast';
const failedPhotos = new Set();
const prefetchedPhotos = new Set();
const renderKeys = new Map();
let state;
let players = new Map();
let source;
let retry;
let timer;
let running = false;
let connectionGeneration = 0;
let cursor = 0;
let connected = false;
let serverOffset = 0;
let waitingPage = 0;
let standingPage = 0;
let rotatedAt = 0;
let standingChanged = false;
let activeScene;
let pendingScenes = [];
let sceneTimers = [];
let previousLive = new Set();

function text(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function renderWhen(node, key, markup) {
  if (renderKeys.get(node) === key) return;
  renderKeys.set(node, key);
  node.innerHTML = markup();
}

function photoUrl(player) {
  const source = player?.photo;
  if (!source || failedPhotos.has(source)) return '';
  try {
    const parsed = new URL(source, location.origin);
    return ['https:', 'http:'].includes(parsed.protocol) ? source : '';
  } catch { return ''; }
}

function portrait(player) {
  const initials = player?.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase() || 'BX';
  const photo = photoUrl(player);
  return `<span class="portrait" aria-hidden="true">${escapeHtml(initials)}${photo
    ? `<img src="${escapeHtml(photo)}" data-photo="${escapeHtml(photo)}" decoding="async" alt="">` : ''}</span>`;
}

document.addEventListener('error', event => {
  if (event.target instanceof HTMLImageElement && event.target.dataset.photo) {
    if (failedPhotos.size >= 128) failedPhotos.clear();
    failedPhotos.add(event.target.dataset.photo);
    event.target.remove();
  }
}, true);

function preloadMatches(matches) {
  for (const match of matches) {
    for (const id of [match.p1Id, match.p2Id]) {
      const url = photoUrl(players.get(id));
      if (!url || prefetchedPhotos.has(url)) continue;
      if (prefetchedPhotos.size >= 128) prefetchedPhotos.clear();
      prefetchedPhotos.add(url);
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
    }
  }
}

const elo = player => player?.elo != null ? `<small>ELO ${player.elo}</small>` : '';
const nameClass = player => (player?.name.length ?? 0) > 25 ? 'long' : '';

function competitor(id) {
  const player = players.get(id);
  return `<div class="competitor">${portrait(player)}<strong class="${nameClass(player)}">${escapeHtml(player?.name || 'Blader')}</strong>${elo(player)}</div>`;
}

function duel(match, scene = false) {
  const score = !scene && (match.p1Score || match.p2Score)
    ? `<small>${match.p1Score} – ${match.p2Score}</small>` : '';
  return `<div class="${scene ? 'scene-duel' : 'duel'}">${competitor(match.p1Id)}<div class="versus">VS${score}</div>${competitor(match.p2Id)}</div>`;
}

function showConnection(label, online = false) {
  text(el.connection.querySelector('span'), label);
  el.connection.classList.toggle('online', online);
}

function renderArena() {
  const { tournament, live, waiting, completed, participants, standings } = state;
  const finished = tournament.status === 'FINISHED';
  text(el.arenaLabel, finished ? 'Pódio oficial' : 'Mesas ao vivo');
  text(el.arenaCount, tournament.status === 'RUNNING' ? two(live.length) + ' / 04 ativas' : '');
  renderWhen(el.arenaStage, JSON.stringify([tournament, live, waiting.length, completed, participants.length,
    finished ? standings.slice(0, 3).map(row => [row, players.get(row.playerId)]) : live.map(m => [players.get(m.p1Id), players.get(m.p2Id)])]), () => {
    if (finished && standings.length) {
      return `<div class="podium-final">${[1, 0, 2].map(index => {
        const row = standings[index];
        if (!row) return '<div></div>';
        const player = players.get(row.playerId);
        return `<div class="podium-place ${medals[index]}"><span class="place">${index + 1}º</span>${portrait(player)}
          <strong>${escapeHtml(player?.name || 'Blader')}</strong><small>${row.points} pontos</small>${elo(player)}</div>`;
      }).join('')}</div>`;
    }
    if (live.length) {
      return `<div class="live-grid" data-count="${live.length}">${live.map(match => `
        <article class="live-card ${previousLive.has(match.id) ? '' : 'enter'}" data-table="${match.liveTableNo}" data-live-id="${escapeHtml(match.id)}">
          <div class="live-meta"><span>Mesa ${two(match.liveTableNo)} · R${two(match.round)}</span><b>Ao vivo</b>
            ${match.liveStartedAt ? `<time data-start="${escapeHtml(match.liveStartedAt)}"></time>` : ''}</div>
          ${duel(match)}
        </article>`).join('')}</div>`;
    }
    let heading = 'Aguardando mesa ao vivo';
    let detail = waiting.length + ' confronto(s) aguardando nesta rodada';
    if (tournament.status === 'OPEN') {
      heading = 'O torneio começa em breve';
      detail = participants.length + ' participantes aptos';
    } else if (tournament.status === 'CANCELED') {
      heading = 'Torneio cancelado';
      detail = '';
    } else if (finished) {
      heading = 'Torneio encerrado';
      detail = '';
    } else if (!waiting.length) {
      heading = 'Aguardando próxima rodada';
      detail = completed + ' partidas concluídas na rodada';
    }
    return `<div class="arena-empty"><span class="tv-kicker">${escapeHtml(tournament.storeName || 'Beyblade X')}</span><strong>${heading}</strong>${detail ? `<p>${detail}</p>` : ''}</div>`;
  });
  previousLive = new Set(live.map(match => match.id));
  renderWaiting();
  tickClocks();
}

function renderWaiting() {
  const waiting = state.waiting;
  el.waiting.hidden = !waiting.length;
  if (!waiting.length) return;
  const pages = Math.ceil(waiting.length / 3);
  waitingPage %= pages;
  const slice = waiting.slice(waitingPage * 3, (waitingPage + 1) * 3);
  text(el.waitingCount, waiting.length + ' aguardando' + (pages > 1 ? ` · ${waitingPage + 1}/${pages}` : ''));
  renderWhen(el.waitingGrid, JSON.stringify(slice.map(m => [m.id, m.tableNo, players.get(m.p1Id), players.get(m.p2Id)])), () => {
    const line = id => {
      const player = players.get(id);
      return `<div class="waiting-line">${portrait(player)}${escapeHtml(player?.name || 'Blader')}</div>`;
    };
    return slice.map(match => `<article class="waiting-item">
      <div class="waiting-meta"><span>Pareamento ${two(match.tableNo)}</span><span>Aguardando</span></div>
      ${line(match.p1Id)}<span class="waiting-vs">VS</span>${line(match.p2Id)}</article>`).join('');
  });
}

function renderStandings() {
  const registration = state.tournament.status === 'OPEN';
  const rows = registration ? state.participants.map(playerId => ({ playerId })) : state.standings;
  const fixed = registration ? 0 : Math.min(3, rows.length);
  const limit = 8 - fixed;
  const pages = Math.max(1, Math.ceil((rows.length - fixed) / limit));
  standingPage %= pages;
  text(el.standingLabel, registration ? 'Participantes aptos' : 'Classificação geral');
  text(el.standingCount, rows.length + ' bladers');
  el.standingCols.hidden = registration || !rows.length;
  text(el.standingPage, pages > 1 ? `Página ${standingPage + 1} / ${pages}` : '');
  const offset = fixed + standingPage * limit;
  const visible = [...rows.slice(0, fixed).map((row, i) => [row, i]),
    ...rows.slice(offset, offset + limit).map((row, i) => [row, offset + i])];
  const decoratePodium = !registration && (state.tournament.status === 'FINISHED' || rows.some(row => row.points || row.losses));
  renderWhen(el.standingList, JSON.stringify([registration, decoratePodium, visible.map(([row, i]) => [row, i, players.get(row.playerId)])]), () => {
    if (!visible.length) return '<p class="standing-empty">Nenhum participante disponível.</p>';
    return visible.map(([row, i]) => {
      const player = players.get(row.playerId);
      const medal = decoratePodium && i < 3 ? 'podium ' + medals[i] : '';
      return `<div class="standing-row ${medal} ${i >= fixed && standingChanged ? 'page-enter' : ''}">
        <span class="standing-rank">${registration ? '·' : i + 1}</span>
        <div class="standing-person">${portrait(player)}<div class="standing-name"><b class="${nameClass(player)}">${escapeHtml(player?.name || 'Blader')}</b>${elo(player)}${row.dropped ? '<small>Drop</small>' : ''}</div></div>
        ${registration ? '' : `<span class="standing-score">${row.points}</span><span class="standing-record"><span class="w">${row.wins}</span>–<span class="l">${row.losses}</span></span>`}
        </div>`;
    }).join('');
  });
  standingChanged = false;
}

function tickClocks() {
  for (const clock of el.arenaStage.querySelectorAll('[data-start]')) {
    const seconds = Math.max(0, Math.floor((Date.now() + serverOffset - Date.parse(clock.dataset.start)) / 1000));
    if (Number.isFinite(seconds)) text(clock, two(Math.floor(seconds / 60)) + ':' + two(seconds % 60));
  }
}

function render() {
  const t = state.tournament;
  text(el.eventName, t.name);
  text(el.roundLabel, t.status === 'FINISHED' ? 'Encerrado' : t.round ? 'Rodada atual' : 'Painel da arena');
  text(el.roundNumber, t.round ? two(t.round) : '—');
  text(el.eventLocation, [t.storeName, t.format === 'MD3' ? 'Melhor de 3' : 'Até 4 pontos'].filter(Boolean).join(' · '));
  document.title = t.name + ' · Arena ao vivo';
  renderArena();
  renderStandings();
}

function currentMatch(event) {
  return state.live.find(match => match.id === event.matchId);
}

function relevant(event) {
  if (!connected || state?.tournament.status !== 'RUNNING' || event.round !== state.tournament.round) return false;
  if (event.kind === 'ROUND') return true;
  const match = currentMatch(event);
  if (!match) return false;
  const latest = [...state.events].reverse().find(item => item.kind === 'TABLE' && item.matchId === match.id);
  return !latest || latest.id === event.id;
}

function clearScene() {
  for (const id of sceneTimers) clearTimeout(id);
  sceneTimers = [];
  activeScene = null;
  el.scene.hidden = true;
  el.scene.classList.remove('exiting');
  delete el.scene.dataset.table;
  el.scene.replaceChildren();
}

function presentNext() {
  if (activeScene) return;
  pendingScenes = pendingScenes.filter(event => event.expires > performance.now() && relevant(event));
  const next = pendingScenes.shift();
  if (!next) return;
  activeScene = next;
  const isRound = next.kind === 'ROUND';
  const match = isRound ? null : currentMatch(next);
  if (match) el.scene.dataset.table = match.liveTableNo;
  el.scene.innerHTML = isRound
    ? `<div class="scene-round"><p>${escapeHtml(state.tournament.name)}</p><h2>Rodada ${two(next.round)}</h2><p>Confrontos definidos</p></div>`
    : `<div class="scene-table"><p>Partida iniciada · Rodada ${two(next.round)}</p><h2>Mesa ${two(match.liveTableNo)}</h2>${duel(match, true)}</div>`;
  el.scene.hidden = false;
  audio.play(next.kind);
  if (!isRound) sceneTimers.push(setTimeout(() => audio.play('VS'), 790));
  const duration = isRound ? 6200 : 5100;
  sceneTimers.push(setTimeout(() => el.scene.classList.add('exiting'), duration - 500));
  sceneTimers.push(setTimeout(() => {
    clearScene();
    rotatedAt = performance.now();
    presentNext();
  }, duration));
}

function receive(snapshot, initial) {
  if (!initial && snapshot.cursor < cursor) return;
  const lastRound = state?.tournament.round;
  const lastStatus = state?.tournament.status;
  state = snapshot;
  players = new Map(snapshot.players.map(player => [player.id, player]));
  if (lastRound !== snapshot.tournament.round || lastStatus !== snapshot.tournament.status) {
    waitingPage = standingPage = 0;
    rotatedAt = performance.now();
  }
  if (initial) {
    pendingScenes = [];
    clearScene();
    cursor = snapshot.cursor;
  }
  const fresh = initial ? [] : snapshot.events.filter(event => event.id > cursor && relevant(event));
  cursor = Math.max(cursor, snapshot.cursor);
  if (activeScene && (!relevant(activeScene) || fresh.some(event => event.kind === 'ROUND'))) clearScene();
  pendingScenes.push(...fresh.map(event => ({ ...event, expires: performance.now() + 22_000 })));
  pendingScenes = pendingScenes.filter(relevant)
    .sort((a, b) => Number(b.kind === 'ROUND') - Number(a.kind === 'ROUND') || a.id - b.id).slice(0, 5);
  preloadMatches([...state.live, ...state.waiting.slice(0, 6)]);
  render();
  presentNext();
}

function rotate() {
  tickClocks();
  if (!state || activeScene || document.hidden || performance.now() - rotatedAt < 8500) return;
  rotatedAt = performance.now();
  if (state.waiting.length > 3) { waitingPage++; renderWaiting(); }
  if ((state.tournament.status === 'OPEN' ? state.participants : state.standings).length > 8) {
    standingPage++;
    standingChanged = true;
    renderStandings();
  }
}

function unavailable() {
  state = null;
  renderKeys.clear();
  pendingScenes = [];
  clearScene();
  el.waiting.hidden = true;
  text(el.eventName, 'Painel indisponível');
  text(el.roundNumber, '—');
  text(el.arenaCount, '');
  text(el.standingCount, '');
  text(el.eventLocation, '');
  text(el.standingPage, '');
  el.standingList.replaceChildren();
  el.standingCols.hidden = true;
  el.arenaStage.innerHTML = '<div class="arena-empty"><strong>Painel indisponível</strong><p>Confira o link ou o acesso a este torneio.</p></div>';
  showConnection('Sem acesso');
}

async function connect(generation, first = true) {
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout?.(8000) });
    if (!running || generation !== connectionGeneration) return;
    if ([401, 403, 404].includes(response.status)) return unavailable();
    if (!response.ok) throw new Error('Painel temporariamente indisponível');
    const snapshot = await response.json();
    if (!running || generation !== connectionGeneration) return;
    const time = Date.parse(response.headers.get('Date'));
    if (Number.isFinite(time)) serverOffset = time - Date.now();
    const nativeStream = typeof EventSource === 'function';
    connected = !nativeStream;
    receive(snapshot, first || nativeStream);
    if (!nativeStream) {
      showConnection('Conectado', true);
      retry = setTimeout(() => connect(generation, false), 1400);
      return;
    }
    const stream = new EventSource(url + '/stream');
    source = stream;
    stream.addEventListener('snapshot', message => {
      if (source !== stream) return;
      connected = true;
      showConnection('Conectado', true);
      receive(JSON.parse(message.data), true);
    });
    stream.addEventListener('state', message => {
      if (source === stream && connected) receive(JSON.parse(message.data), false);
    });
    stream.addEventListener('unavailable', () => {
      stream.close();
      unavailable();
    });
    stream.onerror = () => {
      if (source !== stream) return;
      connected = false;
      pendingScenes = [];
      clearScene();
      showConnection('Reconectando…');
      if (stream.readyState === EventSource.CLOSED) retry = setTimeout(() => connect(generation), 2200);
    };
  } catch {
    if (!running || generation !== connectionGeneration) return;
    connected = false;
    pendingScenes = [];
    clearScene();
    showConnection('Reconectando…');
    retry = setTimeout(() => connect(generation), 2200);
  }
}

function start() {
  if (running) return;
  running = true;
  timer = setInterval(rotate, 1000);
  void connect(++connectionGeneration);
}

window.addEventListener('pagehide', () => {
  running = connected = false;
  source?.close();
  source = null;
  clearTimeout(retry);
  clearInterval(timer);
  pendingScenes = [];
  clearScene();
});
window.addEventListener('pageshow', start);

function soundState() {
  el.soundToggle.setAttribute('aria-pressed', String(audio.enabled));
  text(el.soundToggle, audio.enabled ? 'Som ligado' : 'Ativar som');
}
async function enableSound() {
  try { await audio.unlock(); }
  catch { text(el.soundToggle, 'Som indisponível'); return false; }
  soundState();
  return audio.enabled;
}
el.soundToggle.onclick = async () => {
  if (audio.enabled) { audio.mute(); soundState(); }
  else if (await enableSound()) audio.play('TABLE');
};
el.testSound.onclick = async () => { if (audio.enabled || await enableSound()) audio.play('ROUND'); };
el.volume.oninput = () => audio.setVolume(Number(el.volume.value) / 100);
el.motionToggle.onclick = () => {
  const reduced = document.documentElement.classList.toggle('reduced-effects');
  el.motionToggle.setAttribute('aria-pressed', String(reduced));
};
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen?.();
  } catch { /* Navegadores que exigem um gesto deixam o botão disponível. */ }
}
el.fullscreen.onclick = fullscreen;
document.addEventListener('fullscreenchange', () => text(el.fullscreen, document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia ⛶'));
if (new URLSearchParams(location.search).get('fullscreen') === '1') void fullscreen();
start();
