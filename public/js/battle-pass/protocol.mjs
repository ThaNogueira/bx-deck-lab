// Protocol research and payload fixtures by Simone Marzulli / DiZZi (MIT).
// See /battle-pass/THIRD-PARTY.txt for the copyright and permission notice.
export const BATTLE_PASS = Object.freeze({
  name:'BEYBLADE_TOOL01',
  service:'55c40000-f8eb-11ec-b939-0242ac120002',
  notify:'55c4f002-f8eb-11ec-b939-0242ac120002',
  write:'55c4f001-f8eb-11ec-b939-0242ac120002',
});

export function command(name) {
  const code = name==='metadata'?0x51:name==='history'?0x74:undefined;
  if (code===undefined) throw new Error('Comando de leitura inválido.');
  return Uint8Array.of(code);
}

export const hex = bytes => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(' ');
const u16 = (bytes,offset) => new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint16(offset,true);
const pageSize = tag => tag===0xa1 ? 4 : tag===0xa0 || tag>=0xb0 && tag<=0xb7 || tag>=0x70 && tag<=0x73 ? 17 : 0;

export function decodeHeader(bytes) {
  if (bytes.length!==17 || bytes[0]!==0xa0) throw new Error('Cabeçalho incompleto.');
  return {
    type:'metadata',counter:u16(bytes,9),best:u16(bytes,7),
    battery:{raw:bytes[4],percent:Math.round(bytes[4]*100/255),estimated:true},
    state:bytes[3]===4?'attached':bytes[3]===0?'ready':'unknown',
    address:Array.from(bytes.slice(11,17)).reverse().map(b=>b.toString(16).padStart(2,'0')).join(''),
  };
}

export function decodeHistory(pages) {
  if (pages.length!==8 || pages.some((p,i)=>p.length!==17 || p[0]!==0xb0+i)) throw new Error('Histórico incompleto.');
  const data = Uint8Array.from(pages.flatMap(p=>Array.from(p.slice(1))));
  const checksum = data.slice(0,127).reduce((sum,b)=>sum+b,0)%256;
  if (checksum!==data[127]) throw new Error('Checksum inválido.');
  const count = u16(data,106), counter = u16(data,104), best = u16(data,102);
  if (count>50) throw new Error('Quantidade de lançamentos inválida.');
  const values = Array.from({length:count},(_,i)=>u16(data,i*2));
  if (values.some(sp=>sp===0)) throw new Error('Lançamento vazio no histórico.');
  return {type:'history',counter,best,values,checksum};
}

export class BattlePassProtocol {
  constructor({onEvent=()=>{},onPacket=()=>{},onInvalid=()=>{}}={}) {
    Object.assign(this,{onEvent,onPacket,onInvalid});
    this.reset();
  }

  reset() {
    clearTimeout(this.timer);
    this.buffer = new Uint8Array();
    this.pages = [];
    this.pending = null;
    this.live = false;
    this.expectingHistory = false;
  }

  expectHistory() { this.expectingHistory = true; }

  feed(value) {
    const bytes = value instanceof DataView ? new Uint8Array(value.buffer,value.byteOffset,value.byteLength) : new Uint8Array(value);
    if (!bytes.length || bytes.length>4096) return;
    const joined = new Uint8Array(this.buffer.length+bytes.length);
    joined.set(this.buffer);joined.set(bytes,this.buffer.length);
    this.buffer = joined;
    while (this.buffer.length) {
      const size = pageSize(this.buffer[0]);
      if (!size) { this.buffer = this.buffer.slice(1);this.onInvalid('Byte fora de uma página conhecida.');continue; }
      if (this.buffer.length<size) break;
      const page = this.buffer.slice(0,size);
      this.buffer = this.buffer.slice(size);
      this.onPacket(page);
      try { this.accept(page); }
      catch (error) { this.pages=[];this.pending=null;this.onInvalid(error.message); }
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(()=>this.flush(),this.buffer.length || this.pages.length ? 1500 : 350);
  }

  accept(page) {
    const tag = page[0];
    if (tag===0xa0) {
      if (this.pending) this.finish();
      this.live = false;
      this.pages = [];
      this.onEvent(decodeHeader(page));
    } else if (tag===0xa1) {
      this.pages = [];this.pending = null;
      this.onEvent({type:'device-reset'});
    } else if (tag>=0xb0 && tag<=0xb7) {
      if (tag===0xb0) { if (this.pending) this.finish();this.pages=[]; }
      if (tag!==0xb0+this.pages.length) throw new Error('Página do histórico fora de sequência.');
      this.pages.push(page);
      if (tag===0xb7) {
        this.pending = decodeHistory(this.pages);
        this.pages = [];
        if (this.expectingHistory) this.finish();
      }
    } else {
      // The sensor pages have no documented conversion. Only their presence identifies a live capture.
      if (tag===0x70) this.live = true;
      if (tag===0x73) this.finish();
    }
  }

  finish() {
    if (this.pending) this.onEvent({...this.pending,live:this.live && !this.expectingHistory});
    this.pending = null;
    this.live = this.expectingHistory = false;
  }

  flush() {
    this.finish();
    if (this.buffer.length || this.pages.length) this.onInvalid('Recepção incompleta. Leia o histórico novamente.');
    this.buffer = new Uint8Array();
    this.pages = [];
  }
}
