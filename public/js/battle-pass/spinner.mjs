import { broadcastBladeSpin } from '../tournament-broadcast-blades.mjs';

export const visualSpinSpeed = sp=>12+52*(1-Math.exp(-Math.max(0,sp)/16000));
const renderUrl = source=>{
  if(!source) return source;
  const url=new URL(source,location.href);
  // Keep this no-referrer request separate from older opaque hotlink errors in the site's image cache.
  if(url.hostname==='img.beybladehub.app') url.searchParams.set('bxlab-render','1');
  return url.href;
};

// Decorative dynamics only. SP is not converted to physical RPM.
export class MiniSpinModel {
  constructor() {this.reset();}
  reset() {Object.assign(this,{speed:0,angle:0,phase:0,lean:0,x:0,y:0,token:null,pending:false});}
  impulse(token,sp) {
    if(token===this.token && (!this.pending || sp==null)) return false;
    this.token=token;this.pending=sp==null;
    this.speed=visualSpinSpeed(sp??8000);return true;
  }
  advance(seconds) {
    const dt=Math.max(0,seconds),before=this.speed;
    this.speed=Math.max(0,(this.speed+7.5)*Math.exp(-.2*dt)-7.5);
    if(this.speed<.35) this.speed=0;
    this.angle=(this.angle+(before+this.speed)*.5*dt)%(Math.PI*2);
    this.phase=(this.phase+(1.7+4/(this.speed+1))*dt)%(Math.PI*2);
    const leanTarget=this.speed>0?2+17*Math.exp(-this.speed/9):0;
    this.lean+=(leanTarget-this.lean)*(1-Math.exp(-dt*7));
    const drift=this.speed>0?1.5+this.lean*.15:0;
    this.x+=(Math.sin(this.phase)*drift-this.x)*(1-Math.exp(-dt*5));
    this.y+=(Math.cos(this.phase)*drift*.5-this.y)*(1-Math.exp(-dt*5));
    if(!this.speed && this.lean<.02 && Math.abs(this.x)+Math.abs(this.y)<.04) this.lean=this.x=this.y=0;
    return this.speed>0 || this.lean>0;
  }
}

export class BattlePassSpinner {
  constructor(button) {
    this.button=button;this.body=button.querySelector('.bp-mini-body');this.rotor=button.querySelector('.bp-mini-rotor');
    this.shadow=button.querySelector('.bp-mini-shadow');this.model=new MiniSpinModel();this.direction=1;
    this.motion=matchMedia('(prefers-reduced-motion: reduce)');
    this.visible=true;
    if('IntersectionObserver' in window) {
      this.observer=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;if(this.visible) this.schedule();else {cancelAnimationFrame(this.frame);this.frame=0;}});
      this.observer.observe(button);
    }
    this.visibility=()=>{if(document.hidden){cancelAnimationFrame(this.frame);this.frame=0;}else this.schedule();};
    document.addEventListener('visibilitychange',this.visibility);
    this.tick=now=>{
      this.frame=0;const active=this.model.advance(this.lastTime?Math.max(0,(now-this.lastTime)/1000):0);this.lastTime=now;
      this.paint();if(active) this.schedule();
    };
  }
  async initialize(account) {
    this.owner=account?.id??'guest';
    const index=await BX.partsIndex();
    this.index=index;this.parts=index.list.filter(p=>p.kind==='BLADE');
    let saved;try {saved=localStorage.getItem('bx-battle-pass-blade:'+this.owner);}catch{}
    const selected=this.parts.find(p=>p.id===saved)??this.parts.find(p=>p.id===account?.favoritePartId);
    if(selected) this.select(selected,false);
    this.button.onclick=()=>this.picker();
  }
  select(part,reset=true) {
    this.selected=part;
    const root=this.index.byId.get(part.parentId)||part;
    this.direction=broadcastBladeSpin(root)==='left'?-1:1;
    this.button.dataset.bladeId=part.id;
    this.button.title=part.display||part.name;
    this.button.setAttribute('aria-label','Escolher Blade: '+(part.display||part.name));
    const image=this.rotor.querySelector('img'),fallback=this.rotor.querySelector('.bp-mini-empty');
    image.hidden=!part.img;fallback.hidden=!!part.img;
    image.referrerPolicy='no-referrer';
    image.onerror=()=>{image.hidden=true;fallback.hidden=false;};
    if(part.img) image.src=renderUrl(part.img);
    if(reset) {cancelAnimationFrame(this.frame);this.frame=0;this.model.reset();this.lastTime=0;this.paint();}
    try {localStorage.setItem('bx-battle-pass-blade:'+this.owner,part.id);}catch{}
  }
  launch(token,sp) {
    if(!this.model.impulse(token,sp)) return;
    this.lastTime=performance.now();
    this.button.dataset.spinning='true';
    if(this.motion.matches) {this.model.speed=this.model.lean=this.model.x=this.model.y=0;this.paint();this.button.animate([{opacity:.55},{opacity:1}],{duration:120});return;}
    this.schedule();
  }
  schedule() {if(!this.frame && this.visible && !document.hidden && !this.motion.matches && (this.model.speed || this.model.lean)) this.frame=requestAnimationFrame(this.tick);}
  paint() {
    const {model}=this;
    this.body.style.transform=`translate3d(${model.x.toFixed(2)}px,${model.y.toFixed(2)}px,0) rotateX(${(model.lean*Math.cos(model.phase)).toFixed(2)}deg) rotateY(${(model.lean*Math.sin(model.phase)).toFixed(2)}deg)`;
    this.rotor.style.transform=`rotate(${(this.direction*model.angle).toFixed(4)}rad)`;
    this.shadow.style.transform=`translate3d(${(model.x*.55).toFixed(2)}px,0,0) scale(${(1-model.lean*.008).toFixed(3)})`;
    this.button.style.setProperty('--spin-strength',Math.min(1,model.speed/55).toFixed(3));
    this.button.dataset.spinning=String(model.speed>0);
  }
  async picker() {
    if(this.dialog?.open) return;
    const dialog=document.createElement('dialog');this.dialog=dialog;dialog.className='bp-blade-picker';
    dialog.setAttribute('aria-label','Escolher Blade');
    dialog.innerHTML='<div class="bp-picker-head"><h2>Escolher Blade</h2><button type="button" aria-label="Fechar">×</button></div><input type="search" placeholder="Buscar Blade" aria-label="Buscar Blade"><div class="bp-picker-grid"></div><button type="button" class="btn bp-picker-more">Mostrar mais</button>';
    document.body.appendChild(dialog);
    let limit=60;
    const render=()=>{
      const query=BX.norm(dialog.querySelector('input').value);
      const parts=this.parts.filter(p=>BX.norm([p.display,p.name,...(p.aliases||[])].join(' ')).includes(query));
      dialog.querySelector('.bp-picker-grid').innerHTML=parts.slice(0,limit).map(p=>`<button type="button" data-part="${BX.esc(p.id)}" aria-pressed="${p.id===this.selected?.id}">${BX.partThumb({...p,img:renderUrl(p.img)},62).replace('<img ','<img referrerpolicy="no-referrer" ')}<span>${BX.esc(p.display||p.name)}</span></button>`).join('')||'<p>Nenhuma Blade encontrada.</p>';
      dialog.querySelector('.bp-picker-more').hidden=parts.length<=limit;
    };
    dialog.querySelector('input').oninput=()=>{limit=60;render();};
    dialog.querySelector('.bp-picker-more').onclick=()=>{limit+=60;render();};
    dialog.querySelector('.bp-picker-head button').onclick=()=>dialog.close();
    dialog.querySelector('.bp-picker-grid').onclick=event=>{
      const button=event.target.closest('[data-part]');if(!button) return;
      this.select(this.parts.find(p=>p.id===button.dataset.part));dialog.close();
    };
    dialog.onclick=event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom) dialog.close();}};
    dialog.onclose=()=>{dialog.remove();this.button.focus();};
    render();dialog.showModal();
  }
  stop() {cancelAnimationFrame(this.frame);this.frame=0;this.model.reset();this.lastTime=0;this.paint();}
}
