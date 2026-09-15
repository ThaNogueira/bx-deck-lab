import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = 'http://127.0.0.1:4174'; // Never accept a production URL.
const browser = await chromium.launch({ headless:true, channel:'msedge' });
const results = [];
const run = Date.now();
await mkdir('artifacts/revamp-auth', { recursive:true });
async function api(context, route, method='GET', data, status=200) {
  const response = await context.request.fetch(origin + route, {method, data});
  assert.equal(response.status(), status, `${method} ${route}: ${await response.text()}`);
  if (response.headers()['content-type']?.includes('json')) return response.json();
  return response;
}
try {
  const owner = await browser.newContext();
  const guest = await browser.newContext();
  const other = await browser.newContext();
  const third = await browser.newContext();
  const page = await owner.newPage();
  const email = `owner-${run}@revamp.invalid`;
  const password = `LocalTest-${run}!`;
  await page.goto(origin + '/entrar');
  await page.waitForLoadState('networkidle');
  await page.locator('#modeRegister').click();
  await page.locator('#fName').fill('Gestor de teste');
  await page.locator('#fEmail').fill(email);
  await page.locator('#fPassword').fill(password);
  await page.locator('#pwSubmit').click();
  await page.waitForURL('**/perfil?bemvindo=1');
  await page.locator('#logoutBtn').waitFor();
  results.push('UI registration and authenticated profile');
  const me = await api(owner, '/api/me');
  for (const [i, context] of [other,third].entries()) await api(context, '/api/auth/register','POST',{name:`Jogador ${i+2}`,email:`player-${i}-${run}@revamp.invalid`,password});
  await api(guest, '/api/decks','POST',{},401);
  await api(owner, '/api/decks','POST',{title:''},422);
  const {parts} = await api(owner, '/api/parts?all=1');
  const beys = [['BLADE','RATCHET','BIT'].map(kind => parts.find(p => p.kind === kind).id)];
  const {deck} = await api(owner, '/api/decks','POST',{title:`Deck QA ${run}`,beys,isPublic:false});
  await api(other, `/api/decks/${deck.id}`,'PATCH',{title:'Unauthorized'},403);
  await api(owner, `/api/decks/${deck.id}`,'PATCH',{title:'Deck revisado',isPublic:true});
  results.push('Deck create/edit, invalid form response, anonymous and non-owner permission checks');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jv1sAAAAASUVORK5CYII=','base64');
  const uploaded = await owner.request.post(origin + '/api/me/avatar',{multipart:{file:{name:'qa-avatar.png',mimeType:'image/png',buffer:png}}});
  assert.equal(uploaded.status(),200);
  const upload = await uploaded.json();
  assert((await owner.request.get(origin + upload.url)).ok());
  results.push('Avatar upload and image retrieval (local only)');
  const {tournament} = await api(owner,'/api/tournaments','POST',{name:`Torneio QA ${run}`,startsAt:new Date().toISOString(),roundsPlanned:1});
  const base = `/api/tournaments/${tournament.slug}`;
  await api(owner, base, 'PATCH', { entryFeeCents: 2500, description: 'Evento de teste com premiação.' });
  const coverResponse = await owner.request.post(origin + base + '/cover', { multipart: { file: { name: 'cover.png', mimeType: 'image/png', buffer: png } } });
  assert.equal(coverResponse.status(), 200, await coverResponse.text());
  const cover = await coverResponse.json();
  assert((await owner.request.get(origin + cover.coverUrl)).ok());
  assert.equal((await api(owner, base)).tournament.entryFeeCents, 2500);
  const deniedCover = await other.request.post(origin + base + '/cover', { multipart: { file: { name: 'cover.png', mimeType: 'image/png', buffer: png } } });
  assert.equal(deniedCover.status(), 403);
  results.push('Tournament cover, entry fee and organizer permissions');
  for (const context of [owner,other,third]) await api(context,base+'/join','POST',{});
  await api(owner,base+'/my-deck','POST',{deckId:deck.id});
  await api(other,base+'/start','POST',{},403);
  await api(owner,base+'/start','POST',{});
  const active = await api(owner,base);
  await writeFile('artifacts/revamp-auth/tournament.json',JSON.stringify(active,null,2));
  const matches = active.matches || active.tournament.matches;
  assert(matches.some(m => !m.p2), 'Odd field must have bye');
  for (const match of matches.filter(m => m.p2)) await api(owner,base+`/matches/${match.id}/resolve`,'POST',{winnerId:match.p1.id});
  await api(owner,base+'/finish','POST',{});
  const photoResponse = await owner.request.post(origin + base + '/photos', { multipart: { photos: { name: 'event.png', mimeType: 'image/png', buffer: png } } });
  assert.equal(photoResponse.status(), 200, await photoResponse.text());
  assert.equal((await api(owner, base)).photos.length, 1);
  results.push('Finished-event gallery upload and retrieval');
  const exported = await api(owner,base+'/standings-image.png');
  assert.equal(exported.headers()['content-type'],'image/png');
  await writeFile('artifacts/revamp-auth/standings.png',await exported.body());
  results.push('Tournament create/join/deck/start/bye/resolve/finish and standings PNG');
  const profile = me.user || me;
  const {products} = await api(owner,'/api/products');
  const routes = ['/perfil','/meus-decks',`/u/${profile.slug}`,`/deck/${deck.slug}`,`/peca/${parts[0].slug}`,`/produto/${products[0].slug}`,`/torneio/${tournament.slug}`,`/torneio/${tournament.slug}/cartaz`,`/t/${tournament.slug}`,'/admin','/manutencao','/#builder'];
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:960});
    for (const [i,route] of routes.entries()) {
      const errors=[];
      const listener = e=>errors.push(e.message);
      page.on('pageerror',listener);
      await page.goto(origin+route);
      await page.waitForTimeout(700);
      const scroll = await page.evaluate(()=>document.documentElement.scrollWidth);
      await page.screenshot({path:`artifacts/revamp-auth/${width}-${i}.png`,fullPage:true});
      results.push({route,width,scroll,errors});
      assert.deepEqual(errors,[],route);
      page.off('pageerror',listener);
    }
  }
  await page.goto(origin+'/perfil');
  await page.locator('#logoutBtn').click();
  await page.waitForURL(origin+'/');
  await api(owner,'/api/me/collection','GET',undefined,401);
  await page.goto(origin+'/entrar');
  await page.waitForLoadState('networkidle');
  await page.locator('#fEmail').fill(email);
  await page.locator('#fPassword').fill(password);
  await page.locator('#pwSubmit').click();
  await page.waitForURL(origin+'/');
  await api(owner,'/api/me/collection');
  results.push('UI logout, session revoked, password login');
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:960});
    await page.goto(origin+`/torneio/${tournament.slug}`);
    await page.locator('[data-view="gestao"]').click();
    await page.locator('[data-build-deck]').first().click();
    await page.locator('#miniDeckSearch').pressSequentially('Dragoon',{delay:80});
    assert.equal(await page.locator('#miniDeckSearch').inputValue(),'Dragoon');
    assert(await page.locator('#miniDeckSearch').evaluate(e=>e===document.activeElement));
    await page.screenshot({path:`artifacts/revamp-auth/${width}-mini-builder.png`,fullPage:true});
    await page.locator('[data-mini-close]').first().click();
    assert(!(await page.locator('#manageDeckModal').isVisible()));
    const download = page.waitForEvent('download');
    await page.locator('#downloadResults').click();
    await (await download).saveAs(`artifacts/revamp-auth/${width}-results-export.json`);
    await page.locator('[data-view="pairings"]').click();
    await page.locator('#tModeBtn').click();
    await page.locator('[data-view="geral"]').click();
    await page.locator('[data-deck-popup]').first().click();
    assert(await page.locator('#publicDeckModal').isVisible());
    await page.locator('[data-public-deck-close]').click();
    await page.locator('#userMenuBtn').click();
    assert(await page.locator('#userMenu').isVisible());
    await page.locator('#userMenuBtn').click();
    await page.locator('#notifBtn').click();
    assert.equal(await page.locator('#notifBtn').getAttribute('aria-expanded'),'true');
    await page.locator('#notifBtn').click();
  }
  results.push('Management mini-builder search focus, close, JSON download after finish, pairing view toggle, deck modal, account and notification menus at both widths');
  // Fixture promotion is restricted to the dedicated local SQLite database.
  const {PrismaClient} = require('@prisma/client');
  const db = new PrismaClient({datasources:{db:{url:'file:../data/qa/revamp.db'}}});
  await db.user.update({where:{email},data:{role:'ADMIN'}});
  await db.$disconnect();
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:960});
    await page.goto(origin+'/admin');
    await page.waitForTimeout(700);
    await page.screenshot({path:`artifacts/revamp-auth/${width}-admin.png`,fullPage:true});
  }
  results.push('Admin fixture and restricted dashboard rendered at both widths');
  const extra = (await api(owner,'/api/decks','POST',{title:`Disposable ${run}`,beys})).deck;
  await api(owner,`/api/decks/${extra.id}`,'DELETE');
  results.push('Delete own disposable deck');
} finally {
  await writeFile('artifacts/revamp-auth/results.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
  await browser.close();
}
