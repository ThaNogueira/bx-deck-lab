import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('push is scoped to the bound account, replaces one session notification and focuses without navigating the capture page',async()=>{
  const handlers=new Map(),state=new Map(),notifications=[],messages=[],opened=[];let windows=[{url:'https://beyxlab.com.br/battle-pass',async focus(){messages.push('focused');},postMessage:message=>messages.push(message)}];
  const indexedDB={open(){const request={};queueMicrotask(()=>{request.result={createObjectStore(){},close(){},transaction(){const tx={objectStore(){return {get(key){const q={};queueMicrotask(()=>{q.result=state.get(key);q.onsuccess();queueMicrotask(()=>tx.oncomplete());});return q;},put(value,key){state.set(key,value);const q={};queueMicrotask(()=>{q.onsuccess();queueMicrotask(()=>tx.oncomplete());});return q;}};}};return tx;}};request.onupgradeneeded();request.onsuccess();});return request;}};
  const self={location:{origin:'https://beyxlab.com.br'},registration:{async showNotification(title,options){notifications.push({title,options});}},clients:{async matchAll(){return windows;},async openWindow(url){opened.push(url);}},addEventListener(type,handler){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(handler);}};
  vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{self,indexedDB,URL,Date,console});
  const fire=async(type,data)=>{const waits=[];for(const handler of handlers.get(type)??[])handler({...data,waitUntil:p=>waits.push(p)});await Promise.all(waits);};
  const push=data=>fire('push',{data:{json:()=>data}});
  await fire('message',{data:{type:'bp-push-account',userId:'account-one'}});
  const payload={type:'battle-pass-launch',userId:'account-one',sessionId:'session-one',eventId:'launch-one',title:'12.000 SP · Lançamento',body:'Dran Sword',icon:'/blade.png',at:new Date().toISOString()};
  await push({...payload,userId:'account-two'});assert.equal(notifications.length,0);
  await push(payload);await push({...payload,eventId:'launch-two'});assert.equal(notifications.length,2);
  assert.equal(notifications[0].options.tag,notifications[1].options.tag);assert.equal(notifications[0].options.renotify,false);assert.equal(notifications[0].options.icon,'https://beyxlab.com.br/blade.png');
  let closed=0;await fire('notificationclick',{notification:{data:{...notifications[0].options.data,url:'https://outside.invalid'},close(){closed++;}}});
  assert.equal(closed,1);assert.equal(messages[0],'focused');assert.equal(messages[1].type,'bp-open-session');assert.equal(opened.length,0);
  windows=[];await fire('notificationclick',{notification:{data:notifications[0].options.data,close(){}}});assert.equal(opened[0],'https://beyxlab.com.br/battle-pass?session=session-one');
  await fire('message',{data:{type:'bp-push-account',userId:null}});await push(payload);assert.equal(notifications.length,2);
});
