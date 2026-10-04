// Uses a fresh temporary database. Never reads .env or mutates production.
import { mkdtempSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const temp = mkdtempSync(path.join(tmpdir(), 'bx-profile-qa-'));
new DatabaseSync(path.join(temp, 'profile.db')).close();
process.env.DATABASE_URL = `file:${path.join(temp, 'profile.db').replaceAll('\\', '/')}`;
process.env.NODE_ENV = 'test';
process.env.BX_ISOLATED_TEST = '1';
const migrated = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: process.env, encoding: 'utf8' });
assert.equal(migrated.status, 0, migrated.stderr);
const { prisma } = await import('../server/db.js');
const { default: express } = await import('express');
const { default: community } = await import('../server/routes/community.js');
const { default: profile } = await import('../server/routes/profile.js');
const { default: catalog } = await import('../server/routes/catalog.js');
const { chromium } = await import('playwright');
let server, browser;
try {
  const user = await prisma.user.create({ data: { name: 'Blader de teste', email: 'player@profile.invalid', slug: 'blader-teste', bio: 'Do primeiro lançamento ao próximo pódio.' } });
  const rival = await prisma.user.create({ data: { name: 'Oponente', email: 'rival@profile.invalid', slug: 'oponente-teste' } });
  await prisma.user.create({ data: { name: 'Novo jogador', email: 'new@profile.invalid', slug: 'novo-teste' } });
  // Catalog metadata is public and read-only; use real artwork for visual QA.
  const index = await fetch('https://beyxlab.com.br/api/parts-index').then(r => r.json());
  const all = Array.isArray(index) ? index : index.parts;
  assert.ok(Array.isArray(all));
  const blades = all.filter(p => p.kind === 'BLADE' && !p.parentId && p.img).slice(0,3);
  const ratchet = all.find(p => p.kind === 'RATCHET' && p.img);
  const bit = all.find(p => p.kind === 'BIT' && !p.subKind && p.img);
  for(const p of [...blades,ratchet,bit]) await prisma.part.create({data:{id:p.id,slug:p.slug,kind:p.kind,name:p.name,displayName:p.display||p.name,imageUrl:p.img}});
  const beys = blades.map(p => [p.id,ratchet.id,bit.id]);
  for(let i=0;i<15;i++) {
    const t=await prisma.tournament.create({data:{name:`Liguinha de teste ${i+1} — Arena BeyXLab`,slug:`arena-${i}`,storeName:'Tamer Shop',startsAt:new Date(2026,Math.floor(i/3),i+1),organizerId:user.id,status:i===13?'RUNNING':'FINISHED',visibility:i===10?'PRIVATE':i===11?'LINK_ONLY':'PUBLIC',description:i===12?'[ADMIN TEST] privado':null}});
    const p=await prisma.tournamentPlayer.create({data:{tournamentId:t.id,userId:user.id,manualDeckJson:JSON.stringify(beys)}});
    const q=await prisma.tournamentPlayer.create({data:{tournamentId:t.id,userId:rival.id}});
    await prisma.tMatch.create({data:{tournamentId:t.id,p1Id:p.id,p2Id:q.id,round:1,tableNo:1,status:'DONE',winnerId:i%3===0?q.id:p.id}});
    if(i===14) await prisma.tournament.delete({where:{id:t.id}});
  }
  const app=express();
  app.get('/api/me',(_req,res)=>res.json({user:null}));
  app.use(profile,community,catalog);
  app.get('/u/:slug',(_req,res)=>res.sendFile(path.resolve('public/u.html')));
  app.use(express.static('public'));
  app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:err.message});});
  server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.on('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const response=await fetch(base+'/api/users/blader-teste/tournaments');
  assert.equal(response.status,200);
  const stats=await response.json();
  assert.equal(stats.summary.events,11); assert.equal(stats.tournaments.length,12);
  assert.equal(stats.summary.matches,11); assert.equal(stats.favoriteBeys.length,3);
  assert.ok(!JSON.stringify(stats).includes('@profile.invalid'));
  const privateEvent=await prisma.tournament.findUnique({where:{slug:'arena-0'}});
  await prisma.tournament.update({where:{id:privateEvent.id},data:{visibility:'PRIVATE'}});
  const changed=await fetch(base+'/api/users/blader-teste/tournaments').then(r=>r.json());
  assert.equal(changed.summary.events,10); // Visibility changes apply immediately.
  await prisma.tournament.update({where:{id:privateEvent.id},data:{visibility:'PUBLIC'}});
  const empty=await fetch(base+'/api/users/novo-teste/tournaments').then(r=>r.json());
  assert.equal(empty.summary.events,0); assert.equal(empty.summary.winRate,null);
  assert.equal((await fetch(base+'/api/users/missing/tournaments')).status,404);
  await prisma.user.update({where:{id:rival.id},data:{status:'BANNED'}});
  assert.equal((await fetch(base+'/api/users/oponente-teste/tournaments')).status,404);
  browser=await chromium.launch({headless:true,channel:'msedge'});
  mkdirSync('artifacts/profile-competition',{recursive:true});
  for(const width of [1440,390,360]) {
    const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',err=>errors.push(err.message));
    await page.goto(base+'/u/blader-teste');
    await page.locator('.pc-bey').first().waitFor();
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('.pc-beys').scrollIntoViewIfNeeded();
    await page.evaluate(async()=>{ await Promise.all([...document.querySelectorAll('.pc-bey img')].map(img=>img.decode().catch(()=>{}))); });
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:`artifacts/profile-competition/${width}.png`,fullPage:true});
    assert.equal(await page.locator('.pc-event').count(),5);
    await page.getByRole('button',{name:'Próxima página'}).click();
    assert.match(await page.locator('[data-pages]').innerText(),/2 de 3/);
    await page.getByRole('button',{name:'Próxima página'}).click();
    assert.equal(await page.locator('.pc-event').count(),2);
    const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,bg:getComputedStyle(document.body).backgroundImage}));
    assert.equal(layout.width,layout.scroll,`Overflow at ${width}`);
    assert.match(layout.bg,/site-circuits/); assert.deepEqual(errors,[]);
    await page.goto(base+'/u/novo-teste');
    await page.locator('.pc-ring').waitFor();
    assert.match(await page.locator('.pc-ring').innerText(),/—/);
    await page.screenshot({path:`artifacts/profile-competition/empty-${width}.png`,fullPage:true});
    await page.close();
  }
  console.log('PASS: real API, standings, privacy, deleted events, empty profiles, responsive 1440/390/360, history pagination, background, no browser errors.');
} finally {
  await browser?.close();
  await new Promise(resolve=>server?server.close(resolve):resolve());
  await prisma.$disconnect();
}
