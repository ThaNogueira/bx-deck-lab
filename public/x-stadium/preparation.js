import { BLADES } from './rules.js';
import { avatarMarkup, escapeText } from './account.js';

const positions = ['1ª','2ª','3ª'];
const pipPositions = [[5],[1,9],[1,5,9],[1,3,7,9],[1,3,5,7,9],[1,3,4,6,7,9]];
const diceCube = value => '<div class="stadium-die" aria-hidden="true"><div class="stadium-die-cube" data-value="'+value+'">'+
  pipPositions.map((pips,i)=>'<div class="stadium-die-face" data-face="'+(i+1)+'">'+
    pips.map(position=>'<i style="grid-area:'+Math.ceil(position/3)+'/'+((position-1)%3+1)+'"></i>').join('')+'</div>').join('')+'</div></div>';

export class StadiumPreparation {
  constructor(root,thumb) {
    this.root = root;
    this.thumb = thumb;
    root.addEventListener('click',event=>{
      const button = event.target.closest('button');
      if (!button || this.locked || this.suppressClick) return;
      if (button.dataset.parity || button.dataset.arenaSide) {
        this.locked = true;
        this.root.querySelectorAll('button').forEach(node=>{ node.disabled = true; });
        this.confirm(button.dataset.parity || button.dataset.arenaSide);
      } else if (button.dataset.orderSlot!==undefined) {
        this.selected = Number(button.dataset.orderSlot);
        this.updateOrder();
      } else if (button.dataset.moveOrder) {
        this.move(this.selected,this.selected+Number(button.dataset.moveOrder));
      } else if (button.dataset.confirmOrder!==undefined && this.canConfirm()) {
        this.locked = true;
        this.updateOrder();
        this.confirm(this.deck);
      }
    });
    root.addEventListener('pointerdown',event=>this.beginDrag(event));
    root.addEventListener('pointermove',event=>this.continueDrag(event));
    root.addEventListener('pointerup',event=>this.endDrag(event));
    root.addEventListener('pointercancel',event=>this.endDrag(event,true));
    root.addEventListener('error',event=>{
      if (event.target.matches('img')) event.target.hidden = true;
    },true);
  }

  show(content,view) {
    this.root.dataset.view = view;
    this.root.innerHTML = content;
    this.root.hidden = false;
  }

  intro(profiles) {
    this.show(this.versus(profiles.map(profile=>avatarMarkup(profile)+'<strong>'+escapeText(profile.name)+'</strong>')),'intro');
  }

  reveal(configs) {
    this.show(this.versus(configs.map(config=>this.thumb('blade',config.blade)+'<strong>'+escapeText(BLADES[config.blade].name)+'</strong>')),'reveal');
  }

  parity(chooser,confirm) {
    this.locked = false;
    this.confirm = confirm;
    this.show('<h2>Par ou ímpar</h2>'+diceCube(1)+(confirm?'<div class="stadium-dice-actions">'+
      '<button type="button" data-parity="even">Par</button><button type="button" data-parity="odd">Ímpar</button></div>':
      '<p class="stadium-lineup-status" role="status">'+escapeText(chooser)+' vai escolher par ou ímpar.</p>'),'dice');
  }

  roll(value,parity,chooser,winner) {
    this.show('<h2>'+escapeText(chooser)+' escolheu '+(parity==='even'?'par':'ímpar')+'</h2>'+diceCube(value)+
      '<p class="stadium-dice-result" role="status">'+value+' · '+(value%2===0?'Par':'Ímpar')+' · '+escapeText(winner)+' escolhe o lado</p>','roll');
  }

  sides(winner,confirm,assigned=false) {
    this.locked = false;
    this.confirm = confirm;
    this.show('<h2>'+(assigned?'Preparando o lançamento':confirm?'Escolha seu lado':escapeText(winner)+' está escolhendo o lado')+'</h2>'+
      '<div class="stadium-arena-map" aria-label="Vista de cima da arena">'+
      '<button type="button" data-arena-side="B"'+(confirm?'':' disabled')+'><b>B</b><span>Esquerda</span></button>'+
      '<button type="button" data-arena-side="X"'+(confirm?'':' disabled')+'><b>X</b><span>Direita</span></button></div>','sides');
  }

  versus(cards) {
    return '<div class="stadium-versus"><div>'+cards[0]+'</div><b>VS</b><div>'+cards[1]+'</div></div>';
  }

  clear() {
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.drag = null;
    this.confirm = null;
  }

  order(deck,reorder,online,confirm) {
    this.original = deck;
    this.deck = [...deck];
    this.selected = 0;
    this.reorder = reorder;
    this.online = online;
    this.confirm = confirm;
    this.locked = this.opponentReady = this.suppressClick = false;
    this.show('<h2>'+(reorder?'Escolha uma nova ordem':'Escolha a ordem do deck')+'</h2>'+
      '<div class="stadium-lineup-cards"></div><div class="stadium-lineup-actions">'+
      '<button type="button" data-move-order="-1" aria-label="Mover para a esquerda">‹</button>'+
      '<button type="button" data-confirm-order>Confirmar ordem</button>'+
      '<button type="button" data-move-order="1" aria-label="Mover para a direita">›</button></div>'+
      '<p class="stadium-lineup-status" role="status"></p>','order');
    this.drawOrder();
  }

  canConfirm() {
    return !this.locked && (!this.reorder || this.deck.some((bey,i)=>bey!==this.original[i]));
  }

  drawOrder() {
    this.root.querySelector('.stadium-lineup-cards').innerHTML = this.deck.map((bey,i)=>
      '<button type="button" data-order-slot="'+i+'" data-blade="'+bey.blade+'"><span>'+positions[i]+'</span>'+
      this.thumb('blade',bey.blade)+'<strong>'+escapeText(BLADES[bey.blade].name)+'</strong></button>').join('');
    this.updateOrder();
  }

  updateOrder() {
    if (this.root.hidden || this.root.dataset.view!=='order') return;
    this.root.querySelectorAll('[data-order-slot]').forEach((card,i)=>{
      card.setAttribute('aria-pressed',i===this.selected);
      card.disabled = this.locked;
    });
    this.root.querySelector('[data-move-order="-1"]').disabled = this.locked || this.selected===0;
    this.root.querySelector('[data-move-order="1"]').disabled = this.locked || this.selected===2;
    this.root.querySelector('[data-confirm-order]').disabled = !this.canConfirm();
    this.root.querySelector('.stadium-lineup-status').textContent = this.locked && this.online ? 'Ordem confirmada · aguardando o adversário' :
      this.opponentReady ? 'Adversário pronto' : this.reorder && !this.canConfirm() ? 'Mova uma Bey para confirmar a nova ordem.' : 'Arraste as Beys ou use as setas.';
  }

  readyOpponent() {
    this.opponentReady = true;
    this.updateOrder();
  }

  move(from,to) {
    if (this.locked || from===to || to<0 || to>2) return;
    const old = new Map([...this.root.querySelectorAll('[data-order-slot]')].map(card=>[card.dataset.blade,card.getBoundingClientRect().x]));
    const [bey] = this.deck.splice(from,1);
    this.deck.splice(to,0,bey);
    this.selected = to;
    this.drawOrder();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const card of this.root.querySelectorAll('[data-order-slot]')) {
        const offset = old.get(card.dataset.blade)-card.getBoundingClientRect().x;
        if (offset) card.animate([{translate:offset+'px 0'},{translate:'0 0'}],{duration:180,easing:'ease-out'});
      }
    }
  }

  beginDrag(event) {
    const card = event.target.closest('[data-order-slot]');
    if (!card || this.locked || event.button!==0 || this.drag) return;
    this.drag = {id:event.pointerId,start:event.clientX,index:Number(card.dataset.orderSlot),card,
      centers:[...this.root.querySelectorAll('[data-order-slot]')].map(node=>{
        const rect = node.getBoundingClientRect();
        return rect.left+rect.width/2;
      })};
    card.setPointerCapture(event.pointerId);
  }

  continueDrag(event) {
    const drag = this.drag;
    if (!drag || event.pointerId!==drag.id) return;
    const offset = event.clientX-drag.start;
    if (Math.abs(offset)>7) drag.moving = true;
    if (!drag.moving) return;
    drag.card.classList.add('dragging');
    drag.card.style.transform = 'translateX('+offset+'px)';
    const x = drag.centers[drag.index]+offset;
    drag.target = drag.centers.reduce((closest,center,i)=>Math.abs(center-x)<Math.abs(drag.centers[closest]-x)?i:closest,drag.index);
    this.root.querySelectorAll('[data-order-slot]').forEach((card,i)=>card.classList.toggle('drop-target',i===drag.target && i!==drag.index));
  }

  endDrag(event,cancelled=false) {
    const drag = this.drag;
    if (!drag || event.pointerId!==drag.id) return;
    this.drag = null;
    if (!drag.moving) return;
    this.suppressClick = true;
    setTimeout(()=>{this.suppressClick=false;},0);
    this.root.querySelectorAll('[data-order-slot]').forEach(card=>card.classList.remove('drop-target'));
    drag.card.classList.remove('dragging');
    drag.card.style.removeProperty('transform');
    if (!cancelled) this.move(drag.index,drag.target);
  }
}
