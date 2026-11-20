import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BattlePassProtocol,decodeHistory,decodeHeader,command,BATTLE_PASS} from '../public/js/battle-pass/protocol.mjs';
import {BattlePassSession} from '../public/js/battle-pass/session.mjs';
import {BattlePassSync} from '../public/js/battle-pass/sync.mjs';
import {BattlePassTransport,compatibility} from '../public/js/battle-pass/transport.mjs';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/battle-pass.json',import.meta.url)));
const bytes=hex=>Uint8Array.from(Buffer.from(hex,'hex'));
const history=fixture=>decodeHistory(fixture.slice(1,9).map(bytes));
const pause=ms=>new Promise(r=>setTimeout(r,ms));

test('real A0 payload, little endian, address and attach/cancel/launch states',()=>{
  const attached=decodeHeader(bytes(fixtures.attached));
  assert.equal(attached.counter,29);assert.equal(attached.best,5634);assert.equal(attached.address,'dac45104b435');
  const session=new BattlePassSession();assert.equal(session.metadata(attached),'attached');
  assert.equal(session.metadata(decodeHeader(bytes(fixtures.dropped))),'cancelled');
  session.metadata(attached);assert.equal(session.metadata(decodeHeader(bytes(fixtures.launched))),'ready');
});
test('real first launch and FIFO 50 after 55 launches; full checksum',()=>{
  const first=history(fixtures.first);assert.deepEqual(first.values,[3234]);assert.equal(first.counter,1);
  const last=history(fixtures.fiftyFifth);assert.equal(last.values.length,50);assert.equal(last.counter,55);
  assert.equal(last.best,9541);assert.equal(last.values[0],5319);assert.equal(last.values.at(-1),8700);
  const session=new BattlePassSession();const entries=session.snapshot(last);
  assert.equal(entries[0].counter,6);assert.equal(entries.at(-1).counter,55);
  assert.ok(entries.every(r=>r.measuredAt===null && r.source==='history'));
});
test('fragmented and coalesced BLE notifications, sensor pages identify live capture',()=>{
  const received=[],invalid=[],decoder=new BattlePassProtocol({onEvent:e=>received.push(e),onInvalid:e=>invalid.push(e)});
  const payload=Buffer.from(fixtures.first.join(''),'hex');
  for(let i=0;i<payload.length;i+=7) decoder.feed(payload.subarray(i,i+7));
  decoder.flush();decoder.reset();assert.equal(invalid.length,0);
  assert.equal(received.filter(e=>e.type==='history').length,1);assert.equal(received.at(-1).live,true);
  const entries=new BattlePassSession().snapshot(received.at(-1),'2026-11-20T12:00:00Z');
  assert.equal(entries[0].source,'live');assert.equal(entries[0].measuredAt,'2026-11-20T12:00:00Z');
});
test('requested history stays imported, truncated and corrupt packets rejected and next read recovers',()=>{
  const received=[],invalid=[],decoder=new BattlePassProtocol({onEvent:e=>received.push(e),onInvalid:e=>invalid.push(e)});
  decoder.expectHistory();fixtures.first.slice(1,9).forEach(p=>decoder.feed(bytes(p)));
  assert.equal(received.at(-1).live,false);
  decoder.feed(bytes('b0a20c'));decoder.flush();assert.ok(invalid.length);
  const corrupt=fixtures.first.slice(1,9).map(bytes);corrupt[2][5]=50;
  assert.throws(()=>decodeHistory(corrupt),/Checksum/);
  corrupt.forEach(p=>decoder.feed(p));decoder.flush();
  decoder.feed(bytes('b200000000000000000000000000000000'));decoder.flush();
  const validBefore=received.filter(e=>e.type==='history').length;
  fixtures.first.forEach(p=>decoder.feed(bytes(p)));decoder.flush();decoder.reset();
  assert.equal(received.filter(e=>e.type==='history').length,validBefore+1);
  assert.ok(invalid.length>=3);
});
test('idempotent repeated frames, reconnect cursor, counter wrap and external reset',()=>{
  const data={...history(fixtures.first),live:true};
  const session=new BattlePassSession();assert.equal(session.snapshot(data).length,1);assert.equal(session.snapshot(data).length,0);
  assert.equal(new BattlePassSession({counter:1}).snapshot(data).length,0);
  const wrapped=new BattlePassSession({counter:65535,epoch:4});
  const entries=wrapped.snapshot({counter:1,values:[4000,4500,4600],live:true});
  assert.deepEqual(entries.map(e=>[e.epoch,e.counter]),[[5,0],[5,1]]);
  assert.equal(entries.at(-1).source,'live');
  const initialWrap=new BattlePassSession().snapshot({counter:1,values:[4000,4500,4600],live:false});
  assert.deepEqual(initialWrap.map(e=>[e.epoch,e.counter]),[[0,65535],[1,0],[1,1]]);
  const reset=new BattlePassSession({counter:500,epoch:0});assert.equal(reset.snapshot(data)[0].epoch,1);
});
test('only read commands exist; unsupported and insecure browsers detected',()=>{
  assert.deepEqual([...command('metadata')],[81]);assert.deepEqual([...command('history')],[116]);
  assert.throws(()=>command('erase'));assert.throws(()=>command('clear'));
  assert.throws(()=>command('toString'));assert.throws(()=>command('constructor'));
  assert.equal(compatibility({isSecureContext:false,navigator:{bluetooth:{requestDevice(){}}}}).supported,false);
  assert.equal(compatibility({isSecureContext:true,navigator:{userAgent:'iPhone'}}).ios,true);
});
test('transport requests permission only on connect, actual UUIDs, cancellation and disconnect mid-read',async()=>{
  let requests=0,disconnected=false;const sent=[],states=[];
  class Device extends EventTarget {name=BATTLE_PASS.name;id='test';gatt={connected:false,
    connect:async()=>{this.gatt.connected=true;return {getPrimaryService:async uuid=>{assert.equal(uuid,BATTLE_PASS.service);return {getCharacteristic:async id=>id===BATTLE_PASS.write?{writeValueWithoutResponse:async data=>sent.push([...data])}:Object.assign(new EventTarget(),{startNotifications:async()=>{}})};}};},
    disconnect:()=>{disconnected=true;this.gatt.connected=false;}};}
  const device=new Device();
  const scope={isSecureContext:true,navigator:{bluetooth:{requestDevice:async options=>{requests++;assert.deepEqual(options.filters,[{name:BATTLE_PASS.name}]);return device;}}}};
  const transport=new BattlePassTransport({onData(){},onState:s=>{states.push(s);if(s==='connected') setTimeout(()=>transport.disconnect(),5);}},scope);
  assert.equal(requests,0);await assert.rejects(transport.connect(),/novamente/);
  assert.equal(requests,1);assert.deepEqual(sent,[[81]]);assert.ok(disconnected);
  assert.ok(states.includes('disconnected'));assert.equal(transport.characteristic,null);
  scope.navigator.bluetooth.getDevices=async()=>[device];
  await transport.prepare();
  assert.equal(transport.knownDevice,device);
  const count=requests;await assert.rejects(transport.connect(),/novamente/);assert.equal(requests,count);
  transport.device=transport.knownDevice=null;
  scope.navigator.bluetooth.requestDevice=async()=>{throw Object.assign(new Error('cancel'),{name:'NotFoundError'});};
  await transport.connect();assert.equal(transport.connecting,false);
});
test('offline durable outbox, retry after reload, deduplication, batched synchronization and guest isolation',async()=>{
  let durable={devices:{},sessions:[]},online=false;const posts=[];
  const store={owner:'account-a',async read(){return structuredClone(durable);},async change(update){update(durable);return structuredClone(durable);}};
  const request=async(_path,options)=>{if(!online) throw new Error('offline');posts.push(options.body);return {};};
  const session={id:'session-test',startedAt:new Date().toISOString(),endedAt:null},device={key:'a'.repeat(64),name:BATTLE_PASS.name};
  const rows=Array.from({length:120},(_,i)=>({key:'0:'+i,epoch:0,counter:i,sp:4000+i,source:'history',measuredAt:null}));
  const first=new BattlePassSync(store,{request,authenticated:true});
  await first.add(session,device,rows,{counter:119,epoch:0});await pause(20);first.stop();
  assert.equal(durable.sessions[0].launches.length,120);assert.equal(posts.length,0);
  online=true;const restored=new BattlePassSync(store,{request,authenticated:true});
  await restored.flush();await pause(300);await restored.flush();restored.stop();
  assert.equal(posts.length,2);assert.equal(posts[0].launches.length,100);assert.equal(posts[1].launches.length,20);
  assert.ok(posts.every(p=>p.accountId==='account-a'));assert.ok(durable.sessions[0].launches.every(r=>r.synced));
  const guest=new BattlePassSync(store,{request,authenticated:false});
  await guest.add(session,device,rows,{counter:119,epoch:0});assert.equal(durable.sessions[0].launches.length,120);
  await guest.flush();guest.stop();assert.equal(posts.length,2);
});

test('SP colors and profile progression use the requested exact thresholds',async()=>{
  globalThis.BX={};await import('../public/js/battle-pass/power.js');
  const {tone,level}=BX.shootPower;
  assert.equal(tone(10999),'neutral');assert.equal(tone(11000),'green');assert.equal(tone(11999),'green');
  assert.equal(tone(12000),'orange');assert.equal(tone(14999),'orange');assert.equal(tone(15000),'red');
  assert.equal(level(0).label,'Iniciante');assert.equal(level(19999).label,'Habilidoso');assert.equal(level(20000).label,'Profissional');
});
