import {levelColor} from './mission-rules.mjs';

const labels={daily:'Diárias',weekly:'Semanais',monthly:'Mensais'};
const names={daily:'Faíscas',weekly:'Órbitas',monthly:'Núcleos'};
const icon=(type,size=36)=>`<svg class="mm-insignia mm-${type}" width="${size}" height="${size}" aria-hidden="true"><use href="/assets/battle-pass/insignias.svg#${type}"></use></svg>`;
const number=value=>Math.round(value||0).toLocaleString('pt-BR');
export class BattlePassMissions {
  constructor(view,request) {
    this.view=view;this.request=request;this.cadence='daily';this.queue=[];this.seen=new Set();this.sound=true;
    view.innerHTML='<p class="bp-empty">Carregando missões…</p>';
    view.onclick=event=>{
      const period=event.target.closest('[data-mission-period]');
      if(period){this.cadence=period.dataset.missionPeriod;this.render();return;}
      if(event.target.closest('[data-mission-login]')){BX.requireLogin('/battle-pass');return;}
      if(event.target.closest('[data-mission-sound]')){
        this.sound=!this.sound;try{localStorage.setItem('bx-missions-sound',String(this.sound));}catch{}
        if(this.sound)this.unlock();this.render();
      }
    };
    this.unlock=()=>{
      if(!this.sound)return;
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)return;
      try {this.audio??=new Audio();if(this.audio.state!=='running')this.audio.resume().catch(()=>{});}catch{}
    };
    document.addEventListener('pointerdown',this.unlock,{passive:true});
    document.addEventListener('keydown',this.unlock,{passive:true});
    this.timer=setInterval(()=>{
      if(document.hidden)return;
      this.updateReset();
      this.load();
    },60000);
    window.addEventListener('online',()=>this.load());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){this.load();this.showNext();}});
  }
  initialize(account) {
    this.account=account;
    try {
      this.sound=localStorage.getItem('bx-missions-sound')!=='false';
      this.seen=new Set(JSON.parse(localStorage.getItem('bx-missions-seen:'+account?.id)||'[]'));
      this.lastLevel=Number(localStorage.getItem('bx-missions-level:'+account?.id)||1);
    }catch {this.lastLevel=1;}
    this.load();
  }
  async load() {
    if(this.loading){this.reload=true;return;}
    if(!this.account){this.view.innerHTML='<div class="mm-guest"><svg width="58" height="58" aria-hidden="true"><use href="/assets/battle-pass/insignias.svg#level"></use></svg><h2>Seu próximo nível começa no treino</h2><button class="btn primary" data-mission-login>Entrar para participar</button></div>';return;}
    this.loading=true;
    try {
      const data=await this.request('/api/battle-pass/missions');
      if(data.userId!==this.account.id)return;
      if(data.totalXp<(this.state?.totalXp??0))return;
      this.state=data;this.offset=Date.parse(data.now)-Date.now();this.render();this.achievements(data);
    }catch {
      if(!this.state)this.view.innerHTML='<p class="bp-empty">As missões voltam quando sua conexão retornar. Seus lançamentos continuam salvos.</p>';
    }finally{this.loading=false;if(this.reload){this.reload=false;this.refreshSoon(0);}}
  }
  receive(data) {
    if(data.userId!==this.account?.id)return;
    this.state={...this.state,...data};
    if(this.state.periods)this.render();
    this.achievements(data);
    this.refreshSoon();
  }
  refreshSoon(delay=150) {clearTimeout(this.refresh);this.refresh=setTimeout(()=>this.load(),delay);}
  render() {
    const data=this.state;if(!data?.periods)return;
    const period=data.periods.find(p=>p.cadence===this.cadence),done=period.missions.filter(m=>m.done).length;
    const tier=data.level===100?5:Math.floor((data.level-1)/20),color=levelColor(data.level);
    const previousLevel=Number(this.view.querySelector('.mm-progress')?.dataset.level);
    const old=previousLevel===data.level?(this.view.querySelector('.mm-xp-fill')?.style.width??'0%'):'0%';
    this.view.innerHTML=`<div class="mm-progress" style="--level-color:${color};--level-glow:${7+data.level*.2}px" data-level="${data.level}" data-tier="${tier}">
      <div class="mm-level-badge">${icon('level',110)}<span><small>NV.</small><b>${data.level}</b></span></div>
      <div class="mm-progress-info"><div class="mm-progress-title"><h2>${data.level===100?'Nível máximo':'Próximo nível'}</h2><button type="button" data-mission-sound aria-label="Som de conquistas" aria-pressed="${this.sound}" title="${this.sound?'Desativar':'Ativar'} som"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4Z"/>${this.sound?'<path d="M17 8q5 4 0 8M19 5q8 7 0 14"/>':'<path d="m17 9 5 6m0-6-5 6"/>'}</svg></button></div><div class="mm-xp-track" role="progressbar" aria-label="XP do nível ${data.level}" aria-valuemin="0" aria-valuemax="${data.next||100}" aria-valuenow="${data.level===100?100:data.xp}"><span class="mm-xp-fill" style="width:${old}"></span></div><div class="mm-xp-label"><span>${data.level===100?'MAX':number(data.xp)+' / '+number(data.next)+' XP'}</span><span>${number(data.completed)} ${data.completed===1?'concluída':'concluídas'}</span></div></div>
      <div class="mm-wallet">${icon('monthly',38)}<span><b>${number(data.insignias)}</b><small>Insígnias</small></span></div>
    </div>
    <div class="mm-period-head"><div class="mm-periods" role="group" aria-label="Período das missões">${Object.entries(labels).map(([key,label])=>`<button data-mission-period="${key}" aria-pressed="${key===this.cadence}">${label}</button>`).join('')}</div><span class="mm-reset"></span></div>
    <div class="mm-section-label"><span>${done} / ${period.missions.length} concluídas</span></div>
    <div class="mm-mission-grid">${period.missions.map(m=>`<article class="mm-mission${m.done?' is-complete':''}" data-mission-id="${m.id}"><div class="mm-mission-symbol">${icon(m.cadence,40)}${m.done?'<span aria-label="Concluída">✓</span>':''}</div><div class="mm-mission-content"><h3>${BX.esc(m.title)}</h3><p${m.metric==='sets'?' title="Até 20% de diferença entre as forças de cada sequência de 3 lançamentos."':''}>${BX.esc(m.description)}</p><div class="mm-task-track" role="progressbar" aria-label="${BX.esc(m.title)}" aria-valuemin="0" aria-valuemax="${m.target}" aria-valuenow="${m.progress}"><span style="width:${m.progress/m.target*100}%"></span></div><div class="mm-mission-bottom"><small>${number(m.progress)} / ${number(m.target)}${m.metric==='sets'?' sequências':''}</small><span><b>+${number(m.xp)} XP</b> ${icon(m.cadence,16)} ${m.insignias}</span></div></div></article>`).join('')}</div>
    <div class="mm-collection"><span>Insígnias acumuladas</span><div>${Object.entries(names).map(([cadence,name])=>`<article>${icon(cadence,35)}<span><b>${number(data.collection?.find(c=>c.cadence===cadence)?.count??0)}</b><small>${name}</small></span></article>`).join('')}</div></div>`;
    requestAnimationFrame(()=>{const fill=this.view.querySelector('.mm-xp-fill');if(fill)fill.style.width=data.percent+'%';});
    this.updateReset();
  }
  updateReset() {
    const element=this.view.querySelector('.mm-reset'),period=this.state?.periods?.find(p=>p.cadence===this.cadence);if(!element || !period)return;
    const minutes=Math.max(0,Math.ceil((Date.parse(period.resetsAt)-Date.now()-(this.offset??0))/60000));
    const days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60);
    element.textContent='Renova em '+(days?days+'d '+hours+'h':hours?hours+'h '+minutes%60+'min':minutes+'min');
  }
  achievements(data) {
    for(const reward of data.rewards??[]) {
      if(this.seen.has(reward.id)){this.ack([reward.id]);continue;}
      if(!this.queue.some(r=>r.id===reward.id))this.queue.push(reward);
    }
    if(data.level>this.lastLevel) {
      this.queue.push({id:'level-'+data.level,level:data.level,title:'Nível '+data.level,cadence:'level'});
      this.lastLevel=data.level;
      try{localStorage.setItem('bx-missions-level:'+this.account.id,String(data.level));}catch{}
    }
    this.showNext();
  }
  ack(ids) {this.request('/api/battle-pass/missions/ack',{method:'POST',body:{accountId:this.account.id,ids}}).catch(()=>{});}
  showNext() {
    if(this.showing || !this.queue.length)return;
    if(document.hidden || document.querySelector('dialog[open]')){clearTimeout(this.wait);this.wait=setTimeout(()=>this.showNext(),1000);return;}
    const reward=this.queue.shift();
    try{this.seen=new Set(JSON.parse(localStorage.getItem('bx-missions-seen:'+this.account.id)||'[]'));}catch{}
    if(this.seen.has(reward.id)){this.showNext();return;}
    this.showing=true;this.seen.add(reward.id);
    try{localStorage.setItem('bx-missions-seen:'+this.account.id,JSON.stringify([...this.seen].slice(-500)));}catch{}
    const toast=document.createElement('aside');toast.className='mm-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');
    if(reward.level)toast.style.setProperty('--toast-accent',levelColor(reward.level));
    toast.innerHTML=`<span class="mm-toast-symbol">${icon(reward.cadence,43)}</span><span><small>${reward.level?'NOVO NÍVEL':'MISSÃO CONCLUÍDA'}</small><b>${BX.esc(reward.title)}</b>${reward.level?'':`<em>+${reward.xp} XP · +${reward.insignias} ${reward.insignias===1?'insígnia':'insígnias'}</em>`}</span>`;
    document.body.appendChild(toast);this.chime();
    if(!reward.level)this.ack([reward.id]);
    this.toastTimer=setTimeout(()=>{toast.remove();this.showing=false;this.showNext();},3800);
  }
  chime() {
    if(!this.sound || !this.audio || this.audio.state!=='running')return;
    const now=this.audio.currentTime;
    [523.25,659.25,783.99].forEach((frequency,i)=>{
      const oscillator=this.audio.createOscillator(),gain=this.audio.createGain(),start=now+i*.065;
      oscillator.type='sine';oscillator.frequency.value=frequency;
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.035,start+.015);gain.gain.exponentialRampToValueAtTime(.001,start+.24);
      oscillator.connect(gain);gain.connect(this.audio.destination);oscillator.start(start);oscillator.stop(start+.25);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    });
  }
}
