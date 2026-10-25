// Isolated database: exercises payment eligibility and safe correction of pairings.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
const temp = mkdtempSync(path.join(tmpdir(),'bx-manager-'));
new DatabaseSync(path.join(temp,'test.db')).close();
process.env.DATABASE_URL = `file:${path.join(temp,'test.db').replaceAll('\\','/')}`;
process.env.NODE_ENV='test'; process.env.BX_ISOLATED_TEST='1';
const migrate=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{encoding:'utf8',env:process.env});
assert.equal(migrate.status,0,migrate.stderr);
const {prisma}=await import('../server/db.js');
const {default:express}=await import('express');
const {default:router}=await import('../server/routes/tournaments.js');
const {publicUser}=await import('../server/auth.js');
const users=[];
let server,browser;
try {
 for(let i=0;i<7;i++) users.push(await prisma.user.create({data:{name:i===1?'Tharcísio Nogueira':i===2?'Lucas Magalhães':`Jogador ${i+1}`,slug:`player-${i}`,email:`player-${i}@test.invalid`}}));
 const t=await prisma.tournament.create({data:{slug:'qa-manager',name:'Copa BeyXLab — Teste de gestão',organizerId:users[0].id,startsAt:new Date(),entryFeeCents:2500,roundsPlanned:5,coverUrl:'/assets/profiles/default-blader.png'}});
 const app=express();app.use(express.json());
 app.use((req,res,next)=>{req.user=users.find(u=>u.id===req.headers['x-test-user'])||users[0];next();});
 app.get('/api/me',(req,res)=>res.json({user:publicUser(req.user)}));
 app.get('/api/site',(req,res)=>res.json({site:{name:'BeyXLab'},flags:{}}));
 app.get('/api/parts-index',(req,res)=>res.json({parts:[]}));
 app.use(router);app.get('/torneios/novo',(req,res)=>res.sendFile(path.resolve('public/novo-torneio.html')));app.get('/torneio/:slug',(req,res)=>res.sendFile(path.resolve('public/torneio.html')));app.use(express.static('public'));
 app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:err.message});});
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const call=async(endpoint,body={},user=users[0],method='POST')=>{const response=await fetch(base+`/api/tournaments/${t.slug}`+endpoint,{method,headers:{'Content-Type':'application/json','x-test-user':user.id},body:method==='GET'?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
 for(const u of users.slice(1)) assert.equal((await call('/join',{},u)).status,200);
 let ps=await prisma.tournamentPlayer.findMany({where:{tournamentId:t.id},orderBy:{id:'asc'}});
 assert(ps.every(p=>!p.paymentConfirmed));
 assert.equal((await call('/start')).status,422);
 assert.equal((await call(`/players/${ps[0].id}/payment`,{paid:true},users[1],'PATCH')).status,403);
 for(const p of ps.slice(0,4)) assert.equal((await call(`/players/${p.id}/payment`,{paid:true},users[0],'PATCH')).status,200);
 if(process.argv.includes('--visual')) {
  const {chromium}=await import('playwright');browser=await chromium.launch({headless:true,channel:'msedge'});mkdirSync('artifacts/tournament-manager',{recursive:true});
  await prisma.store.create({data:{name:'Loja de teste',address:'Rua Teste, 10'}});
  const creation=await browser.newPage({viewport:{width:390,height:900}});
  await creation.route('**/api/stores',async route=>{const response=await route.fetch();await new Promise(r=>setTimeout(r,200));await route.fulfill({response});});
  await creation.goto(base+'/torneios/novo');await creation.locator('#store option', {hasText:'Loja de teste'}).waitFor({state:'attached'});
  assert.equal(await creation.locator('#store option[value=""]').textContent(),'Sem loja definida');assert.equal(await creation.locator('#store').inputValue(),'');
  await creation.locator('#name').fill('Torneio sem loja');await creation.locator('#date').fill('2026-11-01T14:00');await creation.locator('#submit').click();await creation.waitForURL('**/torneio/torneio-sem-loja');
  const noStoreEvent=await prisma.tournament.findUnique({where:{slug:'torneio-sem-loja'}});assert.equal(noStoreEvent.storeId,null);assert.equal(noStoreEvent.storeName,null);await creation.close();
  for(const width of [320,390,1440]) {
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/torneio/qa-manager#gestao');await page.locator('[data-payment]').first().waitFor();
   assert.equal(await page.locator('.tournament-cover').isVisible(),false);
   assert.equal(await page.locator('[data-payment-state=paid]').count(),4);
   await page.screenshot({path:`artifacts/tournament-manager/management-${width}.png`,fullPage:true});
   assert.equal(await page.locator('[data-view=divulgacao],[data-view=configuracao]').count(),0);
   await page.locator('[data-manager-panel=divulgacao]').click();assert(await page.locator('#copyLink').isVisible());assert.equal(await page.locator('#startBtn').isVisible(),false);
   await page.locator('[data-manager-panel=configuracao]').click();assert(await page.locator('#saveT').isVisible());
   await page.locator('[data-manager-panel=configuracao]').click();assert(await page.locator('#startBtn').isVisible());
   await page.locator('[data-view=geral]').click();assert(await page.locator('.tournament-cover').isVisible());
   const compact = await page.evaluate(()=>({blocks:[...document.querySelectorAll('.tournament-fact')].map(el=>el.getBoundingClientRect().height),size:parseFloat(getComputedStyle(document.querySelector('.tournament-fact strong')).fontSize),tags:[...document.querySelectorAll('.tournament-hero p>span')].map(el=>el.getBoundingClientRect().y),flag:document.querySelector('#reportBtn').getBoundingClientRect().bottom,cover:document.querySelector('.tournament-cover').getBoundingClientRect().top}));
   assert(compact.blocks.every(height=>height<140));assert(compact.size>=16);assert.equal(new Set(compact.tags).size,1);assert(compact.flag<=compact.cover);
   await page.screenshot({path:`artifacts/tournament-manager/public-${width}.png`,fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await page.close();
  }
 }
 assert.equal((await call('/start')).status,200);
 let matches=await prisma.tMatch.findMany({where:{tournamentId:t.id,round:1}});assert.equal(matches.length,2);
 const unpaid=new Set(ps.slice(4).map(p=>p.id));assert(matches.every(m=>!unpaid.has(m.p1Id)&&!unpaid.has(m.p2Id)));
 for(const m of matches) assert.equal((await call(`/matches/${m.id}/resolve`,{winnerId:m.p1Id})).status,200);
 assert.equal((await call('/next-round')).status,200);
 let correction={round:1,results:matches.map(m=>({matchId:m.id,winnerId:m.p2Id}))};
 assert.equal((await call('/correct-round',correction)).status,200);
 assert.equal((await call(`/matches/${matches[0].id}/reopen`)).status,409);
 matches=await prisma.tMatch.findMany({where:{tournamentId:t.id,round:2}});
 if(browser) {
  const participant=ps.find(p=>p.id===matches[1].p2Id);
  const page=await browser.newPage({viewport:{width:390,height:844},extraHTTPHeaders:{'x-test-user':participant.userId}});
  await page.goto(base+'/torneio/qa-manager#partida');await page.locator('[data-report=WIN]').waitFor();
  assert.equal(await page.locator('.mesa-link').count(),0);assert.equal(await page.locator('.match-score-zero').count(),0);
  assert(await page.locator('.match-screen').evaluate(el=>el.getBoundingClientRect().height<450));
  await page.screenshot({path:'artifacts/tournament-manager/my-match-390.png',animations:'disabled'});await page.close();
 }
 await prisma.tMatch.update({where:{id:matches[0].id},data:{p1Report:'WIN'}});
 if(browser) {
  for(const width of [390,1440]) {
   const page=await browser.newPage({viewport:{width,height:1100}});
   await page.goto(base+'/torneio/qa-manager#gestao');await page.locator('.manager-table.reported').waitFor();
   await page.locator('[data-view=pairings]').click();assert.equal(await page.locator('.tournament-facts,.tournament-cover,.tournament-heading').count(),0);
   assert.equal(await page.locator('.bracket-round').count(),1);
   await page.locator('#tRounds button[data-round="1"]').click();assert.equal(await page.locator('.bracket-round').getAttribute('data-round'),'1');
   await page.locator('#tRounds button[data-round="2"]').click();assert.equal(await page.locator('.bracket-round').getAttribute('data-round'),'2');assert.equal(await page.locator('.bracket-round').count(),1);
   assert.equal(await page.locator('#tRounds .round-live-dot').count(),1);
   await page.screenshot({path:`artifacts/tournament-manager/pairings-compact-${width}.png`,animations:'disabled'});
   assert.equal(await page.locator('#app>:first-child').getAttribute('class'),'tabs');
   await page.locator('[data-view=gestao]').click();await page.locator('.manager-table.reported').waitFor();
   if(width>900) assert(await page.evaluate(()=>document.querySelector('#viewBox').getBoundingClientRect().x>=document.querySelector('.side-nav').getBoundingClientRect().right));
   assert.match(await page.locator('.manager-rounds .primary').innerText(),/R2/);
   await page.screenshot({path:`artifacts/tournament-manager/tables-${width}.png`,fullPage:false,animations:'disabled'});
   await page.locator('[data-manager-round="1"]').click();await page.locator('#correctPast').click();assert(await page.locator('dialog').isVisible());await page.getByRole('button',{name:'Cancelar',exact:true}).last().click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.close();
  }
 }
 assert.equal((await call('/correct-round',correction)).status,409);
 assert.equal((await prisma.tMatch.findMany({where:{tournamentId:t.id,round:2}})).length,2);
 assert.equal((await call(`/matches/${matches[0].id}/resolve`,{})).status,200);
 if(browser) {
  const page=await browser.newPage({viewport:{width:390,height:900}});await page.goto(base+'/torneio/qa-manager#gestao');await page.locator('.match-winner').waitFor();
  assert.equal(await page.locator('.match-winner-trophy').count(),1);
  assert(await page.locator('.tournament-control-card').evaluate(el=>el.getBoundingClientRect().height<150));
  await page.screenshot({path:'artifacts/tournament-manager/winner-compact-390.png',animations:'disabled'});await page.close();
 }
 const m=matches[1],u1=users.find(u=>u.id===ps.find(p=>p.id===m.p1Id).userId),u2=users.find(u=>u.id===ps.find(p=>p.id===m.p2Id).userId);
 assert.equal((await call('/report',{matchId:m.id,result:'WIN'},u1)).status,200);
 assert.equal((await prisma.tMatch.findUnique({where:{id:m.id}})).status,'PENDING');
 assert.equal((await call('/report',{matchId:m.id,result:'LOSS'},u2)).status,200);
 assert.equal((await prisma.tMatch.findUnique({where:{id:m.id}})).status,'DONE');
 const free=await prisma.tournament.create({data:{slug:'free',name:'Free',organizerId:users[0].id,startsAt:new Date()}});
 const rr=await fetch(base+'/api/tournaments/free/join',{method:'POST',headers:{'x-test-user':users[1].id,'Content-Type':'application/json'},body:'{}'});assert.equal(rr.status,200);
 assert.equal((await prisma.tournamentPlayer.findFirst({where:{tournamentId:free.id}})).paymentConfirmed,true);
 // Parse inline client scripts too; HTML is not covered by node --check.
 const vm=await import('node:vm');for(const file of ['public/torneio.html','public/inscricao.html'])for(const match of readFileSync(file,'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1],{filename:file});
 console.log('PASS: payment permissions, paid-only pairing, free entry, past correction, report protection, UI syntax.');
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await prisma.$disconnect();}
