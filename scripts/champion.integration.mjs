import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { comboLabel,partAbbreviation,layoutChampionParts } from '../public/js/champion-renderer.mjs';
const temp=fs.mkdtempSync(path.join(tmpdir(),'bx-champion-'));new DatabaseSync(path.join(temp,'qa.db')).close();
process.env.DATABASE_URL=`file:${path.join(temp,'qa.db').replaceAll('\\','/')}`;process.env.NODE_ENV='test';process.env.BX_ISOLATED_TEST='1';process.env.CHECKPOINT_DISABLE='1';
const migration=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);
const {prisma}=await import('../server/db.js');const {default:express}=await import('express');const {default:championRouter}=await import('../server/routes/champion.js');const {publicUser}=await import('../server/auth.js');const {UPLOADS_DIR}=await import('../server/uploads.js');
let server,browser;const cleanup=[];
try{
 fs.mkdirSync('artifacts/champion',{recursive:true});
 const users=[];for(const [i,role] of ['ADMIN','MOD','USER','USER'].entries())users.push(await prisma.user.create({data:{name:i===2?'Lipão':`Teste ${role}`,slug:`test-${i}`,email:`test-${i}@test.invalid`,role}}));
 const fixture=fs.existsSync('artifacts/champion/parts.json')?JSON.parse(fs.readFileSync('artifacts/champion/parts.json','utf8')):[['Glory Valkyrie','BLADE','INTEGRATED'],['Needle','BIT'],['Suppress Superion','BLADE'],['9-60','RATCHET'],['Kick','BIT'],['Emperor','LOCK_CHIP'],['Blast','MAIN_BLADE'],['Heavy','ASSIST_BLADE'],['Break','OVER_BLADE'],['6-60','RATCHET'],['Wedge','BIT'],['Narrow','BIT'],['SharkScale','BLADE']].map(([name,kind,subKind],i)=>({id:`qa-part-${i}`,slug:`part-${i}`,name,display:name,kind,subKind:subKind||null,parentId:null}));
 const parts=[];for(const p of fixture){
  const filename=`qa-champion-${p.id}.png`,file=path.join(UPLOADS_DIR,filename),original=`artifacts/champion/${p.id}.png`;
  if(fs.existsSync(original))fs.copyFileSync(original,file);else await sharp(Buffer.from(`<svg width="180" height="180"><circle cx="90" cy="90" r="78" fill="#0a95b5" stroke="#e6faff" stroke-width="10"/><text x="90" y="100" text-anchor="middle" fill="white" font-size="26">${p.kind==='RATCHET'?p.name:p.name.slice(0,3)}</text></svg>`)).png().toFile(file);
  cleanup.push(file);parts.push(await prisma.part.create({data:{id:p.id,slug:p.slug,name:p.name,displayName:p.display||p.name,kind:p.kind,subKind:p.subKind,parentId:p.parentId,variantLabel:p.variantLabel,abbrev:p.abbrev,imageUrl:`/uploads/${filename}`}}));
 }
 const get=name=>parts.find(p=>p.name===name&&!p.parentId),variant=parts.find(p=>p.parentId===get('9-60').id);
 const beys=[[get('Glory Valkyrie').id,get('Needle').id],[get('Suppress Superion').id,get('9-60').id,get('Kick').id],['Emperor','Blast','Heavy','Break','6-60','Wedge'].map(n=>get(n).id)],byId=new Map(parts.map(p=>[p.id,p]));
 assert.equal(comboLabel(beys[0],byId),'GV N');assert.equal(comboLabel(beys[1],byId),'SPS 9-60 K');assert.equal(partAbbreviation(get('SharkScale')),'SSC');assert.equal(partAbbreviation(get('Narrow')),'NR');assert.equal(partAbbreviation(get('Needle')),'N');
 const pair=layoutChampionParts(beys[0],byId,0);assert.equal((Math.min(...pair.map(p=>p.x))+Math.max(...pair.map(p=>p.x+p.w)))/2,230);
 const cx=layoutChampionParts(beys[2],byId,2);assert.equal(cx.length,6);assert(cx.every(p=>p.x>20&&p.x+p.w<450&&p.y>677&&p.y+p.h<825));
 const tournament=await prisma.tournament.create({data:{name:'Semanal Tamer',slug:'qa-champion',startsAt:new Date('2026-10-27T21:30:00Z'),status:'FINISHED',organizerId:users[0].id,currentRound:1}});
 const winner=await prisma.tournamentPlayer.create({data:{tournamentId:tournament.id,userId:users[2].id,manualDeckJson:JSON.stringify(beys)}}),other=await prisma.tournamentPlayer.create({data:{tournamentId:tournament.id,userId:users[3].id}});
 const match=await prisma.tMatch.create({data:{tournamentId:tournament.id,round:1,tableNo:1,p1Id:winner.id,p2Id:other.id,winnerId:winner.id,status:'DONE'}});
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user=users.find(u=>u.id===req.headers['x-test-user'])||null;next();});
 app.get('/api/me',(req,res)=>res.json({user:publicUser(req.user)}));app.get('/api/site',(req,res)=>res.json({site:{name:'BeyXLab'},flags:{}}));app.get('/api/parts-index',(req,res)=>res.json({parts:parts.map(p=>({...p,display:p.displayName,img:p.imageUrl,aliases:[]}))}));
 app.use(championRouter);app.get('/admin',(req,res)=>res.sendFile(path.resolve('public/admin.html')));app.use('/uploads',express.static(UPLOADS_DIR));app.use(express.static('public'));app.use((error,req,res,next)=>res.status(500).json({error:error.message}));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const request=(url,role=users[0],options={})=>fetch(base+url,{...options,headers:{...(options.headers||{}),...(role?{'x-test-user':role.id}:{})}});
 for(const u of [users[1],users[2],null]){assert.equal((await request('/api/admin/champion/tournaments',u)).status,u?403:401);assert.equal((await request('/api/admin/champion/artworks',u,{method:'POST'})).status,u?403:401);}
 const detail=await request('/api/admin/champion/tournaments/qa-champion');assert.equal(detail.status,200);assert.equal((await detail.json()).players[0].user.name,'Lipão');
 const {chromium}=await import('playwright');browser=await chromium.launch({headless:true,channel:'msedge'});
 const page=await browser.newPage({viewport:{width:1440,height:1100},extraHTTPHeaders:{'x-test-user':users[0].id}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>console.log('Failed asset:',r.url(),r.failure()?.errorText));
 await page.goto(base+'/admin#champion');await page.locator('#championTournament').selectOption('qa-champion');await page.locator('#championName').waitFor();
 await page.waitForFunction(()=>document.querySelector('#championName')?.value==='Lipão');
 assert.match(await page.locator('#championComboLabels').innerText(),/GV N/);assert.match(await page.locator('#championComboLabels').innerText(),/SPS 9-60 K/);
 await page.locator('#championDeck').click();await page.locator('[data-mini-slot="1"]').click();
 if(variant){await page.locator(`[data-mini-colors="${get('9-60').id}"]`).click();await page.locator(`[data-mini-color="${variant.id}"]`).click();assert.match(await page.locator('[data-mini-slot="1"]').innerText(),/SPS 9-60 K/);}
 await page.locator('[data-mini-save]').click();await page.locator('.tournament-deck-dialog').waitFor({state:'detached'});
 const photo=process.argv.includes('--real-photo')?'artifacts/champion/portrait-input.jpg':path.join(temp,'portrait.png');
 if(!process.argv.includes('--real-photo'))await sharp(Buffer.from('<svg width="500" height="720"><circle cx="250" cy="150" r="100" fill="#d8a57d"/><path d="M80 720V390Q80 240 250 250Q420 240 420 390V720Z" fill="#163354"/></svg>')).png().toFile(photo);
 await page.locator('#championPhoto').setInputFiles(photo);await page.locator('#championDownload').waitFor({state:'visible'});
 await page.waitForFunction(()=>!document.querySelector('#championDownload').disabled||document.querySelector('#championStatus').classList.contains('error'),null,{timeout:240000});
 assert.equal(await page.locator('#championStatus.error').count(),0,await page.locator('#championStatus').innerText());
 await page.screenshot({path:'artifacts/champion/admin-desktop.png',animations:'disabled'});
 const downloadPromise=page.waitForEvent('download');await page.locator('#championDownload').click();const download=await downloadPromise;await download.saveAs('artifacts/champion/generated-2160.png');
 const meta=await sharp('artifacts/champion/generated-2160.png').metadata();assert.equal(meta.width,2160);assert.equal(meta.height,2160);
 for(const width of [390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`artifacts/champion/admin-${width}.png`,fullPage:true,animations:'disabled'});}
 await page.setViewportSize({width:1440,height:1100});await page.locator('#championSave').click();await page.getByText('Arte salva.',{exact:true}).waitFor();
 const saved=await prisma.championArtwork.findFirst();cleanup.push(path.join(UPLOADS_DIR,path.basename(saved.imageUrl)));assert.equal(saved.tournamentId,tournament.id);assert.equal(saved.championUserId,users[2].id);if(variant)assert(JSON.parse(saved.beysJson)[1].includes(variant.id));assert.equal(saved.eventDate,'2026-10-27');
 const published=await request(`/api/admin/champion/artworks/${saved.id}/publish`,users[0],{method:'POST'});assert.equal(published.status,200);const first=await published.json();const again=await (await request(`/api/admin/champion/artworks/${saved.id}/publish`,users[0],{method:'POST'})).json();assert.equal(first.postId,again.postId);assert.equal(await prisma.post.count({where:{tag:'CHAMPION'}}),1);
 const post=await prisma.post.findUnique({where:{id:first.postId}});assert.equal(JSON.parse(post.dataJson).tournamentSlug,tournament.slug);assert.equal(JSON.parse(post.mediaJson)[0].url,saved.imageUrl);assert.equal((await prisma.tMatch.findUnique({where:{id:match.id}})).winnerId,winner.id);
 const invalid=new FormData();invalid.append('name','Falha');invalid.append('eventName','Teste');invalid.append('eventDate','2026-10-27');invalid.append('beys',JSON.stringify([[get('Needle').id],[],[]]));invalid.append('image',new Blob([fs.readFileSync('artifacts/champion/generated-2160.png')],{type:'image/png'}),'test.png');assert.equal((await request('/api/admin/champion/artworks',users[0],{method:'POST',body:invalid})).status,422);
 await prisma.tournament.update({where:{id:tournament.id},data:{visibility:'PRIVATE'}});assert.equal((await request(`/api/admin/champion/artworks/${saved.id}/publish`,users[0],{method:'POST'})).status,422);
 assert.deepEqual(errors,[]);await page.close();
 console.log('PASS: admin-only generator, automatic abbreviations, centered two-piece Bey, six-piece CX, recolors, portrait, square 2160px PNG, saved art, tournament link, idempotent community publishing and mobile layout.');
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));for(const file of cleanup){if(!path.resolve(file).startsWith(path.resolve(UPLOADS_DIR)+path.sep))throw Error('Unsafe cleanup path');await fs.promises.unlink(file).catch(()=>{});}await prisma.$disconnect();}
