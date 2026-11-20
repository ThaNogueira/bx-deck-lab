import {summarizeSession,formatDuration} from './session-stats.mjs';
import {renderLaunchChart} from './chart.mjs';
import {shareSession} from './session-share.mjs';
import {levelColor} from './mission-rules.mjs';
const number=value=>value==null?'—':Math.round(value).toLocaleString('pt-BR');
const date=value=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
const day=value=>new Date(value).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'short'});
const percent=value=>value==null?'—':(value>0?'+':'')+value.toFixed(1).replace('.',',')+'%';
export class SessionHistory {
  constructor(root,{request,getAccount,getStore,getLevel}) {
    Object.assign(this,{root,request,getAccount,getStore,getLevel});this.entries=new Map();
    this.resize=new ResizeObserver(entries=>{for(const {target,contentRect} of entries){const state=this.entries.get(target.dataset.session);if(state?.data && contentRect.width>0 && Math.round(contentRect.width)!==state.width){state.width=Math.round(contentRect.width);const chart=target.querySelector('.bp-session-chart');if(chart)renderLaunchChart(chart,state.data.launches.map(r=>r.sp));}}});
  }
  render(sessions) {
    if(!sessions.length){for(const entry of this.entries.values())this.resize.unobserve(entry.element);this.entries.clear();this.root.innerHTML='<p class="bp-empty">Seu histórico começa no primeiro lançamento.</p>';return;}
    this.root.querySelector(':scope>.bp-empty')?.remove();
    const ids=new Set(sessions.map(s=>s.id));
    for(const [id,entry] of this.entries)if(!ids.has(id)){this.resize.unobserve(entry.element);entry.element.remove();this.entries.delete(id);}
    for(const row of sessions){
      let entry=this.entries.get(row.id);
      if(!entry){const element=document.createElement('details');element.dataset.session=row.id;element.className='bp-session-entry';element.innerHTML='<summary></summary><div class="bp-session-body"></div>';
        entry={element};this.entries.set(row.id,entry);this.resize.observe(element);
        element.addEventListener('toggle',()=>{if(element.open && !entry.loading && !entry.data)this.load(entry);});}
      entry.row=row;
      const local=row.local?summarizeSession(row,row.launches).stats:null;
      const liveCount=local?.liveCount??row.liveCount??0,displayCount=liveCount||row.launchCount;
      const displayBest=liveCount?(local?.best??row.liveBestSp):row.bestSp,displayAverage=liveCount?(local?.average??row.liveAverageSp):row.averageSp;
      const signature=JSON.stringify([row.launchCount,row.bestSp,row.averageSp,row.endedAt]);
      if(entry.signature!==signature){entry.signature=signature;entry.element.querySelector('summary').innerHTML=`<span><b>${BX.esc(date(row.startedAt))}</b><small>${number(displayCount)} ${liveCount?(displayCount===1?'lançamento':'lançamentos'):(displayCount===1?'registro importado':'registros importados')}</small></span><span class="bp-session-mini"><small>Máximo</small><b>${number(displayBest)} SP</b></span><span class="bp-session-mini"><small>Média</small><b>${number(displayAverage)} SP</b></span>`;entry.data=null;if(entry.element.open)this.load(entry);}
      this.root.appendChild(entry.element);
    }
  }
  async local(row) {
    const stored=await this.getStore().read(),session=stored.sessions.find(s=>s.id===row.id);if(!session)throw new Error('Esta sessão não está disponível neste aparelho.');
    const previous=stored.sessions.filter(s=>s.id!==session.id && Date.parse(s.startedAt)<Date.parse(session.startedAt)).sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt)).slice(0,5)
      .map(s=>({id:s.id,startedAt:s.startedAt,...summarizeSession(s,s.launches).stats}));
    return {...summarizeSession(session,session.launches,previous),user:{name:this.getAccount()?.name??'Blader convidado',avatarUrl:this.getAccount()?.avatarUrl,level:this.getLevel()??1},
      record:{isNew:false},progression:{tracked:false,xp:0,missions:0,levels:[],rewards:[],events:[]}};
  }
  async load(entry) {
    if(entry.loading)return;entry.loading=true;
    const body=entry.element.querySelector('.bp-session-body'),signature=entry.signature;body.innerHTML='<p class="bp-empty">Carregando sessão…</p>';
    try {
      let data;
      if(entry.row.local)data=await this.local(entry.row);
      else {try{data=await this.request('/api/battle-pass/sessions/'+encodeURIComponent(entry.row.id)+'/overview');}catch(error){if(error.status)throw error;data=await this.local(entry.row);}}
      if(signature!==entry.signature){entry.loading=false;return await this.load(entry);}
      entry.data=data;this.draw(entry);
    }catch(error){body.innerHTML=`<p class="bp-empty">${BX.esc(error.message)}</p><button class="btn" data-retry-session>Tentar novamente</button>`;body.querySelector('button').onclick=()=>this.load(entry);}
    finally{entry.loading=false;}
  }
  draw(entry) {
    const data=entry.data,body=entry.element.querySelector('.bp-session-body'),s=data.stats,p=data.progression,known=p.tracked||p.events.length||p.rewards.length;
    const change=data.comparison.change,comparison=change==null?'Sem treino anterior para comparar':`${percent(change)} na média vs. ${data.comparison.sessionCount} ${data.comparison.sessionCount===1?'treino anterior':'treinos anteriores'}`;
    const bars=[...data.comparison.sessions,{id:data.session.id,startedAt:data.session.startedAt,average:s.average}],max=Math.max(1,...bars.map(b=>b.average));
    const cadence={daily:'Diária',weekly:'Semanal',monthly:'Mensal'};
    const logs=[...p.rewards.map(r=>({at:r.at,title:r.title,detail:r.description||cadence[r.cadence],value:'+'+number(r.xp)+' XP'})),
      ...p.events.filter(e=>e.toLevel>e.fromLevel).map(e=>({at:e.at,title:e.toLevel===e.fromLevel+1?'Nível '+e.toLevel:`Níveis ${e.fromLevel+1} a ${e.toLevel}`,detail:'Evolução',value:'↑'}))].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    body.innerHTML=`<div class="bp-session-person"><img src="${BX.esc(data.user.avatarUrl||'/assets/profiles/default-blader.png')}" alt=""><div><b>${BX.esc(data.user.name)}</b><span style="color:${levelColor(data.user.level)}">Nível ${data.user.level}</span></div><button class="btn" data-share-session>Compartilhar resumo ↗</button></div>
      <div class="bp-session-meta"><time>${BX.esc(date(data.session.startedAt))}${data.session.endedAt?' — '+BX.esc(new Date(data.session.endedAt).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})):''}</time>${s.importedCount?`<span>${number(s.importedCount)} ${s.importedCount===1?'importado':'importados'}</span>`:''}</div>
      <div class="bp-session-metrics">${[['Máximo',s.best,'SP'],['Média',s.average,'SP'],[s.source==='live'?'Lançamentos ao vivo':'Registros',s.count,''],[data.session.durationExact?'Duração':'Até o último lançamento',formatDuration(data.session.durationMs),'']].map(([label,value,unit])=>`<article><span>${label}</span><b>${typeof value==='number'?number(value):value}<small>${unit}</small></b></article>`).join('')}</div>
      <div class="bp-session-highlights"><span data-direction="${change==null?'neutral':change>=0?'up':'down'}">${BX.esc(comparison)}</span>${data.record?.isNew?`<b>Novo recorde · +${number(s.best-data.record.previousBest)} SP</b>`:''}</div>
      <div class="bp-session-progress">${[['XP registrado',known?'+'+number(p.xp):'—'],['Missões concluídas',known?number(p.missions):'—'],['Níveis ganhos',known?'+'+number(p.levels.length):'—']].map(([label,value])=>`<article><span>${label}</span><b>${value}</b></article>`).join('')}</div>
      ${!p.tracked?'<p class="bp-session-note">Os ganhos de XP por sessão passaram a ser registrados nesta atualização.</p>':''}
      <h3>Evolução dos lançamentos</h3><div class="bp-chart bp-session-chart"></div>
      ${data.comparison.sessionCount?`<h3>Média por sessão</h3><div class="bp-session-comparison">${bars.map(b=>`<button type="button" data-compare-session="${BX.esc(b.id)}" ${b.id===data.session.id || !this.entries.has(b.id)?'disabled':''} title="${BX.esc(date(b.startedAt))}: ${number(b.average)} SP"><b>${number(b.average)}</b><span style="--bar-height:${Math.max(3,b.average/max*115)}px" ${b.id===data.session.id?'class="is-current"':''}></span><small>${b.id===data.session.id?'Esta sessão':BX.esc(day(b.startedAt))}</small></button>`).join('')}</div>`:''}
      <details class="bp-session-more"><summary>Mais dados</summary><div class="bp-session-metrics">${[['Menor SP',number(s.minimum)],['Mediana',number(s.median)],['Variação',s.variation==null?'—':s.variation.toFixed(1).replace('.',',')+'%'],['Do começo ao fim',percent(s.withinChange)]].map(([label,value])=>`<article><span>${label}</span><b>${value}</b></article>`).join('')}</div></details>
      <details class="bp-session-log"><summary>Conquistas e evolução (${logs.length})</summary>${logs.length?`<ol>${logs.map(log=>`<li><span><b>${BX.esc(log.title)}</b><small>${BX.esc(log.detail)} · ${BX.esc(date(log.at))}</small></span><strong>${BX.esc(log.value)}</strong></li>`).join('')}</ol>`:'<p class="bp-session-note">Nenhuma conquista registrada nesta sessão.</p>'}</details>
      <details class="bp-session-launches"><summary>Lançamentos (${number(s.count)})</summary><ol></ol><button class="btn" data-more-launches hidden>Ver mais</button></details>`;
    renderLaunchChart(body.querySelector('.bp-session-chart'),data.launches.map(r=>r.sp));
    body.querySelector('[data-share-session]').onclick=()=>shareSession(data);
    let shown=0;
    const appendLaunches=()=>{const next=data.launches.slice(shown,shown+50);body.querySelector('.bp-session-launches ol').insertAdjacentHTML('beforeend',next.map((r,i)=>`<li><span>#${shown+i+1}${r.measuredAt?' · '+BX.esc(new Date(r.measuredAt).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})):''}</span><b>${number(r.sp)} SP</b></li>`).join(''));shown+=next.length;body.querySelector('[data-more-launches]').hidden=shown>=data.launches.length;};
    body.querySelector('.bp-session-launches').ontoggle=event=>{if(event.target.open && !shown)appendLaunches();};body.querySelector('[data-more-launches]').onclick=appendLaunches;
    body.querySelectorAll('[data-compare-session]:not(:disabled)').forEach(button=>button.onclick=()=>{const other=this.entries.get(button.dataset.compareSession);if(other){other.element.open=true;other.element.scrollIntoView({behavior:'smooth',block:'start'});}});
  }
}
