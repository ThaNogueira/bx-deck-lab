import { BATTLE_PASS, command } from './protocol.mjs';

export function compatibility(scope=globalThis) {
  const ios = /iPhone|iPad|iPod/.test(scope.navigator?.userAgent??'') ||
    scope.navigator?.platform==='MacIntel' && scope.navigator?.maxTouchPoints>1;
  const supported = scope.isSecureContext && typeof scope.navigator?.bluetooth?.requestDevice==='function';
  return {supported,ios,reason:!scope.isSecureContext ? 'Abra esta página por HTTPS para conectar.' :
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
    try {
      const devices=await this.scope.navigator.bluetooth.getDevices();
      const preferred=this.scope.localStorage?.getItem('bx-battle-pass-device');
      this.knownDevice=devices.find(d=>d.name===BATTLE_PASS.name && d.id===preferred)??devices.find(d=>d.name===BATTLE_PASS.name)??null;
      return this.knownDevice;
    } catch {return null;}
  }

  async connect() {
    if (this.connecting || this.device?.gatt?.connected) return;
    if (!compatibility(this.scope).supported) throw new Error(compatibility(this.scope).reason);
    this.connecting = true;
    this.onState('connecting');
    try {
      // requestDevice stays in the click's activation, before any other asynchronous work.
      const device = this.device??this.knownDevice??await this.scope.navigator.bluetooth.requestDevice({
        filters:[{name:BATTLE_PASS.name}],optionalServices:[BATTLE_PASS.service],
      });
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
          const server = await step(device.gatt.connect());
          const service = await step(server.getPrimaryService(BATTLE_PASS.service));
          this.writer = await step(service.getCharacteristic(BATTLE_PASS.write));
          this.characteristic = await step(service.getCharacteristic(BATTLE_PASS.notify));
          this.characteristic.addEventListener('characteristicvaluechanged',this.receive);
          await step(this.characteristic.startNotifications());
        })(),new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('O Battle Pass não respondeu. Aproxime o acessório e tente conectar novamente.')),15000);})]);
      } finally {clearTimeout(timer);}
      if (!device.gatt.connected) throw new Error('O Battle Pass desconectou durante a conexão.');
      this.onState('connected',{name:device.name,localId:device.id});
      await this.readHistory();
    } catch (error) {
      this.disconnect();
      if (error.name==='NotFoundError' && !this.device) return;
      if (['SecurityError','NotAllowedError'].includes(error.name)) this.device=this.knownDevice=null;
      throw new Error(error.name==='SecurityError' ? 'Permita Bluetooth neste site e tente novamente.' : error.message);
    } finally { this.connecting = false; }
  }

  async write(name) {
    if (!this.writer || !this.device?.gatt?.connected) throw new Error('Conecte o Battle Pass novamente.');
    const bytes = command(name);
    this.onDiagnostic('Enviado '+bytes[0].toString(16));
    await this.writer.writeValueWithoutResponse(bytes);
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
    this.generation = (this.generation??0)+1;
    this.characteristic?.removeEventListener('characteristicvaluechanged',this.receive);
    const device = this.device;
    device?.removeEventListener('gattserverdisconnected',this.lost);
    this.characteristic = this.writer = null;
    if (device?.gatt?.connected) device.gatt.disconnect();
    this.onState('disconnected');
  }
}
