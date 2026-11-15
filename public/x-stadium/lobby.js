import { BLADES, RATCHETS, BITS, BIT_TYPES, DEFAULTS, GRAMS_PER_MASS_UNIT, getParts, sanitizeConfig } from './rules.js';
import { partKinds as kinds, hasRepeatedParts, loadoutStats } from './deck.js';
import { avatarMarkup, escapeText as escape, insideWebView, stadiumRequest } from './account.js';

const storageKey = 'x-stadium-decks-v1';
const labels = {blade:'Blades',ratchet:'Ratchets',bit:'Bits'};
const bitGroups = Object.keys(BIT_TYPES).map(type=>({
  type,codes:Object.keys(BITS).filter(code=>BITS[code].type===type),
}));
const ratchetGroups = [...new Set(Object.values(RATCHETS).map(ratchet=>ratchet.teeth))].sort((a,b)=>a-b)
  .map(teeth=>({teeth,codes:Object.keys(RATCHETS).filter(code=>RATCHETS[code].teeth===teeth)
    .sort((a,b)=>RATCHETS[a].mm-RATCHETS[b].mm)}));
const titles = {single:'Single',trio:'3×3'};
const difficulties = {easy:'Fácil',normal:'Normal',hard:'Difícil'};
const defaults = [{...DEFAULTS[0]},{blade:'wizard',ratchet:'5-70',bit:'B'},{blade:'knight',ratchet:'4-60',bit:'N'}];
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const catalogCode = (kind,code) => kinds[kind][code]?.name ?? code;
const button = (text,action,extra='') => '<button type="button" class="lobby-button" data-lobby="'+action+'" '+extra+'>'+text+'</button>';
const tile = (label,action,{icon,tone='cyan',detail='',attributes=''}={}) =>
  '<button type="button" class="lobby-button lobby-action" data-lobby="'+action+'" data-tone="'+tone+'" '+attributes+
  ' aria-label="'+label+'"><span class="lobby-action-icon"><i data-icon="'+icon+'" aria-hidden="true"></i></span>'+
  '<span class="lobby-action-title"><strong>'+label+'</strong>'+(detail?'<small>'+detail+'</small>':'')+'</span>'+
  '<i class="lobby-action-arrow" data-icon="arrow" aria-hidden="true"></i></button>';
const spinner = '<span class="queue-spinner" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M20 2 32 7 38 20 32 33 20 38 7 32 2 20 8 7Z M20 8l9 6 2 10-11 8-10-7 1-10Z"/><circle cx="20" cy="20" r="5"/></svg></span>';

function readDecks() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(saved) ? saved.filter(deck=>deck && typeof deck.id === 'string' &&
      typeof deck.name === 'string' && Array.isArray(deck.beys) && deck.beys.length === 3)
      .map(deck=>({...deck,beys:deck.beys.map(bey=>sanitizeConfig(bey,0))})) : [];
  } catch { return []; }
}

export class StadiumLobby {
  constructor(root, badge, actions) {
    this.root = root;
    this.badge = badge;
    this.actions = actions;
    this.decks = readDecks();
    this.browserDecks = this.decks;
    this.guestNumber = 1000+Math.floor(Math.random()*9000);
    this.guest = {name:'Blader '+this.guestNumber,avatarUrl:null};
    this.profile = this.guest;
    this.authMode = 'login';
    this.embedded = insideWebView();
    this.pictures = new Map();
    this.difficulty = 'normal';
    this.page = 'home';
    root.addEventListener('click',e=>{
      const target = e.target.closest('[data-lobby]');
      if (!target) return;
      const previous = this.page;
      this.click(target);
      if (e.detail===0 && this.page!==previous && !root.hidden) root.querySelector('h2')?.focus({preventScroll:true});
    });
    badge.addEventListener('click',e=>{
      const target = e.target.closest('[data-lobby]');
      if (target) this.click(target);
    });
    root.addEventListener('input',e=>{
      if (e.target.id === 'lobby-deck-name') this.draft.name = e.target.value;
      if (e.target.id === 'lobby-room-code') this.roomCode = e.target.value;
      if (e.target.id === 'lobby-graphics') this.actions.graphics(e.target.value);
    });
    root.addEventListener('keydown',e=>{
      const back = root.querySelector('[data-lobby="back"]');
      if (e.key==='Escape' && back && !this.busy) {
        e.preventDefault();
        this.click(back);
        root.querySelector('h2')?.focus({preventScroll:true});
      }
    });
    root.addEventListener('error',e=>{
      const image = e.target;
      if (image.matches('.stadium-avatar img')) image.hidden = true;
      if (!image.matches('img[data-part-image]')) return;
      const [kind,code] = image.dataset.partImage.split(':');
      const fallback = kind === 'blade' && BLADES[code]?.image;
      if (fallback && image.getAttribute('src') !== fallback) image.src = fallback;
      else image.hidden = true;
    },true);
    root.addEventListener('submit',e=>{
      if (e.target.matches('[data-account-form]')) {
        e.preventDefault();
        this.submitAccount(e.target);
      }
    });
    root.addEventListener('toggle',e=>{
      if (!e.target.matches('.lobby-preview') || !e.target.isConnected) return;
      this.previewOpen = e.target.open;
      this.updatePreview();
    },true);
    this.accountReady = this.loadAccount().catch(()=>{ this.accountUnavailable = true; });
    const query = new URLSearchParams(location.search);
    if (query.has('perfil')) {
      this.accountReady.then(()=>{
        if (this.root.hidden || this.page!=='home') return;
        this.show('profile');
        this.error = query.get('erro') || '';
        query.delete('perfil');
        query.delete('erro');
        const search = query.toString();
        history.replaceState(null,'',location.pathname+(search?'?'+search:''));
        this.render();
      });
    }
    this.loadPictures();
    this.render();
  }

  async loadPictures() {
    try {
      const response = await fetch('/api/parts-index');
      if (!response.ok) return;
      const {parts} = await response.json();
      for (const kind of ['ratchet','bit']) {
        for (const code of Object.keys(kinds[kind])) {
          const aliases = new Set([normalize(catalogCode(kind,code)),normalize(code)]);
          const found = parts.find(part=>part.kind === kind.toUpperCase() && part.img && !part.parentId &&
            [part.name,part.display,part.slug,part.abbrev,...(part.aliases ?? [])].some(value=>aliases.has(normalize(value))));
          if (found) {
            const url = new URL(found.img,location.origin);
            if (['https:','http:'].includes(url.protocol)) this.pictures.set(kind+':'+code,url.href);
          }
        }
      }
      for (const img of this.root.querySelectorAll('[data-part-image]')) {
        const src = this.pictures.get(img.dataset.partImage);
        if (src) { img.src = src; img.hidden = false; }
      }
      document.dispatchEvent(new Event('stadium-catalog-ready'));
    } catch { /* The editor still works with the local catalog. */ }
  }

  picture(kind,code) {
    // Local cutouts of the catalog's original releases, including BX-01, BX-04, UX-03 and BX-34.
    if (kind==='blade' && Object.hasOwn(BLADES,code)) return './assets/stock/'+code+'.webp';
    return this.pictures.get(kind+':'+code) || '';
  }

  thumb(kind,code) {
    const src = this.picture(kind,code);
    return '<span class="lobby-thumb"><img alt="" draggable="false" referrerpolicy="no-referrer" data-part-image="'+escape(kind+':'+code)+'"'+
      (src ? ' src="'+escape(src)+'"' : ' hidden')+'></span>';
  }

  async loadAccount() {
    const data = await stadiumRequest('/api/x-stadium/profile');
    this.member = Boolean(data.profile);
    this.profile = data.profile || this.guest;
    this.googleEnabled = data.google;
    if (this.member) {
      this.browserDecks = this.decks;
      this.decks = data.decks;
    }
    if (['home','profile','decks','loadout'].includes(this.page)) this.render();
  }

  accountPanel() {
    const profile = '<div class="lobby-profile-summary">'+avatarMarkup(this.profile)+'<div><strong>'+escape(this.profile.name)+'</strong>'+
      '<small>'+(this.member?'Conta BX Lab':'Convidado')+'</small></div></div>';
    const save = '<button class="lobby-button" data-primary type="submit">'+(this.busy?'Aguarde…':'Salvar perfil')+'</button>';
    if (this.member) return profile+'<form class="lobby-account-form" data-account-form="profile">'+
      '<label class="lobby-field">Nome no X Stadium<input name="name" required maxlength="40" value="'+escape(this.profile.name)+'"></label>'+
      '<label class="lobby-field">Foto no X Stadium<input name="file" type="file" accept="image/png,image/jpeg,image/webp"></label>'+
      '<label><input type="checkbox" name="useAccountPhoto" value="1"> Usar a foto da conta BX Lab</label>'+save+'</form>';
    const create = this.authMode==='register';
    return profile+(this.accountUnavailable?'<p>Não foi possível consultar sua sessão.</p>':'')+
      '<div class="lobby-tabs">'+button('Entrar','auth-mode','data-value="login" aria-pressed="'+!create+'"')+
      button('Criar conta','auth-mode','data-value="register" aria-pressed="'+create+'"')+'</div>'+
      '<form class="lobby-account-form" data-account-form="auth">'+
      (create?'<label class="lobby-field">Nome<input name="name" maxLength="40" required autocomplete="nickname"></label>':'')+
      '<label class="lobby-field">E-mail<input type="email" name="email" required autocomplete="email" value="'+escape(this.authEmail ?? '')+'"></label>'+
      '<label class="lobby-field">Senha<input type="password" name="password" required '+(create?'minlength="8"':'')+
      ' autocomplete="'+(create?'new-password':'current-password')+'"></label>'+
      '<button class="lobby-button" data-primary type="submit">'+(this.busy?'Aguarde…':create?'Criar conta BX Lab':'Entrar na conta')+'</button></form>'+
      (this.googleEnabled && !this.embedded ? button('Entrar com Google','google') : '');
  }

  async submitAccount(form) {
    if (this.busy) return;
    const data = new FormData(form);
    this.busy = true;
    this.error = '';
    form.setAttribute('aria-busy','true');
    try {
      if (form.dataset.accountForm==='profile') {
        if (!data.get('file')?.size) data.delete('file');
        const {profile} = await stadiumRequest('/api/x-stadium/profile','PATCH',data);
        this.profile = profile;
        this.show('home');
      } else {
        this.authEmail = String(data.get('email') ?? '');
        await stadiumRequest('/api/auth/'+this.authMode,'POST',Object.fromEntries(data));
        this.accountUnavailable = false;
        await this.loadAccount();
        this.show('profile');
      }
    } catch (error) {
      this.error = this.embedded && error.code==='NO_PASSWORD' ? 'Esta conta ainda não tem senha cadastrada.' : error.message;
    } finally {
      this.busy = false;
      this.render();
    }
  }

  async googleLogin() {
    if (this.embedded || !this.googleEnabled) return;
    try {
      await stadiumRequest('/api/auth/after-login','POST',{to:'/x-stadium/?perfil=1'});
      location.assign('/api/oauth/google');
    } catch (error) { this.error = error.message; }
    this.render();
  }

  show(page) {
    this.page = page;
    this.error = '';
    this.root.hidden = false;
    this.render();
  }

  hide() {
    this.root.hidden = true;
    if (this.page==='editor') this.actions.inspect?.(null);
    this.updateBadge();
  }

  deckRows(selecting) {
    if (!this.decks.length) return '<p class="lobby-empty">Nenhum deck salvo.</p>';
    return '<div class="lobby-decks">'+this.decks.map(deck=>{
      const repeated = hasRepeatedParts(deck.beys);
      return '<article><div class="lobby-deck-line">'+deck.beys.map(bey=>this.thumb('blade',bey.blade)).join('')+
      '<strong>'+escape(deck.name)+'</strong></div><div class="lobby-row-actions">'+(selecting ?
        button('Usar deck','use','data-id="'+escape(deck.id)+'"'+(repeated?' disabled':'')) : '')+
      button(repeated?'Corrigir peças repetidas':'Editar','edit','data-id="'+escape(deck.id)+'"')+'</div></article>';
    }).join('')+'</div>';
  }

  edit(deck, single=false) {
    this.returnPage = this.page;
    this.single = single;
    this.draft = {id:deck?.id,name:deck?.name ?? '',beys:(deck?.beys ?? (single ? [defaults[0]] : defaults))
      .map(bey=>sanitizeConfig(bey,0))};
    this.slot = 0;
    this.part = 'blade';
    this.show('editor');
  }

  partOwner(kind,code) {
    return code ? this.draft.beys.findIndex((bey,i)=>i!==this.slot && bey[kind]===code) : -1;
  }

  partOptions() {
    const kind = this.part;
    const selected = this.draft.beys[this.slot][kind];
    const groups = kind==='bit' ? bitGroups : kind==='ratchet' ? ratchetGroups : [{codes:Object.keys(BLADES)}];
    return groups.map(({codes,type,teeth})=>{
      const title = type ? '<h3 class="lobby-bit-type" data-bit-type="'+type+'"><span aria-hidden="true"></span>'+BIT_TYPES[type]+'</h3>' : '';
      const groupLabel = type ? BIT_TYPES[type] : kind==='ratchet' ? 'Ratchets '+teeth : labels[kind];
      const cards = codes.map(code=>{
        const owner = this.partOwner(kind,code);
        return '<button type="button" data-lobby="part" data-code="'+escape(code)+'" aria-pressed="'+(selected===code)+'"'+
          (owner>=0?' disabled':'')+'>'+this.thumb(kind,code)+'<span>'+escape(catalogCode(kind,code))+'</span>'+
          (owner>=0?'<small>Em uso na Bey '+(owner+1)+'</small>':'')+'</button>';
      }).join('');
      return '<section class="lobby-part-group" aria-label="'+groupLabel+'">'+title+
        '<div class="lobby-part-cards">'+cards+'</div></section>';
    }).join('');
  }

  preview(bey) {
    const {blade,bit,mass,ratchet} = getParts(bey);
    const stats = loadoutStats(bey).map(([label,value])=>'<div><small>'+label+'</small><meter min="0" max="100" value="'+value+'" aria-label="'+label+'">'+value+'</meter></div>').join('');
    return '<details class="lobby-preview"'+((this.previewOpen ?? matchMedia('(min-width:651px)').matches)?' open':'')+'><summary>Prévia 3D</summary>'+
      '<div class="lobby-preview-body"><canvas id="lobby-preview-model" aria-label="Modelo 3D de '+escape(blade.name)+'"></canvas><div>'+
      '<strong>'+escape(blade.name)+'</strong><small>'+escape([blade.integrated?'Base integrada':bey.ratchet+' · '+ratchet.mm+' mm',bit.name,
        (mass*GRAMS_PER_MASS_UNIT).toLocaleString('pt-BR',{maximumFractionDigits:1})+' g'].join(' · '))+'</small>'+
      '<div class="lobby-preview-views">'+['Cima','Lado','Baixo'].map((label,i)=>button(label,'preview-angle','data-value="'+['top','side','bottom'][i]+'"')).join('')+'</div>'+
      '<div class="lobby-preview-stats">'+stats+'</div></div></div></details>';
  }

  updatePreview() {
    const canvas = !this.root.hidden && this.root.querySelector('.lobby-preview[open] canvas');
    this.actions.inspect?.(canvas || null,canvas ? this.draft.beys[this.slot] : null);
  }

  editor() {
    const bey = this.draft.beys[this.slot];
    const stock = BLADES[bey.blade].integrated;
    const part = this.part;
    return (this.single ? '' : '<label class="lobby-field">Nome do deck<input id="lobby-deck-name" maxlength="42" value="'+escape(this.draft.name)+'"></label>')+
      '<div class="lobby-editor"><div class="lobby-slots">'+this.draft.beys.map((entry,i)=>
        '<button type="button" data-lobby="slot" data-slot="'+i+'" aria-pressed="'+(this.slot===i)+'">'+
        '<span class="lobby-slot-number">Bey '+(i+1)+'</span><span class="lobby-slot-parts">'+
        Object.keys(kinds).filter(kind=>entry[kind]).map(kind=>this.thumb(kind,entry[kind])).join('')+'</span>'+
        '<strong>'+escape(BLADES[entry.blade].name)+'</strong><small>'+[entry.ratchet,entry.bit].filter(Boolean).join(' · ')+'</small></button>').join('')+
      '</div><div class="lobby-picker"><div class="lobby-tabs">'+Object.keys(kinds).map(kind=>button(labels[kind],'kind',
        'data-kind="'+kind+'" aria-pressed="'+(part===kind)+'" '+(kind==='ratchet'&&stock?'disabled':'') )).join('')+
      '</div><div class="lobby-part-grid" data-part="'+part+'">'+this.partOptions()+'</div></div></div>'+this.preview(bey)+
      '<div class="lobby-footer">'+(!this.single && this.draft.id?button('Excluir deck','delete'):'')+
      button(this.single?'Escolher Bey':'Salvar deck','save')+'</div>';
  }

  queueLabel() {
    if (this.queue.count === null) return 'Conectando à fila…';
    return this.queue.count === 0 ? 'Nenhum outro jogador na fila' :
      this.queue.count + (this.queue.count===1 ? ' jogador na fila' : ' jogadores na fila');
  }

  queueText() {
    return this.queue.room ? 'Sala '+this.queue.room : this.queueLabel();
  }

  render(keepScroll = true) {
    const wide = this.page === 'editor';
    const transitioning = this.root.dataset.page !== this.page;
    const previousCanvas = this.root.querySelector('#lobby-preview-model');
    const scroll = keepScroll && wide && this.root.dataset.page === 'editor' ? this.root.querySelector('.lobby-part-grid')?.scrollTop : 0;
    this.root.dataset.page = this.page;
    this.root.classList.toggle('wide',wide);
    let title, body;
    switch (this.page) {
      case 'home':
        title = 'X Stadium';
        body = '<div class="lobby-main-actions">'+tile('Jogar online','online',{icon:'bolt',detail:'Buscar partida ou criar sala',attributes:'data-primary'})+
          tile('Jogar contra IA','cpu',{icon:'cpu',tone:'violet',detail:'Single ou 3×3'})+
          tile('Decks','decks',{icon:'parts',tone:'amber',detail:'Montar e editar Beys'})+
          '</div><div class="lobby-footer">'+button('<i data-icon="menu" aria-hidden="true"></i>Opções','settings')+'</div>';
        break;
      case 'online':
        title = 'Jogar online';
        body = tile('Buscar partida online','search',{icon:'target',attributes:'data-primary'})+
          tile('Criar sala','private',{icon:'lock',tone:'violet'})+tile('Entrar por código','join',{icon:'users',tone:'amber'});
        break;
      case 'format':
        title = 'Escolha o formato';
        body = tile('3×3','format',{icon:'parts',tone:'violet',detail:'Três Beys por jogador',attributes:'data-format="trio"'})+
          tile('Single','format',{icon:'target',detail:'Uma Bey por jogador',attributes:'data-format="single"'});
        break;
      case 'difficulty':
        title = 'Dificuldade';
        body = Object.entries(difficulties).map(([value,label],i)=>tile(label,'difficulty',{
          icon:['guard','activity','strike'][i],tone:['cyan','violet','amber'][i],attributes:'data-value="'+value+'"',
        })).join('');
        break;
      case 'decks':
        title = 'Meus decks';
        body = tile('Criar deck','new',{icon:'plus',attributes:'data-primary'})+this.deckRows(false)+
          (this.member && this.importableDecks().length?button('Importar decks deste navegador','import-decks'):'');
        break;
      case 'profile':
        title = 'Meu perfil';
        body = this.accountPanel();
        break;
      case 'loadout':
        title = this.format === 'trio' ? 'Escolha seu deck' : 'Escolha sua Bey';
        body = (this.flow === 'join' ? '<label class="lobby-field">Código da sala<input id="lobby-room-code" maxlength="6" value="'+escape(this.roomCode??'')+'" autocapitalize="characters" spellcheck="false"></label>' : '')+
          (this.format === 'trio' ? button('Criar deck','new')+this.deckRows(true) :
            '<div class="lobby-single">'+this.thumb('blade',this.singleBey?.blade??'dran')+
            '<strong>'+escape(BLADES[this.singleBey?.blade??'dran'].name)+'</strong>'+button('Montar Bey','single-edit')+'</div>'+
            button(this.flow==='cpu'?'Jogar':'Continuar','single-use','data-primary'));
        break;
      case 'editor':
        title = this.single?'Montar Bey':this.draft.id?'Editar deck':'Criar deck';
        body = this.editor();
        break;
      case 'queue':
        title = this.queue?.room ? 'Sala privada' : 'Buscando partida';
        body = this.queue ? '<div class="lobby-search">'+spinner+'<strong class="lobby-queue-label">'+this.queueText()+'</strong>'+
          '<span data-queue-time>00:00</span></div>'+
          (this.queue.room ? button('Copiar código','copy') : button('Jogar enquanto espera','wait','data-primary'))+
          button(this.queue.training?'Voltar ao treino':'Cancelar',this.queue.training?'return-training':'cancel')+
          (this.queue.training?button('Cancelar busca','cancel'):'') : '';
        break;
      case 'settings':
        title = 'Opções';
        body = tile(this.actions.soundEnabled()?'Silenciar som':'Ativar som','sound',{icon:this.actions.soundEnabled()?'sound':'muted'})+
          '<label class="lobby-field">Gráficos<select id="lobby-graphics">'+
          [['auto','Automático'],['fps30','Meta 30 FPS'],['fps60','Meta 60 FPS'],['fps120','Meta 120 FPS'],['low','Leve'],['medium','Equilibrado'],['high','Alto']]
            .map(([key,label])=>'<option value="'+key+'" '+(key===this.actions.graphicsValue()?'selected':'')+'>'+label+'</option>').join('')+
          '</select></label>'+tile('Duelo local','local',{icon:'users',tone:'violet'})+tile('Como jogar','help',{icon:'help',tone:'amber'});
        break;
    }
    const profileButton = this.page==='home' ? '<button type="button" class="lobby-profile-button" data-lobby="profile" aria-label="Meu perfil" title="'+escape(this.profile.name)+'">'+avatarMarkup(this.profile)+'</button>' : '';
    const heading = this.page==='home' ? '<div class="lobby-wordmark"><img src="./assets/stadium-mark.svg" alt="" width="76" height="64">'+
      '<h2 tabindex="-1">'+title+'</h2></div>' : button('<i data-icon="arrow" aria-hidden="true"></i>','back','aria-label="Voltar"')+
      '<h2 tabindex="-1">'+title+'</h2>';
    this.root.innerHTML = '<div class="lobby-heading">'+heading+profileButton+'</div><div class="lobby-body">'+body+
      (this.error?'<p class="lobby-error" role="alert">'+escape(this.error)+'</p>':'')+'</div>';
    this.actions.icons?.(this.root);
    if (transitioning) {
      this.root.scrollTop = 0;
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.root.querySelector('.lobby-body').animate?.([{opacity:.45,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)'}],
          {duration:215,easing:'cubic-bezier(.2,.75,.3,1)'});
      }
    }
    if (scroll) this.root.querySelector('.lobby-part-grid').scrollTop = scroll;
    if (wide && previousCanvas) {
      const nextCanvas = this.root.querySelector('#lobby-preview-model');
      previousCanvas.setAttribute('aria-label',nextCanvas.getAttribute('aria-label'));
      nextCanvas.replaceWith(previousCanvas);
    }
    if (wide || previousCanvas) this.updatePreview();
    this.updateBadge();
    this.tick();
  }

  tick() {
    if (!this.queue) return;
    const seconds = Math.floor((performance.now()-this.queue.start)/1000);
    if (this.elapsed === seconds) return;
    this.elapsed = seconds;
    const time = String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
    for (const el of document.querySelectorAll('[data-queue-time]')) el.textContent = time;
  }

  updateBadge() {
    this.badge.hidden = !this.queue || !this.root.hidden;
    if (!this.badge.hidden) {
      this.badge.innerHTML = button(spinner+'<span><strong>Buscando '+titles[this.queue.format]+'</strong><small>'+
        this.queueLabel()+' · <b data-queue-time>00:00</b></small></span>','expand');
    }
    this.elapsed = null;
  }

  queueChanged({count}) {
    if (!this.queue) return;
    this.queue.count = count;
    if (this.page === 'queue' && !this.root.hidden) this.root.querySelector('.lobby-queue-label').textContent = this.queueText();
    else this.updateBadge();
  }

  roomReady(room) {
    if (!this.queue) return;
    if (this.flow === 'private') this.queue.room = room;
    if (this.page === 'queue' && !this.root.hidden) this.render();
  }

  fail(message) {
    const training = this.queue?.training;
    this.queue = null;
    if (!training || !this.root.hidden) this.show('online');
    this.error = message;
    if (!this.root.hidden) this.render();
    this.updateBadge();
  }

  validateRoomCode() {
    const code = (this.roomCode ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      this.error = 'Digite os seis caracteres do código da sala.';
      this.render();
      return null;
    }
    return code;
  }

  choose(beys) {
    if (this.format==='trio' && hasRepeatedParts(beys)) {
      this.error = 'Use peças diferentes entre as três Beys.';
      this.render();
      return;
    }
    const code = this.flow === 'join' ? this.validateRoomCode() : null;
    if (this.flow === 'join' && !code) return;
    if (this.flow === 'cpu') {
      this.hide();
      this.actions.play(this.format,beys,this.difficulty);
    } else {
      this.queue = {format:this.format,beys,start:performance.now(),count:null};
      this.show('queue');
      this.actions.join(this.format,{privateRoom:this.flow==='private',code,guestNumber:this.guestNumber});
    }
  }

  matched() {
    const pending = this.queue;
    this.queue = null;
    this.hide();
    return pending;
  }

  async save() {
    if (this.single) {
      this.singleBey = this.draft.beys[0];
      return this.show('loadout');
    }
    const name = this.draft.name.trim();
    if (!name || hasRepeatedParts(this.draft.beys)) {
      this.error = name?'Use peças diferentes entre as três Beys.':'Dê um nome ao deck.';
      this.render();
      return;
    }
    const deck = { id:this.draft.id ?? crypto.randomUUID(), name, beys:this.draft.beys };
    this.busy = true;
    try {
      await this.accountReady;
      await this.storeDeck(deck);
      this.show(this.returnPage);
    } catch (error) { this.error = error.message; this.render(); }
    finally { this.busy = false; }
  }

  async storeDeck(deck) {
    if (this.member) {
      const result = await stadiumRequest('/api/x-stadium/decks/'+encodeURIComponent(deck.id),'PUT',deck);
      deck = result.deck;
    }
    this.decks = [deck,...this.decks.filter(entry=>entry.id!==deck.id)];
  }

  importableDecks() {
    return this.browserDecks.filter(deck=>!hasRepeatedParts(deck.beys) && !this.decks.some(saved=>saved.id===deck.id));
  }

  async importDecks() {
    this.busy = true;
    try {
      for (const deck of this.importableDecks().reverse()) await this.storeDeck(deck);
      this.show('decks');
    } catch (error) { this.error = error.message; this.render(); }
    finally { this.busy = false; }
  }

  async removeDeck() {
    const id = this.draft.id;
    if (!id || !confirm('Excluir este deck?')) return;
    this.busy = true;
    try {
      await this.accountReady;
      if (this.member) await stadiumRequest('/api/x-stadium/decks/'+encodeURIComponent(id),'DELETE');
      this.decks = this.decks.filter(entry=>entry.id!==id);
      this.browserDecks = this.browserDecks.filter(entry=>entry.id!==id);
      this.show(this.returnPage);
    } catch (error) { this.error = error.message; this.render(); }
    finally { this.busy = false; }
  }

  click(target) {
    if (this.busy) return;
    const {lobby:action,id,format,kind,code,slot,value} = target.dataset;
    const deck = this.decks.find(entry=>entry.id===id);
    switch (action) {
      case 'home': this.show('home'); break;
      case 'online': case 'decks': case 'settings': case 'profile': this.show(action); break;
      case 'auth-mode': this.authMode=value; this.show('profile'); break;
      case 'google': this.googleLogin(); break;
      case 'import-decks': if (this.member) this.importDecks(); break;
      case 'preview-angle': this.actions.inspectAngle?.(value); break;
      case 'cpu': case 'search': case 'private': case 'join':
        this.flow = action; this.show('format'); break;
      case 'format': this.format = format; this.show(this.flow==='cpu'?'difficulty':'loadout'); break;
      case 'difficulty': this.difficulty=value; this.show('loadout'); break;
      case 'new': this.edit(); break;
      case 'edit': if (deck) this.edit(deck); break;
      case 'single-edit': this.edit({beys:[this.singleBey??defaults[0]]},true); break;
      case 'use': if (deck) this.choose(deck.beys); break;
      case 'single-use': this.choose([this.singleBey??defaults[0]]); break;
      case 'slot': this.slot=Number(slot); this.part='blade'; this.render(false); break;
      case 'kind': this.part=kind; this.render(false); break;
      case 'part': {
        if (!Object.hasOwn(kinds[this.part],code) || this.partOwner(this.part,code)>=0) break;
        const bey = this.draft.beys[this.slot];
        const stock = this.part==='blade' ? BLADES[code].stock : null;
        const change = stock ? {blade:code,ratchet:stock[0],bit:stock[1]} : {[this.part]:code};
        const next = sanitizeConfig({...bey,...change},0);
        if (this.part==='blade' && !this.single) {
          for (const kind of ['ratchet','bit']) {
            if (this.partOwner(kind,next[kind])>=0) {
              // Prefer the slot's previous part when the stock part is taken.
              next[kind] = [bey[kind],...Object.keys(kinds[kind])].find(entry=>entry && this.partOwner(kind,entry)<0);
            }
          }
        }
        this.draft.beys[this.slot] = next;
        this.error = '';
        this.render();
        break;
      }
      case 'save': this.save(); break;
      case 'delete': this.removeDeck(); break;
      case 'wait':
        this.queue.training = true; this.hide(); this.actions.play(this.queue.format,this.queue.beys,this.difficulty); break;
      case 'return-training': this.hide(); break;
      case 'expand': this.show('queue'); break;
      case 'cancel': {
        const training=this.queue?.training;
        this.queue=null; this.actions.cancel();
        if (training) this.hide(); else this.show('online');
        break;
      }
      case 'copy': navigator.clipboard?.writeText(this.queue.room).then(()=>{target.textContent='Copiado';}).catch(()=>{}); break;
      case 'sound': this.actions.toggleSound().finally(()=>this.render()); break;
      case 'local': this.hide(); this.actions.local(); break;
      case 'help': this.actions.help(); break;
      case 'back':
        if (this.page==='queue') this.root.querySelector(this.queue.training?'[data-lobby="return-training"]':'[data-lobby="cancel"]').click();
        else this.show(({editor:this.returnPage,format:this.flow==='cpu'?'home':'online',difficulty:'format',
          loadout:this.flow==='cpu'?'difficulty':'format'})[this.page] ?? 'home');
        break;
    }
  }
}
