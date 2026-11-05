const clamp=(n,[min,max])=>Math.max(min,Math.min(max,n));

export function mountChampionPhotoEditor({root,state,renderer,byId,changed,enabled}){
  const stage=root.querySelector('.champion-stage'),canvas=stage.querySelector('canvas');
  stage.insertAdjacentHTML('beforeend',`<div class="champion-selection" hidden><button type="button" data-corner="nw" aria-label="Redimensionar pelo canto superior esquerdo"></button><button type="button" data-corner="ne" aria-label="Redimensionar pelo canto superior direito"></button><button type="button" data-corner="sw" aria-label="Redimensionar pelo canto inferior esquerdo"></button><button type="button" data-corner="se" aria-label="Redimensionar pelo canto inferior direito"></button></div>`);
  root.insertAdjacentHTML('afterbegin',`<div class="champion-preview-tools"><button type="button" data-photo-edit aria-pressed="true">Ajustar foto</button><button type="button" data-photo-center>Centralizar</button><button type="button" data-photo-expand>Ampliar</button></div>`);
  root.insertAdjacentHTML('beforeend',`<small class="champion-drag-hint">Arraste a foto · use os cantos para redimensionar</small>
    <details class="champion-look" open><summary>Cor e luz</summary><fieldset disabled>
      <label>Saturação<input data-photo-key="saturation" type="range" min="0.5" max="2.5" step="0.05" value="1.4"><output>140%</output></label>
      <label>Glow azul<input data-photo-key="glow" type="range" min="0" max="2" step="0.05" value="0.75"><output>75%</output></label>
      <label>Sombra<input data-photo-key="shadow" type="range" min="0" max="1.2" step="0.05" value="0.3"><output>30%</output></label>
    </fieldset></details>`);
  const selection=stage.querySelector('.champion-selection'),edit=root.querySelector('[data-photo-edit]'),expand=root.querySelector('[data-photo-expand]');
  let selected=true,gesture=null,expanded=false,previousOverflow='',previousFocus=null,liveReady=false,liveAppearance=null;
  const live=document.createElement('div');live.className='champion-live-layers';live.hidden=true;live.setAttribute('aria-hidden','true');
  const world=document.createElement('div');world.className='champion-live-world';
  const background=new Image();background.src='/assets/champion/template.png';
  const photo=document.createElement('canvas'),front=document.createElement('canvas');photo.className='champion-live-photo';front.className='champion-live-front';world.append(background,photo,front);live.append(world);stage.insertBefore(live,selection);
  const sizeObserver=new ResizeObserver(entries=>{world.style.transform=`scale(${entries[0].contentRect.width/1000})`;});sizeObserver.observe(stage);
  async function startLive(){
    const a=renderer.championPhotoLayer(state);if(!a)return;
    if(liveAppearance!==a){photo.width=a.layer.width;photo.height=a.layer.height;photo.style.width=photo.width+'px';photo.style.height=photo.height+'px';photo.getContext('2d').drawImage(a.layer,0,0);liveAppearance=a;}
    await Promise.all([background.decode(),renderer.renderChampion(front,{...state,portrait:null},byId,{size:1000,foregroundOnly:true})]);
    if(!gesture)return;liveReady=true;live.hidden=false;canvas.style.visibility='hidden';sync();
  }
  const sliders=[...root.querySelectorAll('[data-photo-key]')];
  const point=e=>{const b=canvas.getBoundingClientRect();return {x:(e.clientX-b.left)/b.width*1000,y:(e.clientY-b.top)/b.height*1000};};
  function sync(){
    const r=renderer.portraitBounds(state),active=!!r&&enabled();
    root.querySelector('.champion-look fieldset').disabled=!active;
    for(const button of root.querySelectorAll('[data-photo-edit],[data-photo-center],[data-corner]'))button.disabled=!active;
    edit.setAttribute('aria-pressed',String(selected));const editLabel=selected?'Concluir ajuste':'Ajustar foto';if(edit.textContent!==editLabel)edit.textContent=editLabel;
    selection.hidden=!active||!selected;stage.classList.toggle('is-editing',active&&selected);
    if(r){const x=Math.max(1,r.x),y=Math.max(1,r.y),right=Math.min(999,r.x+r.w),bottom=Math.min(849,r.y+r.h);selection.hidden=selection.hidden||right<=x||bottom<=y;selection.style.left=x/10+'%';selection.style.top=y/10+'%';selection.style.width=Math.max(0,right-x)/10+'%';selection.style.height=Math.max(0,bottom-y)/10+'%';}
    if(r&&liveAppearance){const a=liveAppearance;photo.style.transform=`translate(${r.x-a.pad/a.w*r.w}px,${r.y-a.pad/a.h*r.h}px) scale(${r.w/a.w})`;}
    for(const input of sliders){input.value=state[input.dataset.photoKey];const label=Math.round(Number(input.value)*100)+'%';if(input.nextElementSibling.value!==label)input.nextElementSibling.value=label;}
  }
  function apply(){for(const key of ['zoom','offsetX','offsetY'])state[key]=clamp(state[key],renderer.portraitLimits[key]);changed(true);sync();}
  sliders.forEach(input=>input.oninput=()=>{state[input.dataset.photoKey]=Number(input.value);changed(true);sync();});
  edit.onclick=()=>{selected=!selected;sync();};
  root.querySelector('[data-photo-center]').onclick=()=>{state.zoom=1;state.offsetX=state.offsetY=0;selected=true;apply();};
  function setExpanded(value){
    expanded=value;root.classList.toggle('is-expanded',value);expand.textContent=value?'Fechar editor':'Ampliar';expand.setAttribute('aria-expanded',String(value));
    if(value){previousOverflow=document.body.style.overflow;previousFocus=document.activeElement;document.body.style.overflow='hidden';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Editar foto do campeão');expand.focus();}
    else{document.body.style.overflow=previousOverflow;root.removeAttribute('role');root.removeAttribute('aria-modal');previousFocus?.focus?.();}
  }
  expand.onclick=()=>setExpanded(!expanded);
  stage.onpointerdown=async e=>{
    if(!enabled()||!state.portrait||e.button>0)return;
    const p=point(e),corner=e.target.closest('[data-corner]')?.dataset.corner,r=renderer.portraitBounds(state);
    // Capture immediately; alpha hit-testing can finish after the browser's pointerdown dispatch.
    stage.setPointerCapture(e.pointerId);
    if(!corner&&!await renderer.portraitHit(state,p.x,p.y)){selected=false;sync();return;}
    if(!stage.hasPointerCapture(e.pointerId))return;
    selected=true;gesture={pointer:e.pointerId,corner,start:p,rect:r,zoom:state.zoom,x:state.offsetX,y:state.offsetY};sync();startLive().catch(()=>{liveReady=false;live.hidden=true;canvas.style.visibility='';});
  };
  stage.onpointermove=e=>{
    if(!gesture||gesture.pointer!==e.pointerId||!enabled())return;e.preventDefault();const p=point(e),g=gesture;
    if(!g.corner){state.offsetX=g.x+p.x-g.start.x;state.offsetY=g.y+p.y-g.start.y;}
    else{
      const west=g.corner.includes('w'),north=g.corner.includes('n'),ax=west?g.rect.x+g.rect.w:g.rect.x,ay=north?g.rect.y+g.rect.h:g.rect.y;
      const vx=(west?-1:1)*g.rect.w,vy=(north?-1:1)*g.rect.h,ratio=1+((p.x-g.start.x)*vx+(p.y-g.start.y)*vy)/(vx*vx+vy*vy);
      state.zoom=clamp(g.zoom*ratio,renderer.portraitLimits.zoom);const w=g.rect.w*state.zoom/g.zoom,h=g.rect.h*state.zoom/g.zoom;
      state.offsetX=(west?ax-w:ax)+w/2-725;state.offsetY=(north?ay-h:ay)+h-850;
    }
    apply();
  };
  const finish=e=>{if(gesture?.pointer===e.pointerId){gesture=null;changed(true);}};
  stage.onpointerup=finish;stage.onpointercancel=finish;stage.onlostpointercapture=finish;
  canvas.tabIndex=0;
  canvas.onkeydown=e=>{
    if(!selected||!enabled())return;const delta=e.shiftKey?10:2;
    if(e.key==='ArrowLeft')state.offsetX-=delta;else if(e.key==='ArrowRight')state.offsetX+=delta;else if(e.key==='ArrowUp')state.offsetY-=delta;else if(e.key==='ArrowDown')state.offsetY+=delta;else return;
    e.preventDefault();apply();
  };
  selection.querySelectorAll('[data-corner]').forEach(button=>button.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||!enabled())return;e.preventDefault();state.zoom+=['ArrowUp','ArrowRight'].includes(e.key) ? .02 : -.02;apply();});
  const keys=e=>{
    if(!expanded)return;if(e.key==='Escape'){e.preventDefault();setExpanded(false);return;}
    if(e.key==='Tab'){const focusable=[...root.querySelectorAll('button:not(:disabled),input:not(:disabled),summary,canvas[tabindex]')].filter(el=>el.getClientRects().length&&!el.closest('[hidden]'));const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  };
  document.addEventListener('keydown',keys);
  const observer=new MutationObserver(()=>{if(!root.isConnected){if(expanded)document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',keys);sizeObserver.disconnect();observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
  sync();return {sync,isLive:()=>!!gesture&&liveReady,finishPreview(){if(!gesture){liveReady=false;live.hidden=true;canvas.style.visibility='';}},select(){selected=true;gesture=null;liveReady=false;liveAppearance=null;photo.width=photo.height=1;live.hidden=true;canvas.style.visibility='';sync();}};
}
