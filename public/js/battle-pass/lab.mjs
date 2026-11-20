import { BattlePassProtocol } from './protocol.mjs';
import { renderLaunchChart } from './chart.mjs';
import { BattlePassSpinner } from './spinner.mjs';
import { BattlePassMissions } from './missions.mjs';
import { LaunchFeedback } from './launch-feedback.mjs';
import { SessionHistory } from './session-history.mjs';
import { BattlePassTransport,compatibility } from './transport.mjs';
import { BattlePassSession } from './session.mjs';
import { BattlePassStore,BattlePassSync } from './sync.mjs';

const $ = id=>document.getElementById(id), esc = BX.esc;
const number = value=>value==null?'—':Math.round(value).toLocaleString('pt-BR');
const date = value=>new Date(value).toLocaleString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const average = values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
let support = compatibility();
const spinner=new BattlePassSpinner($('bladeBtn'));
const missions=new BattlePassMissions($('missionsView'),request);
const launchFeedback=new LaunchFeedback(()=>document.querySelector('[data-tab="training"]').click());
const sessionHistory=new SessionHistory($('savedHistory'),{request,getAccount:()=>account,getStore:()=>store,getLevel:()=>missions.state?.level??1});
let account,store,sync,current,demo=false,demoRows=[],rows=[],personalBest=0,page=1,pages=1,visibleRows=20;
let savedRefresh,events=Promise.resolve(),demoTimer,initialized=false;
let connectionState='disconnected';
let lastDisplayed=null,revealTimer,settleTimer,chartValues=[],chartWidth=0,syncNotice=false;
let initializationFailed=false;
BX.renderTopbar('/battle-pass');

function notice(message='') { $('notice').textContent=message;$('notice').hidden=!message; }
function batteryState(battery) {
  const value=battery?.percent,known=Number.isInteger(value) && value>=0 && value<=100;
  $('batteryState').querySelector('b').textContent=known?value+'%':'—';
  $('batteryState').setAttribute('aria-label',known?'Bateria: '+value+' por cento. Abrir detalhes.':'Bateria: leitura indisponível. Abrir detalhes.');
}
function enqueue(action) {
  events=events.then(action).catch(error=>notice(error.message));
  return events;
}
function beyState(state,text) {
  $('beyState').dataset.state=state;
  $('beyState').title=text;
  $('beyState').lastElementChild.textContent=state==='attached'?'Bey encaixada':state==='offline' || state==='unknown'?'Bey indisponível':demo?'Bey simulada':'Sem Bey encaixada';
}
function connectionPanel(open) {
  $('connectionPanel').classList.toggle('is-collapsed',!open);
  $('connectionPanel').inert=!open;
  $('connectionPanel').setAttribute('aria-hidden',String(!open));
  $('connectBtn').setAttribute('aria-expanded',String(open));
}
function connection(state) {
  support=compatibility();
  const changed=connectionState!==state;
  connectionState=state;
  const badge=$('connectionBadge');
  const busy=state==='searching' || state==='connecting';
  $('connectBtn').dataset.connected=state==='connected';$('connectBtn').dataset.busy=busy;
  badge.textContent=({connected:'Conectado',searching:'Buscando…',connecting:'Conectando…',demo:'Conectar',disconnected:'Conectar'}[state]??state);
  $('connectBtn').setAttribute('aria-label',state==='connected'?'Opções do Battle Pass conectado':busy?'Cancelar busca':'Conectar Battle Pass');
  $('connectBtn').title=state==='connected'?'Abrir opções de conexão':'';
  $('connectBtn').disabled=false;
  $('disconnectBtn').hidden=state!=='connected';
  $('readBtn').hidden=state!=='connected';
  if(state!=='connected') batteryState(null);
  if(changed) connectionPanel(false);
}
const protocol=new BattlePassProtocol({
  onInvalid:notice,
  onEvent:event=>{
    const context=current;
    if(context && !demo && event.type==='metadata') {
      batteryState(event.battery);
      if(context.observedCounter!==undefined && event.counter!==context.observedCounter && event.state==='ready') spinner.launch(context.id+':'+event.counter);
      context.observedCounter=event.counter;
    }
    if(context && !demo && event.type==='history' && event.values.length && (event.live || spinner.model.token===context.id+':'+event.counter)) spinner.launch(context.id+':'+event.counter,event.values.at(-1));
    if(context && !demo && event.type==='history' && event.values.length) setShootPower(event.values.at(-1),{animate:(event.live || spinner.model.token===context.id+':'+event.counter) && context.tracker.counter!==event.counter});
    const receivedAt=new Date().toISOString();
    if(context) enqueue(()=>receive({...event,receivedAt},context));
  },
});
const transport=new BattlePassTransport({
  onData:value=>protocol.feed(value),
  onState:(state,info)=>{
    if(state==='reading') { protocol.expectHistory();return; }
    connection(state);
    if(state==='connected') {
      current.info=info;
      beyState('ready','Aguardando a Bey');
    } else if(state==='searching' || state==='connecting') beyState('offline','Aguardando o Battle Pass');
    else if(state==='disconnected') {
      protocol.flush();protocol.reset();
      beyState('offline','Desconectado · registros preservados');
      const context=current;
      if(context && !context.endedAt) {
        context.endedAt=new Date().toISOString();
        enqueue(async()=>{if(context.device) await sync.add(context,context.device,[],cursor(context));});
      }
    }
  },
});
const cursor=context=>({counter:context.tracker.counter,epoch:context.tracker.epoch});
$('batteryState').onclick=()=>$('batteryHelp').showModal();

async function receive(event,context) {
  if(event.type==='metadata') {
    if(!context.device) {
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(event.address));
      context.device={key:Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join(''),name:context.info?.name??'BEYBLADE_TOOL01',localId:context.info?.localId};
      context.tracker=new BattlePassSession(await sync.device(context.device));
      if(context.waiting) {const waiting=context.waiting;context.waiting=null;await receive(waiting,context);}
    }
    const state=context.tracker.metadata(event);
    if(current===context && !context.endedAt) beyState(state,{
      attached:'Bey encaixada · pronta para lançar',ready:'Lançador pronto · encaixe a Bey',
      cancelled:'Bey retirada · lançamento cancelado',unknown:'Aguardando lançamento',
    }[state]);
    return;
  }
  if(event.type==='device-reset') {notice('O acessório informou uma reinicialização. Confira o contador ao reler o histórico.');return;}
  if(event.type!=='history') return;
  if(!context.device) { context.waiting=event;return; }
  const entries=context.tracker.snapshot(event,event.receivedAt), oldBest=personalBest;
  const saved=await sync.add(context,context.device,entries,cursor(context));
  if(current!==context || demo) return;
  rows=saved.launches;personalBest=Math.max(personalBest,...entries.map(r=>r.sp));
  renderTraining();
  if(!rows.length && event.values.length) setShootPower(event.values.at(-1));
  if(entries.some(r=>r.source==='live')) {
    const latest=entries.filter(r=>r.source==='live').at(-1);
    if(document.querySelector('[data-view="training"]').hidden) launchFeedback.show(latest,context.device.key+':'+latest.key);
    if(!context.endedAt) beyState('launched','Lançamento recebido · encaixe a próxima Bey');
    $('record').textContent=entries.at(-1).sp>oldBest?'Novo recorde pessoal!':'';
    flash();
  }
  if(!account) notice('Lançamentos salvos neste aparelho. Entre na sua conta para sincronizar.');
}

function setShootPower(value,{animate=false}={}) {
  if(value===lastDisplayed && !animate) return;
  lastDisplayed=value;clearTimeout(revealTimer);clearTimeout(settleTimer);
  const output=$('lastSp'),label=$('powerLabel'),formatted=number(value);
  output.classList.remove('bp-calculating');
  output.dataset.powerTone=BX.shootPower.tone(value??0);
  output.setAttribute('aria-label',value==null?'Nenhum lançamento':formatted+' SP');
  label.textContent='ÚLTIMO LANÇAMENTO';
  if(!animate || matchMedia('(prefers-reduced-motion: reduce)').matches || value==null) {output.textContent=formatted;return;}
  label.textContent='CALCULANDO FORÇA';output.classList.add('bp-calculating');
  revealTimer=setTimeout(()=>{
    output.classList.remove('bp-calculating');label.textContent='ÚLTIMO LANÇAMENTO';
    output.innerHTML=Array.from(formatted,(digit,i)=>{
      if(digit==='.') return '<span class="bp-slot-separator">.</span>';
      let reel=Array.from({length:10},(_,n)=>String((n+i*3)%10));reel.push(digit);
      if(i%2) reel.reverse();
      return `<span aria-hidden="true" class="bp-slot-digit${i%2?' is-reverse':''}" data-reel="${reel.join('&#10;')}" style="--slot-time:${450+i*40}ms">${digit}</span>`;
    }).join('');
    settleTimer=setTimeout(()=>{output.textContent=formatted;},800);
  },130);
}

function flash() {
  const element=$('lastSp').closest('article');
  element.dataset.flash='false';requestAnimationFrame(()=>element.dataset.flash='true');
}
function historyRow(row) {
  return `<li><b class="bp-power-number" data-power-tone="${BX.shootPower.tone(row.sp)}">${number(row.sp)} <small>SP</small></b><span class="${row.source==='live'?'bp-source-live':''}">${row.source==='live'?'Ao vivo':'Importado do BX-09'}<time>${row.measuredAt?esc(date(row.measuredAt)):'Horário original indisponível'}</time></span><small>#${row.counter}${row.synced===false?' · local':''}</small></li>`;
}
function renderTraining({animate=false}={}) {
  const list=demo?demoRows:rows, values=list.map(r=>r.sp), recent=values.slice(-10), prior=values.slice(-20,-10);
  const avg=average(values), recentAvg=average(recent);
  const variation=recent.length>=2 && recentAvg?Math.round(Math.sqrt(average(recent.map(sp=>(sp-recentAvg)**2)))/recentAvg*100):null;
  const trend=prior.length===10 && recent.length===10?(recentAvg-average(prior))/average(prior)*100:null;
  setShootPower(values.at(-1)??null,{animate});
  $('bestSp').textContent=number(demo?(values.length?Math.max(...values):null):personalBest||null);
  $('averageSp').textContent=number(values.length?avg:null);$('launchCount').textContent=number(values.length);
  $('bestSp').dataset.powerTone=BX.shootPower.tone(demo?Math.max(0,...values):personalBest);
  $('averageSp').dataset.powerTone=BX.shootPower.tone(avg);
  $('minimumSp').textContent=number(values.length?Math.min(...values):null);
  $('recentAverage').textContent=number(recent.length?recentAvg:null);
  $('variation').textContent=variation==null?'—':variation+'%';
  $('trend').textContent=trend==null?'—':(trend>=0?'+':'')+trend.toFixed(1)+'%';
  $('sessionEmpty').hidden=!!list.length;
  $('currentHistory').innerHTML=list.slice().reverse().slice(0,visibleRows).map(historyRow).join('');
  $('moreCurrent').hidden=list.length<=visibleRows;
  chartValues=values;renderLaunchChart($('chart'),values);
  $('chartSummary').textContent=values.length?number(values.length)+' lançamentos':'';
}

async function request(path,options={}) {
  return BX.api(path,{...options,signal:AbortSignal.timeout(10000),cache:'no-store'});
}
async function savedSessions() {
  if(!store) return;
  let sessions=[],summary;
  if(account) {
    try {
      const data=await request('/api/battle-pass?page='+page);
      sessions=data.sessions;summary=data.summary;pages=data.pages;
      personalBest=Math.max(personalBest,summary.best);
      $('publicStats').checked=data.public;$('publicStats').disabled=false;
      $('accountState').textContent='';
    } catch(error) {
      $('accountState').textContent=error.status===401?'Entre novamente para sincronizar. Seus dados locais estão preservados.':'Sem conexão com o servidor. Exibindo as sessões guardadas neste navegador.';
    }
  }
  if(!summary) {
    const data=await store.read();
    const all=data.sessions.flatMap(s=>s.launches),values=all.map(r=>r.sp);
    summary={count:values.length,average:average(values),best:Math.max(0,...values),sessions:data.sessions.length};
    pages=Math.max(1,Math.ceil(data.sessions.length/10));
    sessions=data.sessions.slice().reverse().slice((page-1)*10,page*10).map(s=>({...s,
      launchCount:s.launches.length,averageSp:average(s.launches.map(r=>r.sp)),bestSp:Math.max(0,...s.launches.map(r=>r.sp)),
      launches:s.launches.slice().reverse(),local:true}));
    personalBest=Math.max(personalBest,summary.best);
    if(!account) $('accountState').innerHTML='<p class="bp-note">Dados neste navegador. <a href="/entrar" id="accountLogin">Entre na sua conta</a> antes de treinar para sincronizar.</p>';
    $('accountLogin')?.addEventListener('click',event=>{event.preventDefault();BX.requireLogin('/battle-pass');});
  }
  $('lifetimeStats').innerHTML=[['Média geral',summary.average,'SP'],['Recorde pessoal',summary.best,'SP'],['Lançamentos',summary.count,'registros'],['Sessões de treino',summary.sessions,'sessões']].map(([label,value,unit])=>`<article><span>${label}</span><strong>${number(value)}</strong><small>${unit}</small></article>`).join('');
  $('savedSummary').textContent=number(summary.count)+' lançamentos';
  sessionHistory.render(sessions);
  $('pageNumber').textContent=pages>1?`${page} / ${pages}`:'';
  $('previousPage').hidden=page<=1;$('nextPage').hidden=page>=pages;
  if(!demo) {$('bestSp').textContent=number(personalBest||null);$('bestSp').dataset.powerTone=BX.shootPower.tone(personalBest);}
}

async function ranking(sort='best') {
  $('rankBest').setAttribute('aria-pressed',sort==='best');$('rankAverage').setAttribute('aria-pressed',sort==='average');
  $('rankingList').textContent='Carregando ranking…';
  try {
    const data=await request('/api/battle-pass/ranking?sort='+sort);
    document.querySelector('.bp-rank-head').hidden=!data.entries.length;
    $('rankingList').innerHTML=data.entries.length?data.entries.map(r=>`<div class="bp-rank-row"><span>${r.place}º</span><a href="/u/${esc(r.user.slug)}"><img src="${esc(r.user.avatarUrl||'/assets/profiles/default-blader.png')}" alt="" loading="lazy"><strong>${esc(r.user.name)}</strong></a><div><b aria-label="Recorde: ${number(r.best)} SP">${number(r.best)}</b></div><div><b aria-label="Média: ${number(r.average)} SP">${number(r.average)}</b></div></div>`).join(''):'<p class="bp-empty">Nenhum jogador no ranking.</p>';
  } catch {$('rankingList').textContent='Não foi possível carregar o ranking.';}
}

document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{
  document.querySelectorAll('[data-tab]').forEach(b=>b.toggleAttribute('aria-current',b===button));
  button.setAttribute('aria-current','page');
  document.querySelectorAll('[data-view]').forEach(view=>view.hidden=view.dataset.view!==button.dataset.tab);
  if(button.dataset.tab==='training') launchFeedback.hide();
  if(button.dataset.tab==='records') savedSessions().catch(error=>notice(error.message));
  if(button.dataset.tab==='ranking') ranking();
  if(button.dataset.tab==='missions') missions.load();
});
$('connectBtn').onclick=()=>{
  if(connectionState==='searching' || connectionState==='connecting') {transport.disconnect();return;}
  support=compatibility();
  if(!support.supported) {
    $('iosHelp').hidden=!support.ios;$('iosGuide').hidden=!support.ios;
    $('compatibility').textContent=support.reason;
    document.querySelector('[data-tab="guide"]').click();
    notice(support.ios?'Para conectar no iPhone, abra este site no Bluefy ou use o Safari com a extensão beacio ativada.':support.reason+' Use Chrome no Android ou Chrome/Edge no computador.');
    return;
  }
  if(initializationFailed) {location.reload();return;}
  if(!initialized) {notice('Preparando o treino. Toque novamente em Conectar em instantes.');return;}
  if(connectionState==='connected') {connectionPanel($('connectionPanel').inert);return;}
  startConnection();
};
function startConnection() {
  if(!initialized) return;
  leaveDemo();spinner.stop();notice();protocol.reset();rows=[];visibleRows=20;$('record').textContent='';renderTraining();
  current={id:crypto.randomUUID(),startedAt:new Date().toISOString(),endedAt:null,tracker:new BattlePassSession()};
  transport.connect().catch(error=>notice(error.message));
}
$('disconnectBtn').onclick=()=>transport.disconnect();
document.addEventListener('click',event=>{
  if(connectionState==='connected' && !event.target.closest('.bp-connection')) connectionPanel(false);
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape' && connectionState==='connected' && !$('connectionPanel').inert) {
    connectionPanel(false);$('connectBtn').focus();
  }
});
$('readBtn').onclick=async()=>{
  $('readBtn').disabled=true;
  try {await transport.readHistory();} catch(error){notice(error.message);}
  finally {$('readBtn').disabled=false;}
};
$('moreCurrent').onclick=()=>{visibleRows+=20;renderTraining();};
$('previousPage').onclick=()=>{page--;savedSessions().catch(error=>notice(error.message));};
$('nextPage').onclick=()=>{page++;savedSessions().catch(error=>notice(error.message));};
$('publicStats').onchange=async()=>{
  const checkbox=$('publicStats');checkbox.disabled=true;
  try {await request('/api/battle-pass/preferences',{method:'PATCH',body:{accountId:account.id,public:checkbox.checked}});}
  catch(error){checkbox.checked=!checkbox.checked;notice(error.message);}finally{checkbox.disabled=false;}
};
$('rankBest').onclick=()=>ranking('best');$('rankAverage').onclick=()=>ranking('average');

function leaveDemo() {
  if(!demo) return;
  clearInterval(demoTimer);demo=false;demoRows=[];$('demoBtn').textContent='Experimentar demonstração';
  spinner.stop();
  $('record').textContent='';notice();connection('disconnected');renderTraining();
  beyState('offline','Pronto para conectar');
}
$('demoBtn').onclick=()=>{
  if(demo) {leaveDemo();return;}
  if(transport.device?.gatt?.connected) transport.disconnect();
  demo=true;demoRows=[];connection('demo');
  document.querySelector('[data-tab="training"]').click();
  $('demoBtn').textContent='Sair da demonstração';
  notice('Demonstração · dados simulados. Estes lançamentos não são salvos nem enviados ao perfil ou ranking.');
  let count=0;
  const tick=()=>{
    const sp=[4230,5184,4970,5682,5301,6128,5810,5543][count%8];
    demoRows.push({sp,counter:++count,source:'live',measuredAt:new Date().toISOString()});
    spinner.launch('demo:'+count,sp);
    if(demoRows.length>50) demoRows.shift();
    beyState('launched','Lançamento simulado');renderTraining({animate:true});flash();
  };
  tick();demoTimer=setInterval(tick,2400);
};
window.addEventListener('online',()=>{sync?.flush();savedSessions().catch(()=>{});});
window.addEventListener('pagehide',()=>{clearInterval(demoTimer);clearTimeout(revealTimer);clearTimeout(settleTimer);spinner.stop();transport.disconnect();});
$('iosHelp').hidden=!support.ios;
$('iosGuide').hidden=!support.ios;
$('compatibility').textContent=support.supported?'Bluetooth disponível neste navegador.':support.reason;
connection('disconnected');

try {
  account=await BX.me();
  missions.initialize(account);
  spinner.initialize(account).catch(()=>{ $('bladeBtn').onclick=()=>spinner.initialize(account).then(()=>spinner.picker()).catch(()=>notice('Não foi possível carregar as Blades. Tente novamente.')); });
  let owner=account?.id;
  if(!owner) {owner=localStorage.getItem('bx-battle-pass-guest')||'guest-'+crypto.randomUUID();localStorage.setItem('bx-battle-pass-guest',owner);}
  store=new BattlePassStore(owner);await store.read();
  sync=new BattlePassSync(store,{request,authenticated:!!account,onProgress:data=>missions.receive(data),onStatus:(state,detail)=>{
    document.querySelector('.bp-page').dataset.sync=state;
    if(state==='pending' && !demo) {syncNotice=true;notice('Sem conexão. Seus lançamentos estão salvos neste aparelho e serão sincronizados.');}
    if(state==='saved' && syncNotice) {syncNotice=false;notice();}
    if(state==='blocked') notice(detail);
    if(state==='saved') {missions.refreshSoon();clearTimeout(savedRefresh);savedRefresh=setTimeout(()=>savedSessions().catch(()=>{}),500);}
  }});
  initialized=true;connection(demo?'demo':'disconnected');
  savedSessions().catch(()=>{});sync.flush();
  transport.prepare().then(()=>{if(transport.knownDevice && !demo && !current) startConnection();});
} catch(error) {
  initializationFailed=true;
  notice('Não foi possível preparar o salvamento: '+error.message+' Recarregue a página para tentar novamente.');
  connection('disconnected');
}

if('ResizeObserver' in window) new ResizeObserver(entries=>{
  const width=Math.round(entries[0].contentRect.width);
  if(width && width!==chartWidth) {chartWidth=width;renderLaunchChart($('chart'),chartValues);}
}).observe($('chart'));
