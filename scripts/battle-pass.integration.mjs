// Real HTTP authentication, isolated SQLite migrations, IndexedDB and mocked BLE radio.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
const temp=mkdtempSync(path.join(tmpdir(),'bx-battle-pass-'));
new DatabaseSync(path.join(temp,'qa.db')).close();
process.env.DATABASE_URL='file:'+path.join(temp,'qa.db').replaceAll('\\','/');
process.env.NODE_ENV='test';process.env.BX_ISOLATED_TEST='1';
const migrated=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:process.env,encoding:'utf8'});
assert.equal(migrated.status,0,migrated.stderr);
const {prisma}=await import('../server/db.js');
const {createSession,sessionMiddleware,publicUser}=await import('../server/auth.js');
const {default:express}=await import('express');
const {default:routes}=await import('../server/routes/battle-pass.js');
const {default:profile}=await import('../server/routes/profile.js');
const {chromium}=await import('playwright');
let server,browser;
try {
  const users=await Promise.all(['one','two','radio'].map(name=>prisma.user.create({data:{name:'Blader '+name,slug:'bp-'+name,email:name+'@battle-pass.invalid'}})));
  assert.ok(users.every(user=>user.battlePassPublic===true));
  const catalog=await fetch('https://beyxlab.com.br/api/parts-index',{signal:AbortSignal.timeout(10000)}).then(r=>r.json());
  const blades=['dransword-2-0','cobaltdragoon'].map(slug=>catalog.parts.find(p=>p.slug===slug && p.kind==='BLADE' && !p.parentId));
  assert.ok(blades.every(p=>p?.img));
  for(const p of blades) await prisma.part.create({data:{id:p.id,slug:p.slug,kind:p.kind,name:p.name,displayName:p.display,imageUrl:p.img}});
  await prisma.user.update({where:{id:users[2].id},data:{favoritePartId:blades[1].id}});
  const cookies=[];
  for(const user of users) await createSession({cookie:(name,value)=>cookies.push(name+'='+value)},user.id);
  const app=express();app.use(express.json());
  app.use((req,_res,next)=>{req.cookies=Object.fromEntries((req.headers.cookie??'').split(';').filter(Boolean).map(pair=>pair.trim().split('=')));next();});
  app.use(sessionMiddleware);
  app.get('/api/me',(req,res)=>res.json({user:publicUser(req.user)}));
  app.get('/api/site',(_req,res)=>res.json({site:{name:'BX LAB'}}));
  app.get('/api/cosmetics',(_req,res)=>res.json({cosmetics:[]}));
  app.get('/api/parts-index',(_req,res)=>res.json({parts:[...blades,{id:'bit-test',name:'Needle',display:'Needle',kind:'BIT'}]}));
  app.get('/api/notifications/unread-count',(_req,res)=>res.json({unread:0}));
  app.use(routes,profile);
  app.get('/battle-pass',(_req,res)=>res.sendFile(path.resolve('public/battle-pass.html')));
  app.get('/u/:slug',(_req,res)=>res.sendFile(path.resolve('public/u.html')));
  app.use(express.static('public'));
  app.use((error,_req,res,_next)=>{console.error(error);res.status(500).json({error:error.message});});
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  async function api(url,{who=0,body,method='GET'}={}) {
    const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(who===null?{}:{Cookie:cookies[who]})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json()};
  }
  assert.equal((await api('/api/battle-pass')).data.public,true);
  assert.equal((await api('/api/battle-pass/ranking',{who:null})).data.entries.length,0);
  const device={key:'a'.repeat(64),name:'BEYBLADE_TOOL01'};
  const payload={accountId:users[0].id,device,session:{id:'training-http-001',startedAt:new Date().toISOString(),endedAt:null},
    launches:Array.from({length:50},(_,i)=>({sp:3000+i*10,counter:i+1,epoch:0,source:'history',measuredAt:null}))};
  assert.equal((await api('/api/battle-pass',{who:null})).status,401);
  assert.equal((await api('/api/battle-pass/sync',{who:null,method:'POST',body:payload})).status,401);
  assert.equal((await api('/api/battle-pass/sync',{who:1,method:'POST',body:payload})).status,409);
  const first=await api('/api/battle-pass/sync',{method:'POST',body:payload});assert.equal(first.data.inserted,50);
  const repeated=await Promise.all(Array.from({length:4},()=>api('/api/battle-pass/sync',{method:'POST',body:payload})));
  assert.ok(repeated.every(r=>r.status===200 && r.data.inserted===0));
  assert.equal(await prisma.battlePassLaunch.count(),50);
  const other=await api('/api/battle-pass/sync',{who:1,method:'POST',body:{...payload,accountId:users[1].id}});assert.equal(other.status,403);
  assert.equal((await api('/api/battle-pass/sessions/training-http-001',{who:1})).status,404);
  const sessionPage=await api('/api/battle-pass/sessions/training-http-001?page=2');assert.equal(sessionPage.data.launches.length,20);
  const own=await api('/api/battle-pass');assert.equal(own.data.summary.average,3245);assert.equal(own.data.summary.best,3490);
  assert.equal(own.data.summary.imported,50);assert.equal(own.data.sessions[0].launches[0].measuredAt,null);
  const conflict=structuredClone(payload);conflict.launches[0].sp=10000;
  assert.equal((await api('/api/battle-pass/sync',{method:'POST',body:conflict})).status,409);
  for(const bad of [{sp:0},{sp:65536},{counter:-1},{epoch:1.5},{source:'history',measuredAt:new Date().toISOString()},{simulated:true},{source:'live',measuredAt:null}]) {
    const body={...payload,launches:[{...payload.launches[0],...bad}]};assert.equal((await api('/api/battle-pass/sync',{method:'POST',body})).status,422);
  }
  assert.equal((await api('/api/battle-pass/sync',{method:'POST',body:{...payload,launches:Array(101).fill(payload.launches[0])}})).status,422);
  assert.equal((await api('/api/users/bp-one',{who:null})).data.battlePass.average,3245);
  assert.equal((await api('/api/users/bp-one')).data.battlePass.average,3245);
  assert.equal((await api('/api/battle-pass/ranking',{who:null})).data.entries[0].user.id,users[0].id);
  await api('/api/battle-pass/preferences',{method:'PATCH',body:{accountId:users[0].id,public:false}});
  assert.equal((await api('/api/users/bp-one',{who:null})).data.battlePass,null);
  assert.equal((await api('/api/battle-pass/ranking',{who:null})).data.entries.length,0);
  await api('/api/battle-pass/preferences',{method:'PATCH',body:{accountId:users[0].id,public:true}});
  const ranking=await api('/api/battle-pass/ranking?sort=average',{who:null});assert.equal(ranking.data.entries[0].average,3245);
  assert.ok(!JSON.stringify(ranking.data).includes('@battle-pass.invalid'));
  assert.equal((await api('/api/users/bp-one',{who:null})).data.battlePass.count,50);
  await prisma.user.update({where:{id:users[0].id},data:{status:'BANNED'}});
  assert.equal((await api('/api/battle-pass/ranking',{who:null})).data.entries.length,0);
  await prisma.user.update({where:{id:users[0].id},data:{status:'ACTIVE'}});
  // Legacy zero rows must neither qualify a player nor lower a valid SP average.
  const zeroDevice=await prisma.battlePassDevice.create({data:{userId:users[1].id,key:'b'.repeat(64),name:'BEYBLADE_TOOL01'}});
  const zeroSession=await prisma.battlePassTraining.create({data:{id:'training-zero-001',userId:users[1].id,deviceId:zeroDevice.id,startedAt:new Date()}});
  await prisma.battlePassLaunch.createMany({data:Array.from({length:15},(_,i)=>({userId:users[1].id,deviceId:zeroDevice.id,sessionId:zeroSession.id,sp:0,counter:i,epoch:0,source:'history'}))});
  for(const sort of ['best','average']) {
    const data=(await api('/api/battle-pass/ranking?sort='+sort,{who:null})).data;
    assert.equal(data.entries.length,1);assert.equal(data.entries[0].user.id,users[0].id);
  }
  await prisma.battlePassLaunch.updateMany({where:{sessionId:zeroSession.id,counter:{lt:9}},data:{sp:1000}});
  assert.equal((await api('/api/battle-pass/ranking',{who:null})).data.entries.length,1);
  await prisma.battlePassLaunch.updateMany({where:{sessionId:zeroSession.id,counter:9},data:{sp:1000}});
  const qualified=(await api('/api/battle-pass/ranking?sort=average',{who:null})).data.entries.find(r=>r.user.id===users[1].id);
  assert.equal(qualified.count,10);assert.equal(qualified.average,1000);assert.equal(qualified.best,1000);
  await prisma.battlePassTraining.delete({where:{id:zeroSession.id}});
  await prisma.battlePassDevice.delete({where:{id:zeroDevice.id}});
  console.log('PASS: migrations, auth, ownership, account switch, concurrent idempotency, validation, pagination, profile privacy and ranking.');

  browser=await chromium.launch({headless:true,channel:'msedge'});
  mkdirSync('artifacts/battle-pass',{recursive:true});
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/battle-pass.json',import.meta.url))).first;
  for(const width of [1440,390,360]) {
    const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/battle-pass');
    assert.ok(await page.locator('.bp-mini-empty').isVisible());
    assert.equal(await page.locator('.bp-mini-rotor svg').count(),0);
    assert.ok(await page.locator('#iosHelp').isHidden());
    assert.ok(await page.locator('#iosGuide').isHidden());
    assert.equal(await page.locator('.bp-heading, #diagnostic, .bp-footnote, #saveState, .bp-device-data').count(),0);
    await page.getByRole('button',{name:'Como conectar',exact:true}).click();
    await page.getByRole('button',{name:'Experimentar demonstração'}).click();
    await page.waitForFunction(()=>document.querySelector('#lastSp').textContent==='4.230');
    await page.screenshot({path:`artifacts/battle-pass/${width}-training.png`,fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.getByRole('button',{name:'Como conectar',exact:true}).click();
    await page.locator('#connectionGuide').waitFor();
    assert.equal(await page.locator('[data-guide-slide]').count(),4);
    assert.doesNotMatch(await page.locator('#connectionGuide').innerText(),/pilhas|Ligue o Battle Pass/i);
    await page.evaluate(async()=>{const urls=[...new Set([...document.querySelectorAll('#connectionGuide image')].map(img=>img.getAttribute('href')))];await Promise.all(urls.map(async url=>{const img=new Image();img.src=url;await img.decode();}));});
    for(let step=1;step<=4;step++) {
      await page.locator(`[data-guide-step="${step-1}"]`).click();
      await page.waitForFunction(step=>{
        const root=document.querySelector('#connectionGuide'),viewport=root.querySelector('.bp-guide-viewport');
        const slide=root.querySelector(`[data-guide-slide="${step-1}"]`);
        return root.dataset.step===String(step) && Math.abs(slide.getBoundingClientRect().left-viewport.getBoundingClientRect().left)<2;
      },step);
      assert.equal(await page.locator('[data-guide-slide][aria-hidden="false"]').count(),1);
      assert.equal(await page.locator('[data-guide-previous]').isDisabled(),step===1);
      assert.equal(await page.locator('[data-guide-next]').isDisabled(),step===4);
      await page.screenshot({path:`artifacts/battle-pass/${width}-guide-${step}.png`});
    }
    await page.locator('.bp-guide-viewport').focus();await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(()=>document.querySelector('#connectionGuide').dataset.step==='3');
    await page.locator('[data-guide-step="0"]').click();
    await page.evaluate(()=>{const viewport=document.querySelector('.bp-guide-viewport');viewport.scrollLeft=viewport.clientWidth;});
    await page.waitForFunction(()=>document.querySelector('#connectionGuide').dataset.step==='2');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.deepEqual(errors,[]);
    assert.equal(await prisma.battlePassLaunch.count({where:{userId:users[2].id}}),0);
    await context.close();
  }
  const context=await browser.newContext({viewport:{width:390,height:1000},reducedMotion:'reduce'});
  await context.addCookies([{name:'bx_session',value:cookies[2].split('=')[1],url:base}]);
  const mockRadioFixture=({fixture})=>{
    const bytes=hex=>new Uint8Array(hex.match(/../g).map(x=>parseInt(x,16)));
    const notify=new EventTarget();notify.startNotifications=async()=>{};
    const emit=hex=>{notify.value=new DataView(bytes(hex).buffer);notify.dispatchEvent(new Event('characteristicvaluechanged'));};
    const device=new EventTarget();device.name='BEYBLADE_TOOL01';device.id='radio-fixture';
    device.gatt={connected:false,disconnect(){this.connected=false;device.dispatchEvent(new Event('gattserverdisconnected'));},async connect(){this.connected=true;return {async getPrimaryService(){return {async getCharacteristic(uuid){
      if(uuid.includes('f002')) return notify;
      return {async writeValueWithoutResponse(data){window.__writes.push(data[0]);if(data[0]===81) emit(fixture[0]);else fixture.slice(1,9).forEach(emit);}};
    }}}};}};
    window.__requests=0;window.__writes=[];
    window.__attach=()=>emit(fixture[0].slice(0,6)+'04'+fixture[0].slice(8));
    window.__detach=()=>emit(fixture[0]);
    window.__battery=raw=>{const header=bytes(fixture[0]);header[4]=raw;emit([...header].map(b=>b.toString(16).padStart(2,'0')).join(''));};
    window.__beginLaunch=()=>{const header=bytes(fixture[0]);new DataView(header.buffer).setUint16(9,2,true);emit([...header].map(b=>b.toString(16).padStart(2,'0')).join(''));};
    Object.defineProperty(navigator,'bluetooth',{configurable:true,value:{async getDevices(){return localStorage.getItem('qa-bx-known')==='1'?[device]:[];},async requestDevice(){window.__requests++;window.__activation=navigator.userActivation?.isActive;return device;}}});
    window.__launch=(sp=6500,counter=2,sensors=true)=>{
      const data=new Uint8Array(128),view=new DataView(data.buffer);
      view.setUint16(0,3234,true);view.setUint16(2,sp,true);view.setUint16(102,Math.max(3234,sp),true);view.setUint16(104,counter,true);view.setUint16(106,2,true);
      data[127]=data.slice(0,127).reduce((a,b)=>a+b,0)%256;
      const hex=bytes=>[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
      const header=bytes(fixture[0]);new DataView(header.buffer).setUint16(7,Math.max(3234,sp),true);new DataView(header.buffer).setUint16(9,counter,true);emit(hex(header));
      for(let i=0;i<8;i++) emit(hex([176+i,...data.slice(i*16,(i+1)*16)]));
      if(sensors) fixture.slice(9).forEach(emit);
    };
  };
  await context.addInitScript(mockRadioFixture,{fixture});
  const page=await context.newPage();await page.goto(base+'/battle-pass');
  await page.waitForFunction(()=>!document.querySelector('#connectBtn').disabled);
  await page.waitForFunction(id=>document.querySelector('#bladeBtn').dataset.bladeId===id,blades[1].id);
  assert.ok(await page.locator('.bp-mini-empty').isHidden());
  await page.locator('#bladeBtn').click();
  await page.getByRole('dialog',{name:'Escolher Blade',exact:true}).waitFor();
  assert.equal(await page.locator('.bp-picker-grid>button').count(),2);
  await page.getByRole('searchbox',{name:'Buscar Blade'}).fill('Dran');
  assert.equal(await page.locator('.bp-picker-grid>button').count(),1);
  await page.locator('.bp-picker-grid>button').click();
  assert.equal(await page.locator('#bladeBtn').getAttribute('data-blade-id'),blades[0].id);
  await page.waitForFunction(()=>document.querySelector('#bladeBtn img').naturalWidth>0);
  assert.equal(await page.locator('#bladeBtn img').getAttribute('referrerpolicy'),'no-referrer');
  assert.ok(await page.locator('.bp-mini-empty').isHidden());
  assert.equal(await page.locator('#bladeBtn').getAttribute('data-spinning'),'false');
  assert.equal(await page.evaluate(()=>window.__requests),0);
  await page.locator('[data-tab="guide"]').click();
  await page.locator('[data-guide-step="2"]').click();
  await page.locator('[data-guide-connect]').click();
  await page.waitForFunction(()=>document.querySelector('#launchCount').textContent==='1');
  assert.deepEqual(await page.evaluate(()=>window.__writes),[81,116]);
  await page.waitForFunction(()=>document.querySelector('.bp-page').dataset.sync==='saved');
  assert.equal(await page.locator('#connectBtn').getAttribute('data-connected'),'true');
  assert.equal(await page.locator('#connectionGuide').getAttribute('data-step'),'4');
  assert.equal(await page.evaluate(()=>window.__activation),true);
  await page.locator('[data-guide-train]').click();
  assert.equal(await page.locator('#connectionBadge').innerText(),'Conectado');
  assert.equal(await page.locator('#connectBtn').getAttribute('aria-expanded'),'false');
  assert.ok(await page.locator('#disconnectBtn').isHidden());
  assert.equal(await page.locator('#batteryState b').innerText(),'100%');
  await page.evaluate(()=>window.__battery(218));
  assert.equal(await page.locator('#batteryState b').innerText(),'85%');
  assert.match(await page.locator('#batteryState').getAttribute('aria-label'),/Bateria: 85/);
  assert.doesNotMatch(await page.locator('#batteryState').innerText(),/estimad|≈/);
  await page.locator('#batteryState').click();
  await page.getByRole('dialog',{name:'Sobre a bateria'}).waitFor();
  assert.match(await page.getByRole('dialog',{name:'Sobre a bateria'}).innerText(),/estimativa/);
  await page.getByRole('button',{name:'Fechar detalhes da bateria'}).click();
  assert.ok(await page.getByRole('dialog',{name:'Sobre a bateria'}).isHidden());
  await page.evaluate(()=>window.__battery(0));
  assert.equal(await page.locator('#batteryState b').innerText(),'0%');
  for(const width of [390,360,1440]) {
    await page.setViewportSize({width,height:1000});
    const geometry=await page.evaluate(()=>({
      tops:[...document.querySelectorAll('.bp-status-controls>.bp-status-control')].map(el=>el.getBoundingClientRect().top),
      panel:document.querySelector('#connectionPanel').getBoundingClientRect().height,
      output:document.querySelector('.bp-latest').getBoundingClientRect().top,
      overflow:document.documentElement.scrollWidth>innerWidth+1,
    }));
    assert.equal(geometry.tops.length,3);assert.equal(new Set(geometry.tops).size,1);
    assert.equal(geometry.panel,0);assert.ok(geometry.output<480);assert.equal(geometry.overflow,false);
    await page.screenshot({path:`artifacts/battle-pass/${width}-connected.png`,fullPage:true});
  }
  await page.setViewportSize({width:390,height:1000});
  await page.getByRole('button',{name:'Opções do Battle Pass conectado'}).click();
  await page.locator('#disconnectBtn').waitFor({state:'visible'});
  assert.ok(await page.locator('#disconnectBtn').isVisible());
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#connectBtn').getAttribute('aria-expanded'),'false');
  await page.evaluate(()=>window.__attach());
  await page.waitForFunction(()=>document.querySelector('#beyState').textContent==='Bey encaixada');
  assert.equal(await page.locator('#batteryState b').innerText(),'100%');
  await page.evaluate(()=>window.__detach());
  await page.waitForFunction(()=>document.querySelector('#beyState').textContent==='Sem Bey encaixada');
  assert.equal(await page.evaluate(()=>window.__requests),1);
  await page.emulateMedia({reducedMotion:'no-preference'});
  const immediate=await page.evaluate(()=>{window.__beginLaunch();return {spinning:document.querySelector('#bladeBtn').dataset.spinning,value:document.querySelector('#lastSp').textContent};});
  assert.equal(immediate.spinning,'true');assert.equal(immediate.value,'3.234');
  let offline=true;await context.route('**/api/battle-pass/sync',route=>offline?route.abort():route.continue());
  await page.evaluate(()=>window.__launch());
  await page.waitForFunction(()=>document.querySelector('#lastSp').textContent==='6.500');
  await page.waitForFunction(()=>document.querySelector('.bp-page').dataset.sync==='pending');
  assert.equal(await prisma.battlePassLaunch.count({where:{userId:users[2].id}}),1);
  await page.screenshot({path:'artifacts/battle-pass/390-offline.png',fullPage:true});
  await page.reload();offline=false;await page.evaluate(()=>dispatchEvent(new Event('online')));
  await page.waitForFunction(id=>document.querySelector('#bladeBtn').dataset.bladeId===id,blades[0].id);
  await page.waitForFunction(()=>document.querySelector('.bp-page').dataset.sync==='saved');
  const records=await prisma.battlePassLaunch.findMany({where:{userId:users[2].id},orderBy:{counter:'asc'}});
  assert.equal(records.length,2);assert.equal(records[1].source,'live');assert.ok(records[1].measuredAt);
  await page.getByRole('button',{name:'Missões',exact:true}).click();
  await page.locator('.mm-progress').waitFor();
  assert.equal(await page.locator('.mm-mission').count(),6);
  await page.locator('[data-mission-id="d-first"].is-complete').waitFor();
  assert.equal(await page.locator('[data-mission-id="d-first"].is-complete').count(),1);
  const radioProgress=(await api('/api/battle-pass/missions',{who:2})).data;
  await page.waitForFunction(level=>document.querySelector('.mm-progress')?.dataset.level===String(level),radioProgress.level);
  assert.doesNotMatch(await page.locator('[data-mission-id="d-steady"] p').innerText(),/trios|20%/);
  await page.getByRole('button',{name:'Semanais',exact:true}).click();
  assert.equal(await page.locator('[data-mission-id^="w-"]').count(),6);
  await page.getByRole('button',{name:'Mensais',exact:true}).click();
  assert.equal(await page.locator('[data-mission-id^="m-"]').count(),4);
  await page.getByRole('button',{name:'Som de conquistas'}).click();
  assert.equal(await page.getByRole('button',{name:'Som de conquistas'}).getAttribute('aria-pressed'),'false');
  for(const width of [390,360,1440]) {
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:`artifacts/battle-pass/${width}-missions.png`,fullPage:true});
  }
  await page.setViewportSize({width:390,height:1000});
  await page.getByRole('button',{name:'Registros',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#publicStats').disabled);
  assert.ok(await page.getByRole('checkbox').isChecked());
  await page.getByRole('checkbox').uncheck();
  await page.waitForFunction(()=>!document.querySelector('#publicStats').disabled);
  assert.equal((await prisma.user.findUnique({where:{id:users[2].id}})).battlePassPublic,false);
  await page.getByRole('checkbox').check();
  await page.waitForFunction(()=>!document.querySelector('#publicStats').disabled);
  assert.equal((await prisma.user.findUnique({where:{id:users[2].id}})).battlePassPublic,true);
  await page.goto(base+'/u/bp-radio');
  await page.locator('.bp-profile-stats').waitFor();
  assert.match(await page.locator('.bp-profile-stats').innerText(),/4.867/);
  assert.match(await page.locator('.bp-profile-stats').innerText(),/6.500/);
  assert.match(await page.locator('.bp-profile-stats>div').first().innerText(),/Máximo/);
  assert.equal(await page.locator('.bp-profile-chart').count(),0);
  assert.equal(await page.locator('.bp-profile-head, .bp-power-scale-head, .bp-power-scale>p').count(),0);
  assert.equal(await page.locator('[role="meter"]').getAttribute('aria-valuenow'),'6500');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('.bp-profile').scrollIntoViewIfNeeded();
  await page.screenshot({path:'artifacts/battle-pass/390-profile.png',fullPage:true});
  await page.goto(base+'/battle-pass');
  await page.waitForFunction(()=>!document.querySelector('#connectBtn').disabled);
  await page.getByRole('button',{name:'Conectar Battle Pass',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#launchCount').textContent==='1');
  await page.emulateMedia({reducedMotion:'no-preference'});
  for(const [sp,tone,counter] of [[11000,'green',2],[12000,'orange',3],[15000,'red',4],[20000,'red',5]]) {
    await page.evaluate(([sp,counter])=>window.__launch(sp,counter),[sp,counter]);
    await page.locator('.bp-slot-digit').first().waitFor();
    assert.equal(await page.locator('#lastSp').getAttribute('data-power-tone'),tone);
    await page.waitForFunction(sp=>document.querySelector('#lastSp').textContent===sp.toLocaleString('pt-BR') && !document.querySelector('.bp-slot-digit'),sp);
  }
  await page.evaluate(()=>window.__launch(20000,6));
  await page.locator('.bp-slot-digit').first().waitFor();
  await page.waitForFunction(()=>!document.querySelector('.bp-slot-digit'));
  await page.waitForFunction(()=>document.querySelector('.bp-page').dataset.sync==='saved');
  await page.evaluate(async()=>{const {renderLaunchChart}=await import('/js/battle-pass/chart.mjs');renderLaunchChart(document.querySelector('#chart'),Array.from({length:100},(_,i)=>4000+i*140+Math.sin(i/3)*1200));});
  assert.equal(await page.locator('.bp-chart-point').count(),100);
  assert.equal(await page.locator('.bp-chart-line').count(),1);
  assert.equal(await page.locator('#chart figure').count(),0);
  await page.screenshot({path:'artifacts/battle-pass/390-power-reveal.png',fullPage:true});
  await page.goto(base+'/u/bp-radio');
  await page.locator('[role="meter"][aria-valuenow="20000"]').waitFor();
  assert.match(await page.locator('[role="meter"]').getAttribute('aria-valuetext'),/Profissional/);
  assert.equal(await page.locator('.bp-profile-max strong').getAttribute('data-power-tone'),'red');
  await page.screenshot({path:'artifacts/battle-pass/390-profile-professional.png',fullPage:true});
  await page.evaluate(()=>localStorage.setItem('qa-bx-known','1'));
  await page.goto(base+'/battle-pass');
  await page.waitForFunction(()=>document.querySelector('#connectBtn').dataset.connected==='true');
  assert.equal(await page.evaluate(()=>window.__requests),0);
  await context.close();
  const missionContext=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await missionContext.addCookies([{name:'bx_session',value:cookies[1].split('=')[1],url:base}]);
  await missionContext.addInitScript(mockRadioFixture,{fixture});
  const training=await missionContext.newPage(),missionErrors=[];
  training.on('pageerror',error=>missionErrors.push(error.message));
  await training.goto(base+'/battle-pass');
  await training.waitForFunction(()=>document.querySelector('.bp-page').dataset.sync==='saved');
  await training.locator('[data-tab="ranking"]').click();
  await training.locator('.bp-rank-row').first().waitFor();
  assert.equal(await training.locator('[data-view="ranking"] .bp-note, [data-view="ranking"] .eyebrow, .bp-rank-row small').count(),0);
  assert.ok(await training.locator('.bp-rank-head').isVisible());
  await training.screenshot({path:'artifacts/battle-pass/390-ranking-clean.png',fullPage:true});
  await training.getByRole('button',{name:'Conectar Battle Pass',exact:true}).click();
  await training.waitForFunction(()=>document.querySelector('#launchCount').textContent==='1');
  await training.waitForFunction(()=>document.querySelector('.bp-page').dataset.sync==='saved');
  assert.ok(await training.locator('[data-view="ranking"]').isVisible());
  assert.equal(await training.locator('.mm-toast, .bp-launch-toast').count(),0);
  await training.locator('[data-tab="training"]').click();
  // No mission tab visit and no sensor pages: the observed counter still credits this real launch.
  await training.evaluate(()=>window.__launch(11000,2,false));
  await training.locator('.mm-toast').waitFor();
  assert.match(await training.locator('.mm-toast').innerText(),/MISSÃO CONCLUÍDA.*Primeiro impulso/s);
  assert.ok(await training.locator('[data-view="training"]').isVisible());
  assert.equal(await training.locator('.bp-launch-toast').count(),0);
  await training.screenshot({path:'artifacts/battle-pass/390-training-achievement.png',fullPage:true});
  let result=(await api('/api/battle-pass/missions',{who:1})).data;
  assert.ok(result.totalXp>=80);assert.equal(result.periods[0].missions.find(m=>m.id==='d-warmup').progress,1);
  await training.evaluate(()=>window.__launch(11050,3,false));
  await training.waitForFunction(()=>document.querySelector('#launchCount').textContent==='3');
  await training.evaluate(()=>window.__launch(11100,4,false));
  await training.waitForFunction(()=>document.querySelector('#launchCount').textContent==='4');
  for(const [tab,sp,counter] of [['records',11150,5],['ranking',11200,6],['guide',11300,7],['missions',11400,8]]) {
    await training.locator(`[data-tab="${tab}"]`).click();
    const accepted=training.waitForResponse(response=>response.url().endsWith('/api/battle-pass/sync') && response.ok() && response.request().postDataJSON()?.launches?.some(r=>r.counter===counter && r.source==='live'));
    await training.evaluate(([sp,counter])=>window.__launch(sp,counter,false),[sp,counter]);
    await training.waitForFunction(sp=>document.querySelector('.bp-launch-toast b>span')?.textContent===sp.toLocaleString('pt-BR'),sp);
    await training.waitForFunction(()=>document.querySelector('.bp-page').dataset.sync==='saved');
    await accepted;
    assert.ok(await training.locator(`[data-view="${tab}"]`).isVisible());
    const launches=await prisma.battlePassLaunch.findMany({where:{userId:users[1].id,source:'live'}});
    assert.equal(launches.length,counter-1);
    if(tab==='guide') {
      await training.screenshot({path:'artifacts/battle-pass/390-guide-launch-notice.png',fullPage:true});
    }
  }
  result=(await api('/api/battle-pass/missions',{who:1})).data;
  assert.equal(result.periods[0].missions.find(m=>m.id==='d-first').done,true);
  assert.equal(result.periods[0].missions.find(m=>m.id==='d-warmup').progress,7);
  assert.equal(result.periods[1].missions.find(m=>m.id==='w-reps').progress,7);
  assert.equal(result.periods[2].missions.find(m=>m.id==='m-reps').progress,7);
  await training.evaluate(()=>window.__launch(11400,8,false));
  await training.waitForFunction(()=>document.querySelector('.bp-page').dataset.sync==='saved');
  assert.equal(await prisma.battlePassLaunch.count({where:{userId:users[1].id,source:'live'}}),7);
  for(const width of [390,360,1440]) {
    await training.setViewportSize({width,height:844});
    assert.ok(await training.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.ok(await training.locator('.bp-launch-toast').isVisible());
    assert.ok(await training.evaluate(()=>document.querySelector('.bp-launch-toast').getBoundingClientRect().top>document.querySelector('.bp-status-controls').getBoundingClientRect().bottom));
    await training.screenshot({path:`artifacts/battle-pass/${width}-launch-notice.png`,fullPage:true});
  }
  await training.locator('.bp-launch-toast button').click();
  assert.ok(await training.locator('[data-view="training"]').isVisible());
  assert.equal(await training.locator('.bp-launch-toast').count(),0);
  // A saved response without inline rewards must still recover achievements outside Missions.
  await missionContext.route('**/api/battle-pass/sync',async route=>{
    try{const response=await route.fetch(),data=await response.json();delete data.progression;
      await route.fulfill({response,json:data});
    }catch(error){if(!/closed|disposed|aborted/i.test(error.message))throw error;}
  });
  await training.locator('[data-tab="guide"]').click();
  for(let counter=9;counter<=16;counter++) {
    const accepted=training.waitForResponse(response=>response.url().endsWith('/api/battle-pass/sync') && response.ok() && response.request().postDataJSON()?.launches?.some(r=>r.counter===counter && r.source==='live'));
    await training.evaluate(counter=>window.__launch(11500,counter,false),counter);
    await training.waitForFunction(counter=>document.querySelector('#launchCount').textContent===String(counter),counter);
    await training.waitForFunction(()=>document.querySelector('.bp-page').dataset.sync==='saved');
    await accepted;
  }
  await training.waitForFunction(()=>document.querySelector('.mm-toast')?.textContent.includes('Aquecimento'),null,{timeout:60000});
  assert.ok(await training.locator('[data-view="guide"]').isVisible());
  const completedPower=(await api('/api/battle-pass/missions',{who:1})).data;
  assert.equal(completedPower.totalXp,1330);
  assert.ok(completedPower.periods[0].missions.filter(m=>m.metric==='power').every(m=>m.done));
  assert.equal(completedPower.periods[1].missions.find(m=>m.id==='w-power-10000-10').done,true);
  await training.waitForFunction(()=>document.querySelector('.mm-toast')?.textContent.includes('Mão firme'),null,{timeout:60000});
  await training.locator('[data-tab="missions"]').click();
  await training.locator('[data-mission-id="d-warmup"].is-complete').waitFor();
  for(const width of [390,360,1440]) {
    await training.setViewportSize({width,height:1000});
    await training.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.ok(await training.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await training.screenshot({path:`artifacts/battle-pass/${width}-power-missions.png`,fullPage:true});
  }
  const olderDevice=await prisma.battlePassDevice.create({data:{userId:users[1].id,key:'e'.repeat(64),name:'BEYBLADE_TOOL01'}});
  const olderStart=new Date(Date.now()-7200000);
  await prisma.battlePassTraining.create({data:{id:'overview-ui-previous',userId:users[1].id,deviceId:olderDevice.id,startedAt:olderStart,endedAt:new Date(olderStart.getTime()+3600000),launchCount:6,averageSp:7250,bestSp:8500,
    launches:{create:[6000,6500,7000,7500,8000,8500].map((sp,i)=>({userId:users[1].id,deviceId:olderDevice.id,sp,source:'live',epoch:0,counter:i+1,measuredAt:new Date(olderStart.getTime()+i*10000)}))}}});
  await prisma.user.update({where:{id:users[1].id},data:{avatarUrl:'/assets/profiles/default-blader.png'}});
  await training.locator('[data-tab="records"]').click();
  const currentTraining=await prisma.battlePassTraining.findFirst({where:{userId:users[1].id,id:{not:'overview-ui-previous'}}});
  const overview=training.locator(`.bp-session-entry[data-session="${currentTraining.id}"]`);
  await overview.locator(':scope>summary').click();
  await overview.locator('.bp-session-chart svg').waitFor();
  assert.match(await overview.locator('.bp-session-progress').innerText(),/1\.330/);
  assert.equal(await overview.locator('.bp-chart-point').count(),15);
  assert.equal(await overview.locator('.bp-session-comparison button').count(),2);
  assert.match(await overview.locator('.bp-session-highlights').innerText(),/Novo recorde/);
  await overview.locator('.bp-session-log>summary').click();
  assert.ok(await overview.locator('.bp-session-log li').count()>=6);
  for(const width of [390,360,1440]) {
    await training.setViewportSize({width,height:1000});
    await training.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.ok(await training.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await training.evaluate(()=>window.scrollTo(0,0));
    await training.screenshot({path:`artifacts/battle-pass/${width}-session-overview.png`,fullPage:true});
  }
  await overview.locator('[data-share-session]').click();
  await training.locator('#sessionShareDialog img').waitFor({state:'visible'});
  const downloaded=training.waitForEvent('download');
  await training.locator('[data-download]').click();
  const imageDownload=await downloaded;await imageDownload.saveAs('artifacts/battle-pass/session-share.png');
  const png=readFileSync('artifacts/battle-pass/session-share.png');assert.equal(png.readUInt32BE(16),2160);assert.equal(png.readUInt32BE(20),2160);
  await training.getByRole('button',{name:'Fechar compartilhamento'}).click();
  await training.getByRole('button',{name:'Opções do Battle Pass conectado'}).click();
  await training.locator('#disconnectBtn').click();
  assert.equal(await training.locator('#batteryState b').innerText(),'—');
  assert.deepEqual(missionErrors,[]);
  await missionContext.close();
  console.log('PASS: achievements in Training without visiting Missions, sensor-less launches in every tab, SP notices, no tab switches, duplicates and daily/weekly/monthly progress.');
  const ios=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'});
  await ios.addInitScript(()=>Object.defineProperty(navigator,'bluetooth',{configurable:true,value:undefined}));
  const iphone=await ios.newPage();await iphone.goto(base+'/battle-pass');
  await iphone.waitForFunction(()=>document.querySelector('#compatibility').textContent.includes('indisponível'));
  assert.ok(await iphone.locator('#connectBtn').isEnabled());
  await iphone.getByRole('button',{name:'Conectar Battle Pass',exact:true}).click();
  assert.ok(await iphone.locator('#iosHelp').isVisible());assert.match(await iphone.locator('#notice').innerText(),/Bluefy/);
  await iphone.evaluate(fixture=>{
    const notify=new EventTarget();notify.startNotifications=async()=>{};
    const emit=hex=>{notify.value=new DataView(Uint8Array.from(hex.match(/../g),b=>parseInt(b,16)).buffer);notify.dispatchEvent(new Event('characteristicvaluechanged'));};
    const device=new EventTarget();device.name='BEYBLADE_TOOL01';device.id='ios-bridge';
    const service={async getCharacteristic(uuid){
      if(uuid.includes('f002'))return notify;
      return {async writeValue(data){if(data[0]===81)emit(fixture[0]);else fixture.slice(1,9).forEach(emit);}};
    }};
    device.gatt={connected:false,disconnect(){this.connected=false;},async connect(){this.connected=true;return {async getPrimaryService(){return service;}};}};
    window.__iosRequests=0;
    Object.defineProperty(navigator,'bluetooth',{configurable:true,value:{async requestDevice(){window.__iosRequests++;return device;}}});
  },fixture);
  await iphone.getByRole('button',{name:'Conectar Battle Pass',exact:true}).click();
  await iphone.waitForFunction(()=>document.querySelector('#connectBtn').dataset.connected==='true');
  await iphone.waitForFunction(()=>document.querySelector('#lastSp').textContent==='3.234');
  assert.equal(await iphone.locator('#batteryState b').innerText(),'100%');
  assert.equal(await iphone.evaluate(()=>window.__iosRequests),1);
  await ios.close();
  console.log('PASS: 1440/390/360 layouts, guide images, isolated demo, click-only BLE, live capture, IndexedDB reload, offline retry and sharing control.');
} finally {
  await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());await prisma.$disconnect();
}
