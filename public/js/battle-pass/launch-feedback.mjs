export class LaunchFeedback {
  constructor(onOpen) {this.onOpen=onOpen;}
  show(row,identity) {
    if(identity===this.lastIdentity)return;
    this.lastIdentity=identity;
    if(!this.element) {
      this.element=document.createElement('aside');this.element.className='bp-launch-toast';
      this.element.setAttribute('role','status');this.element.setAttribute('aria-live','polite');
      const button=document.createElement('button');button.type='button';
      button.innerHTML='<span>Último lançamento</span><b class="bp-power-number"><span></span><small>SP</small></b>';
      button.onclick=()=>{this.onOpen();this.hide();};this.element.appendChild(button);
    }
    this.element.querySelector('b>span').textContent=Math.round(row.sp).toLocaleString('pt-BR');
    this.element.querySelector('b').dataset.powerTone=BX.shootPower.tone(row.sp);
    this.element.querySelector('button').setAttribute('aria-label','Último lançamento: '+row.sp+' SP. Abrir treino.');
    document.body.appendChild(this.element);
    clearTimeout(this.timer);this.timer=setTimeout(()=>this.hide(),4500);
  }
  hide() {clearTimeout(this.timer);this.element?.remove();}
}
