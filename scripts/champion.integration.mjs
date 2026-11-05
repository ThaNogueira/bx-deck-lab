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
 const page=await browser.newPage({viewport:{width:1440,height:1100},hasTouch:true,extraHTTPHeaders:{'x-test-user':users[0].id}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>console.log('Failed asset:',r.url(),r.failure()?.errorText));
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
 // Direct manipulation changes position/scale, while controls remain usable and the export stays clean.
 await page.locator('#championCanvas').scrollIntoViewIfNeeded();let box=await page.locator('#championCanvas').boundingBox();
 await page.mouse.move(box.x+box.width*.73,box.y+box.height*.25);await page.mouse.down();await page.mouse.move(box.x+box.width*.77,box.y+box.height*.28,{steps:12});assert(await page.locator('.champion-live-layers').isVisible(),'Dragging should use composited layers');await page.screenshot({path:'artifacts/champion/dragging.png'});await page.mouse.up();
 assert(Number(await page.locator('#championX').inputValue())>25,'Dragging should move the photo');assert(Number(await page.locator('#championY').inputValue())>15);
 const corner=page.locator('[data-corner=nw]');await corner.scrollIntoViewIfNeeded();const handle=await corner.boundingBox();
 await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x-18,handle.y-18,{steps:8});await page.mouse.up();assert(Number(await page.locator('#championZoom').inputValue())>1);
 await page.locator('[data-photo-center]').click();
 await page.locator('[data-photo-key=saturation]').fill('1.65');await page.locator('[data-photo-key=glow]').fill('0.55');await page.locator('[data-photo-key=shadow]').fill('0.4');
 assert.equal(await page.locator('[data-photo-key=saturation] + output').textContent(),'165%');
 await page.locator('[data-photo-expand]').click();assert.equal(await page.locator('.champion-preview').getAttribute('role'),'dialog');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
 await page.waitForFunction(()=>!document.querySelector('#championDownload').disabled);
 const compositing=await page.evaluate(async()=>{
   const m=await import('/js/champion-renderer.mjs?v=photo-editor-4'),p=document.createElement('canvas');p.width=p.height=1000;p.getContext('2d').fillStyle='#ff00ff';p.getContext('2d').fillRect(0,0,1000,1000);
   const base=document.createElement('canvas'),painted=document.createElement('canvas'),s={name:'',beys:[[],[],[]],eventName:'',eventDate:''};await m.renderChampion(base,s,new Map(),{size:1000});await m.renderChampion(painted,{...s,portrait:p,zoom:2,offsetX:-350,saturation:1,glow:0,shadow:0},new Map(),{size:1000});
   const pixel=(c,x,y)=>[...c.getContext('2d').getImageData(x,y,1,1).data];return {box:[pixel(base,440,380),pixel(painted,440,380)],name:[pixel(base,220,270),pixel(painted,220,270)],footer:[pixel(base,600,900),pixel(painted,600,900)],corner:pixel(painted,430,490)};
 });
 for(const key of ['box','name','footer'])assert.deepEqual(compositing[key][0],compositing[key][1],`Photo must stay behind ${key}`);
 assert(compositing.corner[0]>200&&compositing.corner[1]<40,'Photo should follow the diagonal panel corner, without the old vertical crop');
 const fallback=await page.evaluate(async()=>{
   const descriptor=Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype,'filter');delete CanvasRenderingContext2D.prototype.filter;
   try{const m=await import('/js/champion-renderer.mjs?v=photo-editor-4'),p=document.createElement('canvas');p.width=100;p.height=160;const c=p.getContext('2d');c.fillStyle='#9e8989';c.fillRect(0,0,100,160);const state={portrait:p,saturation:2,glow:.5,shadow:.3};const layer=m.championPhotoLayer(state),d=layer.layer.getContext('2d').getImageData(layer.pad+30,layer.pad+30,1,1).data;return d[0]-d[1]>25&&d[3]===255;}finally{if(descriptor)Object.defineProperty(CanvasRenderingContext2D.prototype,'filter',descriptor);}
 });assert(fallback,'Color/glow should work without native canvas filters');
 await page.screenshot({path:'artifacts/champion/admin-desktop.png',animations:'disabled'});
 const downloadPromise=page.waitForEvent('download');await page.locator('#championDownload').click();const download=await downloadPromise;await download.saveAs('artifacts/champion/generated-2160.png');
 const meta=await sharp('artifacts/champion/generated-2160.png').metadata();assert.equal(meta.width,2160);assert.equal(meta.height,2160);
 for(const width of [390,320]){
   await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('[data-photo-expand]').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(width===390){const client=await page.context().newCDPSession(page),b=await page.locator('#championCanvas').boundingBox(),x=b.x+b.width*.73,y=b.y+b.height*.25;await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+15,y:y+8,id:1}]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert(Number(await page.locator('#championX').inputValue())>10,'Touch should move the photo');await page.locator('[data-photo-center]').click();}
   await page.waitForFunction(()=>!document.querySelector('#championDownload').disabled);await page.screenshot({path:`artifacts/champion/editor-${width}.png`,animations:'disabled'});await page.locator('[data-photo-expand]').click();await page.screenshot({path:`artifacts/champion/admin-${width}.png`,fullPage:true,animations:'disabled'});
 }
 await page.setViewportSize({width:1440,height:1100});await page.locator('#championSave').click();await page.getByText('Arte salva.',{exact:true}).waitFor();
 const saved=await prisma.championArtwork.findFirst();cleanup.push(path.join(UPLOADS_DIR,path.basename(saved.imageUrl)));assert.equal(saved.tournamentId,tournament.id);assert.equal(saved.championUserId,users[2].id);if(variant)assert(JSON.parse(saved.beysJson)[1].includes(variant.id));assert.equal(saved.eventDate,'2026-10-27');
 const published=await request(`/api/admin/champion/artworks/${saved.id}/publish`,users[0],{method:'POST'});assert.equal(published.status,200);const first=await published.json();const again=await (await request(`/api/admin/champion/artworks/${saved.id}/publish`,users[0],{method:'POST'})).json();assert.equal(first.postId,again.postId);assert.equal(await prisma.post.count({where:{tag:'CHAMPION'}}),1);
 const post=await prisma.post.findUnique({where:{id:first.postId}});assert.equal(JSON.parse(post.dataJson).tournamentSlug,tournament.slug);assert.equal(JSON.parse(post.mediaJson)[0].url,saved.imageUrl);assert.equal((await prisma.tMatch.findUnique({where:{id:match.id}})).winnerId,winner.id);
 const invalid=new FormData();invalid.append('name','Falha');invalid.append('eventName','Teste');invalid.append('eventDate','2026-10-27');invalid.append('beys',JSON.stringify([[get('Needle').id],[],[]]));invalid.append('image',new Blob([fs.readFileSync('artifacts/champion/generated-2160.png')],{type:'image/png'}),'test.png');assert.equal((await request('/api/admin/champion/artworks',users[0],{method:'POST',body:invalid})).status,422);
 await prisma.tournament.update({where:{id:tournament.id},data:{visibility:'PRIVATE'}});assert.equal((await request(`/api/admin/champion/artworks/${saved.id}/publish`,users[0],{method:'POST'})).status,422);
 assert.deepEqual(errors,[]);await page.close();
 console.log('PASS: champion generator, direct drag/resize, color/glow/shadow controls, photo behind exact panel/name shapes, mobile expanded editor, high-quality cutout, 2160px export, permissions, recolors and idempotent publishing.');
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));for(const file of cleanup){if(!path.resolve(file).startsWith(path.resolve(UPLOADS_DIR)+path.sep))throw Error('Unsafe cleanup path');await fs.promises.unlink(file).catch(()=>{});}await prisma.$disconnect();}
