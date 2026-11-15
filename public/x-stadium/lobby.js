import { BLADES, RATCHETS, BITS, DEFAULTS, sanitizeConfig } from './rules.js';

const storageKey = 'x-stadium-decks-v1';
const kinds = {blade:BLADES,ratchet:RATCHETS,bit:BITS};
const labels = {blade:'Blades',ratchet:'Ratchets',bit:'Bits'};
const titles = {single:'Single',trio:'3×3'};
const difficulties = {easy:'Fácil',normal:'Normal',hard:'Difícil'};
const defaults = [{...DEFAULTS[0]},{blade:'wizard',ratchet:'5-70',bit:'B'},{blade:'knight',ratchet:'4-60',bit:'N'}];
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const catalogCode = (kind,code) => kinds[kind][code]?.name ?? code;
const button = (text,action,extra='') => '<button type="button" class="lobby-button" data-lobby="'+action+'" '+extra+'>'+text+'</button>';
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
    this.pictures = new Map();
    this.difficulty = 'normal';
    this.page = 'home';
    root.addEventListener('click',e=>{
      const target = e.target.closest('[data-lobby]');
      if (target) this.click(target);
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
    this.loadPictures();
    this.render();
  }

  async loadPictures() {
    try {
      const response = await fetch('/api/parts-index');
      if (!response.ok) return;
      const {parts} = await response.json();
      for (const [kind,entries] of Object.entries(kinds)) {
        for (const code of Object.keys(entries)) {
          const target = normalize(catalogCode(kind,code));
          const aliases = new Set([target]);
          if (kind !== 'blade') aliases.add(normalize(code));
          if (kind === 'blade' && code === 'glory') aliases.add('gloriousvalkyrie');
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
    return this.pictures.get(kind+':'+code) || (kind === 'blade' && code ? BLADES[code].image : '');
  }

  thumb(kind,code) {
    const src = this.picture(kind,code);
    return '<span class="lobby-thumb"><img alt="" draggable="false" data-part-image="'+escape(kind+':'+code)+'"'+
      (src ? ' src="'+escape(src)+'"' : ' hidden')+'></span>';
  }

  show(page) {
    this.page = page;
    this.error = '';
    this.root.hidden = false;
    this.render();
  }

  hide() {
    this.root.hidden = true;
    this.updateBadge();
  }

  deckRows(selecting) {
    if (!this.decks.length) return '<p class="lobby-empty">Nenhum deck salvo.</p>';
    return '<div class="lobby-decks">'+this.decks.map(deck=>
      '<article><div class="lobby-deck-line">'+deck.beys.map(bey=>this.thumb('blade',bey.blade)).join('')+
      '<strong>'+escape(deck.name)+'</strong></div><div class="lobby-row-actions">'+(selecting ?
        button('Usar deck','use','data-id="'+escape(deck.id)+'"') : '')+
      button('Editar','edit','data-id="'+escape(deck.id)+'"')+'</div></article>').join('')+'</div>';
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

  editor() {
    const bey = this.draft.beys[this.slot];
    const stock = BLADES[bey.blade].integrated;
    const part = this.part;
    const options = Object.keys(kinds[part]).map(code=>
      '<button type="button" data-lobby="part" data-code="'+escape(code)+'" aria-pressed="'+(bey[part]===code)+'">'+
      this.thumb(part,code)+'<span>'+escape(catalogCode(part,code))+'</span></button>').join('');
    return (this.single ? '' : '<label class="lobby-field">Nome do deck<input id="lobby-deck-name" maxlength="42" value="'+escape(this.draft.name)+'"></label>')+
      '<div class="lobby-editor"><div class="lobby-slots">'+this.draft.beys.map((entry,i)=>
        '<button type="button" data-lobby="slot" data-slot="'+i+'" aria-pressed="'+(this.slot===i)+'">'+
        '<span class="lobby-slot-number">Bey '+(i+1)+'</span><span class="lobby-slot-parts">'+
        Object.keys(kinds).filter(kind=>entry[kind]).map(kind=>this.thumb(kind,entry[kind])).join('')+'</span>'+
        '<strong>'+escape(BLADES[entry.blade].name)+'</strong><small>'+[entry.ratchet,entry.bit].filter(Boolean).join(' · ')+'</small></button>').join('')+
      '</div><div class="lobby-picker"><div class="lobby-tabs">'+Object.keys(kinds).map(kind=>button(labels[kind],'kind',
        'data-kind="'+kind+'" aria-pressed="'+(part===kind)+'" '+(kind==='ratchet'&&stock?'disabled':'') )).join('')+
      '</div><div class="lobby-part-grid">'+options+'</div></div></div>'+
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

  render() {
    const wide = this.page === 'editor';
    const scroll = wide && this.root.dataset.page === 'editor' ? this.root.querySelector('.lobby-part-grid')?.scrollTop : 0;
    this.root.dataset.page = this.page;
    this.root.classList.toggle('wide',wide);
    let title, body;
    switch (this.page) {
      case 'home':
        title = 'X Stadium';
        body = '<div class="lobby-main-actions">'+button('Jogar online','online','data-primary')+
          button('Jogar contra IA','cpu')+button('Decks','decks')+'</div><div class="lobby-footer">'+button('Opções','settings')+'</div>';
        break;
      case 'online':
        title = 'Jogar online';
        body = button('Buscar partida online','search','data-primary')+button('Criar sala','private')+button('Entrar por código','join');
        break;
      case 'format':
        title = 'Escolha o formato';
        body = button('3×3 <small>Três Beys por jogador</small>','format','data-format="trio"')+
          button('Single <small>Uma Bey · até 4 pontos</small>','format','data-format="single"');
        break;
      case 'difficulty':
        title = 'Dificuldade';
        body = Object.entries(difficulties).map(([value,label])=>button(label,'difficulty','data-value="'+value+'"')).join('');
        break;
      case 'decks':
        title = 'Meus decks';
        body = button('Criar deck','new','data-primary')+this.deckRows(false);
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
        body = button(this.actions.soundEnabled()?'Silenciar som':'Ativar som','sound')+
          '<label class="lobby-field">Gráficos<select id="lobby-graphics">'+
          [['auto','Automático'],['fps30','Meta 30 FPS'],['fps60','Meta 60 FPS'],['fps120','Meta 120 FPS'],['low','Leve'],['medium','Equilibrado'],['high','Alto']]
            .map(([key,label])=>'<option value="'+key+'" '+(key===this.actions.graphicsValue()?'selected':'')+'>'+label+'</option>').join('')+
          '</select></label>'+button('Duelo local','local')+button('Como jogar','help');
        break;
    }
    this.root.innerHTML = '<div class="lobby-heading">'+(this.page==='home'?'':button('‹','back','aria-label="Voltar"'))+
      '<h2>'+title+'</h2></div><div class="lobby-body">'+body+
      (this.error?'<p class="lobby-error" role="alert">'+escape(this.error)+'</p>':'')+'</div>';
    if (scroll) this.root.querySelector('.lobby-part-grid').scrollTop = scroll;
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
    const code = this.flow === 'join' ? this.validateRoomCode() : null;
    if (this.flow === 'join' && !code) return;
    if (this.flow === 'cpu') {
      this.hide();
      this.actions.play(this.format,beys,this.difficulty);
    } else {
      this.queue = {format:this.format,beys,start:performance.now(),count:null};
      this.show('queue');
      this.actions.join(this.format,{privateRoom:this.flow==='private',code});
    }
  }

  matched() {
    const pending = this.queue;
    this.queue = null;
    this.hide();
    return pending;
  }

  save() {
    if (this.single) {
      this.singleBey = this.draft.beys[0];
      return this.show('loadout');
    }
    const name = this.draft.name.trim();
    const duplicate = Object.keys(kinds).some(kind=>{
      const parts = this.draft.beys.map(bey=>bey[kind]).filter(Boolean);
      return new Set(parts).size !== parts.length;
    });
    if (!name || duplicate) {
      this.error = name?'Use peças diferentes entre as três Beys.':'Dê um nome ao deck.';
      this.render();
      return;
    }
    const deck = { id:this.draft.id ?? crypto.randomUUID(), name, beys:this.draft.beys };
    this.decks = [deck,...this.decks.filter(entry=>entry.id!==deck.id)];
    this.writeDecks();
    this.show(this.returnPage);
  }

  writeDecks() {
    try { localStorage.setItem(storageKey,JSON.stringify(this.decks)); } catch { /* Browser storage may be blocked. */ }
  }

  click(target) {
    const {lobby:action,id,format,kind,code,slot,value} = target.dataset;
    const deck = this.decks.find(entry=>entry.id===id);
    switch (action) {
      case 'home': this.show('home'); break;
      case 'online': case 'decks': case 'settings': this.show(action); break;
      case 'cpu': case 'search': case 'private': case 'join':
        this.flow = action; this.show('format'); break;
      case 'format': this.format = format; this.show(this.flow==='cpu'?'difficulty':'loadout'); break;
      case 'difficulty': this.difficulty=value; this.show('loadout'); break;
      case 'new': this.edit(); break;
      case 'edit': if (deck) this.edit(deck); break;
      case 'single-edit': this.edit({beys:[this.singleBey??defaults[0]]},true); break;
      case 'use': if (deck) this.choose(deck.beys); break;
      case 'single-use': this.choose([this.singleBey??defaults[0]]); break;
      case 'slot': this.slot=Number(slot); this.part='blade'; this.render(); break;
      case 'kind': this.part=kind; this.render(); break;
      case 'part': {
        const bey = this.draft.beys[this.slot];
        const stock = this.part==='blade' ? BLADES[code].stock : null;
        const change = stock ? {blade:code,ratchet:stock[0],bit:stock[1]} : {[this.part]:code};
        this.draft.beys[this.slot] = sanitizeConfig({...bey,...change},0);
        this.render();
        break;
      }
      case 'save': this.save(); break;
      case 'delete':
        if (!this.draft.id || !confirm('Excluir este deck?')) break;
        this.decks=this.decks.filter(entry=>entry.id!==this.draft.id); this.writeDecks(); this.show(this.returnPage); break;
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
