import { BattlePassProtocol,hex } from './protocol.mjs';
import { BattlePassTransport,compatibility } from './transport.mjs';
import { BattlePassSession } from './session.mjs';
import { BattlePassStore,BattlePassSync } from './sync.mjs';

const $ = id=>document.getElementById(id), esc = BX.esc;
const number = value=>value==null?'—':Math.round(value).toLocaleString('pt-BR');
const date = value=>new Date(value).toLocaleString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const average = values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
const support = compatibility();
let account,store,sync,current,demo=false,demoRows=[],rows=[],personalBest=0,page=1,pages=1,visibleRows=20;
let savedRefresh,events=Promise.resolve(),demoTimer,initialized=false;
const packets=[];
BX.renderTopbar('/battle-pass');

function notice(message='') { $('notice').textContent=message;$('notice').hidden=!message; }
function diagnostic(message) {
  packets.push(new Date().toISOString()+' '+message);
  if(packets.length>120) packets.shift();
  if($('diagnostic').open) $('packetLog').textContent=packets.join('\n');
}
function enqueue(action) {
  events=events.then(action).catch(error=>{notice(error.message);diagnostic('Erro: '+error.message);});
  return events;
}
function beyState(state,text) {
  $('beyState').dataset.state=state;
  $('beyState').lastElementChild.textContent=text;
}
function connection(state) {
  const badge=$('connectionBadge');
  badge.dataset.connected=state==='connected';badge.dataset.busy=state==='connecting';
  badge.innerHTML='<i></i> '+({connected:'Conectado',connecting:'Conectando…',demo:'Demonstração',disconnected:'Desconectado'}[state]??state);
  $('connectBtn').hidden=state==='connected';
  $('connectBtn').disabled=!initialized || !support.supported || state==='connecting';
  $('disconnectBtn').hidden=state!=='connected';
  $('readBtn').hidden=state!=='connected';
  $('endBtn').hidden=state!=='connected';
}
const protocol=new BattlePassProtocol({
  onPacket:page=>diagnostic('RX '+hex(page)),
  onInvalid:message=>{diagnostic(message);notice(message);},
  onEvent:event=>{
    const context=current;
    if(context && !demo && event.type==='history' && event.values.length) $('lastSp').textContent=number(event.values.at(-1));
    if(context) enqueue(()=>receive(event,context));
  },
});
const transport=new BattlePassTransport({
  onData:value=>protocol.feed(value),onDiagnostic:diagnostic,
  onState:(state,info)=>{
    if(state==='reading') { protocol.expectHistory();return; }
    connection(state);
    if(state==='connected') {
      current.info=info;
      $('deviceName').textContent=info.name;
      $('pairingHint').textContent='Conectado. Encaixe a Bey no lançador e faça seu lançamento no estádio.';
      beyState('ready','Aguardando a Bey');
    } else if(state==='connecting') beyState('offline','Selecione seu Battle Pass');
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
    $('deviceCounter').textContent='Contador do acessório: '+number(event.counter);
    $('deviceBest').textContent='Recorde do acessório: '+number(event.best)+' SP';
    return;
  }
  if(event.type==='device-reset') {notice('O acessório informou uma reinicialização. Confira o contador ao reler o histórico.');return;}
  if(event.type!=='history') return;
  if(!context.device) { context.waiting=event;return; }
  const entries=context.tracker.snapshot(event), oldBest=personalBest;
  const saved=await sync.add(context,context.device,entries,cursor(context));
  if(current!==context || demo) return;
  rows=saved.launches;personalBest=Math.max(personalBest,...entries.map(r=>r.sp));
  $('deviceCounter').textContent='Contador do acessório: '+number(event.counter);
  $('deviceBest').textContent='Recorde do acessório: '+number(event.best)+' SP';
  renderTraining();
  if(!rows.length && event.values.length) $('lastSp').textContent=number(event.values.at(-1));
  if(entries.some(r=>r.source==='live')) {
    if(!context.endedAt) beyState('launched','Lançamento recebido · encaixe a próxima Bey');
    $('record').textContent=entries.at(-1).sp>oldBest?'Novo recorde pessoal!':'Lançamento registrado';
    flash();
  }
  if(!account) $('saveState').textContent='Salvo neste navegador · entre para sincronizar';
}

function flash() {
  const element=$('lastSp').closest('article');
  element.dataset.flash='false';requestAnimationFrame(()=>element.dataset.flash='true');
}
function historyRow(row) {
  return `<li><b>${number(row.sp)} <small>SP</small></b><span class="${row.source==='live'?'bp-source-live':''}">${row.source==='live'?'Ao vivo':'Importado do BX-09'}<time>${row.measuredAt?esc(date(row.measuredAt)):'Horário original indisponível'}</time></span><small>#${row.counter}${row.synced===false?' · local':''}</small></li>`;
}
function renderTraining() {
  const list=demo?demoRows:rows, values=list.map(r=>r.sp), recent=values.slice(-10), prior=values.slice(-20,-10);
  const avg=average(values), recentAvg=average(recent);
  const variation=recent.length>=2 && recentAvg?Math.round(Math.sqrt(average(recent.map(sp=>(sp-recentAvg)**2)))/recentAvg*100):null;
  const trend=prior.length===10 && recent.length===10?(recentAvg-average(prior))/average(prior)*100:null;
  $('lastSp').textContent=number(values.at(-1));
  $('bestSp').textContent=number(demo?(values.length?Math.max(...values):null):personalBest||null);
  $('averageSp').textContent=number(values.length?avg:null);$('launchCount').textContent=number(values.length);
  $('minimumSp').textContent=number(values.length?Math.min(...values):null);
  $('recentAverage').textContent=number(recent.length?recentAvg:null);
  $('variation').textContent=variation==null?'—':variation+'%';
  $('trend').textContent=trend==null?'—':(trend>=0?'+':'')+trend.toFixed(1)+'%';
  $('sessionEmpty').hidden=!!list.length;
  $('currentHistory').innerHTML=list.slice().reverse().slice(0,visibleRows).map(historyRow).join('');
  $('moreCurrent').hidden=list.length<=visibleRows;
  const chart=values.slice(-20),max=Math.max(...chart,1);
  $('chart').innerHTML=chart.length?chart.map((sp,i)=>`<figure aria-label="Lançamento ${values.length-chart.length+i+1}: ${number(sp)} SP"><div style="height:${Math.max(3,sp/max*135)}px"></div><figcaption>${number(sp)}</figcaption></figure>`).join(''):'<p>Seus lançamentos vão aparecer aqui.</p>';
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
  $('savedHistory').innerHTML=sessions.length?sessions.map(s=>`<details data-session="${esc(s.id)}"><summary><span>${esc(date(s.startedAt))}</span><span>${number(s.launchCount)} lançamentos</span><b>Média ${number(s.averageSp)} · Recorde ${number(s.bestSp)} SP</b></summary><p class="bp-note">${esc(s.device.name)} · ${s.endedAt?'Encerrada '+esc(date(s.endedAt)):'Sessão iniciada '+esc(date(s.startedAt))}</p><ol class="bp-history">${s.launches.slice(0,30).map(historyRow).join('')}</ol>${s.launchCount>30?`<button class="btn" data-more-session="${esc(s.id)}" data-page="1" data-local="${s.local?'true':'false'}">Mais lançamentos</button>`:''}</details>`).join(''):'<p class="bp-empty">Seu histórico começa no primeiro lançamento.</p>';
  $('pageNumber').textContent=pages>1?`${page} / ${pages}`:'';
  $('previousPage').hidden=page<=1;$('nextPage').hidden=page>=pages;
  if(!demo) $('bestSp').textContent=number(personalBest||null);
}

async function ranking(sort='best') {
  $('rankBest').setAttribute('aria-pressed',sort==='best');$('rankAverage').setAttribute('aria-pressed',sort==='average');
  $('rankingList').textContent='Carregando ranking…';
  try {
    const data=await request('/api/battle-pass/ranking?sort='+sort);
    $('rankingList').innerHTML=data.entries.length?data.entries.map(r=>`<div class="bp-rank-row"><span>${r.place}º</span><a href="/u/${esc(r.user.slug)}"><img src="${esc(r.user.avatarUrl||'/assets/profiles/default-blader.png')}" alt="" loading="lazy"><strong>${esc(r.user.name)}</strong></a><div><b>${number(r.best)}</b><small>RECORDE SP</small></div><div><b>${number(r.average)}</b><small>MÉDIA · ${number(r.count)}</small></div></div>`).join(''):'<p class="bp-empty">O primeiro lugar está em aberto.<br>Registre 10 lançamentos e ative o compartilhamento em Registros.</p>';
  } catch {$('rankingList').textContent='Não foi possível carregar o ranking. Tente novamente quando a conexão voltar.';}
}

document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{
  document.querySelectorAll('[data-tab]').forEach(b=>b.toggleAttribute('aria-current',b===button));
  button.setAttribute('aria-current','page');
  document.querySelectorAll('[data-view]').forEach(view=>view.hidden=view.dataset.view!==button.dataset.tab);
  if(button.dataset.tab==='records') savedSessions().catch(error=>notice(error.message));
  if(button.dataset.tab==='ranking') ranking();
});
$('connectBtn').onclick=()=>{
  if(!initialized) return;
  leaveDemo();notice();protocol.reset();rows=[];visibleRows=20;$('record').textContent='';renderTraining();
  current={id:crypto.randomUUID(),startedAt:new Date().toISOString(),endedAt:null,tracker:new BattlePassSession()};
  transport.connect().catch(error=>notice(error.message));
};
$('disconnectBtn').onclick=$('endBtn').onclick=()=>transport.disconnect();
$('readBtn').onclick=async()=>{
  $('readBtn').disabled=true;
  try {await transport.readHistory();} catch(error){notice(error.message);}
  finally {$('readBtn').disabled=false;}
};
$('moreCurrent').onclick=()=>{visibleRows+=20;renderTraining();};
$('previousPage').onclick=()=>{page--;savedSessions().catch(error=>notice(error.message));};
$('nextPage').onclick=()=>{page++;savedSessions().catch(error=>notice(error.message));};
$('savedHistory').onclick=async event=>{
  const button=event.target.closest('[data-more-session]');if(!button) return;
  button.disabled=true;
  try {
    const next=Number(button.dataset.page)+1,id=button.dataset.moreSession;
    let data;
    if(button.dataset.local==='true') {
      const session=(await store.read()).sessions.find(s=>s.id===id);
      data={launches:session.launches.slice().reverse().slice((next-1)*30,next*30),pages:Math.ceil(session.launches.length/30)};
    } else data=await request('/api/battle-pass/sessions/'+encodeURIComponent(id)+'?page='+next);
    button.previousElementSibling.insertAdjacentHTML('beforeend',data.launches.map(historyRow).join(''));
    button.dataset.page=next;button.hidden=next>=data.pages;
  } catch(error){notice(error.message);} finally {button.disabled=false;}
};
$('publicStats').onchange=async()=>{
  const checkbox=$('publicStats');checkbox.disabled=true;
  try {await request('/api/battle-pass/preferences',{method:'PATCH',body:{accountId:account.id,public:checkbox.checked}});}
  catch(error){checkbox.checked=!checkbox.checked;notice(error.message);}finally{checkbox.disabled=false;}
};
$('rankBest').onclick=()=>ranking('best');$('rankAverage').onclick=()=>ranking('average');

function leaveDemo() {
  if(!demo) return;
  clearInterval(demoTimer);demo=false;demoRows=[];$('demoBtn').textContent='Experimentar demonstração';
  $('record').textContent='';$('saveState').textContent='';notice();connection('disconnected');renderTraining();
  beyState('offline','Pronto para conectar');
}
$('demoBtn').onclick=()=>{
  if(demo) {leaveDemo();return;}
  if(transport.device?.gatt?.connected) transport.disconnect();
  demo=true;demoRows=[];connection('demo');
  $('demoBtn').textContent='Sair da demonstração';
  notice('Demonstração · dados simulados. Estes lançamentos não são salvos nem enviados ao perfil ou ranking.');
  $('saveState').textContent='Simulação · sem sincronização';
  let count=0;
  const tick=()=>{
    const sp=[4230,5184,4970,5682,5301,6128,5810,5543][count%8];
    demoRows.push({sp,counter:++count,source:'live',measuredAt:new Date().toISOString()});
    if(demoRows.length>50) demoRows.shift();
    beyState('launched','Lançamento simulado');renderTraining();flash();
  };
  tick();demoTimer=setInterval(tick,2400);
};
$('diagnostic').ontoggle=()=>{if($('diagnostic').open) $('packetLog').textContent=packets.join('\n');};
if(new URLSearchParams(location.search).has('diagnostico')) $('diagnostic').open=true;
$('clearLog').onclick=()=>{packets.length=0;$('packetLog').textContent='';};
$('downloadLog').onclick=()=>{
  const url=URL.createObjectURL(new Blob([packets.join('\n')],{type:'text/plain'})),link=document.createElement('a');
  link.href=url;link.download='bx09-diagnostico.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
window.addEventListener('online',()=>{sync?.flush();savedSessions().catch(()=>{});});
window.addEventListener('pagehide',()=>{clearInterval(demoTimer);transport.disconnect();});
$('iosHelp').hidden=!support.ios;
$('compatibility').textContent=support.supported?'Bluetooth disponível neste navegador.':support.reason;
connection('disconnected');

try {
  account=await BX.me();
  let owner=account?.id;
  if(!owner) {owner=localStorage.getItem('bx-battle-pass-guest')||'guest-'+crypto.randomUUID();localStorage.setItem('bx-battle-pass-guest',owner);}
  store=new BattlePassStore(owner);await store.read();
  sync=new BattlePassSync(store,{request,authenticated:!!account,onStatus:(state,detail)=>{
    if(!demo) $('saveState').textContent={syncing:'Sincronizando…',pending:'Salvo no navegador · sincronização pendente',blocked:'Salvo no navegador · confira o aviso',saved:'Salvo na sua conta'}[state];
    if(state==='blocked') notice(detail);
    if(state==='saved') {clearTimeout(savedRefresh);savedRefresh=setTimeout(()=>savedSessions().catch(()=>{}),500);}
  }});
  await savedSessions();initialized=true;connection(demo?'demo':'disconnected');sync.flush();
} catch(error) {
  notice('Não foi possível preparar o salvamento: '+error.message+' Recarregue a página para tentar novamente.');
  connection('disconnected');
}
