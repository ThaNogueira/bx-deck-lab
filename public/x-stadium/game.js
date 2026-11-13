import { ArenaView } from './scene.js';
import { Battle, DT, initPhysics } from './physics.js';
import { ATTACK, BIT_TYPES, BITS, BLADE_TOP, BLADES, DEFAULTS, GRAMS_PER_MASS_UNIT, MOVE_USES, RATCHETS, STAMINA, getParts, railRating, sanitizeConfig, specialMove } from './rules.js';
import { clamp } from './stadium.js';
import { Link, roomCode } from './online.js';
import { ArenaAudio } from './audio.js';

const $ = id => document.getElementById(id);
const icons = {
  arena:'<path d="m2 9 4-5h12l4 5-3 10H5z"/><ellipse cx="12" cy="10" rx="6" ry="3"/>',
  parts:'<path d="m12 3 9 5-9 5-9-5 9-5zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4m-2-12a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
  muted:'<path d="M11 5 6 9H3v6h3l5 4zm5 4 5 6m0-6-5 6"/>',
  sound:'<path d="M11 5 6 9H3v6h3l5 4zm4 4a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-.7.8-.7 1.6m0 3h.01"/>',
  cpu:'<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/><rect x="10" y="10" width="4" height="4"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',
  cube:'<path d="m12 2 9 5v10l-9 5-9-5V7zm0 10v10M3 7l9 5 9-5"/>',
  top:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
  focus:'<path d="M3 9V4h5m8 0h5v5m0 6v5h-5m-8 0H3v-5"/><circle cx="12" cy="12" r="4"/>',
  expand:'<path d="M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6"/>',
  mouse:'<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 5v4"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3"/>',
  bolt:'<path d="m13 2-9 12h7l-1 8 10-12h-7z"/>',
  trophy:'<path d="M8 21h8m-4-5v5m-5-18h10v6a5 5 0 0 1-10 0zm0 2H3v2a4 4 0 0 0 4 4m10-6h4v2a4 4 0 0 1-4 4"/>',
  activity:'<path d="M2 12h5l3-7 4 14 3-7h5"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  edit:'<path d="m15 5 4 4M4 20l4-1L20 7l-4-4L4 15z"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  plus:'<path d="M5 12h14m-7-7v14"/>',
  minus:'<path d="M5 12h14"/>',
  reset:'<path d="M3 10a9 9 0 1 1 3 9M3 4v6h6"/>',
  hand:'<path d="M8 12V6a1.5 1.5 0 0 1 3 0v4-6a1.5 1.5 0 0 1 3 0v6-4a1.5 1.5 0 0 1 3 0v5-2a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1c-2 0-4-1-5-3l-3-4a1.5 1.5 0 0 1 2-2l2 2"/>',
  shrink:'<path d="M3 9h6V3m6 0v6h6m0 6h-6v6m-6 0v-6H3"/>',
  check:'<path d="m4 12 5 5L20 6" stroke-width="2.7"/>',
};
function drawIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach(icon => {
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[icon.dataset.icon] + '</svg>';
  });
}

const state = {
  mode: 'cpu', phase: 'setup', round: 1, scores: [0, 0], localPlayer: 0, turn: 0,
  configs: DEFAULTS.map(sanitizeConfig), ready: [false, false], frames: null, physics: null,
  result: null, qte: null, reflex: true, trial: null, sound: false, camera: 'orbit', cameraDrag: false, connected: false, roomStatus: '',
};
let view, available = false, workPlayer = 0, accumulator = 0, flashTimer, lastTime = performance.now(), lastSent = 0, lastHud = 0;
let workPart = null;
const audio = new ArenaAudio();
let previousFrames = null, newestSnapshot = null;
const snapshots = [];
let onlineDraft = '';
const dialog = $('dialog'), content = $('dialog-content'), overlay = $('battle-overlay');
const phases = { setup: 'PREPARAÇÃO', countdown: 'LANÇAMENTO', fight: 'EM BATALHA', qte: 'IMPACTO', result: 'RESULTADO' };
const QTE_SPEED = .012;

const isHost = () => state.mode !== 'online' || state.localPlayer === 0;
const activePlayer = () => state.mode === 'local' ? state.turn : state.localPlayer;
const canEdit = i => state.phase === 'setup' && !state.ready[i] && (state.mode !== 'online' || i === state.localPlayer);
const controls = $('combat-controls');
const moves = {
  attack: { name: 'Xtreme Attack', icon: 'target', text: ' avançou para o ataque.' },
  defense: { name: 'Full Defense', icon: 'arena', text: ' firmou posição no centro.' },
  circle: { name: 'Full Circle', icon: 'top', text: ' entrou em órbita no centro.' },
  dash: { name: 'Xtreme Dash', icon: 'bolt', text: ' acelerou em direção ao trilho.' },
};
const specialFor = player => specialMove(BITS[state.configs[player].bit]);
controls.innerHTML = [0,1].map(player =>
  '<section class="combat-side p' + (player+1) + '" aria-label="Jogador ' + (player+1) + '"><b>J' + (player+1) + '</b>' +
  ['special','dash'].map(slot =>
    '<button type="button" data-action="combat" data-player="' + player + '" data-slot="' + slot + '" disabled>' +
    '<i data-icon="target"></i><span class="combat-name"></span><kbd></kbd><span class="combat-charge">' + MOVE_USES + '</span></button>'
  ).join('') + '</section>'
).join('');
const moveButtons = Array.from(controls.querySelectorAll('button')).map(el => ({
  el, player: Number(el.dataset.player), slot: el.dataset.slot, key: el.querySelector('kbd'), count: el.querySelector('.combat-charge'),
  name: el.querySelector('.combat-name'), icon: el.querySelector('i'),
}));

function updateCombatControls() {
  const fighting = state.phase === 'fight';
  controls.hidden = !fighting;
  for (const { el, player, slot, key, count, name, icon } of moveButtons) {
    const kind = slot === 'special' ? specialFor(player) : 'dash';
    const owned = state.mode === 'local' || state.localPlayer === player;
    const data = state.frames?.[player]?.moves;
    const boost = fighting && slot === 'special' ? data?.reflexBoost ?? '' : '';
    if (el.dataset.boost !== boost) el.dataset.boost = boost;
    const uses = data?.[kind] ?? MOVE_USES;
    const letter = (slot === 'special' ? ['E','I'] : ['R','O'])[state.mode === 'local' ? player : 0];
    el.closest('section').hidden = !owned;
    el.disabled = !owned || !fighting || !data?.ready?.includes(kind);
    if (el.dataset.move !== kind) {
      el.dataset.move = kind;
      name.textContent = moves[kind].name;
      icon.dataset.icon = moves[kind].icon;
      drawIcons(el);
    }
    const label = 'Jogador ' + (player+1) + ' · ' + moves[kind].name + (boost ? ' reforçado' : '') + ' · ' + uses + ' de ' + MOVE_USES + ' usos';
    if (el.getAttribute('aria-label') !== label) {
      el.setAttribute('aria-label',label);
      count.textContent = uses;
    }
    if (key.textContent !== letter) {
      key.textContent = letter;
      el.setAttribute('aria-keyshortcuts',letter);
    }
  }
}

function requestMove(player, kind) {
  if (state.phase !== 'fight' || !Object.hasOwn(moves,kind) ||
    state.mode !== 'local' && player !== state.localPlayer ||
    !state.frames?.[player]?.moves?.ready?.includes(kind)) return;
  if (isHost()) {
    if (!state.physics.tryMove(player,kind)) return;
    state.frames = state.physics.frames();
  } else {
    link.send({type:'move',kind,round:state.round});
    const data = state.frames[player].moves;
    data.ready = data.ready.filter(move => move !== kind);
  }
  updateCombatControls();
}

function updateScore() {
  state.scores.forEach((score, i) => {
    $('score' + (i + 1)).textContent = score;
    $('pips' + (i + 1)).innerHTML = Array.from({ length: 4 }, (_, p) => '<span' + (p < score ? ' class="won"' : '') + '></span>').join('');
  });
  $('round-label').textContent = 'RODADA ' + state.round;
  $('player2-label').textContent = state.mode === 'cpu' ? 'CPU' : 'JOGADOR 2';
}

function updateCards() {
  state.configs.forEach((config, i) => {
    const b = BLADES[config.blade];
    $('bey' + (i + 1)).innerHTML =
      '<div class="bey-image"><img src="' + b.image + '" alt=""></div><div class="bey-info"><h3>' + b.name + '</h3><p>' + [config.ratchet,config.bit].filter(Boolean).join(' ') + '</p></div>' +
      '<button class="icon-btn bey-edit" data-action="edit" data-player="' + i + '" aria-label="Editar ' + b.name + '" title="Trocar peças"><i data-icon="edit"></i></button>' +
      '<div class="stamina"><span>GIRO</span><span class="bar"><span class="fill" id="spin-fill' + i + '"></span></span><output id="spin' + i + '">100%</output></div>';
  });
  drawIcons();
  updateStamina();
}

function updateStamina() {
  state.configs.forEach((_, i) => {
    const value = Math.round((state.frames?.[i].spin ?? 1) * 100) + '%';
    const output = $('spin' + i);
    if (output.textContent === value) return;
    $('spin-fill' + i).style.width = value;
    output.textContent = value;
  });
}

function updateControls() {
  const local = activePlayer(), config = state.configs[local];
  const editing = canEdit(local);
  const settingUp = state.phase === 'setup';
  $('heading').value = config.heading;
  $('heading-value').textContent = config.heading + '°';
  $('angle').value = config.angle;
  $('power').value = config.power;
  $('angle-value').value = config.angle + '°';
  $('power-value').value = config.power + '%';
  $('heading').disabled = $('angle').disabled = $('power').disabled = !editing;
  $('launch-title').textContent = state.mode === 'local' ? 'Lançamento · J' + (local + 1) : 'Lançamento';
  $('launch-hint').textContent = !editing ? 'Aguardando o adversário' : state.cameraDrag ?
    'Arraste para mover a câmera.' : 'Toque ou arraste na sua metade.';
  $('launch-panel').hidden = !settingUp;
  $('launch-panel').dataset.editing = editing;
  $('launch-ranges').hidden = !editing;
  $('launch').hidden = !editing;
  $('camera-drag').hidden = !settingUp;
  $('camera-drag').setAttribute('aria-pressed',state.cameraDrag);
  const trainingLabel = {stamina:'TESTE DE RESISTÊNCIA',attack:'TESTE DE ATAQUE'}[state.trial] || 'TREINO COM IA';
  $('mode-name').textContent = {cpu:trainingLabel,local:'DUELO LOCAL',online:state.connected?'DUELO ONLINE':'SALA ONLINE'}[state.mode];
  const modeIcon = document.querySelector('.mode-pill i');
  const nextIcon = state.mode === 'cpu' ? 'cpu' : 'users';
  if (modeIcon.dataset.icon !== nextIcon) {
    modeIcon.dataset.icon = nextIcon;
    drawIcons(modeIcon.parentElement);
  }
  $('stage-state').textContent = phases[state.phase];
  $('stage').dataset.phase = state.phase;
  $('stage').dataset.gesture = editing && !state.cameraDrag ? 'launch' : 'camera';
  $('launch').disabled = !available || !editing || state.mode === 'online' && !state.connected;
  $('launch').querySelector('span').textContent = state.mode === 'local' && local === 0 ? 'Confirmar J1' :
    state.mode === 'online' && !state.connected ? 'Aguardando sala' : 'Puxar corda';
  document.querySelectorAll('.bey-edit').forEach((el, i) => {
    el.hidden = !canEdit(i);
    $('player' + (i + 1) + '-panel').dataset.active = editing && i === local;
  });
  updateCombatControls();
}

function announce(text) { $('last-event').textContent = text; }
function flash(text) {
  const node = $('callout');
  node.hidden = false;
  node.textContent = text;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { node.hidden = true; }, 1000);
}

function resetRound(newMatch = false) {
  state.physics?.dispose();
  state.physics = null;
  state.phase = 'setup';
  state.frames = state.result = state.qte = null;
  previousFrames = newestSnapshot = null;
  snapshots.length = 0;
  state.ready = [false, false];
  state.cameraDrag = false;
  state.turn = 0;
  accumulator = 0;
  if (newMatch) { state.round = 1; state.scores = [0, 0]; }
  $('callout').hidden = true;
  overlay.hidden = true;
  overlay.setAttribute('aria-live','polite');
  updateScore();
  updateCards();
  updateControls();
  view?.ready(state.configs, activePlayer());
  announce('Arena pronta para o lançamento.');
}

function configure(partial, broadcast = true) {
  const i = activePlayer();
  if (!canEdit(i)) return;
  state.configs[i] = sanitizeConfig({ ...state.configs[i], ...partial }, i);
  updateControls();
  view?.ready(state.configs, i);
  if (broadcast) sendSetup();
}

function sendSetup() {
  if (state.mode === 'online' && state.connected) {
    link.send({ type: 'setup', config: state.configs[state.localPlayer], ready: state.ready[state.localPlayer] });
  }
}

function launch() {
  if ($('launch').disabled) return;
  const i = activePlayer();
  state.ready[i] = true;
  if (state.mode === 'local' && i === 0) {
    state.turn = 1;
    view.ready(state.configs, 1);
    updateControls();
    announce('Jogador 2, escolha seu lançamento.');
    return;
  }
  if (state.mode === 'cpu') {
    const options = state.round === 1 || state.trial ? {} : {
      angle: Math.round(Math.random() * 35 - 17),
      heading: Math.round(Math.random() * 155 - 78),
      point: [2.4 + Math.random() * 1.4, Math.random() * 3 - 1.5],
      power: Math.round(81 + Math.random() * 16),
    };
    state.configs[1] = sanitizeConfig({ ...state.configs[1], ...options }, 1);
    state.ready[1] = true;
  }
  view.ready(state.configs, i, false);
  view.setCord(i,state.configs[i].power);
  updateControls();
  sendSetup();
  if (isHost() && state.ready.every(Boolean)) countdown();
  else announce('Lançamento pronto. Aguardando o outro jogador.');
}

function countdown(remote = false) {
  state.phase = 'countdown';
  state.deadline = performance.now() + 1530;
  state.countShown = null;
  updateControls();
  overlay.hidden = false;
  if (!remote && state.mode === 'online') link.send({ type: 'countdown', configs: state.configs });
  view.ready(state.configs, activePlayer(),false);
}

function startFight(remote = false) {
  state.phase = 'fight';
  if (!remote) {
    state.physics = new Battle(state.configs, handleBattleEvent, { reflex: state.reflex });
    previousFrames = state.frames = state.physics.frames();
    if (state.mode === 'online') link.send({ type: 'start', frames: state.frames, time: state.physics.time });
  }
  accumulator = 0;
  lastSent = 0;
  state.cpuMoveAt = 3;
  overlay.hidden = true;
  view.launchAnimation();
  audio.play('launch');
  flash('LET IT RIP!');
  announce('Piões lançados. Batalha em andamento.');
  updateControls();
}

const qteKeys = [['A','S','D'],['J','K','L']];
const qtePositions = ['Esquerda','Centro','Direita'];
const qteArrows = ['←','↓','→'];
const qteWindow = 470;
const qteFeedback = 320;

function showQte(event) {
  state.phase = 'qte';
  const start = performance.now();
  const cues = event.cues.map(({at,target}) => ({at,target}));
  const players = state.mode === 'local' ? [0,1] : [state.localPlayer];
  state.qte = { ...event, start, cues, close: start+cues.at(-1).at+qteWindow,
    reactions: cues.map(() => [null,null]), shown: null, feedbackUntil:start };
  if (state.mode === 'cpu') {
    state.qte.cpu = cues.map(cue => ({
      index: Math.random() < .13 ? (cue.target+1)%3 : cue.target,
      delay: 160+Math.random()*230,
    }));
  }
  overlay.setAttribute('aria-live','off');
  overlay.innerHTML = '<div class="qte-panel"><h2>Disputa de reflexo</h2><p>Aperte o botão quando ele acender.</p>' +
    '<div class="qte-actions">' + players.map(i => {
      const keyRow = state.mode === 'local' ? i : 0;
      const role = i === event.defender ? 'Defesa' : 'Ataque';
      return '<section class="qte-player p' + (i+1) + '" aria-label="Jogador ' + (i+1) + ' · ' + role + '">' +
        '<div class="qte-player-line"><span>J' + (i+1) + ' · ' + role + '</span><span class="qte-rounds"></span></div>' +
        '<div class="qte-buttons">' + qtePositions.map((position,index) =>
          '<button type="button" class="qte-btn" data-action="reaction" data-player="' + i + '" data-symbol="' + index +
          '" aria-label="' + position + '" aria-disabled="true"><span class="qte-lamp" aria-hidden="true"></span>' +
          '<i data-icon="check" class="qte-check"></i><span class="qte-miss" aria-hidden="true">×</span>' +
          '<kbd>' + qteKeys[keyRow][index] + (keyRow === 0 ? ' · ' + qteArrows[index] : '') + '</kbd></button>'
        ).join('') + '</div></section>';
    }).join('') + '</div><div class="qte-track" aria-hidden="true"><b></b></div></div>';
  drawIcons(overlay);
  state.qte.track = overlay.querySelector('.qte-track b');
  state.qte.rows = players.map((i,index) => {
    const row = overlay.querySelectorAll('.qte-player')[index];
    return {player:i,buttons:[...row.querySelectorAll('.qte-btn')],rounds:row.querySelector('.qte-rounds')};
  });
  drawQte(start);
  overlay.hidden = false;
  updateControls();
}

function qteCue(q,now) {
  const elapsed = now-q.start;
  return q.cues.findIndex(({at}) => elapsed >= at && elapsed < at+qteWindow);
}

function recordReaction(q,player,stage,index,delay) {
  if (!q?.cues[stage] || q.reactions[stage][player] !== null || !Number.isInteger(index) || index < 0 || index > 2 ||
    !Number.isFinite(delay) || delay < 0 || delay >= qteWindow) return false;
  const feedbackUntil = performance.now()+qteFeedback;
  q.reactions[stage][player] = { index, correct: index === q.cues[stage].target, delay, feedbackUntil };
  q.feedbackUntil = Math.max(q.feedbackUntil,feedbackUntil);
  return true;
}

function react(player,index) {
  const q = state.qte, now = performance.now();
  if (state.phase !== 'qte') return;
  const stage = qteCue(q,now);
  if (stage < 0) return;
  const delay = now-q.start-q.cues[stage].at;
  if (recordReaction(q,player,stage,index,delay) && state.mode === 'online' && !isHost()) {
    link.send({type:'reaction',id:q.id,stage,index,delay});
  }
  drawQte(now);
}

function drawQte(now) {
  const q = state.qte;
  const stage = qteCue(q,now);
  const latest = stage >= 0 ? stage : q.cues.findLastIndex(cue=>now-q.start >= cue.at);
  const feedback = q.rows.map(({player}) => {
    const reaction = q.reactions[latest]?.[player];
    return reaction && now < reaction.feedbackUntil ? reaction : null;
  });
  const signature = [stage,latest,...feedback.map(hit=>hit?.index ?? '-'),...q.reactions.flat().map(hit=>hit?.index ?? '-')].join('/');
  if (signature !== q.shown) {
    q.shown = signature;
    const target = stage >= 0 ? q.cues[stage].target : -1;
    q.rows.forEach(({player,buttons,rounds},row) => {
      const locked = stage < 0 || q.reactions[stage][player] !== null;
      const hit = feedback[row];
      buttons.forEach((button,index) => {
        const status = hit?.index === index ? hit.correct ? 'hit' : 'miss' : !locked && index === target ? 'target' : 'idle';
        button.dataset.state = status;
        button.setAttribute('aria-disabled',locked);
        button.setAttribute('aria-label',qtePositions[index] +
          ({target:' · aceso',hit:' · acertou',miss:' · errou'}[status] ?? ''));
      });
      rounds.innerHTML = q.cues.map((_,i) => {
        const reaction = q.reactions[i][player];
        const passed = now >= q.start+q.cues[i].at+qteWindow;
        const result = reaction ? reaction.correct ? 'hit' : 'miss' : passed ? 'miss' : stage === i ? 'active' : 'waiting';
        const label = {hit:'Acertou',miss:'Não acertou',active:'Em andamento',waiting:'Aguardando'}[result];
        return '<span data-state="' + result + '" aria-label="' + label + '">' + ({hit:'✓',miss:'×'}[result] ?? '•') + '</span>';
      }).join('');
    });
  }
  const progress = stage < 0 ? 0 : 1-(now-q.start-q.cues[stage].at)/qteWindow;
  q.track.style.transform = 'scaleX(' + progress + ')';
}

function resolveQte() {
  const q = state.qte;
  const correct = [0,1].map(player => q.reactions.map(row => row[player]).filter(hit => hit?.correct));
  const [a,b] = correct.map(list => list.length);
  const [timeA,timeB] = correct.map(list => list.reduce((total,hit) => total+hit.delay,0));
  let winner = null;
  if (a !== b) winner = a > b ? 0 : 1;
  else if (a && Math.abs(timeA-timeB) >= 8) winner = timeA < timeB ? 0 : 1;
  let outcome = null;
  state.qte = null;
  state.phase = 'fight';
  previousFrames = state.frames;
  accumulator = 0;
  overlay.hidden = true;
  overlay.setAttribute('aria-live','polite');
  updateControls();
  if (winner !== null) {
    const accuracyLead = Math.abs(a-b)/q.cues.length;
    const winningTime = correct[winner].reduce((total,hit) => total+hit.delay,0)/correct[winner].length;
    const losingHits = correct[1-winner];
    const losingTime = losingHits.length ? losingHits.reduce((total,hit) => total+hit.delay,0)/losingHits.length : qteWindow;
    const timingLead = clamp((losingTime-winningTime)/qteWindow,0,1);
    const margin = clamp(accuracyLead*.82+timingLead*(a === b ? .80 : .18),0,1);
    outcome = state.physics.counter(winner,q,margin);
  } else announce('Batalha retomada.');
  previousFrames = state.frames = state.physics.frames();
  if (outcome) showReflexOutcome(winner,outcome,q.at);
  if (state.mode === 'online') link.send({type:'resume',winner,outcome,at:q.at,frames:state.frames,time:state.physics.time});
}

function showReflexOutcome(winner,outcome,at) {
  const action = outcome.defended ? 'CONTRA-ATAQUE' : outcome.heavy ? 'ATAQUE FORTE' : 'ATAQUE';
  const label = action + ' J' + (winner+1);
  const special = state.frames?.[winner]?.moves;
  const boosted = special?.reflexBoost === 'ready' && special[specialFor(winner)] > 0;
  flash(boosted ? 'HABILIDADE REFORÇADA · J' + (winner+1) : label);
  announce(boosted ? label + '. Use a habilidade reforçada em até 2,5 segundos.' : label + '!');
  view.spark(at,outcome.heavy ? 1.65 : .85);
}

function handleBattleEvent(event) {
  if (event.type === 'finish') {
    state.frames = state.physics.frames();
    state.result = event;
    if (event.winner !== null) state.scores[event.winner] += event.points;
    showResult();
    if (state.mode === 'online') link.send({ type: 'finish', result: event, scores: state.scores, frames: state.frames, time: state.physics.time });
    return;
  }
  if (event.qte) {
    const first = 670, second = first+560+Math.floor(Math.random()*80);
    event.id = state.physics.time;
    event.cues = [first,second,second+570+Math.floor(Math.random()*90)].map(at => ({
      at,target: Math.floor(Math.random()*3),
    }));
  }
  visualizeEvent(event);
  if (state.mode === 'online') {
    link.send({ type: 'effect', event, frames: event.qte ? state.physics.frames() : undefined, time: state.physics.time });
  }
}

function receiveFrames(frames, time, exact = false) {
  if (!Array.isArray(frames) || frames.length !== 2) return;
  const now = performance.now() / 1000;
  const snapshot = { frames, time: Number.isFinite(time) ? time : now, arrival: now };
  state.frames = frames;
  if (exact) snapshots.length = 0;
  if (snapshot.time === newestSnapshot?.time && snapshots.length) snapshots.pop();
  snapshots.push(snapshot);
  if (snapshots.length > 8) snapshots.shift();
  newestSnapshot = snapshot;
}

function visualizeEvent(event) {
  if (event.type === 'dash') {
    flash('XTREME DASH');
    announce(BLADES[state.configs[event.player].blade].name + ' engatou na Xtreme Line.');
    view.spark(event.at, .7, true);
    audio.play('dash',1,event.at[0]);
  } else if (event.type === 'move') {
    flash(event.kind === 'dash' ? 'RUMO À XTREME LINE' : moves[event.kind].name.toUpperCase() + (event.boosted ? ' +' : ''));
    announce(BLADES[state.configs[event.player].blade].name+ moves[event.kind].text);
  } else if (event.type === 'spin-reward') {
    flash('GIRO RECUPERADO');
    view.spark(event.at,.85,true);
    announce('Full Circle recuperou giro.');
  } else if (event.type === 'rail-exit') {
    view.spark(event.at,.46,true);
  } else if (event.type === 'scrape') {
    view.spark(event.at,event.strength);
    if (event.strength > .20) audio.play('scrape',event.strength,event.at[0]);
  } else if (event.type === 'hit') {
    if (event.strength > .24) view.spark(event.at, event.strength, false, event.sparkAxis);
    if (event.dashHit) flash('IMPACTO XTREME');
    else if (event.attackHit) flash('XTREME ATTACK');
    audio.play(event.dashHit || event.strength > 1.22 ? 'smash' : 'hit',event.strength,event.at[0]);
    announce(event.qte ? 'Impacto forte! Disputa de reflexo.' : event.dashHit ? 'Pancada na saída do Xtreme Dash.' :
      event.attackHit ? 'Xtreme Attack acertou o adversário.' : event.strength < .24 ? 'Toque leve entre os piões.' : 'As Blades se chocaram.');
    if (event.qte && state.phase === 'fight') showQte(event);
  } else if (event.type === 'reverse') {
    flash('REVERSE');
    announce(BLADES[state.configs[event.player].blade].name +
      (event.fromPocket ? ' voltou do bolso ainda girando.' : ' voltou à arena ainda girando.'));
  }
}

function showResult() {
  state.phase = 'result';
  state.burstAt = performance.now();
  state.qte = null;
  overlay.setAttribute('aria-live','polite');
  const r = state.result;
  const winner = r.winner === null ? null : state.mode === 'cpu' && r.winner === 1 ? 'CPU' : 'Jogador ' + (r.winner + 1);
  const match = state.scores.some(s => s >= 4);
  const label = match ? winner + ' venceu a partida!' : winner ? winner + ' · +' + r.points + (r.points === 1 ? ' ponto' : ' pontos') : 'A rodada será repetida.';
  const loser = r.winner === null ? '' : BLADES[state.configs[1-r.winner].blade].name + ' perdeu a rodada.';
  overlay.innerHTML = '<span class="overlay-label">' + (match ? 'FIM DA PARTIDA' : 'FIM DA RODADA') + '</span><strong>' + r.title.toUpperCase() +
    '</strong><p>' + [loser,label].filter(Boolean).join(' ') + '</p><button class="launch-button" data-action="next"' + (isHost() ? '' : ' disabled') + '>' +
    (isHost() ? match ? 'NOVA PARTIDA' : 'PRÓXIMA RODADA' : 'AGUARDANDO ANFITRIÃO') + '</button>';
  overlay.hidden = false;
  updateScore(); updateControls(); updateStamina();
  audio.play('finish');
  announce(r.title + ' · ' + label);
}

function nextRound() {
  if (state.phase !== 'result' || !isHost()) return;
  const newMatch = state.scores.some(s => s >= 4);
  if (!newMatch && state.result.winner !== null) state.round++;
  resetRound(newMatch);
  if (state.mode === 'online') link.send({ type: 'reset', round: state.round, scores: state.scores });
}

const link = new Link((message, status) => {
  state.roomStatus = message;
  if (status === 'connected') {
    state.connected = true;
    sendSetup();
    announce(message);
    updateControls();
    if (dialog.open && content.dataset.panel === 'multiplayer') dialog.close();
  } else if (status === 'closed') {
    state.connected = false;
    resetRound(true);
    announce(message);
    if (!dialog.open || content.dataset.panel === 'multiplayer') multiplayer();
  }
  if ($('room-status')) $('room-status').textContent = message;
}, data => {
  if (state.mode !== 'online') return;
  const remote = 1 - state.localPlayer;
  switch (data.type) {
    case 'setup':
      if (state.phase !== 'setup') break;
      state.configs[remote] = sanitizeConfig(data.config, remote);
      state.ready[remote] = !!data.ready;
      view.setLoadouts(state.configs);
      view.ready(state.configs,activePlayer(),canEdit(activePlayer()));
      updateCards(); updateControls();
      if (isHost() && state.ready.every(Boolean)) countdown();
      break;
    case 'countdown':
      if (isHost() || state.phase !== 'setup') break;
      state.configs = DEFAULTS.map((_, i) => sanitizeConfig(data.configs?.[i], i));
      view.setLoadouts(state.configs);
      updateCards();
      countdown(true);
      break;
    case 'start':
      if (isHost() || state.phase !== 'countdown') break;
      receiveFrames(data.frames, data.time, true);
      startFight(true);
      break;
    case 'frames':
      if (!isHost() && state.phase === data.phase && ['fight','qte','result'].includes(state.phase)) receiveFrames(data.frames, data.time);
      break;
    case 'move':
      if (isHost() && state.phase === 'fight' && state.round === data.round) state.physics.tryMove(remote,data.kind);
      break;
    case 'effect':
      if (!isHost() && state.phase === 'fight') {
        if (data.frames) receiveFrames(data.frames, data.time, true);
        visualizeEvent(data.event);
      }
      break;
    case 'reaction':
      if (isHost() && state.qte?.id === data.id && Number.isInteger(data.stage) &&
        state.qte.cues[data.stage] && Number.isFinite(data.delay)) {
        const expected = state.qte.start+state.qte.cues[data.stage].at+data.delay;
        if (Math.abs(performance.now()-expected) < 420) {
          recordReaction(state.qte,remote,data.stage,data.index,data.delay);
        }
      }
      break;
    case 'resume':
      if (isHost() || state.phase !== 'qte') break;
      state.qte = null;
      state.phase = 'fight';
      snapshots.length = 0;
      receiveFrames(data.frames,data.time,true);
      overlay.hidden = true;
      overlay.setAttribute('aria-live','polite');
      updateControls();
      if (data.winner !== null && data.outcome) showReflexOutcome(data.winner,data.outcome,data.at);
      break;
    case 'finish':
      if (isHost()) break;
      receiveFrames(data.frames, data.time, true);
      state.result = data.result;
      state.scores = data.scores;
      showResult();
      break;
    case 'reset':
      if (isHost()) break;
      state.round = data.round;
      state.scores = data.scores;
      resetRound();
      break;
  }
});

function setMode(mode, player = 0) {
  link.close();
  state.trial = null;
  state.mode = mode;
  state.connected = false;
  state.localPlayer = player;
  state.roomStatus = '';
  resetRound(true);
}

function openDialog(panel, title, body) {
  if (panel !== 'workshop') view?.closeInspection();
  content.dataset.panel = panel;
  content.innerHTML = '<section class="dialog-body"><div class="dialog-head"><h2 id="dialog-title">' + title +
    '</h2><button class="icon-btn" data-action="close" aria-label="Fechar"><i data-icon="close"></i></button></div>' + body + '</section>';
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  if (!dialog.open) dialog.showModal();
  drawIcons(content);
}

dialog.addEventListener('close', () => {
  if (dialog.open) return;
  workPart = null;
  view?.closeInspection();
});

const partLabels = {blade:'Blade',ratchet:'Ratchet',bit:'Bit'};
const partCatalog = {blade:BLADES,ratchet:RATCHETS,bit:BITS};
const partCode = (kind,code) => kind === 'blade' ? BLADES[code].name : code ?? 'Integrado';
const partDetail = (kind,code) => {
  if (kind === 'blade') return BLADES[code].type;
  if (kind === 'bit') return BITS[code].name;
  return code ? RATCHETS[code].mm + ' mm' : 'UX Expand';
};
const partThumb = (kind,code) => {
  if (kind === 'blade') return '<span class="part-thumb"><img src="' + BLADES[code].image + '" alt=""></span>';
  if (!code) return '<span class="part-thumb integrated-thumb"><i data-icon="parts"></i></span>';
  const index = Object.keys(partCatalog[kind]).indexOf(code) + (kind === 'bit' ? Object.keys(RATCHETS).length : 0);
  return '<span class="part-thumb part-render" aria-hidden="true" style="--col:' + index%8 + ';--row:' + Math.floor(index/8) + '"></span>';
};

function partPicker(config,locked) {
  const kinds = Object.keys(partLabels);
  const slots = kinds.map(kind => '<button class="part-slot" data-action="part-kind" data-kind="' + kind +
    '" aria-expanded="' + (workPart === kind) + '" aria-controls="part-picker"' +
    (locked || !config[kind] ? ' disabled' : '') + '>' + partThumb(kind,config[kind]) +
    '<span><small>' + partLabels[kind] + '</small><strong>' + partCode(kind,config[kind]) + '</strong></span></button>').join('');
  let picker = '<div id="part-picker" hidden></div>';
  if (workPart) {
    const card = code => '<button class="part-option" data-action="part-choice" data-code="' + code + '" aria-pressed="' +
      (config[workPart] === code) + '">' + partThumb(workPart,code) + '<strong>' + partCode(workPart,code) +
      '</strong><small>' + partDetail(workPart,code) + '</small></button>';
    const cards = keys => '<div class="part-options">' + keys.map(card).join('') + '</div>';
    const catalog = workPart === 'bit' ? Object.entries(BIT_TYPES).map(([type,label]) =>
      '<section class="part-category"><h4>' + label + '</h4>' +
      cards(Object.keys(BITS).filter(code=>BITS[code].type===type)) + '</section>').join('') :
      cards(Object.keys(partCatalog[workPart]));
    picker = '<div id="part-picker" aria-label="Escolher ' + partLabels[workPart] + '">' + catalog + '</div>';
  }
  return '<div class="builder"><div class="part-slots" aria-label="Peças da montagem">' + slots + '</div>' + picker + '</div>';
}

function selectPart(code) {
  if (!workPart || !canEdit(workPlayer) || !Object.hasOwn(partCatalog[workPart],code)) return;
  const part = workPart;
  const stock = part === 'blade' ? BLADES[code].stock : null;
  const change = stock ? {blade:code,ratchet:stock[0],bit:stock[1]} : {[part]:code};
  state.configs[workPlayer] = sanitizeConfig({...state.configs[workPlayer],...change},workPlayer);
  view?.setLoadouts(state.configs);
  view?.ready(state.configs,activePlayer());
  updateCards(); updateControls(); sendSetup();
  workshop(workPlayer);
  content.querySelector('[data-code="' + code + '"]')?.focus({preventScroll:true});
}

function workshop(i = activePlayer()) {
  workPlayer = state.mode === 'online' ? state.localPlayer : i;
  const config = state.configs[workPlayer];
  const { blade, ratchet, bit, standing, balance, mass } = getParts(config);
  const locked = !canEdit(workPlayer);
  if (locked || workPart === 'ratchet' && blade.integrated) workPart = null;
  const sameWorkshop = dialog.open && content.dataset.panel === 'workshop';
  const pageScroll = sameWorkshop ? dialog.scrollTop : 0;
  const pickerScroll = sameWorkshop ? content.querySelector('#part-picker')?.scrollTop : 0;
  const player = n => '<button class="mode-choice" data-action="work-player" data-player="' + n + '" aria-pressed="' + (n === workPlayer) + '">Jogador ' + (n + 1) + '</button>';
  const stat = (label, value) => '<div><small>' + label + '</small><span class="bar"><b style="width:' + clamp(value,0,100) + '%"></b></span></div>';
  const height = (30 * (standing + BLADE_TOP)).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const weight = (mass*GRAMS_PER_MASS_UNIT).toLocaleString('pt-BR',{maximumFractionDigits:1});
  openDialog('workshop', 'OFICINA', '<div class="player-switch">' + (state.mode === 'online' ? player(state.localPlayer) : player(0) + player(1)) +
    '</div><div class="work-preview"><canvas id="work-model" aria-label="Modelo 3D de ' + blade.name + '"></canvas><div class="work-details"><h3>' + blade.name + '</h3><p>' +
    [config.ratchet,config.bit].filter(Boolean).join(' ') + ' · ' + BIT_TYPES[bit.type] + '</p><dl><dt>Ratchet</dt><dd>' +
    (blade.integrated ? 'Base integrada' : ratchet.mm + ' mm · ' + (ratchet.teeth ? ratchet.teeth + ' saliências' : 'perfil liso')) +
    '</dd><dt>Giro</dt><dd>' + (blade.spinDirection === 1 ? 'Esquerda' : 'Direita') +
    '</dd><dt>Altura total</dt><dd>' + height + ' mm</dd><dt>Massa estimada</dt><dd>' + weight + ' g</dd></dl>' +
    '<div class="work-views"><button class="secondary-btn" data-action="inspect-top">Cima</button>' +
    '<button class="secondary-btn" data-action="inspect-side">Lado</button></div></div></div>' + partPicker(config,locked) +
    '<div class="stat-list">' + stat('Impacto', blade.hit * bit.attack * 62) + stat('Giro', 42 * Math.sqrt(blade.stamina / bit.drain)) +
    stat('Estabilidade', (balance - .50) * 93) + stat('Trilho ' + railRating(bit), railRating(bit)) + '</div>' +
    (blade.trait ? '<p class="blade-trait">' + blade.trait + '</p>' : '') + '<p>' +
    (locked ? 'As peças podem ser trocadas antes de confirmar o próximo lançamento.' : 'Arraste o modelo para inspecionar as peças.') +
    '</p><div class="dialog-actions"><button class="launch-button" data-action="close">VOLTAR À ARENA</button></div>');
  view?.inspectLoadout($('work-model'), config);
  dialog.scrollTop = pageScroll;
  $('part-picker').scrollTop = pickerScroll || 0;
}

function multiplayer() {
  const modeButton = (mode, label) => '<button class="mode-choice" data-action="mode" data-mode="' + mode + '" aria-pressed="' + (state.mode === mode) + '">' + label + '</button>';
  openDialog('multiplayer', 'MULTIJOGADOR', '<div class="mode-choices">' + modeButton('cpu', 'Treino com IA') +
    modeButton('local', 'Duelo local') + modeButton('online', 'Duelo online') + '</div><p>' +
    (state.mode === 'local' ? 'Cada jogador prepara seu lançamento na mesma tela. Nos impactos, J1 usa A/S/D e J2 usa J/K/L.' :
      state.mode === 'cpu' ? 'Teste combinações de peças e lançamentos em uma partida contra a CPU.' : 'Crie uma sala em um navegador e use o código no outro dispositivo.') +
    '</p><label class="reflex-toggle"><input id="reflex" type="checkbox"' + (state.reflex ? ' checked' : '') +
    (state.phase !== 'setup' || !isHost() ? ' disabled' : '') + '> Disputa de reflexo em impactos fortes</label>' +
    (state.mode === 'online' ? '<div class="dialog-actions"><button class="secondary-btn" data-action="host">Criar sala</button>' +
    '<button class="secondary-btn" data-action="copy-room">Copiar código</button></div><label class="field">Código da sala' +
    '<input id="room-code" maxlength="6" placeholder="Ex. X4F9KM" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>' +
    '<div class="dialog-actions"><button class="secondary-btn" data-action="join">Entrar na sala</button></div>' +
    '<p class="dialog-status" id="room-status" role="status"></p>' :
    '<div class="dialog-actions"><button class="launch-button" data-action="close">VOLTAR À ARENA</button>' +
    '<button class="secondary-btn" data-action="stamina-trial">Testar resistência</button>' +
    '<button class="secondary-btn" data-action="attack-trial">Testar ataque</button>' +
    (state.trial ? '<button class="secondary-btn" data-action="normal-trial">Voltar à combinação inicial</button>' : '') + '</div>'));
  if ($('room-code')) $('room-code').value = onlineDraft;
  if ($('room-status')) $('room-status').textContent = state.roomStatus;
}

function help() {
  openDialog('help', 'COMO JOGAR', '<ul><li>Arraste dentro da abertura para posicionar o lançador na sua metade. Ajuste mira, inclinação e força. Use <b>Shift</b> ao arrastar para inclinar com o mouse.</li>' +
    '<li>Pressione Espaço ou <b>Puxar corda</b>. Os dois piões descem pelo vão da tampa. Uma colisão no ar antes de os dois pousarem repete a rodada.</li>' +
    '<li>Arraste para orbitar. Durante o lançamento, use o botão direito ou ative a mão nos controles de câmera. Role, faça pinça ou use + e − para dar zoom. Mova dois dedos juntos ou segure Alt enquanto arrasta para deslocar a câmera.</li>' +
    '<li>Com giro e velocidade, o Bit pode engatar no trilho verde e fazer um <b>Xtreme Dash</b>.</li>' +
    '<li>Use <b>E/R</b> para a habilidade do Bit e o Xtreme Dash, com três usos de cada por rodada. No duelo local, J2 usa <b>I/O</b>. Defesa firma o centro e resistência circula ao redor dele.</li>' +
    '<li>Primeiro a 4 pontos vence. Spin Finish vale 1, Over e Burst Finish valem 2 e o bolso central Xtreme vale 3.</li>' +
    '<li>O pião precisa passar por cima do trilho e cair inteiro no bolso. Se voltar girando, é Reverse e a rodada continua. Empate ou saída fora dos bolsos repete a rodada.</li>' +
    '<li>Durante a preparação, use <b>setas</b> para mover, <b>Q/E</b> para mirar, <b>A/D</b> para inclinar e <b>[ ]</b> para ajustar a força.</li>' +
    '<li>Na disputa de reflexo em câmera lenta, toque ou clique no botão que acender. Também dá para usar <b>A/S/D</b> ou <b>←/↓/→</b>. No duelo local, J2 usa <b>J/K/L</b>. A opção fica em Multijogador.</li></ul>');
}

document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'close') dialog.close();
  else if (action === 'edit' || action === 'work-player') {
    workPart = null;
    workshop(Number(btn.dataset.player));
  } else if (action === 'part-kind') {
    workPart = workPart === btn.dataset.kind ? null : btn.dataset.kind;
    workshop(workPlayer);
    content.querySelector('[data-kind="' + btn.dataset.kind + '"]').focus({preventScroll:true});
    if (workPart) $('part-picker').scrollIntoView({block:'nearest'});
  } else if (action === 'part-choice') selectPart(btn.dataset.code);
  else if (action === 'inspect-top' || action === 'inspect-side') view?.inspectAngle(action === 'inspect-top');
  else if (action === 'multiplayer') multiplayer();
  else if (action === 'help') help();
  else if (['stamina-trial','attack-trial','normal-trial'].includes(action)) {
    if (!available) return;
    const trial = action.split('-')[0];
    state.configs = ({stamina:STAMINA,attack:ATTACK,normal:DEFAULTS}[trial]).map(sanitizeConfig);
    setMode('cpu');
    state.trial = trial === 'normal' ? null : trial;
    state.reflex = trial === 'normal';
    view.setLoadouts(state.configs);
    view.ready(state.configs, 0);
    updateControls();
    dialog.close();
  }
  else if (action === 'mode') {
    if (state.mode !== btn.dataset.mode) setMode(btn.dataset.mode);
    multiplayer();
  } else if ((action === 'host' || action === 'join') && available) {
    const code = action === 'host' ? roomCode() : $('room-code').value.trim().toUpperCase();
    onlineDraft = code;
    setMode('online', action === 'host' ? 0 : 1);
    multiplayer();
    link.open(code, action === 'host');
  } else if (action === 'copy-room') {
    const room = link.code;
    if (!room) { $('room-status').textContent = 'Crie ou entre em uma sala para copiar o código.'; return; }
    try { await navigator.clipboard.writeText(room); $('room-status').textContent = 'Código ' + room + ' copiado.'; }
    catch { $('room-code').value = room; $('room-code').select(); }
  } else if (action === 'reaction') react(Number(btn.dataset.player),Number(btn.dataset.symbol));
  else if (action === 'combat') requestMove(Number(btn.dataset.player),btn.dataset.move);
  else if (action === 'next') nextRound();
  else if (action === 'sound') {
    state.sound = !state.sound;
    btn.setAttribute('aria-pressed', state.sound);
    btn.title = state.sound ? 'Silenciar som' : 'Ativar som';
    btn.setAttribute('aria-label', btn.title);
    btn.querySelector('i').dataset.icon = state.sound ? 'sound' : 'muted';
    drawIcons(btn);
    try { audio.toggle(state.sound); } catch { announce('Áudio indisponível neste navegador.'); }
  } else if (['orbit', 'top', 'follow'].includes(action) && view) {
    state.camera = action; view.setCamera(action);
    for (const mode of ['orbit', 'top', 'follow']) {
      $('camera-' + mode).classList.toggle('selected', mode === action);
      $('camera-' + mode).setAttribute('aria-pressed', mode === action);
    }
    updateControls();
  } else if (action === 'camera-reset') {
    view?.setCamera(state.camera);
  } else if (action === 'zoom-in' || action === 'zoom-out') {
    view?.changeZoom(action === 'zoom-in' ? .81 : 1.24);
  } else if (action === 'camera-drag') {
    state.cameraDrag = !state.cameraDrag;
    updateControls();
  } else if (action === 'fullscreen') {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $('stage').requestFullscreen();
    } catch { announce('Tela cheia indisponível neste navegador.'); }
  }
});

const fullscreen = $('fullscreen');
fullscreen.hidden = !document.fullscreenEnabled;
document.addEventListener('fullscreenchange', () => {
  const active = document.fullscreenElement === $('stage');
  fullscreen.setAttribute('aria-pressed',active);
  fullscreen.title = active ? 'Sair da tela cheia' : 'Tela cheia do navegador';
  fullscreen.setAttribute('aria-label',fullscreen.title);
  fullscreen.querySelector('i').dataset.icon = active ? 'shrink' : 'expand';
  drawIcons(fullscreen);
});

dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
document.addEventListener('change', e => {
  if (e.target.id === 'reflex') {
    state.reflex = e.target.checked;
  }
});
$('heading').addEventListener('input', e => configure({heading:+e.target.value}));
$('angle').addEventListener('input', e => configure({angle:+e.target.value}));
$('power').addEventListener('input', e => {
  configure({power:+e.target.value});
  if (canEdit(activePlayer())) view.setCord(activePlayer(),+e.target.value);
});
$('launch').addEventListener('click', launch);
document.addEventListener('keydown', e => {
  if (dialog.open || e.ctrlKey || e.altKey || e.metaKey) return;
  if (view && !['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) {
    if (e.key === '+' || e.key === '-' || e.key === '0') {
      e.preventDefault();
      if (e.key === '0') view.setCamera(state.camera);
      else view.changeZoom(e.key === '+' ? .88 : 1.14);
      return;
    }
  }
  if (state.phase === 'setup' && canEdit(activePlayer())) {
    if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
    const config = state.configs[activePlayer()];
    const [x,z] = config.point;
    const distance = e.shiftKey ? .46 : .18, degrees = e.shiftKey ? 6 : 2;
    const position = {ArrowLeft:[x-distance,z],ArrowRight:[x+distance,z],ArrowUp:[x,z-distance],ArrowDown:[x,z+distance]}[e.code];
    const adjustment = {KeyQ:{heading:config.heading-degrees},KeyE:{heading:config.heading+degrees},
      KeyA:{angle:config.angle-degrees},KeyD:{angle:config.angle+degrees},
      BracketLeft:{power:config.power-degrees},BracketRight:{power:config.power+degrees}}[e.code];
    if (position || adjustment) {
      e.preventDefault();
      configure(position ? {point:position} : adjustment);
      if (adjustment?.power !== undefined) view.setCord(activePlayer(),state.configs[activePlayer()].power);
      return;
    }
  }
  if (e.repeat || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (state.phase === 'fight') {
    const combat = { KeyE: [0,'special'], KeyR: [0,'dash'], KeyI: [1,'special'], KeyO: [1,'dash'] }[e.code];
    if (combat && (state.mode === 'local' || combat[0] === 0)) {
      e.preventDefault();
      const player = state.mode === 'local' ? combat[0] : state.localPlayer;
      requestMove(player,combat[1] === 'special' ? specialFor(player) : 'dash');
    }
    return;
  }
  if (state.phase === 'qte') {
    const letter = e.code.slice(3);
    const localPlayer = state.mode === 'local' ? Number(qteKeys[1].includes(letter)) : state.localPlayer;
    const arrow = ['ArrowLeft','ArrowDown','ArrowRight'].indexOf(e.code);
    const index = arrow >= 0 ? arrow : qteKeys[state.mode === 'local' ? localPlayer : 0].indexOf(letter);
    if (index >= 0) { e.preventDefault(); react(localPlayer,index); }
  } else if (e.code === 'Space' && e.target.tagName !== 'BUTTON') {
    e.preventDefault();
    if (state.phase === 'setup') launch();
  }
});

function frame(now) {
  const dt = clamp((now - lastTime) / 1000, .001, .05);
  lastTime = now;
  if (state.phase === 'countdown') {
    const n = Math.max(1, Math.ceil((state.deadline - now) / 510));
    if (state.countShown !== n) {
      overlay.innerHTML = '<span class="overlay-label">PREPARE-SE</span><strong>' + n + '</strong>';
      state.countShown = n;
      if (n === 1) state.configs.forEach((config,i)=>view.setCord(i,config.power));
    }
    if (now >= state.deadline && isHost()) startFight();
  }
  if (state.physics && ['fight','qte','result'].includes(state.phase) && isHost()) {
    const phase = state.phase, rate = phase === 'qte' ? QTE_SPEED : 1;
    accumulator += dt*rate;
    while (accumulator >= DT && state.phase === phase) {
      if (accumulator < 2*DT) previousFrames = state.physics.poses();
      state.physics.step(phase !== 'fight');
      accumulator -= DT;
    }
    state.frames = state.physics.frames();
    if (state.phase === 'fight' && state.mode === 'cpu' && !state.trial && (state.physics.time >= state.cpuMoveAt || state.frames[1].moves.reflexBoost === 'ready')) {
      const [rival,cpu] = state.frames;
      const radius = Math.hypot(cpu.p[0],cpu.p[2]);
      const gap = Math.hypot(cpu.p[0]-rival.p[0],cpu.p[2]-rival.p[2]);
      const special = specialFor(1);
      const wantsSpecial = special === 'attack' ? radius > 2.8 && gap > 2.3 && gap < 5.3 : radius > 1.25 || gap < 4;
      const readyBoost = cpu.moves.reflexBoost === 'ready';
      const kind = (wantsSpecial || readyBoost) && cpu.moves.ready.includes(special) ? special : 'dash';
      if (!readyBoost || kind === special) {
        const used = state.physics.tryMove(1,kind);
        state.cpuMoveAt = state.physics.time+(used ? 5.5 : .65);
      }
    }
    if (state.mode === 'online' && now - lastSent > 40) {
      lastSent = now;
      link.send({ type: 'frames', phase:state.phase, frames: state.frames, time: state.physics.time });
    }
  }
  if (state.phase === 'qte') {
    const q = state.qte;
    drawQte(now);
    if (isHost()) {
      const stage = qteCue(q,now);
      if (q.cpu && stage >= 0 && now >= q.start+q.cues[stage].at+q.cpu[stage].delay) {
        const { index,delay } = q.cpu[stage];
        recordReaction(q,1,stage,index,delay);
      }
      const grace = state.mode === 'online' ? 420 : 0;
      if (now >= q.feedbackUntil && (now >= q.close+grace || q.reactions.every(row => row.every(hit => hit !== null)))) resolveQte();
    }
  }
  if (state.frames) {
    const moving = ['fight','qte','result'].includes(state.phase);
    const rate = state.phase === 'qte' ? QTE_SPEED : 1;
    let from = state.frames, to = null, blend = 0, span = 0;
    if (moving && isHost() && previousFrames) {
      from = previousFrames;
      to = state.frames;
      blend = clamp(accumulator / DT, 0, 1);
      span = DT;
    } else if (moving && snapshots.length > 1) {
      const target = newestSnapshot.time+(now/1000-newestSnapshot.arrival-.080)*rate;
      while (snapshots.length > 2 && snapshots[1].time <= target) snapshots.shift();
      from = snapshots[0].frames;
      to = snapshots[1].frames;
      span = snapshots[1].time - snapshots[0].time;
      blend = span > 0 ? clamp((target - snapshots[0].time) / span, 0, 1) : 1;
    }
    view.showFrames(from,to,blend,span,moving,(now-(state.burstAt??now))/1000,dt*rate);
  }
  if (now - lastHud > 75) {
    updateStamina();
    updateCombatControls();
    audio.update(state.frames,state.phase === 'qte' ? QTE_SPEED : 1);
    lastHud = now;
  }
  view.draw(dt,state.phase === 'qte' ? QTE_SPEED : 1);
  requestAnimationFrame(frame);
}

drawIcons();
updateCards(); updateScore(); updateControls();
try {
  await Promise.all([initPhysics(), document.fonts.load('800 italic 24px Barlow').catch(() => {})]);
  view = new ArenaView($('world'), {
    active: () => canEdit(activePlayer()) && !state.cameraDrag ? {config:state.configs[activePlayer()],player:activePlayer()} : null,
    change: partial => configure(partial,false),
    commit: sendSetup,
  });
  view.setLoadouts(state.configs);
  view.ready(state.configs, 0);
  available = true;
  updateControls();
  requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  $('webgl-error').hidden = false;
} finally {
  $('loading').hidden = true;
}
