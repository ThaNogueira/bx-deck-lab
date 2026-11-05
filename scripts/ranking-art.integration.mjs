import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';import sharp from 'sharp';
const temp=fs.mkdtempSync(path.join(tmpdir(),'bx-ranking-art-'));new DatabaseSync(path.join(temp,'qa.db')).close();
process.env.DATABASE_URL='file:'+path.join(temp,'qa.db').replaceAll('\\','/');process.env.NODE_ENV='test';process.env.BX_ISOLATED_TEST='1';process.env.CHECKPOINT_DISABLE='1';
const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{encoding:'utf8',env:process.env});assert.equal(result.status,0,result.stderr);
const {prisma}=await import('../server/db.js'),{default:express}=await import('express'),{default:router}=await import('../server/routes/champion.js'),{publicUser}=await import('../server/auth.js');
let server,browser;
try{
fs.mkdirSync('artifacts/ranking-art',{recursive:true});const admin=await prisma.user.create({data:{name:'Admin',slug:'qa-admin',email:'qa-admin@test.invalid',role:'ADMIN'}}),mod=await prisma.user.create({data:{name:'Mod',slug:'qa-mod',email:'qa-mod@test.invalid',role:'MOD'}}),users=[];
for(let i=0;i<8;i++)users.push(await prisma.user.create({data:{name:['Tharcísio Nogueira','Heitor Miranda','Madokkaebi','Anderson Vargas','Wesley Bezerra','Lucas Magalhães','Vinícius Neves Prates','SAMIRINSET'][i],slug:'qa-player-'+i,email:`qa-${i}@test.invalid`}}));
for(const [index,date] of ['2026-10-31T02:00:00Z','2026-11-01T18:00:00Z','2026-11-03T18:00:00Z'].entries()){
 const t=await prisma.tournament.create({data:{name:'Semanal '+index,slug:'qa-rank-'+index,startsAt:new Date(date),status:'FINISHED',organizerId:admin.id,currentRound:4}}),players=[];
 for(const user of users)players.push(await prisma.tournamentPlayer.create({data:{tournamentId:t.id,userId:user.id}}));
 for(let round=1;round<=4;round++)for(let i=0;i<8;i+=2)await prisma.tMatch.create({data:{tournamentId:t.id,round,tableNo:i/2+1,p1Id:players[i].id,p2Id:players[i+1].id,winnerId:players[i].id,status:'DONE'}});
}
const app=express();app.use((req,res,next)=>{req.user=req.headers['x-test-user']==='admin'?admin:req.headers['x-test-user']==='mod'?mod:null;next();});app.use(router);app.get('/api/me',(req,res)=>res.json({user:publicUser(req.user)}));app.get('/api/site',(req,res)=>res.json({site:{name:'BeyXLab'},flags:{}}));app.get('/api/parts-index',(req,res)=>res.json({parts:[]}));app.get('/admin',(req,res)=>res.sendFile(path.resolve('public/admin.html')));app.use(express.static('public'));app.use((e,req,res,next)=>res.status(500).json({error:e.message}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
const request=(url,user='admin')=>fetch(base+url,{headers:user?{'x-test-user':user}:{}});
assert.equal((await request('/api/admin/ranking-art/data',null)).status,401);assert.equal((await request('/api/admin/ranking-art/data','mod')).status,403);
const all=await (await request('/api/admin/ranking-art/data')).json(),monthly=await (await request('/api/admin/ranking-art/data?month=2026-11')).json();assert.equal(all.totals.tournaments,3);assert.equal(monthly.totals.tournaments,2);assert.equal(monthly.players.length,8);assert(monthly.players.every(p=>p.events===2));assert(monthly.players.every(p=>!('email' in p.user)));assert.equal((await request('/api/admin/ranking-art/data?month=2026-13')).status,422);
const {chromium}=await import('playwright');browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({viewport:{width:1440,height:1100},extraHTTPHeaders:{'x-test-user':'admin'}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(base+'/admin#rankingArt');await page.locator('#rankArtGenerate').click();await page.waitForFunction(()=>!document.querySelector('#rankArtDownload')?.disabled);assert.equal(await page.locator('#rankArtPage').textContent(),'1 / 6');
for(let i=0;i<6;i++){await page.locator('#rankArtCanvas').screenshot({path:`artifacts/ranking-art/slide-${i+1}.png`});if(i<5)await page.locator('#rankArtNext').click();await page.waitForFunction(()=>!document.querySelector('#rankArtDownload').disabled);}
const download=page.waitForEvent('download');await page.locator('#rankArtDownload').click();const png=await download;await png.saveAs('artifacts/ranking-art/export.png');assert.equal((await sharp('artifacts/ranking-art/export.png').metadata()).width,2160);
const archive=page.waitForEvent('download');await page.locator('#rankArtZip').click();await (await archive).saveAs('artifacts/ranking-art/carousel.zip');
const zip=fs.readFileSync('artifacts/ranking-art/carousel.zip');assert.equal(zip.readUInt32LE(0),0x04034b50);assert.equal(zip.readUInt16LE(zip.length-12),6);
await page.locator('#rankArtMode').selectOption('month');assert(await page.locator('#rankArtDownload').isDisabled());await page.locator('#rankArtMonth').fill('2026-11');await page.locator('#rankArtGenerate').click();await page.waitForFunction(()=>!document.querySelector('#rankArtDownload').disabled);
await page.locator('#rankArtCanvas').screenshot({path:'artifacts/ranking-art/intro-month.png'});
await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'artifacts/ranking-art/mobile.png',fullPage:true});assert.deepEqual(errors,[]);
console.log('PASS: admin-only current/month ranking, distinct intro covers, period boundaries, safe user fields, six pages, PNG 2160px, ZIP, navigation and mobile layout.');
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await prisma.$disconnect();}
