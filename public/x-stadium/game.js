import { ArenaView } from './scene.js';
import { Battle, DT, initPhysics } from './physics.js';
import { ATTACK, BIT_TYPES, BITS, BLADE_TOP, BLADES, DEFAULTS, GRAMS_PER_MASS_UNIT, MAX_LAUNCH_ANGLE, MOVE_USES, RATCHETS, STAMINA, getParts, railRating, sanitizeConfig, specialMove } from './rules.js';
import { clamp } from './stadium.js';
import { Link, roomCode } from './online.js';
import { ArenaAudio } from './audio.js';
import { StadiumLobby } from './lobby.js';
import { Matchmaking } from './matchmaking.js';
import { StadiumPreparation } from './preparation.js';
import { loadoutStats, validateLineup } from './deck.js';
import { BattlePlayback } from './playback.js';
import { avatarMarkup } from './account.js';

const $ = id => document.getElementById(id);
const icons = {
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  camera:'<path d="M3 7h5l2-3h4l2 3h5v13H3z"/><circle cx="12" cy="13" r="3.5"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
  strike:'<path d="m3 17 8-7-2 6 11-12-3 10-9 7 3-6zM3 11l3-3m9 11 4-2"/>',
  guard:'<path d="M12 2 4 6v6c0 4 3 7 8 10 5-3 8-6 8-10V6zM8 15V9l4-2 4 2v6m-4-8v10"/>',
  circulation:'<path d="M21 9a9 9 0 0 0-15-4L3 8m0-5v5h5m-5 7a9 9 0 0 0 15 4l3-3m0 5v-5h-5"/><circle cx="12" cy="12" r="3"/>',
  dash:'<path d="m6 19 3-6H6l8-10-2 7h4L6 19zM13 21l8-11m-4 11 5-7"/>',
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
  move:'<path d="M12 3v18M3 12h18M9 6l3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3"/>',
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
const stage = $('stage');
let inLobby = true, demo = null, demoTime = 0, demoNext = 0;
let roster = null, difficulty = 'normal', publicMatch = false;
let opponentProfiles = null, prepTimer, opponentOrdered = false;
let seat = 0, parityChooser = 0, diceOutcome = null, arenaChosen = false;
let matchNumber = 1, requestedRematch = false, offeredRematch = false;
const cpuDeck = [{blade:'aero',ratchet:'3-70',bit:'A'},{blade:'silver',ratchet:'3-80',bit:'FB'},{blade:'knight',ratchet:'4-60',bit:'H'}];
const cpuReflex = {
  easy: {miss:.32,error:.58,min:315,spread:140},
  normal: {miss:.12,error:.28,min:280,spread:155},
  hard: {miss:.025,error:.10,min:190,spread:130},
};
const escapeAttribute = value => value.replace(/[&"<>]/g,char=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'})[char]);
function safeImage(kind,code,fallback='') {
  return escapeAttribute(lobby.picture(kind,code) || fallback);
}
let view, available = false, workPlayer = 0, accumulator = 0, flashTimer, lastTime = performance.now(), lastSent = 0, lastHud = 0;
let timingPlayer = null, meterStart = 0, meterPower = 45;
let workPart = null;
const audio = new ArenaAudio();
let wantsSound = true;
try { wantsSound = localStorage.getItem('x-stadium-sound') !== 'muted'; } catch { /* Session preference. */ }
const graphics = $('graphics');
try {
  const saved = localStorage.getItem('x-stadium-graphics');
  if ([...graphics.options].some(option => option.value === saved)) graphics.value = saved;
} catch { /* O navegador pode bloquear armazenamento local. */ }
graphics.addEventListener('change', () => {
  view?.setGraphics(graphics.value);
  try { localStorage.setItem('x-stadium-graphics', graphics.value); } catch { /* Preferência da sessão. */ }
});
let previousFrames = null, previousStep = 0, settledFrames = null, lastSentStep = -1;
const playback = new BattlePlayback();
let onlineDraft = '';
const dialog = $('dialog'), content = $('dialog-content'), overlay = $('battle-overlay');
const phases = { intro:'DUELO ONLINE', dice:'PAR OU ÍMPAR', side:'LADO DA ARENA', order:'ORDEM DO DECK', reveal:'CONFRONTO', setup: 'PREPARAÇÃO', countdown: 'LANÇAMENTO', fight: 'EM BATALHA', qte: 'IMPACTO', result: 'RESULTADO' };
const QTE_SPEED = .012;
const PHYSICS_FRAME_BUDGET = 8;
const METER_RISE_MS = 1700;
const METER_PEAK_MS = 150;

const isHost = () => state.mode !== 'online' || (publicMatch ? seat : state.localPlayer) === 0;
const activePlayer = () => state.mode === 'local' ? state.turn : state.localPlayer;
const cpuPlayer = () => 1-state.localPlayer;
const playerName = i => state.mode==='cpu' && i===cpuPlayer() ? 'CPU' : opponentProfiles?.[i]?.name || 'Jogador '+(i+1);
const canEdit = i => !inLobby && state.phase === 'setup' && !state.ready[i] && (state.mode !== 'online' || i === state.localPlayer);
const canEditParts = i => canEdit(i) && !roster;
const launchButton = $('launch'), launcherControls = $('launcher-controls'), aimGrip = $('launcher-aim-grip');
const positionGrip = $('launcher-position-grip'), angleDial = $('launch-angle');
const meterTrack = $('launch-power-track'), powerValue = $('power-value');
const controls = $('combat-controls');
const moves = {
  attack: { name: 'Xtreme Attack', icon: 'strike', text: ' avançou para o ataque.' },
  defense: { name: 'Full Defense', icon: 'guard', text: ' firmou posição no centro.' },
  circle: { name: 'Full Circle', icon: 'circulation', text: ' entrou em órbita no centro.' },
  dash: { name: 'Xtreme Dash', icon: 'dash', text: ' acelerou em direção ao trilho.' },
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
    sendOnline({type:'move',kind,round:state.round});
    const data = state.frames[player].moves;
    data.ready = data.ready.filter(move => move !== kind);
  }
  updateCombatControls();
}

function updateScore() {
  state.scores.forEach((score, i) => {
    $('score' + (i + 1)).textContent = score;
    $('pips' + (i + 1)).innerHTML = Array.from({ length: 4 }, (_, p) => '<span' + (p < score ? ' class="won"' : '') + '></span>').join('');
    $('player'+(i+1)+'-label').textContent = playerName(i);
    const profile = opponentProfiles?.[i];
    const avatar = $('player'+(i+1)+'-avatar');
    const markup = profile ? avatarMarkup(profile) : '';
    avatar.hidden = !profile;
    if (avatar.dataset.markup!==markup) {
      avatar.dataset.markup = markup;
      avatar.innerHTML = markup;
      avatar.querySelector('img')?.addEventListener('error',event=>{event.target.hidden = true;},{once:true});
    }
  });
  $('round-label').textContent = 'RODADA ' + state.round;
}

function updateCards() {
  state.configs.forEach((config, i) => {
    const b = BLADES[config.blade];
    const combo = [config.ratchet ?? 'Base integrada',BITS[config.bit].name+' ('+config.bit+')'].join(' · ');
    $('bey' + (i + 1)).innerHTML =
      '<div class="bey-image"><img src="' + safeImage('blade',config.blade,b.image) + '" alt=""></div><div class="bey-info"><h3>' + b.name + '</h3><p class="bey-combo">' + combo + '</p></div>' +
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

function showLaunchPower(power) {
  meterPower = power;
  meterTrack.style.setProperty('--power',(power-45)/55);
  meterTrack.setAttribute('aria-valuenow',power);
  powerValue.textContent = power + '%';
}

function updateLaunchMeter(now) {
  if (timingPlayer === null || dialog.open) return;
  const progress = Math.min(1,((now-meterStart) % (METER_RISE_MS+METER_PEAK_MS))/METER_RISE_MS);
  const power = Math.round(45+55*Math.max(0,progress));
  if (power !== meterPower) showLaunchPower(power);
}

function updateControls() {
  const local = activePlayer(), config = state.configs[local];
  const editing = canEdit(local);
  const settingUp = state.phase === 'setup';
  const angle = Math.round(config.angle);
  $('angle-value').textContent = angle + '°';
  angleDial.setAttribute('aria-valuenow',angle);
  angleDial.setAttribute('aria-valuetext',angle + ' graus');
  angleDial.style.setProperty('--needle',angle/MAX_LAUNCH_ANGLE*65+'deg');
  const launchReady = available && editing && (state.mode !== 'online' || state.connected);
  const player = launchReady ? local : null;
  if (player !== timingPlayer) {
    timingPlayer = player;
    meterStart = performance.now();
    showLaunchPower(45);
  }
  const gripsVisible = available && editing && !state.cameraDrag;
  for (const element of [launcherControls,positionGrip,aimGrip]) {
    element.classList.toggle('p1',local === 0);
    element.classList.toggle('p2',local === 1);
    element.hidden = !gripsVisible;
  }
  const status = $('launch-status');
  status.hidden = inLobby || !available || !settingUp || (!state.cameraDrag && launchReady);
  status.textContent = !editing ? 'Aguardando o adversário' :
    state.cameraDrag ? 'Ajustando a câmera' : 'Aguardando sala';
  $('camera-drag').hidden = !settingUp;
  $('camera-drag').setAttribute('aria-pressed',state.cameraDrag);
  const trainingLabel = {stamina:'TESTE DE RESISTÊNCIA',attack:'TESTE DE ATAQUE'}[state.trial] || 'TREINO COM IA';
  $('mode-name').textContent = {cpu:trainingLabel,local:'DUELO LOCAL',online:state.connected?'DUELO ONLINE':'SALA ONLINE'}[state.mode];
  const modeIcon = $('mode-name').previousElementSibling;
  const nextIcon = state.mode === 'cpu' ? 'cpu' : 'users';
  if (modeIcon.dataset.icon !== nextIcon) {
    modeIcon.dataset.icon = nextIcon;
    drawIcons(modeIcon.parentElement);
  }
  $('stage-state').textContent = phases[state.phase];
  stage.dataset.phase = inLobby ? 'demo' : state.phase;
  $('stage').dataset.gesture = editing && !state.cameraDrag ? 'launch' : 'camera';
  launchButton.disabled = !launchReady || state.cameraDrag;
  $('launch-label').textContent = state.mode==='online' ? 'Ready Up' : 'Let it rip';
  if (gripsVisible) view?.positionLauncherControls();
  document.querySelectorAll('.bey-edit').forEach((el, i) => {
    el.hidden = !canEditParts(i);
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
  clearTimeout(prepTimer);
  view?.clearSideChoice();
  preparation.clear();
  opponentOrdered = false;
  requestedRematch = offeredRematch = false;
  state.physics?.dispose();
  state.physics = null;
  state.phase = 'setup';
  state.frames = state.result = state.qte = null;
  previousFrames = null;
  previousStep = 0;
  settledFrames = null;
  playback.clear();
  lastSentStep = -1;
  state.ready = [false, false];
  state.cameraDrag = false;
  state.turn = 0;
  accumulator = 0;
  if (newMatch) { state.round = 1; state.scores = [0, 0]; }
  if (roster) {
    for (const [i,deck] of roster.entries()) {
      if (deck) state.configs[i] = sanitizeConfig({...DEFAULTS[i], ...deck[(state.round-1)%deck.length], point:DEFAULTS[i].point},i);
    }
    view?.setLoadouts(state.configs);
  }
  $('callout').hidden = true;
  overlay.hidden = true;
  overlay.setAttribute('aria-live','polite');
  updateScore();
  updateCards();
  updateControls();
  view?.setResultWinner(null);
  view?.ready(state.configs, activePlayer());
  announce('Arena pronta para o lançamento.');
}

function enterLaunchSetup() {
  preparation.clear();
  state.phase = 'setup';
  updateControls();
  view.ready(state.configs,activePlayer(),canEdit(activePlayer()));
  sendSetup();
  if (state.mode==='online' && isHost() && state.ready.every(Boolean)) countdown();
}

function showFaceoff() {
  state.phase = 'reveal';
  updateControls();
  preparation.reveal(state.configs);
  prepTimer = setTimeout(enterLaunchSetup,950);
}

function drawParity() {
  state.phase = 'dice';
  updateControls();
  const names = opponentProfiles ?? [{name:lobby.profile.name},{name:'CPU'}];
  if (diceOutcome) { showDiceRoll(); return; }
  preparation.parity(names[parityChooser].name,parityChooser===seat ? chooseParity : null);
  if (!publicMatch && parityChooser!==seat) prepTimer = setTimeout(()=>chooseParity(Math.random()<.5?'even':'odd'),800);
}

function chooseParity(parity) {
  if (publicMatch) sendOnline({type:'parity',parity});
  else {
    const value = 1+Math.floor(Math.random()*6);
    const winner = (value%2===0)===(parity==='even') ? parityChooser : 1-parityChooser;
    diceOutcome = {value,parity,winner};
    showDiceRoll();
  }
}

function showDiceRoll() {
  const {value,parity,winner} = diceOutcome;
  const names = opponentProfiles ?? [{name:lobby.profile.name},{name:'CPU'}];
  preparation.roll(value,parity,names[parityChooser].name,names[winner].name);
  prepTimer = setTimeout(()=>{
    state.phase = 'side';
    updateControls();
    view.showSideChoice(preparation.sides(names[winner].name,winner===seat ? pickArenaSide : null));
    if (!publicMatch && winner!==seat) prepTimer = setTimeout(()=>pickArenaSide(Math.random()<.5?'B':'X'),720);
  },1050);
}

function pickArenaSide(side) {
  preparation.markSide(side);
  view.updateSideHighlight();
  prepTimer = setTimeout(()=>{
    if (publicMatch) sendOnline({type:'arena-side',side});
    else {
      const left = side==='B' ? diceOutcome.winner : 1-diceOutcome.winner;
      applyArenaSides([left,1-left]);
    }
  },280);
}

function applyArenaSides(placement) {
  if (arenaChosen) return;
  arenaChosen = true;
  roster = placement.map(player=>roster[player]);
  if (opponentProfiles) opponentProfiles = placement.map(player=>opponentProfiles[player]);
  state.localPlayer = placement.indexOf(seat);
  resetRound();
  const trio = roster[state.localPlayer].length===3;
  if (trio) chooseLineup(false);
  else if (publicMatch) {
    state.phase = 'side';
    updateControls();
    preparation.sides(playerName(state.localPlayer),null,true);
    sendSetup();
  } else enterLaunchSetup();
}

function chooseLineup(reorder) {
  state.phase = 'order';
  updateControls();
  const local = state.localPlayer;
  preparation.order(roster[local],reorder,publicMatch,beys=>{
    if (publicMatch) sendOnline({type:'lineup',round:state.round,beys});
    else {
      roster[local] = beys;
      const cpu = cpuPlayer();
      const offset = 1+Math.floor(Math.random()*2);
      roster[cpu] = [...roster[cpu].slice(offset),...roster[cpu].slice(0,offset)];
      resetRound();
      enterLaunchSetup();
    }
  });
  if (opponentOrdered) preparation.readyOpponent();
}

function nextPreparation(chooseOrder) {
  if (chooseOrder) chooseLineup(state.round>1);
  else if (publicMatch && roster[0] && roster[1]) showFaceoff();
  else enterLaunchSetup();
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
    sendOnline({ type: 'setup', config: state.configs[state.localPlayer], ready: state.ready[state.localPlayer], round:state.round });
  }
}

function launch() {
  if (launchButton.disabled) return;
  const i = activePlayer();
  state.configs[i] = { ...state.configs[i], power:meterPower };
  state.ready[i] = true;
  if (state.mode === 'local' && i === 0) {
    state.turn = 1;
    view.ready(state.configs, 1);
    updateControls();
    announce('Jogador 2, escolha seu lançamento.');
    return;
  }
  if (state.mode === 'cpu') {
    const cpu = cpuPlayer();
    const options = state.round === 1 || state.trial ? {} : {
      angle: Math.round(Math.random() * 35 - 17),
      heading: Math.round(Math.random() * 155 - 78),
      point: [(cpu===0?-1:1)*(2.4+Math.random()*1.4), Math.random() * 3 - 1.5],
      power: Math.round(81 + Math.random() * 16),
    };
    state.configs[cpu] = sanitizeConfig({ ...state.configs[cpu], ...options }, cpu);
    state.ready[cpu] = true;
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
  if (!remote && state.mode === 'online') sendOnline({ type: 'countdown', configs: state.configs });
  view.ready(state.configs, activePlayer(),false);
}

function startFight(remote = false) {
  state.phase = 'fight';
  if (!remote) {
    state.physics = new Battle(state.configs, handleBattleEvent, { reflex: state.reflex });
    previousFrames = state.frames = state.physics.frames();
    if (state.mode === 'online') sendOnline({ type: 'start', frames: state.frames, time: state.physics.time });
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
  closeToolMenus();
  state.phase = 'qte';
  const start = performance.now();
  const cues = event.cues.map(({at,target}) => ({at,target}));
  const players = state.mode === 'local' ? [0,1] : [state.localPlayer];
  state.qte = { ...event, start, cues, close: start+cues.at(-1).at+qteWindow,
    reactions: cues.map(() => [null,null]), shown: null, feedbackUntil:start };
  if (state.mode === 'cpu') {
    const level = cpuReflex[difficulty];
    state.qte.cpu = cues.map(({target}) => {
      const accuracy = Math.random();
      if (accuracy < level.miss) return null;
      return {
        index: accuracy < level.error ? (target+(Math.random() < .5 ? 1 : 2))%3 : target,
        delay: level.min+Math.random()*level.spread,
      };
    });
  }
  overlay.setAttribute('aria-live','off');
  const threatLabel = {pocket:'Risco de cair no bolso',wall:'Risco de bater na parede',knockback:'Recuo forte'}[event.threat];
  overlay.innerHTML = '<div class="qte-panel"><h2>Disputa de reflexo</h2><p>' + (threatLabel ? threatLabel + ' · ' : '') + 'Aperte o botão aceso.</p>' +
    '<div class="qte-duel" aria-label="Pontuação da disputa"><span>'+(state.mode==='cpu' && cpuPlayer()===0?'CPU':'J1')+' <b>0</b></span><span><b>0</b> ' + (state.mode==='cpu' && cpuPlayer()===1?'CPU':'J2') + '</span></div>' +
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
  state.qte.duel = overlay.querySelector('.qte-duel');
  state.qte.scoreLabels = state.qte.duel.querySelectorAll('b');
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

function reflexScores(q, now) {
  const scores = [0,0];
  q.cues.forEach(({at}, stage) => {
    q.reactions[stage].forEach((hit, player) => {
      if (hit?.correct) scores[player] += 100 + Math.round(50*(1-hit.delay/qteWindow));
      else if (hit || now >= q.start+at+qteWindow) scores[player] -= 45;
    });
  });
  return scores;
}

function react(player,index) {
  const q = state.qte, now = performance.now();
  if (state.phase !== 'qte') return;
  const stage = qteCue(q,now);
  if (stage < 0) return;
  const delay = now-q.start-q.cues[stage].at;
  if (recordReaction(q,player,stage,index,delay) && state.mode === 'online') {
    sendOnline({type:isHost() ? 'reaction-ack' : 'reaction',id:q.id,stage,index,delay});
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
  const scores = reflexScores(q, now);
  const signature = [stage,latest,...scores,...feedback.map(hit=>hit?.index ?? '-'),...q.reactions.flat().map(hit=>hit?.index ?? '-')].join('/');
  if (signature !== q.shown) {
    q.shown = signature;
    const share = clamp(.5+(scores[0]-scores[1])/(q.cues.length*390),.06,.94);
    q.duel.style.setProperty('--lead', (share*100)+'%');
    q.scoreLabels.forEach((label,i) => { label.textContent = scores[i]; });
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
  const [a,b] = reflexScores(q,q.close);
  const winner = a === b ? null : a > b ? 0 : 1;
  let outcome = null;
  state.qte = null;
  state.phase = 'fight';
  previousFrames = state.frames;
  accumulator = 0;
  overlay.hidden = true;
  overlay.setAttribute('aria-live','polite');
  updateControls();
  if (winner !== null) {
    const margin = Math.abs(a-b)/(q.cues.length*195);
    outcome = state.physics.counter(winner,q,margin);
  } else announce('Batalha retomada.');
  previousFrames = state.frames = state.physics.frames();
  if (outcome) showReflexOutcome(winner,outcome,q.at);
  else flash('REFLEXOS EMPATADOS');
  if (state.mode === 'online') sendOnline({type:'resume',winner,outcome,at:q.at,frames:state.frames,time:state.physics.time});
}

function showReflexOutcome(winner,outcome,at) {
  const action = outcome.defended ? 'DEFESA' : 'ATAQUE';
  const label = action + ' J' + (winner+1);
  const special = state.frames?.[winner]?.moves;
  const boosted = special?.reflexBoost === 'ready' && special[specialFor(winner)] > 0;
  const name = state.mode === 'cpu' && winner === cpuPlayer() ? 'CPU' : 'J'+(winner+1);
  flash(name + ' VENCEU' + (boosted ? ' · ESPECIAL +' : ''));
  const duration = outcome.boostDuration ?? (outcome.defended ? 1.5 : 2.5);
  announce(boosted ? label + '. Use a habilidade reforçada em até ' + duration.toLocaleString('pt-BR') + ' segundos.' : label + '!');
  view.spark(at,outcome.heavy ? 1.65 : .85);
}

function handleBattleEvent(event) {
  if (event.type === 'finish') {
    state.frames = state.physics.frames();
    state.result = event;
    if (event.winner !== null) state.scores[event.winner] += event.points;
    showResult();
    if (state.mode === 'online') sendOnline({type:'finish',match:matchNumber,result:event,scores:state.scores,frames:state.frames,time:state.physics.time});
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
    sendOnline({ type: 'effect', event, frames: event.qte ? state.physics.frames() : undefined, time: state.physics.time });
  }
}

const finiteVector = (values,length) => Array.isArray(values) && values.length === length && values.every(Number.isFinite);

function receiveFrames(frames, time, exact = false) {
  if (!Array.isArray(frames) || frames.length !== 2 || !frames.every(frame=>frame &&
    finiteVector(frame.p,3) && finiteVector(frame.q,4) && finiteVector(frame.w,3) && finiteVector(frame.v,3))) return false;
  const now = performance.now()/1000;
  if (playback.push(frames,Number.isFinite(time)?time:now,now,exact)) state.frames = frames;
  return true;
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
    flash(event.spinLoss ? 'REVERSE · −' + event.spinLoss + '% GIRO' : 'REVERSE');
    announce(BLADES[state.configs[event.player].blade].name +
      (event.spinLoss ? ' voltou do bolso e perdeu ' + event.spinLoss + '% do giro restante.' : ' voltou à arena ainda girando.'));
  }
}

const matchFinished = () => state.phase==='result' && state.scores.some(score=>score>=4);

function showResult() {
  state.phase = 'result';
  state.burstAt = performance.now();
  state.qte = null;
  clearTimeout(flashTimer);
  $('callout').hidden = true;
  overlay.setAttribute('aria-live','polite');
  const r = state.result;
  const finishTitle = escapeAttribute(r.title);
  const winner = r.winner === null ? null : playerName(r.winner);
  const match = matchFinished();
  const bey = winner ? BLADES[state.configs[r.winner].blade].name : '';
  const points = '+' + r.points + (r.points === 1 ? ' ponto' : ' pontos');
  const label = winner ? winner + ' · ' + bey + ' · ' + points : 'A rodada será repetida.';
  const rematch = match && state.mode!=='local';
  const nextLabel = match ? 'NOVA PARTIDA' : !isHost() ? 'AGUARDANDO ANFITRIÃO' :
    r.winner!==null && roster?.[state.localPlayer]?.length===3 && state.round%3===0 ? 'ESCOLHER NOVA ORDEM' : 'PRÓXIMA RODADA';
  const next = rematch ?
    '<button class="launch-button" type="button" data-action="rematch"><i data-icon="reset"></i><span>Revanche</span></button>'+
    '<button class="secondary-btn" type="button" data-action="stadium-home">Voltar ao menu</button>'+
    '<p class="rematch-status" role="status" hidden></p>' :
    '<button class="launch-button" type="button" data-action="next"'+(isHost()?'':' disabled')+'>'+nextLabel+'</button>';
  view.setResultWinner(r.winner);
  overlay.classList.toggle('winner-result', Boolean(winner));
  overlay.innerHTML = winner ?
    '<div class="winner-banner"><span class="overlay-label">' + escapeAttribute(winner) + ' · ' + finishTitle + '</span><strong>Vitória' +
      (match ? ' na partida' : '') + '</strong><div class="winner-score"><span>' + bey + '</span><b>' + points + '</b></div></div>' +
      '<div class="winner-actions"><span class="winner-total" aria-label="Placar da partida">' + state.scores.join(' – ') + '</span>' + next + '</div>' :
    '<span class="overlay-label">FIM DA RODADA</span><strong>' + escapeAttribute(r.title.toUpperCase()) + '</strong><p>' + label + '</p>' + next;
  overlay.hidden = false;
  if (rematch) {
    drawIcons(overlay);
    updateRematchControls();
  }
  updateScore(); updateControls(); updateStamina();
  audio.play('finish');
  announce(r.title + ' · ' + label);
}

function updateRematchControls() {
  const button = overlay.querySelector('[data-action="rematch"]');
  if (!button || state.mode!=='online') return;
  const status = overlay.querySelector('.rematch-status');
  button.disabled = !state.connected || requestedRematch;
  button.querySelector('span').textContent = offeredRematch && !requestedRematch ? 'Aceitar revanche' : 'Revanche';
  status.textContent = !state.connected ? 'O adversário saiu da partida.' :
    requestedRematch ? 'Aguardando o adversário' : offeredRematch ? 'Seu adversário pediu revanche' : '';
  status.hidden = !status.textContent;
}

function requestRematch() {
  if (!matchFinished()) return;
  if (state.mode==='cpu') {
    restartMatch(matchNumber+1);
    return;
  }
  if (state.mode!=='online' || !state.connected || requestedRematch) return;
  requestedRematch = true;
  updateRematchControls();
  sendOnline({type:'rematch',match:matchNumber});
  confirmDirectRematch();
}

function confirmDirectRematch() {
  if (publicMatch || !isHost() || !requestedRematch || !offeredRematch) return;
  const nextMatch = matchNumber+1;
  sendOnline({type:'rematch-start',match:nextMatch});
  restartMatch(nextMatch);
}

function restartMatch(number,chooser) {
  matchNumber = number;
  if (roster) {
    const swap = seat!==state.localPlayer;
    const decks = swap ? [roster[1],roster[0]] : roster;
    const profiles = swap && opponentProfiles ? [opponentProfiles[1],opponentProfiles[0]] : opponentProfiles;
    prepareMatch(decks,profiles,chooser);
  } else {
    resetRound(true);
    enterLaunchSetup();
  }
}

function nextRound() {
  if (state.phase!=='result' || !isHost()) return;
  const newMatch = matchFinished();
  if (newMatch && state.mode!=='local') return;
  const advances = !newMatch && state.result.winner !== null;
  if (advances) state.round++;
  resetRound(newMatch);
  if (state.mode === 'online') {
    sendOnline({ type: 'reset', round: state.round, scores: state.scores });
  }
  const chooseOrder = roster?.[state.localPlayer]?.length===3 && (newMatch || advances && (state.round-1)%3===0);
  nextPreparation(chooseOrder);
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
    announce(message);
    if (matchFinished()) updateRematchControls();
    else {
      resetRound(true);
      if (!dialog.open || content.dataset.panel === 'multiplayer') multiplayer();
    }
  }
  if ($('room-status')) $('room-status').textContent = message;
}, receiveOnline);

function receiveOnline(data) {
  if (state.mode !== 'online') return;
  const remote = 1 - state.localPlayer;
  switch (data.type) {
    case 'rematch':
    case 'rematch-request':
      if (data.type===(publicMatch?'rematch-request':'rematch') && matchFinished() && data.match===matchNumber) {
        offeredRematch = true;
        updateRematchControls();
        confirmDirectRematch();
      }
      break;
    case 'rematch-start':
      if (matchFinished() && requestedRematch && data.match===matchNumber+1 &&
        (publicMatch ? [0,1].includes(data.chooser) : !isHost() && offeredRematch)) restartMatch(data.match,data.chooser);
      break;
    case 'dice-roll':
      if (!publicMatch || diceOutcome || ![0,1].includes(data.winner) || !['even','odd'].includes(data.parity) ||
        !Number.isInteger(data.value) || data.value<1 || data.value>6) break;
      diceOutcome = data;
      if (state.phase==='dice') showDiceRoll();
      break;
    case 'arena-side':
      if (publicMatch && Array.isArray(data.placement) && data.placement.length===2 &&
        data.placement.includes(0) && data.placement.includes(1)) applyArenaSides(data.placement);
      break;
    case 'lineup-ready':
      if (publicMatch && data.round===state.round) {
        opponentOrdered = true;
        preparation.readyOpponent();
      }
      break;
    case 'lineup': {
      if (!publicMatch || state.phase!=='order' || data.round!==state.round || !Array.isArray(data.lineups) || data.lineups.length!==2) break;
      const lineups = data.lineups.map(validateLineup);
      if (!lineups.every(Boolean)) break;
      roster = lineups;
      resetRound();
      showFaceoff();
      break;
    }
    case 'setup':
      if (!['setup','side','reveal'].includes(state.phase) || data.round !== undefined && data.round !== state.round) break;
      const expected = roster?.[remote]?.length===3 ? roster[remote][(state.round-1)%3] : null;
      state.configs[remote] = sanitizeConfig(expected ? {...data.config,blade:expected.blade,ratchet:expected.ratchet,bit:expected.bit} : data.config, remote);
      state.ready[remote] = !!data.ready;
      if (state.phase==='side' && arenaChosen && roster?.[state.localPlayer]?.length===1) {
        roster[remote] = [state.configs[remote]];
        showFaceoff();
      }
      view.setLoadouts(state.configs);
      view.ready(state.configs,activePlayer(),canEdit(activePlayer()));
      updateCards(); updateControls();
      if (state.phase==='setup' && isHost() && state.ready.every(Boolean)) countdown();
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
      if (!receiveFrames(data.frames,data.time,true)) break;
      startFight(true);
      break;
    case 'frames':
      if (!isHost() && (data.round===undefined || data.round===state.round) && state.phase===data.phase &&
        ['fight','qte','result'].includes(state.phase)) receiveFrames(data.frames,data.time);
      break;
    case 'move':
      if (isHost() && state.phase === 'fight' && state.round === data.round) state.physics.tryMove(remote,data.kind);
      break;
    case 'effect':
      if (!isHost() && state.phase === 'fight' && data.event) {
        const event = data.event;
        if (['dash','move','reverse'].includes(event.type) && ![0,1].includes(event.player)) break;
        if (event.type === 'move' && !Object.hasOwn(moves,event.kind)) break;
        if (['dash','spin-reward','rail-exit','scrape','hit'].includes(event.type) && !finiteVector(event.at,3)) break;
        if (['scrape','hit'].includes(event.type) && (!Number.isFinite(event.strength) || event.strength < 0)) break;
        if (event.qte && (!Array.isArray(event.cues) || !event.cues.length || event.cues.length > 3 ||
          !event.cues.every(cue=>cue && Number.isFinite(cue.at) && cue.at >= 0 && cue.at < 3000 && [0,1,2].includes(cue.target)))) break;
        if (data.frames && !receiveFrames(data.frames,data.time,true)) break;
        visualizeEvent(event);
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
    case 'reaction-ack':
      if (!isHost() && state.qte?.id === data.id) recordReaction(state.qte,remote,data.stage,data.index,data.delay);
      break;
    case 'resume':
      if (isHost() || state.phase !== 'qte') break;
      if (!receiveFrames(data.frames,data.time,true)) break;
      state.qte = null;
      state.phase = 'fight';
      overlay.hidden = true;
      overlay.setAttribute('aria-live','polite');
      updateControls();
      if ([0,1].includes(data.winner) && data.outcome && finiteVector(data.at,3)) {
        showReflexOutcome(data.winner,data.outcome,data.at);
      }
      else flash('REFLEXOS EMPATADOS');
      break;
    case 'finish':
      if (isHost() || !data.result || ![null,0,1].includes(data.result.winner) ||
        ![0,1,2,3].includes(data.result.points) || typeof data.result.title !== 'string' ||
        !Array.isArray(data.scores) || data.scores.length !== 2 || !data.scores.every(Number.isFinite) ||
        !receiveFrames(data.frames,data.time,true)) break;
      state.result = data.result;
      state.scores = data.scores;
      showResult();
      break;
    case 'reset':
      if (isHost() || !Number.isInteger(data.round) || data.round < 1 ||
        !Array.isArray(data.scores) || data.scores.length !== 2 || !data.scores.every(Number.isFinite)) break;
      const advances = state.round!==data.round;
      state.round = data.round;
      state.scores = data.scores;
      resetRound();
      nextPreparation(publicMatch && roster?.[state.localPlayer]?.length===3 && advances && (state.round-1)%3===0);
      break;
  }
}

function sendOnline(message) {
  if (publicMatch) matchmaking.send(message);
  else link.send(message);
}

function setMode(mode, player = 0) {
  link.close();
  roster = null;
  publicMatch = false;
  opponentProfiles = null;
  arenaChosen = false;
  matchNumber = 1;
  if (view) view.setCamera(state.camera);
  state.trial = null;
  state.mode = mode;
  state.connected = false;
  state.localPlayer = player;
  state.roomStatus = '';
  resetRound(true);
}

function leaveDemo() {
  inLobby = false;
  stage.dataset.lobby = 'false';
  demo?.dispose();
  demo = null;
}

function openLobby() {
  dialog.close();
  matchmaking.close();
  link.close();
  lobby.queue = null;
  publicMatch = false;
  roster = null;
  inLobby = true;
  stage.dataset.lobby = 'true';
  state.configs = DEFAULTS.map(sanitizeConfig);
  setMode('cpu');
  audio.update(null,1);
  lobby.show('home');
  demoNext = 0;
}

function startLobbyMatch(mode,format,beys,level='normal',side=0,profiles=null,chooser=0) {
  leaveDemo();
  closeToolMenus();
  if (dialog.open) dialog.close();
  link.close();
  state.mode = mode;
  state.localPlayer = side;
  state.connected = mode === 'online';
  state.trial = null;
  state.reflex = true;
  difficulty = level;
  publicMatch = mode === 'online';
  seat = side;
  matchNumber = 1;
  const decks = [null,null];
  decks[seat] = beys;
  if (mode==='cpu') decks[1] = format==='trio' ? cpuDeck : [cpuDeck[Math.floor(Math.random()*cpuDeck.length)]];
  stage.dataset.format = format;
  prepareMatch(decks,profiles,chooser);
}

function prepareMatch(decks,profiles,chooser) {
  state.localPlayer = seat;
  opponentProfiles = profiles;
  parityChooser = publicMatch ? chooser : Math.floor(Math.random()*2);
  diceOutcome = null;
  arenaChosen = false;
  roster = decks;
  state.configs = DEFAULTS.map(sanitizeConfig);
  resetRound(true);
  if (!publicMatch) { drawParity(); return; }
  state.phase = 'intro';
  updateControls();
  preparation.intro(profiles ?? [{name:'Jogador 1'},{name:'Jogador 2'}]);
  prepTimer = setTimeout(drawParity,1450);
}

const lobby = new StadiumLobby($('stadium-lobby'),$('stadium-queue'),{
  icons: drawIcons,
  play: (format,beys,level) => startLobbyMatch('cpu',format,beys,level),
  join: (format,options) => matchmaking.join(format,options),
  cancel: () => matchmaking.close(),
  soundEnabled: () => state.sound,
  toggleSound,
  graphicsValue: () => graphics.value,
  graphics: value => { graphics.value = value; graphics.dispatchEvent(new Event('change')); },
  inspect: (canvas,config) => canvas ? view?.inspectLoadout(canvas,config) : view?.closeInspection(),
  inspectAngle: angle => view?.inspectAngle(angle),
  local: () => { leaveDemo(); setMode('local'); view.setLoadouts(state.configs); view.ready(state.configs,0); },
  help,
});
const preparation = new StadiumPreparation($('stadium-preparation'),(kind,code)=>kind==='blade'?lobby.thumb(kind,code):partThumb(kind,code));
const matchmaking = new Matchmaking({
  queue: data => lobby.queueChanged(data),
  room: code => lobby.roomReady(code),
  play: receiveOnline,
  match: ({side,profiles,chooser}) => {
    const pending = lobby.matched();
    if (pending) startLobbyMatch('online',pending.format,pending.beys,'normal',side,profiles,chooser);
  },
  error: (message,matched) => {
    if (matched && matchFinished()) {
      state.connected = false;
      updateRematchControls();
      return;
    }
    if (matched) openLobby();
    lobby.fail(message);
    announce(message);
  },
});
document.addEventListener('stadium-catalog-ready',updateCards);
window.addEventListener('pagehide',()=>matchmaking.close());

function playDemo(dt,now) {
  if (!demo || demo.finished || demo.time > 14) {
    if (demo && now < demoNext) return;
    demo?.dispose();
    const blades = Object.keys(BLADES);
    const first = Math.floor(Math.random()*blades.length);
    const configs = [first,(first+1+Math.floor(Math.random()*(blades.length-1)))%blades.length].map((index,i)=>
      sanitizeConfig({...DEFAULTS[i],blade:blades[index],ratchet:BLADES[blades[index]].stock?.[0],
        bit:BLADES[blades[index]].stock?.[1],heading:DEFAULTS[i].heading+Math.random()*24-12},i));
    demo = new Battle(configs,event=>{
      if (event.type === 'finish') demoNext = performance.now()+300;
      if (event.type === 'hit' && event.strength > .5) view.spark(event.at,event.strength);
    });
    view.setLoadouts(configs);
    view.ready(configs,0,false);
    view.launchAnimation();
    demoTime = 0;
  }
  demoTime += dt;
  const until = performance.now()+4;
  let step = demo.stepSize();
  while (!demo.finished && demoTime >= step && performance.now() < until) {
    demo.step(false,step);
    demoTime -= step;
    step = demo.stepSize();
  }
  demoTime = Math.min(demoTime,DT*2);
  for (const top of demo.tops) {
    if (demo.time >= (top.demoMoveAt ?? 2)) {
      top.demoMoveAt = demo.time+1.5;
      demo.tryMove(top.player,top.charges.dash ? 'dash' : specialMove(top.bit));
    }
  }
  view.showFrames(demo.frames(),null,0,0,true,0,dt);
}

async function toggleSound(enabled = !state.sound, save = true) {
  const btn = stage.querySelector('[data-action="sound"]');
  if (btn.disabled) return;
  btn.disabled = true;
  try { state.sound = await audio.toggle(enabled); }
  catch { state.sound = false; announce('Áudio indisponível neste navegador.'); }
  finally { btn.disabled = false; }
  btn.setAttribute('aria-pressed',state.sound);
  btn.title = state.sound ? 'Silenciar som' : 'Ativar som';
  btn.setAttribute('aria-label',btn.title);
  btn.querySelector('span').textContent = btn.title;
  btn.querySelector('i').dataset.icon = state.sound ? 'sound' : 'muted';
  drawIcons(btn);
  if (save) {
    wantsSound = enabled;
    try { localStorage.setItem('x-stadium-sound',enabled?'on':'muted'); } catch { /* Session preference. */ }
  }
  if (state.sound) audio.play('launch');
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
  if (code && lobby.picture(kind,code)) return '<span class="part-thumb"><img referrerpolicy="no-referrer" src="' + safeImage(kind,code) + '" alt=""></span>';
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
  if (!workPart || !canEditParts(workPlayer) || !Object.hasOwn(partCatalog[workPart],code)) return;
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
  const { blade, ratchet, bit, standing, mass } = getParts(config);
  const locked = !canEditParts(workPlayer);
  if (locked || workPart === 'ratchet' && blade.integrated) workPart = null;
  const sameWorkshop = dialog.open && content.dataset.panel === 'workshop';
  const pageScroll = sameWorkshop ? dialog.scrollTop : 0;
  const pickerScroll = sameWorkshop ? content.querySelector('#part-picker')?.scrollTop : 0;
  const player = n => '<button class="mode-choice" data-action="work-player" data-player="' + n + '" aria-pressed="' + (n === workPlayer) + '">Jogador ' + (n + 1) + '</button>';
  const stats = loadoutStats(config).map(([label,value])=>'<div><small>'+label+'</small><span class="bar"><b style="width:'+value+'%"></b></span></div>').join('');
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
    '<div class="stat-list">' + stats + '</div>' +
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
    (state.phase !== 'setup' || !isHost() ? ' disabled' : '') + '> Disputa de reflexo em impactos decisivos</label>' +
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
  openDialog('help', 'COMO JOGAR', '<ul><li>Arraste o lançador para posicionar e a bolinha da seta para mirar. Toque no arco do dial ou gire o ponteiro para escolher a inclinação.</li>' +
    '<li>A força sobe sozinha. Toque em <b>Let it rip</b> ou pressione <b>Espaço</b> no ponto desejado da barra.</li>' +
    '<li>Arraste para orbitar. Durante o lançamento, use o botão direito ou ative a mão nos controles de câmera. Role, faça pinça ou use + e − para dar zoom. Mova dois dedos juntos ou segure Alt enquanto arrasta para deslocar a câmera.</li>' +
    '<li>Com giro e velocidade, o Bit pode engatar no trilho verde e fazer um <b>Xtreme Dash</b>.</li>' +
    '<li>Use <b>E/R</b> para a habilidade do Bit e o Xtreme Dash, com três usos de cada por rodada. No duelo local, J2 usa <b>I/O</b>. Defesa firma o centro e resistência circula ao redor dele.</li>' +
    '<li>Primeiro a 4 pontos vence. Spin Finish vale 1, Over e Burst Finish valem 2 e o bolso central Xtreme vale 3.</li>' +
    '<li>O pião precisa passar por cima do trilho e cair inteiro no bolso. Se voltar girando, é Reverse e a rodada continua. Empate ou saída fora dos bolsos repete a rodada.</li>' +
    '<li>Durante a preparação, use <b>setas</b> para mover, <b>Q/E</b> para mirar e <b>A/D</b> para inclinar.</li>' +
    '<li>Na disputa de reflexo em câmera lenta, toque ou clique no botão que acender. Também dá para usar <b>A/S/D</b> ou <b>←/↓/→</b>. No duelo local, J2 usa <b>J/K/L</b>. A opção fica em Multijogador.</li></ul>');
}

const toolMenus = [...document.querySelectorAll('.tool-menu')];
function closeToolMenus(except) {
  for (const menu of toolMenus) if (menu !== except) menu.open = false;
}

document.addEventListener('click', async e => {
  const tool = e.target.closest('.tool-menu');
  closeToolMenus(tool);
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'stadium-home') { closeToolMenus(); openLobby(); }
  else if (action === 'close') dialog.close();
  else if (action === 'edit' || action === 'work-player') {
    workPart = null;
    workshop(Number(btn.dataset.player));
  } else if (action === 'part-kind') {
    workPart = workPart === btn.dataset.kind ? null : btn.dataset.kind;
    workshop(workPlayer);
    content.querySelector('[data-kind="' + btn.dataset.kind + '"]').focus({preventScroll:true});
    if (workPart) $('part-picker').scrollIntoView({block:'nearest'});
  } else if (action === 'part-choice') selectPart(btn.dataset.code);
  else if (action === 'inspect-top' || action === 'inspect-side') view?.inspectAngle(action === 'inspect-top'?'top':'side');
  else if (action === 'multiplayer' || action === 'help') {
    closeToolMenus();
    if (action === 'multiplayer') {
      if (roster || inLobby) openLobby();
      else multiplayer();
    }
    else help();
  }
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
  else if (action === 'mode' && btn.dataset.mode==='online') {
    openLobby();
    lobby.show('online');
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
  else if (action === 'rematch') requestRematch();
  else if (action === 'sound') toggleSound();
  else if (['orbit', 'top', 'follow'].includes(action) && view) {
    view.setCameraLocked(false);
    $('camera-lock').setAttribute('aria-pressed',false);
    state.camera = action; view.setCamera(action);
    for (const mode of ['orbit', 'top', 'follow']) {
      $('camera-' + mode).classList.toggle('selected', mode === action);
      $('camera-' + mode).setAttribute('aria-pressed', mode === action);
    }
    updateControls();
    closeToolMenus();
  } else if (action === 'camera-lock' && view) {
    view.setCameraLocked(!view.lockedCamera);
    btn.setAttribute('aria-pressed', Boolean(view.lockedCamera));
    closeToolMenus();
  } else if (action === 'camera-reset') {
    view?.setCamera(state.camera);
  } else if (action === 'zoom-in' || action === 'zoom-out') {
    view?.changeZoom(action === 'zoom-in' ? .81 : 1.24);
  } else if (action === 'camera-drag') {
    state.cameraDrag = !state.cameraDrag;
    updateControls();
    closeToolMenus();
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
  fullscreen.querySelector('span').textContent = active ? 'Sair da tela cheia' : 'Tela cheia';
  fullscreen.querySelector('i').dataset.icon = active ? 'shrink' : 'expand';
  drawIcons(fullscreen);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const menu = toolMenus.find(item => item.open);
  if (!menu) return;
  closeToolMenus();
  menu.querySelector('summary').focus();
});
document.addEventListener('pointerdown', e => {
  if (state.sound && !e.target.closest('[data-action="sound"]')) audio.unlock().catch(() => {});
}, { passive:true });
document.addEventListener('touchend', () => {
  if (state.sound) audio.unlock().catch(()=>{});
}, {passive:true});
document.addEventListener('click',e=>{
  if (!available || !wantsSound || state.sound || e.target.closest('[data-action="sound"],[data-lobby="sound"],[data-lobby="settings"]')) return;
  if (e.target.closest('[data-lobby="online"],[data-lobby="cpu"],#launch')) toggleSound(true,false);
},{capture:true});

dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
document.addEventListener('change', e => {
  if (e.target.id === 'reflex') {
    state.reflex = e.target.checked;
  }
});
launchButton.addEventListener('click',launch);
function setDialAngle(e) {
  if (!canEdit(activePlayer()) || state.cameraDrag) return;
  const bounds = angleDial.getBoundingClientRect();
  const x = e.clientX-bounds.left-bounds.width/2;
  const y = bounds.top+bounds.height/2-e.clientY;
  if (Math.hypot(x,y)<4) return;
  const degrees = Math.atan2(x,Math.max(0,y))*180/Math.PI;
  configure({angle:Math.round(clamp(degrees/65,-1,1)*MAX_LAUNCH_ANGLE)},false);
}
angleDial.addEventListener('pointerdown', e => {
  if (!e.isPrimary || e.button !== 0) return;
  angleDial.setPointerCapture(e.pointerId);
  setDialAngle(e);
});
angleDial.addEventListener('pointermove', e => {
  if (angleDial.hasPointerCapture(e.pointerId)) setDialAngle(e);
});
angleDial.addEventListener('pointerup', sendSetup);
angleDial.addEventListener('pointercancel', sendSetup);
angleDial.addEventListener('keydown',e => {
  const angle = state.configs[activePlayer()].angle;
  const next = {ArrowLeft:angle-1,ArrowDown:angle-1,ArrowRight:angle+1,ArrowUp:angle+1,Home:-MAX_LAUNCH_ANGLE,End:MAX_LAUNCH_ANGLE}[e.key];
  if (next === undefined) return;
  e.preventDefault();
  e.stopPropagation();
  configure({angle:next});
});
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
      KeyA:{angle:config.angle-degrees},KeyD:{angle:config.angle+degrees}}[e.code];
    if (position || adjustment) {
      e.preventDefault();
      configure(position ? {point:position} : adjustment);
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
  lobby.tick();
  if (inLobby) {
    playDemo(dt,now);
    view.draw(dt,1);
    requestAnimationFrame(frame);
    return;
  }
  updateLaunchMeter(now);
  if (state.phase === 'countdown') {
    const n = Math.max(1, Math.ceil((state.deadline - now) / 510));
    if (state.countShown !== n) {
      const power = state.mode === 'local' ? state.configs.map((config,i) => 'J'+(i+1)+' '+config.power+'%').join(' · ') :
        'FORÇA ' + state.configs[state.localPlayer].power + '%';
      overlay.innerHTML = '<span class="overlay-label">' + power + '</span><strong>' + n + '</strong>';
      state.countShown = n;
      if (n === 1) state.configs.forEach((config,i)=>view.setCord(i,config.power));
    }
    if (now >= state.deadline && isHost()) startFight();
  }
  let settled = state.phase === 'result' && state.frames?.every(top => top.sleeping);
  if (state.physics && !settled && ['fight','qte','result'].includes(state.phase) && isHost()) {
    const phase = state.phase, rate = phase === 'qte' ? QTE_SPEED : 1;
    accumulator += dt*rate;
    const deadline = performance.now()+PHYSICS_FRAME_BUDGET;
    let step = state.physics.stepSize();
    while (accumulator >= step && state.phase === phase) {
      if (accumulator < 2*step) previousFrames = state.physics.poses();
      previousStep = step;
      state.physics.step(phase !== 'fight',step);
      accumulator -= step;
      step = state.physics.stepSize();
      // Drop excess catch-up work instead of starving rendering and touch input.
      if (accumulator >= step && performance.now() >= deadline) {
        accumulator %= step;
        previousFrames = null;
        break;
      }
    }
    if (state.phase!==phase) accumulator = 0;
    state.frames = state.physics.frames();
    settled = state.phase === 'result' && state.frames.every(top => top.sleeping);
    const cpuSeat = cpuPlayer();
    if (state.phase === 'fight' && state.mode === 'cpu' && !state.trial && (state.physics.time >= state.cpuMoveAt || state.frames[cpuSeat].moves.reflexBoost === 'ready')) {
      const rival = state.frames[state.localPlayer], cpu = state.frames[cpuSeat];
      const radius = Math.hypot(cpu.p[0],cpu.p[2]);
      const gap = Math.hypot(cpu.p[0]-rival.p[0],cpu.p[2]-rival.p[2]);
      const special = specialFor(cpuSeat);
      const wantsSpecial = special === 'attack' ? radius > 2.8 && gap > 2.3 && gap < 5.3 : radius > 1.25 || gap < 4;
      const readyBoost = cpu.moves.reflexBoost === 'ready';
      const kind = (wantsSpecial || readyBoost) && cpu.moves.ready.includes(special) ? special : 'dash';
      if (!readyBoost || kind === special) {
        const used = state.physics.tryMove(cpuSeat,kind);
        state.cpuMoveAt = state.physics.time+(used ? 5.5 : .65);
      }
    }
    if (state.mode==='online' && (settled || now-lastSent>32 && state.physics.time!==lastSentStep)) {
      lastSent = now;
      lastSentStep = state.physics.time;
      sendOnline({type:'frames',match:matchNumber,round:state.round,phase:state.phase,frames:state.frames,time:lastSentStep});
    }
  }
  if (state.phase === 'qte') {
    const q = state.qte;
    drawQte(now);
    if (isHost()) {
      const stage = qteCue(q,now);
      const response = q.cpu?.[stage];
      if (response && now >= q.start+q.cues[stage].at+response.delay) {
        recordReaction(q,cpuPlayer(),stage,response.index,response.delay);
      }
      const grace = state.mode === 'online' ? 420 : 0;
      if (now >= q.feedbackUntil && (now >= q.close+grace || q.reactions.every(row => row.every(hit => hit !== null)))) resolveQte();
    }
  }
  if (state.frames && (!settled || settledFrames !== state.frames)) {
    const moving = !settled && ['fight','qte','result'].includes(state.phase);
    const rate = state.phase === 'qte' ? QTE_SPEED : 1;
    let from = state.frames, to = null, blend = 0, span = 0, lead = 0;
    if (moving && isHost() && state.phase==='qte') {
      lead = Math.max(0,accumulator);
    } else if (moving && isHost() && previousFrames && previousStep) {
      from = previousFrames;
      to = state.frames;
      blend = clamp(accumulator / previousStep, 0, 1);
      span = previousStep;
    } else if (moving && !isHost()) {
      const pose = playback.sample(now/1000,rate);
      if (pose) ({from,to,blend,span,lead} = pose);
    }
    const correct = moving && (state.phase==='qte' || !isHost());
    view.showFrames(from,to,blend,span,moving,(now-(state.burstAt??now))/1000,dt*rate,lead,
      correct ? 1-Math.exp(-dt*47) : 1);
    settledFrames = settled ? state.frames : null;
  }
  if (now - lastHud > 75) {
    updateStamina();
    updateCombatControls();
    audio.update(settled ? null : state.frames,state.phase === 'qte' ? QTE_SPEED : 1);
    lastHud = now;
  }
  view.draw(dt,state.phase === 'qte' ? QTE_SPEED : 1,settled);
  requestAnimationFrame(frame);
}

drawIcons();
updateCards(); updateScore(); updateControls();
try {
  await Promise.all([initPhysics(), document.fonts.load('800 italic 24px Barlow').catch(() => {})]);
  view = new ArenaView($('world'), {
    active: () => canEdit(activePlayer()) && !state.cameraDrag && !dialog.open ?
      {config:state.configs[activePlayer()],player:activePlayer()} : null,
    change: partial => configure(partial,false),
    commit: sendSetup,
    panel: launcherControls,
    positionGrip,
    aimGrip,
  });
  view.setGraphics(graphics.value);
  view.setLoadouts(state.configs);
  view.ready(state.configs, 0);
  available = true;
  lobby.root.inert = false;
  updateControls();
  requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  $('webgl-error').hidden = false;
} finally {
  $('loading').hidden = true;
}
