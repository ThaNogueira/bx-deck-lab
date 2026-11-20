import { BATTLE_PASS, command } from './protocol.mjs';

export function compatibility(scope=globalThis) {
  const ios = /iPhone|iPad|iPod/.test(scope.navigator?.userAgent??'') ||
    scope.navigator?.platform==='MacIntel' && scope.navigator?.maxTouchPoints>1;
  const secure = scope.isSecureContext===true || scope.isSecureContext===undefined && scope.location?.protocol==='https:';
  const supported = secure && typeof scope.navigator?.bluetooth?.requestDevice==='function';
  return {supported,ios,reason:!secure ? 'Abra esta página por HTTPS para conectar.' :
    supported ? '' : 'Bluetooth indisponível neste navegador. Seu histórico continua acessível.'};
}

export class BattlePassTransport {
  constructor({onData,onState,onDiagnostic=()=>{}},scope=globalThis) {
    Object.assign(this,{onData,onState,onDiagnostic,scope});
    this.receive = event=>this.onData(event.target.value);
    this.lost = ()=>{
      this.generation = (this.generation??0)+1;
      this.characteristic?.removeEventListener('characteristicvaluechanged',this.receive);
      this.characteristic = this.writer = null;
      this.onState('disconnected');
    };
  }

  async prepare() {
    if(!compatibility(this.scope).supported || !this.scope.navigator.bluetooth.getDevices) return null;
    let timer;
    try {
      const devices=await Promise.race([this.scope.navigator.bluetooth.getDevices(),new Promise(resolve=>{timer=setTimeout(()=>resolve([]),1200);})]);
      const preferred=this.scope.localStorage?.getItem('bx-battle-pass-device');
      this.knownDevice=devices.find(d=>d.name===BATTLE_PASS.name && d.id===preferred)??devices.find(d=>d.name===BATTLE_PASS.name)??null;
      return this.knownDevice;
    } catch {return null;} finally {clearTimeout(timer);}
  }

  async connect() {
    if (this.connecting || this.device?.gatt?.connected) return;
    if (!compatibility(this.scope).supported) throw new Error(compatibility(this.scope).reason);
    const attempt=this.attempt=(this.attempt??0)+1;
    this.connecting = true;
    this.onState('searching');
    try {
      // requestDevice stays in the click's activation, before any other asynchronous work.
      const device = this.device??this.knownDevice??await this.scope.navigator.bluetooth.requestDevice({
        filters:[{name:BATTLE_PASS.name}],optionalServices:[BATTLE_PASS.service],
      });
      if(attempt!==this.attempt) return;
      this.device?.removeEventListener('gattserverdisconnected',this.lost);
      this.device = device;
      this.knownDevice=device;
      try {this.scope.localStorage?.setItem('bx-battle-pass-device',device.id);} catch {}
      device.addEventListener('gattserverdisconnected',this.lost);
      const generation = this.generation;
      const step = async promise=>{
        const result = await promise;
        if (generation!==this.generation) {
          if(device.gatt.connected) device.gatt.disconnect();
          throw new Error('Conexão cancelada. Tente novamente.');
        }
        return result;
      };
      let timer;
      try {
        await Promise.race([(async()=>{
          let server;
          while(!server) {
            try {server=await step(device.gatt.connect());}
            catch(error) {
              if(attempt!==this.attempt || !['NetworkError','NotFoundError','TimeoutError'].includes(error.name)) throw error;
              this.onState('searching');
              await step(new Promise(resolve=>setTimeout(resolve,1000)));
            }
          }
          this.onState('connecting');
          const service = await step(server.getPrimaryService(BATTLE_PASS.service));
          this.writer = await step(service.getCharacteristic(BATTLE_PASS.write));
          this.characteristic = await step(service.getCharacteristic(BATTLE_PASS.notify));
          this.characteristic.addEventListener('characteristicvaluechanged',this.receive);
          await step(this.characteristic.startNotifications());
        })(),new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Battle Pass não encontrado. Ative o pareamento e toque em Conectar novamente.')),90000);})]);
      } finally {clearTimeout(timer);}
      if (!device.gatt.connected) throw new Error('O Battle Pass desconectou durante a conexão.');
      this.onState('connected',{name:device.name,localId:device.id});
      await this.readHistory();
    } catch (error) {
      if(attempt!==this.attempt) return;
      this.disconnect();
      const cancelled=error.name==='NotFoundError' && !this.device;
      this.device=this.knownDevice=null;
      if(cancelled) return;
      throw new Error(error.name==='SecurityError' ? 'Permita Bluetooth neste site e tente novamente.' : error.message);
    } finally {if(attempt===this.attempt) this.connecting = false;}
  }

  async write(name) {
    if (!this.writer || !this.device?.gatt?.connected) throw new Error('Conecte o Battle Pass novamente.');
    const bytes = command(name);
    this.onDiagnostic('Enviado '+bytes[0].toString(16));
    const writer=this.writer,send=writer.writeValueWithoutResponse??writer.writeValue;
    if(typeof send!=='function') throw new Error('O navegador não disponibilizou a escrita Bluetooth. Atualize o Bluefy ou teste outro navegador compatível.');
    let timer;
    try {await Promise.race([send.call(writer,bytes),new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('O Battle Pass não respondeu à leitura. Conecte novamente.')),8000);})]);}
    finally {clearTimeout(timer);}
  }

  async readHistory() {
    if (this.reading) return;
    this.reading = true;
    try {
      await this.write('metadata');
      await new Promise(resolve=>setTimeout(resolve,700));
      this.onState('reading');
      await this.write('history');
    } finally { this.reading = false; }
  }

  disconnect() {
    this.attempt=(this.attempt??0)+1;
    this.connecting=false;
    this.generation = (this.generation??0)+1;
    this.characteristic?.removeEventListener('characteristicvaluechanged',this.receive);
    const device = this.device;
    device?.removeEventListener('gattserverdisconnected',this.lost);
    this.characteristic = this.writer = null;
    if (device?.gatt?.connected) device.gatt.disconnect();
    this.onState('disconnected');
  }
}
