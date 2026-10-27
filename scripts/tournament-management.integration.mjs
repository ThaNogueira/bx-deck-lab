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
const {default:community}=await import('../server/routes/community.js');
const {default:admin}=await import('../server/routes/admin.js');
const {default:decksRouter}=await import('../server/routes/decks.js');
const {normalizeTicketUrl}=await import('../server/store-links.js');
const {publicUser}=await import('../server/auth.js');
const users=[];
let server,browser;
const confirmExit = async (page, answers) => {
 let pending = page.waitForEvent('dialog'); const click = page.locator('#leaveBtn').click();
 for (let i=0;i<answers.length;i++) {
  const dialog=await pending;
  pending=answers[i] && i+1<answers.length ? page.waitForEvent('dialog') : null;
  if(answers[i])await dialog.accept();else await dialog.dismiss();
 }
 await click;
};
try {
 for(let i=0;i<7;i++) users.push(await prisma.user.create({data:{name:i===1?'Tharcísio Nogueira':i===2?'Lucas Magalhães':`Jogador ${i+1}`,slug:`player-${i}`,email:`player-${i}@test.invalid`}}));
 users[0].role='ADMIN';
 const parts=[];for(const [kind,name] of [['BLADE','Shark Scale'],['RATCHET','3-60'],['BIT','Rush']])parts.push(await prisma.part.create({data:{slug:name.toLowerCase().replaceAll(' ','-'),kind,name,displayName:name}}));
 const combo=parts.map(p=>p.id),ownDecks=[];
 for(let i=0;i<6;i++)ownDecks.push(await prisma.communityDeck.create({data:{slug:`meu-deck-${i}`,authorId:users[1].id,title:`Meu deck ${i+1}`,beysJson:JSON.stringify([combo,combo,combo]),isPublic:i!==0}}));
 const foreignDeck=await prisma.communityDeck.create({data:{slug:'outro-deck',authorId:users[2].id,title:'Deck de outra pessoa',beysJson:JSON.stringify([combo])}});
 const t=await prisma.tournament.create({data:{slug:'qa-manager',name:'Copa BeyXLab — Teste de gestão',organizerId:users[0].id,startsAt:new Date(),entryFeeCents:2500,roundsPlanned:5,coverUrl:'/assets/profiles/default-blader.png'}});
 const app=express();app.use(express.json());
 app.use((req,res,next)=>{req.user=users.find(u=>u.id===req.headers['x-test-user'])||users[0];next();});
 app.get('/api/me',(req,res)=>res.json({user:publicUser(req.user)}));
 app.get('/api/site',(req,res)=>res.json({site:{name:'BeyXLab'},flags:{}}));
 app.get('/api/parts-index',(req,res)=>res.json({parts:parts.map(p=>({...p,display:p.displayName,aliases:[]}))}));
 app.use(router,decksRouter,community,admin);app.get('/t/:slug',(req,res)=>res.sendFile(path.resolve('public/inscricao.html')));app.get('/torneios/novo',(req,res)=>res.sendFile(path.resolve('public/novo-torneio.html')));app.get('/torneio/:slug',(req,res)=>res.sendFile(path.resolve('public/torneio.html')));app.use(express.static('public'));
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
  const ticketEvent=await prisma.tournament.create({data:{slug:'qa-ticket',name:'Semanal Tamer Shop #8',storeName:'Tamer Shop',storeId:'tamer-shop',organizerId:users[1].id,startsAt:new Date(),entryFeeCents:1500}});
  const ticketPage=await browser.newPage({viewport:{width:390,height:900}});
  await ticketPage.goto(base+'/t/qa-ticket');await ticketPage.locator('#joinBtn').click();await ticketPage.locator('.tamer-ticket').waitFor();
  assert.match(await ticketPage.locator('.big-join').innerText(),/Inscrição confirmada/i);
  assert.equal(await ticketPage.locator('.tamer-ticket').getAttribute('href'),'https://www.tamershop.com.br/?view=ecom/item&ing=46575');
  assert.equal(await ticketPage.locator('.tamer-ticket img').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  await ticketPage.screenshot({path:'artifacts/tournament-manager/ticket-confirmed-390.png',animations:'disabled'});
  for(const width of [320,390,1440]){
   await ticketPage.setViewportSize({width,height:1000});
   await ticketPage.goto(base+'/t/qa-ticket');await ticketPage.locator('.tamer-ticket').waitFor();assert.match(await ticketPage.locator('.big-join').innerText(),/já está inscrito/);
   await ticketPage.goto(base+'/torneio/qa-ticket');await ticketPage.locator('.payment-notice .tamer-ticket').waitFor();
   assert.equal(await ticketPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert(await ticketPage.locator('.payment-notice').evaluate(el=>el.getBoundingClientRect().height<180));
   await ticketPage.screenshot({path:`artifacts/tournament-manager/ticket-pending-${width}.png`,animations:'disabled'});
  }
  await prisma.tournamentPlayer.updateMany({where:{tournamentId:ticketEvent.id},data:{paymentConfirmed:true}});
  await ticketPage.reload();await ticketPage.locator('.tournament-title').waitFor();assert.equal(await ticketPage.locator('.tamer-ticket,.payment-notice').count(),0);
  for(const answers of [[false],[true,false]]){await confirmExit(ticketPage,answers);assert.equal(await prisma.tournamentPlayer.count({where:{tournamentId:ticketEvent.id}}),1);}
  await confirmExit(ticketPage,[true,true]);await ticketPage.locator('#leaveBtn').waitFor({state:'detached'});assert.equal(await prisma.tournamentPlayer.count({where:{tournamentId:ticketEvent.id}}),0);await ticketPage.close();
  await prisma.store.create({data:{name:'Loja de teste',address:'Rua Teste, 10'}});
  const creation=await browser.newPage({viewport:{width:390,height:900}});
  await creation.route('**/api/stores',async route=>{const response=await route.fetch();await new Promise(r=>setTimeout(r,200));await route.fulfill({response});});
  await creation.goto(base+'/torneios/novo');await creation.locator('#store option', {hasText:'Loja de teste'}).waitFor({state:'attached'});
  assert.equal(await creation.locator('#store option[value=""]').textContent(),'Sem loja definida');assert.equal(await creation.locator('#store').inputValue(),'');
  await creation.locator('#name').fill('Torneio sem loja');await creation.locator('#date').fill('2026-11-01T14:00');await creation.locator('#submit').click();await creation.waitForURL('**/torneio/torneio-sem-loja');
  const noStoreEvent=await prisma.tournament.findUnique({where:{slug:'torneio-sem-loja'}});assert.equal(noStoreEvent.storeId,null);assert.equal(noStoreEvent.storeName,null);await creation.close();
  const storePage=await browser.newPage({viewport:{width:390,height:1000}});await storePage.goto(base+'/torneios/novo');await storePage.locator('[data-create-store]').click();
  await storePage.locator('[data-store-name]').fill('Arena X');await storePage.locator('[data-store-address]').fill('Rua Teste, 20');await storePage.locator('[data-store-ticket]').fill('https://arena.example/ingressos?evento=1&tipo=2');await storePage.locator('[data-save-store]').click();await storePage.locator('.store-create-box').waitFor({state:'hidden'});
  const arena=await prisma.store.findUnique({where:{name:'Arena X'}});assert.equal(arena.ticketUrl,'https://arena.example/ingressos?evento=1&tipo=2');
  await storePage.locator('#name').fill('Copa Arena X');await storePage.locator('#date').fill('2026-11-01T14:00');await storePage.locator('#fee').fill('10');await storePage.locator('#submit').click();await storePage.waitForURL('**/torneio/copa-arena-x');
  await storePage.goto(base+'/t/copa-arena-x');await storePage.locator('#joinBtn').click();await storePage.locator('.ticket-purchase').waitFor();assert.equal(await storePage.locator('.ticket-purchase').getAttribute('href'),arena.ticketUrl);assert.equal(await storePage.locator('.tamer-ticket').count(),0);
  await storePage.screenshot({path:'artifacts/tournament-manager/ticket-other-store-390.png',animations:'disabled'});
  const edited=await fetch(base+'/api/admin/stores/'+arena.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticketUrl:'https://arena.example/novo'})});assert.equal(edited.status,200);
  await storePage.goto(base+'/torneio/copa-arena-x');await storePage.locator('.ticket-purchase').waitFor();assert.equal(await storePage.locator('.ticket-purchase').getAttribute('href'),'https://arena.example/novo');await storePage.close();
  for(const width of [320,390,1440]) {
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/torneio/qa-manager#gestao');await page.locator('[data-payment]').first().waitFor();
   assert.equal(await page.locator('.tournament-cover').isVisible(),false);
   assert.equal(await page.locator('[data-payment-state=paid]').count(),4);
   assert.equal(await page.locator('.manager-player-deck:visible').count(),0);
   const playerOptions=page.locator('.manager-player-options').first();await playerOptions.locator('summary').click();assert(await playerOptions.locator('.manager-player-deck').isVisible());assert.match(await playerOptions.locator('.manager-player-deck').innerText(),/Sem deck declarado/);await playerOptions.locator('summary').click();
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
   const joinedPage=await browser.newPage({viewport:{width,height:900},extraHTTPHeaders:{'x-test-user':users[1].id}});
   await joinedPage.goto(base+'/torneio/qa-manager');await joinedPage.locator('#leaveBtn').waitFor();
   const leaveLayout=await joinedPage.evaluate(()=>{const nav=document.querySelector('.tournament-navigation').getBoundingClientRect(),button=document.querySelector('#leaveBtn').getBoundingClientRect(),tabs=document.querySelector('.tournament-navigation nav').getBoundingClientRect();return {navY:nav.y,buttonY:button.y,navRight:nav.right,buttonRight:button.right,heroHeight:document.querySelector('.tournament-hero').getBoundingClientRect().height,tabsX:tabs.x,firstTabX:document.querySelector('[data-view]').getBoundingClientRect().x};});
   assert(leaveLayout.heroHeight<40);assert(Math.abs(leaveLayout.tabsX-leaveLayout.firstTabX)<2);
   if(width>760){assert.equal(await joinedPage.locator('#leaveBtn').evaluate(el=>el.nextElementSibling.id),'reportBtn');}
   else{assert(Math.abs(leaveLayout.navY-leaveLayout.buttonY)<5);assert.equal(leaveLayout.buttonRight,leaveLayout.navRight);}
   await joinedPage.setViewportSize({width:1440,height:900});assert.equal(await joinedPage.locator('#leaveBtn').evaluate(el=>el.nextElementSibling?.id),'reportBtn');
   await joinedPage.setViewportSize({width:320,height:900});assert.equal(await joinedPage.locator('.tournament-navigation #leaveBtn').count(),1);
   await joinedPage.setViewportSize({width,height:900});
   await joinedPage.screenshot({path:`artifacts/tournament-manager/joined-${width}.png`,animations:'disabled'});await joinedPage.close();
  }
  const deckPage=await browser.newPage({viewport:{width:390,height:900},extraHTTPHeaders:{'x-test-user':users[1].id}});
  await deckPage.goto(base+'/torneio/qa-manager');await deckPage.locator('#myTourDeckSelect').waitFor();
  assert.equal(await deckPage.locator('.my-deck-box .bey-mini.empty').count(),3);
  assert(await deckPage.locator('.my-deck-box').evaluate(el=>el.getBoundingClientRect().height<100));
  await deckPage.locator('#myTourDeckSelect').click();await deckPage.locator('[data-use-my-deck]').first().waitFor();assert.equal(await deckPage.locator('[data-use-my-deck]').count(),5);
  assert(!await deckPage.locator('.tournament-deck-picker').innerText().then(t=>t.includes(foreignDeck.title)));
  await deckPage.locator('[data-my-deck-page="2"]').click();assert.equal(await deckPage.locator('[data-use-my-deck]').count(),1);await deckPage.locator('[data-my-deck-page="1"]').click();
  for(const width of [320,390,1440]){await deckPage.setViewportSize({width,height:900});assert(await deckPage.locator('.tournament-deck-picker').evaluate(el=>el.scrollWidth<=el.clientWidth));assert(await deckPage.locator('[data-create-my-deck]').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('[data-picker-close]').getBoundingClientRect().bottom));await deckPage.screenshot({path:`artifacts/tournament-manager/my-deck-picker-${width}.png`,animations:'disabled'});}await deckPage.setViewportSize({width:390,height:900});
  await deckPage.locator('[data-my-deck-page="2"]').click();
  await deckPage.locator(`[data-use-my-deck="${ownDecks[0].id}"]`).click();await deckPage.locator('.tournament-deck-picker').waitFor({state:'detached'});await deckPage.locator('.my-tournament-deck small').waitFor();
  assert.equal((await prisma.tournamentPlayer.findFirst({where:{tournamentId:t.id,userId:users[1].id}})).deckId,ownDecks[0].id);
  assert.equal((await call('/my-deck',{deckId:foreignDeck.id},users[1])).status,403);
  await deckPage.locator('#myTourDeckSelect').click();await deckPage.locator('[data-clear-my-deck]').click();await deckPage.locator('.tournament-deck-picker').waitFor({state:'detached'});assert.equal((await prisma.tournamentPlayer.findFirst({where:{tournamentId:t.id,userId:users[1].id}})).deckId,null);
  await deckPage.locator('#myTourDeckSelect').click();await deckPage.locator('[data-create-my-deck]').click();await deckPage.locator('#miniDeckTitle').fill('Meu trio no torneio');
  for(let slot=0;slot<3;slot++){await deckPage.locator(`[data-mini-slot="${slot}"]`).click();for(const part of parts)await deckPage.locator(`[data-mini-add="${part.id}"]`).click();}
  for(const width of [320,390,1440]){await deckPage.setViewportSize({width,height:900});assert(await deckPage.locator('.tournament-deck-editor').evaluate(el=>el.scrollWidth<=el.clientWidth));await deckPage.screenshot({path:`artifacts/tournament-manager/my-deck-editor-${width}.png`,animations:'disabled'});}await deckPage.setViewportSize({width:390,height:900});
  let rejectDeclaration=true;await deckPage.route('**/api/tournaments/qa-manager/my-deck',async route=>{if(rejectDeclaration){rejectDeclaration=false;await route.fulfill({status:503,json:{error:'Tente novamente'}});}else await route.continue();});
  await deckPage.locator('[data-mini-save]').click();await deckPage.getByText('Tente novamente',{exact:true}).waitFor();await deckPage.locator('[data-mini-save]').click();await deckPage.locator('.tournament-deck-editor').waitFor({state:'detached'});
  const created=await prisma.communityDeck.findFirst({where:{title:'Meu trio no torneio'}});assert.equal(created.authorId,users[1].id);assert.equal(JSON.parse(created.beysJson).length,3);assert.equal(await prisma.communityDeck.count({where:{title:'Meu trio no torneio'}}),1);assert.equal((await prisma.tournamentPlayer.findFirst({where:{tournamentId:t.id,userId:users[1].id}})).deckId,created.id);
  assert.match(deckPage.url(),/\/torneio\/qa-manager/);assert.equal(await deckPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await deckPage.screenshot({path:'artifacts/tournament-manager/my-deck-saved-390.png',animations:'disabled'});await deckPage.close();
  const managerDeckPage=await browser.newPage({viewport:{width:390,height:900}});await managerDeckPage.goto(base+'/torneio/qa-manager#gestao');await managerDeckPage.locator('.manager-player-options summary').first().click();await managerDeckPage.locator('[data-build-deck]').first().click();await managerDeckPage.locator('#miniDeckTitle').waitFor();
  for(const part of parts)await managerDeckPage.locator(`[data-mini-add="${part.id}"]`).click();await managerDeckPage.locator('[data-mini-save]').click();await managerDeckPage.locator('.tournament-deck-editor').waitFor({state:'detached'});
  const managed=await prisma.tournamentPlayer.findUnique({where:{id:ps[0].id},include:{deck:{include:{author:true}}}});assert.equal(managed.deck.author.slug,'beyxlab');await managerDeckPage.close();
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
  const previousEvent=await prisma.tournament.create({data:{slug:'copa-anterior',name:'Copa anterior',organizerId:users[0].id,status:'FINISHED',startsAt:new Date('2026-10-01T12:00:00Z')}});
  const historicalPlayers=[];for(const u of users.slice(1))historicalPlayers.push(await prisma.tournamentPlayer.create({data:{tournamentId:previousEvent.id,userId:u.id}}));
  for(let i=0;i<6;i+=2)await prisma.tMatch.create({data:{tournamentId:previousEvent.id,round:1,tableNo:i/2+1,p1Id:historicalPlayers[i].id,p2Id:historicalPlayers[i+1].id,winnerId:historicalPlayers[i].id,status:'DONE'}});
  const page=await browser.newPage({viewport:{width:390,height:844},extraHTTPHeaders:{'x-test-user':participant.userId}});
  await page.goto(base+'/torneio/qa-manager#partida');await page.locator('[data-report=WIN]').waitFor();
  assert.equal(await page.locator('[data-view=partida].match-awaiting-report').count(),1);
  assert.equal(await page.locator('[data-view=partida] svg').count(),1);
  await page.locator('.opponent-history h3').filter({hasText:'Últimos confrontos'}).waitFor();
  assert.match(await page.locator('.match-opponent-info').innerText(),/Rodada 1/);
  assert.equal(await page.locator('.mesa-link').count(),0);assert.equal(await page.locator('.match-score-zero').count(),0);
  assert(await page.locator('.report-row').evaluate(el=>el.getBoundingClientRect().bottom<500));
  assert.match(await page.locator('.match-opponent-info').innerText(),/Copa anterior/);
  await page.screenshot({path:'artifacts/tournament-manager/my-match-390.png',animations:'disabled'});
  await page.locator('[data-view=pairings]').click();assert.equal(await page.locator('[data-view=partida].match-awaiting-report').count(),1);
  for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:844});
   await page.screenshot({path:`artifacts/tournament-manager/match-tab-${width}.png`,animations:'disabled'});
  }
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('[data-view=partida]').evaluate(el=>getComputedStyle(el).animationName),'none');
  let state={myReport:'WIN'};
  await page.route('**/api/tournaments/qa-manager/me',async route=>{const response=await route.fetch();const payload=await response.json();Object.assign(payload.match,state);await route.fulfill({response,json:payload});});
  for(const next of [{myReport:'WIN'},{myReport:null,status:'DONE'},{myReport:null,bye:true}]){
   state=next;await page.reload();await page.locator('[data-view=partida]').waitFor();assert.equal(await page.locator('.match-awaiting-report').count(),0);
  }
  await page.close();
 }
 await prisma.tMatch.update({where:{id:matches[0].id},data:{p1Report:'WIN'}});
 if(browser) {
  for(const width of [320,390,1440]) {
   const page=await browser.newPage({viewport:{width,height:1100}});
   await page.goto(base+'/torneio/qa-manager#gestao');await page.locator('.manager-table.reported').waitFor();
   await page.locator('[data-view=pairings]').click();assert.equal(await page.locator('.tournament-facts,.tournament-cover,.tournament-heading').count(),0);
   assert.equal(await page.locator('.bracket-round').count(),1);
   await page.locator('#tRounds button[data-round="1"]').click();assert.equal(await page.locator('.bracket-round').getAttribute('data-round'),'1');
   await page.locator('#tRounds button[data-round="2"]').click();assert.equal(await page.locator('.bracket-round').getAttribute('data-round'),'2');assert.equal(await page.locator('.bracket-round').count(),1);
   assert.equal(await page.locator('#tRounds .round-live-dot').count(),1);
   await page.screenshot({path:`artifacts/tournament-manager/pairings-compact-${width}.png`,animations:'disabled'});
   await page.locator('[data-view=geral]').click();
   assert.equal(await page.locator('.standings th').last().textContent(),'Deck');
   assert(await page.locator('.standings-wrap').evaluate(el=>el.querySelectorAll('th')[7].getBoundingClientRect().right<=el.getBoundingClientRect().right+1));
   await page.screenshot({path:`artifacts/tournament-manager/standings-${width}.png`,animations:'disabled'});
   assert.equal(await page.locator('#app>:first-child').getAttribute('class'),'tournament-navigation');
   await page.locator('[data-view=gestao]').click();await page.locator('.manager-table.reported').waitFor();
   assert.equal(await page.locator('.manager-table-head [data-accept]').count(),1);
   assert.equal(await page.locator('.manager-table.reported .row-actions').count(),0);
   assert(await page.locator('.manager-table-head [data-accept]').evaluate(el=>el.getBoundingClientRect().bottom<=el.closest('.manager-table').querySelector('.manager-table-info').getBoundingClientRect().top));
   if(width>900) assert(await page.evaluate(()=>document.querySelector('#viewBox').getBoundingClientRect().x>=document.querySelector('.side-nav').getBoundingClientRect().right));
   assert.match(await page.locator('.manager-rounds .primary').innerText(),/R2/);
   assert.equal(await page.locator('.manager-rounds .current .round-live-dot').count(),1);
   assert.equal(await page.locator('.manager-round-panel>.eyebrow').count(),0);
   assert(await page.locator('.manager-rounds .current').evaluate(el=>el.getBoundingClientRect().height<=38));
   await page.screenshot({path:`artifacts/tournament-manager/tables-${width}.png`,fullPage:false,animations:'disabled'});
   await page.locator('[data-manager-round="1"]').click();assert.equal(await page.locator('[data-manager-round="1"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-manager-round="2"].current').count(),1);await page.locator('#correctPast').click();assert(await page.locator('dialog').isVisible());await page.getByRole('button',{name:'Cancelar',exact:true}).last().click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.close();
  }
 }
 assert.equal((await call('/correct-round',correction)).status,409);
 assert.equal((await prisma.tMatch.findMany({where:{tournamentId:t.id,round:2}})).length,2);
 assert.equal((await call(`/matches/${matches[0].id}/resolve`,{})).status,200);
 if(browser) {
  const page=await browser.newPage({viewport:{width:390,height:900}});await page.goto(base+'/torneio/qa-manager#gestao');await page.locator('.match-winner').waitFor();
  assert.equal(await page.locator('.match-winner-trophy').count(),1);
  assert.equal(await page.locator('.manager-table-head [data-reopen]').count(),1);
  assert.equal(await page.locator('.manager-table.done .row-actions').count(),0);
  assert(await page.locator('[data-reopen]').evaluate(el=>el.getBoundingClientRect().height<=34));
  assert(await page.locator('.tournament-control-card').evaluate(el=>el.getBoundingClientRect().height<150));
  await page.screenshot({path:'artifacts/tournament-manager/winner-compact-390.png',animations:'disabled'});
  await page.locator('[data-reopen]').click();await page.locator('.manager-table.done').waitFor({state:'detached'});assert.equal(await page.locator('[data-reopen]').count(),0);
  assert.equal((await call(`/matches/${matches[0].id}/resolve`,{winnerId:matches[0].p1Id})).status,200);
  await page.close();
 }
 const m=matches[1],u1=users.find(u=>u.id===ps.find(p=>p.id===m.p1Id).userId),u2=users.find(u=>u.id===ps.find(p=>p.id===m.p2Id).userId);
 assert.equal((await call('/report',{matchId:m.id,result:'WIN'},u1)).status,200);
 assert.equal((await prisma.tMatch.findUnique({where:{id:m.id}})).status,'PENDING');
 assert.equal((await call('/report',{matchId:m.id,result:'LOSS'},u2)).status,200);
 assert.equal((await prisma.tMatch.findUnique({where:{id:m.id}})).status,'DONE');
 const dropEvent=await prisma.tournament.create({data:{slug:'qa-drop',name:'Copa drop',organizerId:users[1].id,startsAt:new Date(),status:'RUNNING',currentRound:2,roundsPlanned:3}});
 const dropPlayers=[];for(const u of users.slice(1,3))dropPlayers.push(await prisma.tournamentPlayer.create({data:{tournamentId:dropEvent.id,userId:u.id}}));
 const oldMatch=await prisma.tMatch.create({data:{tournamentId:dropEvent.id,round:1,tableNo:1,p1Id:dropPlayers[0].id,p2Id:dropPlayers[1].id,status:'DONE',winnerId:dropPlayers[0].id}});
 const liveMatch=await prisma.tMatch.create({data:{tournamentId:dropEvent.id,round:2,tableNo:1,p1Id:dropPlayers[0].id,p2Id:dropPlayers[1].id}});
 if(browser){
  const page=await browser.newPage({viewport:{width:320,height:900},extraHTTPHeaders:{'x-test-user':users[1].id}});
  await page.goto(base+'/torneio/qa-drop#partida');await page.locator('#leaveBtn').waitFor();assert.equal(await page.locator('#leaveBtn').innerText(),'Dropar');
  assert(await page.locator('#leaveBtn').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
  await page.screenshot({path:'artifacts/tournament-manager/drop-top-320.png',animations:'disabled'});
  for(const answers of [[false],[true,false]]){await confirmExit(page,answers);assert.equal((await prisma.tournamentPlayer.findUnique({where:{id:dropPlayers[0].id}})).dropped,false);}
  await confirmExit(page,[true,true]);await page.locator('#leaveBtn').waitFor({state:'detached'});await page.close();
 }else assert.equal((await fetch(base+'/api/tournaments/qa-drop/leave',{method:'POST',headers:{'x-test-user':users[1].id}})).status,200);
 assert.equal((await prisma.tournamentPlayer.findUnique({where:{id:dropPlayers[0].id}})).dropped,true);
 const forfeited=await prisma.tMatch.findUnique({where:{id:liveMatch.id}});assert.equal(forfeited.status,'DONE');assert.equal(forfeited.winnerId,dropPlayers[1].id);assert.equal(forfeited.resolvedBy,'FORFEIT');
 assert.equal((await prisma.tMatch.findUnique({where:{id:oldMatch.id}})).winnerId,dropPlayers[0].id);
 await prisma.tournament.update({where:{id:dropEvent.id},data:{status:'FINISHED'}});
 assert.equal((await fetch(base+'/api/tournaments/qa-drop/leave',{method:'POST',headers:{'x-test-user':users[2].id}})).status,409);
 const free=await prisma.tournament.create({data:{slug:'free',name:'Free',organizerId:users[0].id,startsAt:new Date()}});
 const rr=await fetch(base+'/api/tournaments/free/join',{method:'POST',headers:{'x-test-user':users[1].id,'Content-Type':'application/json'},body:'{}'});assert.equal(rr.status,200);
 assert.equal((await prisma.tournamentPlayer.findFirst({where:{tournamentId:free.id}})).paymentConfirmed,true);
 // Parse inline client scripts too; HTML is not covered by node --check.
 const vm=await import('node:vm');for(const file of ['public/torneio.html','public/inscricao.html'])for(const match of readFileSync(file,'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1],{filename:file});
 const paymentContext={BX:{esc:s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')},URL};vm.runInNewContext(readFileSync('public/js/tournament-payment.js','utf8'),paymentContext);
 assert(!paymentContext.BX.tournamentPaymentNotice({storeName:'Outra loja',name:'Tamer convidado',entryFeeCents:1000}).includes('tamer-ticket'));
 assert(!paymentContext.BX.tournamentPaymentNotice({storeName:'Tamer Shop',entryFeeCents:0}).includes('tamer-ticket'));
 assert(paymentContext.BX.tournamentPaymentNotice({storeName:'Arena X',entryFeeCents:1000,ticketUrl:'https://arena.example/ticket'}).includes('ticket-purchase'));
 for(const invalid of ['javascript:alert(1)','data:text/html,test','https://user:password@example.com']){assert.throws(()=>normalizeTicketUrl(invalid));assert(!paymentContext.BX.tournamentPaymentNotice({entryFeeCents:1000,ticketUrl:invalid}).includes('ticket-purchase'));}
 assert.equal(normalizeTicketUrl('arena.example/ingresso'),'https://arena.example/ingresso');assert.equal(normalizeTicketUrl(''),null);
 const rejected=await fetch(base+'/api/stores',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Invalid',ticketUrl:'javascript:alert(1)'})});assert.equal(rejected.status,422);
 console.log('PASS: payment permissions, paid-only pairing, free entry, past correction, report protection, UI syntax.');
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await prisma.$disconnect();}
