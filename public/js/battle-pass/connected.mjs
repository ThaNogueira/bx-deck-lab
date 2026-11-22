import {joinCaptureHost} from './capture-navigation.mjs';

export const captureClientId=crypto.randomUUID();
export function captureDeviceName() {
  const ua=navigator.userAgent;if(/iPhone|iPod/.test(ua))return 'iPhone';
  if(/iPad/.test(ua) || navigator.platform==='MacIntel' && navigator.maxTouchPoints>1)return 'iPad';
  if(/Android/i.test(ua))return 'Android';if(/Macintosh|Mac OS X/.test(ua))return 'Mac';return 'PC';
}
let singleton;
const num=value=>Math.round(value??0).toLocaleString('pt-BR');
const bell='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
const openPath=id=>'/battle-pass?session='+encodeURIComponent(id);
function installation() {try{let value=localStorage.getItem('bx-push-installation');if(!value){value=crypto.randomUUID();localStorage.setItem('bx-push-installation',value);}return value;}catch{return captureClientId;}}
export function pushSupport() {
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform==='MacIntel' && navigator.maxTouchPoints>1;
  const installed=matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
  return {ios,installed,supported:isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && (!ios || installed)};
}
export function initConnected() {
  return singleton??=createConnected().catch(()=>null);
}
async function createConnected() {
  if(joinCaptureHost())return null;
  if(!document.querySelector('link[href="/ui/battle-pass-connected.css"]')){const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href='/ui/battle-pass-connected.css';document.head.appendChild(stylesheet);}
  let manifest=document.querySelector('link[rel=manifest]');if(!manifest){manifest=document.createElement('link');manifest.rel='manifest';manifest.href='/manifest.webmanifest';document.head.appendChild(manifest);}
  const account=await BX.me();
  const api=(url,{method='GET',body}={})=>BX.api(url,{method,...(body?{body:{accountId:account?.id,...body}}:{})});
  const support=pushSupport(),installationId=installation(),sessions=new Map(),seen=new Set();
  let ownId=null,selected=null,source,dialog,dock,toast,timer,config,pushBusy=false,enabled=false,pulse,wake,wakeWanted=false,alive=true,poll;
  function status(session) {return session.endedAt?'Encerrada':session.lastSeenAt && Date.now()-Date.parse(session.lastSeenAt)<60000?'Ao vivo':'Sem sinal de captura';}
  function image(session) {return session.blade?.image?`<img src="${BX.esc(session.blade.image)}" alt="" referrerpolicy="no-referrer">`:'<span class="bp-connected-empty" aria-hidden="true"></span>';}
  async function bindWorker(userId) {
    if(!('serviceWorker' in navigator))return;
    try{const reg=await navigator.serviceWorker.getRegistration();(reg?.active??navigator.serviceWorker.controller)?.postMessage({type:'bp-push-account',userId});}catch{}
  }
  function drawDock() {
    const rows=[...sessions.values()].filter(s=>!s.endedAt),own=rows.find(s=>s.id===ownId),session=own??rows[0];
    if(!session || !BX.captureHost?.away && location.pathname.replace(/\/$/,'')==='/battle-pass' && (own || !document.getElementById('bpRemoteStatus')?.hidden && document.querySelector('[data-view="training"]')?.hidden===false)){dock?.remove();return;}
    if(!dock){dock=document.createElement('aside');dock.className='bp-connected-dock';dock.setAttribute('aria-label','Sessão do Battle Pass');}
    dock.innerHTML=`<button type="button" data-open-live>${image(session)}<span><small><i class="${status(session)==='Ao vivo'?'is-live':''}"></i>${BX.esc(status(session))} · ${BX.esc(session.deviceName)}</small><b>${session.lastSp==null?'Battle Pass':num(session.lastSp)+' SP'}</b></span></button><button type="button" class="bp-connected-icon" data-open-push aria-label="Notificações">${bell}</button>`;
    dock.querySelector('[data-open-live]').onclick=()=>{if(session.id===ownId && BX.captureHost?.away)BX.captureHost.restore();else openSession(session.id);};
    dock.querySelector('[data-open-push]').onclick=openSettings;document.body.appendChild(dock);
  }
  function createDialog() {
    if(dialog)return;dialog=document.createElement('dialog');dialog.className='bp-connected-dialog';
    dialog.innerHTML='<div class="bp-connected-head"><h2></h2><button type="button" aria-label="Fechar">×</button></div><div class="bp-connected-content"></div>';
    dialog.querySelector('.bp-connected-head button').onclick=()=>dialog.close();
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom)dialog.close();}});
    document.body.appendChild(dialog);
  }
  async function openSession(id) {
    if(!account){BX.toast('Entre na mesma conta para acompanhar a sessão.');return;}
    if(id===ownId && BX.captureHost?.active){if(BX.captureHost.away)BX.captureHost.restore();else document.querySelector('[data-tab="training"]')?.click();return;}
    if(!document.getElementById('bpRemoteStatus')){location.assign(openPath(id));return;}
    selected=id;
    if(!sessions.has(id))try{const data=await api('/api/battle-pass/connected/sessions/'+encodeURIComponent(id));sessions.set(id,data.session);}catch{BX.toast('Sessão não encontrada nesta conta.');return;}
    window.dispatchEvent(new CustomEvent('bp-remote-select',{detail:sessions.get(id)}));
    history.replaceState(history.state,'',openPath(id));
    drawDock();
  }
  function showLaunch(event) {
    const s=event.session;
    if(document.hidden || s.id===ownId && !BX.captureHost?.away || selected===s.id && document.querySelector('[data-view="training"]')?.hidden===false)return;
    if(!toast){toast=document.createElement('aside');toast.className='bp-connected-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');}
    toast.innerHTML=`<button type="button">${image(s)}<span><small>Último lançamento</small><b>${num(s.lastSp)}<em>SP</em></b>${s.blade?.name?`<small>${BX.esc(s.blade.name)}</small>`:''}</span></button>`;
    toast.dataset.tone=s.lastSp>=15000?'red':s.lastSp>=12000?'orange':s.lastSp>=11000?'green':'blue';
    toast.querySelector('button').onclick=()=>{openSession(s.id);toast.remove();};document.body.appendChild(toast);clearTimeout(timer);timer=setTimeout(()=>toast.remove(),4500);
  }
  function accept(event) {
    if(event.type==='hello'){sessions.clear();for(const session of event.sessions)sessions.set(session.id,session);}
    if(event.session){sessions.set(event.session.id,event.session);if(event.type==='launch' && !seen.has(event.eventId)){seen.add(event.eventId);if(seen.size>200)seen.delete(seen.values().next().value);showLaunch(event);}}
    drawDock();window.dispatchEvent(new CustomEvent('bp-session-update',{detail:[...sessions.values()]}));
  }
  async function refresh() {if(!account || !alive)return;try{const data=await api('/api/battle-pass/connected');accept({type:'hello',sessions:data.sessions});}catch{}}
  function connectEvents() {
    if(!account || !alive || !('EventSource' in window))return;
    source?.close();source=new EventSource('/api/battle-pass/connected/events');
    source.onmessage=event=>{try{accept(JSON.parse(event.data));}catch{}};
  }
  async function getPush() {
    if(!account)return;
    try{config=await api('/api/battle-pass/push?installationId='+encodeURIComponent(installationId));enabled=config.enabled;}
    catch{config=null;enabled=false;}
  }
  function settingText() {
    if(!account)return 'Entre na sua conta para ativar.';
    if(support.ios && !support.installed)return 'No Safari: Compartilhar → Adicionar à Tela de Início. Abra o ícone e entre na mesma conta.';
    if(!support.supported)return 'Este navegador não oferece push. Os avisos dentro do site continuam disponíveis.';
    if(Notification.permission==='denied')return 'Notificações bloqueadas. Libere nas configurações deste site.';
    return enabled?'Avisos do último lançamento neste aparelho.':'Receba o último lançamento mesmo fora do site.';
  }
  function drawSettings(message='') {
    createDialog();dialog.querySelector('h2').textContent='Notificações';
    const body=dialog.querySelector('.bp-connected-content');body.innerHTML=`<p class="bp-connected-help">${BX.esc(message||settingText())}</p><button type="button" class="bp-connected-primary" data-toggle-push ${pushBusy || !account || !support.supported || !enabled && Notification.permission==='denied'?'disabled':''}>${bell}${pushBusy?'Aguarde…':enabled?'Desativar neste aparelho':'Ativar neste aparelho'}</button>${enabled?'<button type="button" class="bp-connected-secondary" data-push-test>Enviar teste</button>':''}<p class="bp-connected-note">No iPhone, a captura usa o Bluefy. Se o sistema suspender o navegador, novos lançamentos deixam de chegar até reconectar.</p>`;
    body.querySelector('[data-toggle-push]').onclick=()=>enabled?disablePush().then(()=>drawSettings()).catch(()=>drawSettings('Não foi possível desativar. Tente novamente.')):enablePush();
    body.querySelector('[data-push-test]')?.addEventListener('click',async()=>{try{await api('/api/battle-pass/push/test',{method:'POST',body:{}});drawSettings('Teste enviado. Confira as notificações do aparelho.');}catch{drawSettings('Não foi possível enviar o teste.');}});
  }
  async function openSettings() {createDialog();if(!dialog.open)dialog.showModal();drawSettings();await getPush();drawSettings();}
  async function enablePush() {
    if(pushBusy || !support.supported || !account)return;
    pushBusy=true;
    // Request immediately from the tap; no network await may consume the gesture on iOS.
    const permission=Notification.requestPermission();drawSettings();
    try {
      if(await permission!=='granted')throw new Error('Autorize as notificações para ativar.');
      await getPush();if(!config)throw new Error('Sem conexão. Tente novamente.');
      const registration=await navigator.serviceWorker.register('/sw.js');
      const pending=registration.installing??registration.waiting;
      if(pending && pending.state!=='activated')await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error('Atualizando as notificações. Tente novamente em instantes.')),8000);
        const check=()=>{if(pending.state==='activated'){clearTimeout(timeout);resolve();}else if(pending.state==='redundant'){clearTimeout(timeout);reject(new Error('Não foi possível atualizar as notificações. Tente novamente.'));}};
        pending.addEventListener('statechange',check);check();
      });
      const reg=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Não foi possível preparar as notificações. Tente novamente.')),8000))]),key=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
      let sub=await reg.pushManager.getSubscription();
      if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
      await api('/api/battle-pass/push',{method:'POST',body:{installationId,subscription:sub.toJSON()}});enabled=true;await bindWorker(account.id);
      pushBusy=false;drawSettings();
    }catch(error){pushBusy=false;drawSettings(error.message||'Não foi possível ativar as notificações.');}
  }
  async function disablePush() {
    if(account)await api('/api/battle-pass/push',{method:'DELETE',body:{installationId}});
    if('serviceWorker' in navigator){const reg=await navigator.serviceWorker.getRegistration();const sub=await reg?.pushManager?.getSubscription();await sub?.unsubscribe();}
    enabled=false;await bindWorker(null);
  }
  async function keepAwake(value) {
    wakeWanted=value;
    if(!value){await wake?.release();wake=null;return false;}
    if(navigator.wakeLock && document.visibilityState==='visible')try{wake=await navigator.wakeLock.request('screen');return true;}catch{}
    return false;
  }
  const client={account,captureClientId,openSettings,openSession,disablePush,keepAwake,updateView:drawDock,
    endCapture(value){if(value && account && navigator.sendBeacon)navigator.sendBeacon('/api/battle-pass/connected/presence',new Blob([JSON.stringify({accountId:account.id,...value,ended:true})],{type:'application/json'}));},
    setCapture(id){ownId=id;if(id)selected=null;drawDock();},
    capture(getCapture){pulse=async()=>{const value=getCapture();if(!value || !account)return;try{await api('/api/battle-pass/connected/presence',{method:'POST',body:value});}catch{}};},
    pulse(){return pulse?.();},
    get sessions(){return [...sessions.values()];},
    async logout(){alive=false;source?.close();clearInterval(poll);await disablePush().catch(()=>{});await bindWorker(null);},
  };
  BX.connected=client;
  window.addEventListener('bp-capture-view',drawDock);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){refresh();pulse?.();if(wakeWanted)keepAwake(true);}});
  window.addEventListener('online',()=>{refresh();pulse?.();});
  navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='bp-open-session'){if(event.data.sessionId)openSession(event.data.sessionId);else openSettings();}else if(event.data?.type==='bp-worker-ready')bindWorker(enabled?account?.id:null);});
  window.addEventListener('pagehide',()=>{source?.close();clearInterval(poll);wake?.release().catch(()=>{});});
  window.addEventListener('pageshow',event=>{if(event.persisted){alive=true;connectEvents();refresh();startPoll();}});
  const startPoll=()=>{clearInterval(poll);poll=setInterval(()=>{pulse?.();drawDock();window.dispatchEvent(new CustomEvent('bp-session-update',{detail:[...sessions.values()]}));if(!source || source.readyState===2)refresh();},15000);};
  if(account){connectEvents();refresh();startPoll();if(support.supported)getPush().then(()=>bindWorker(enabled?account.id:null));}
  const requested=new URL(location.href).searchParams.get('session');if(requested)openSession(requested);
  return client;
}
