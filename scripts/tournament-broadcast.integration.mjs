import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';

const dbFile = path.join(mkdtempSync(path.join(tmpdir(), 'bx-broadcast-')), 'test.db');
new DatabaseSync(dbFile).close();
process.env.DATABASE_URL = 'file:' + dbFile.replaceAll('\\', '/');
process.env.BX_ISOLATED_TEST = '1';
process.env.NODE_ENV = 'test';
const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { encoding: 'utf8' });
assert.equal(migration.status, 0, migration.stderr || migration.stdout);
const { prisma } = await import('../server/db.js');
const { default: router } = await import('../server/routes/tournaments.js');
const users = [];
const standardBladeImages = ['/assets/home/spinning-bey.png', '/assets/parts/aero-pegasus-bx53.webp'];
let server, browser;
const streams = new Set();
try {
  for (let i = 0; i < 21; i++) {
    const name = ['Organizador', 'Bia Aurora', 'Augusto Vento Norte', 'Arthur Eclipse', 'Ana Carolina Nascimento de Albuquerque e Silva'][i] || 'Blader ' + String(i).padStart(2, '0');
    users.push(await prisma.user.create({ data: {
      name, slug: 'blader-' + i, email: 'blader-' + i + '@test.invalid',
      avatarUrl: i === 4 ? '/missing-avatar.webp' : i % 2 ? '/assets/profiles/default-blader.png' : null,
    } }));
  }
  // Histórico real no banco isolado, calculado pela mesma função de ELO do site.
  for (let event = 0; event < 3; event++) {
    const history = await prisma.tournament.create({ data: {
      slug: 'history-' + event, name: 'Histórico ' + event, status: 'FINISHED', currentRound: 4,
      organizerId: users[0].id, startsAt: new Date(Date.UTC(2026, 7, 7 + event * 7)),
    } });
    const roster = [];
    for (const u of users.slice(1, 5)) roster.push(await prisma.tournamentPlayer.create({ data: { tournamentId: history.id, userId: u.id } }));
    for (let round = 1; round <= 4; round++) {
      for (const [a, b] of [[0, 1], [2, 3]]) await prisma.tMatch.create({ data: {
        tournamentId: history.id, round, tableNo: a + 1, p1Id: roster[a].id, p2Id: roster[b].id,
        status: 'DONE', winnerId: roster[a].id,
      } });
    }
  }
  const t = await prisma.tournament.create({ data: {
    slug: 'arena-qa', name: 'Copa BeyXLab · Arena Central', storeName: 'Arena Central',
    organizerId: users[0].id, startsAt: new Date(), roundsPlanned: 5,
  } });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = users.find(u => u.id === req.headers['x-test-user']);
    if (req.path.endsWith('/broadcast/stream')) {
      streams.add(res);
      res.once('close', () => streams.delete(res));
    }
    next();
  });
  app.get('/api/me', (req, res) => res.json({ user: req.user || null }));
  app.get('/api/site', (_req, res) => res.json({ site: { name: 'BeyXLab' }, flags: {} }));
  app.get('/api/parts-index', (_req, res) => res.json({ parts: [
    { kind: 'BLADE', slug: 'bullet-griffon', subKind: 'INTEGRATED', img: standardBladeImages[0] },
    { kind: 'BLADE', slug: 'cobaltdragoon', img: standardBladeImages[1] },
    { kind: 'BLADE', slug: 'aeropegasus', parentId: 'recolor', img: '/assets/ranks/ferro.png' },
    { kind: 'BLADE', slug: 'sword-dran', img: '/assets/Blade-Dran-Sword-Sushiro.png' },
    { kind: 'BLADE', slug: 'optimus-prime', img: '/assets/ranks/ouro.png' },
    { kind: 'BLADE', slug: 'darth-vader', img: '/assets/ranks/prata.png' },
    { kind: 'BLADE', slug: 'spinosaurus', img: '/assets/ranks/bronze.png' },
    { kind: 'BLADE', slug: 'spiderman', img: '/assets/ranks/platina.png' },
    { kind: 'MAIN_BLADE', img: '/assets/parts/eclipse.webp' },
    { kind: 'LOCK_CHIP', img: '/excluded-lock.webp' },
  ] }));
  app.get('/torneio/:slug', (_req, res) => res.sendFile(path.resolve('public/torneio.html')));
  app.get('/ao-vivo/:slug', (_req, res) => res.sendFile(path.resolve('public/ao-vivo.html')));
  app.use(router);
  app.use(express.static('public'));
  app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: err.message }); });
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const api = base + '/api/tournaments/' + t.slug;
  const call = (route, body, user = users[0], method = 'POST') => fetch(api + route, {
    method, headers: { 'Content-Type': 'application/json', 'x-test-user': user.id }, body: JSON.stringify(body),
  });
  const snapshot = async () => (await fetch(api + '/broadcast')).json();
  const broadcast = (match, table, user) => call('/matches/' + match.id + '/broadcast', { table }, user, 'PUT');
  const organizer = { 'x-test-user': users[0].id };
  for (const user of users.slice(1)) assert.equal((await call('/join', {}, user)).status, 200);
  assert.equal((await snapshot()).participants.length, 20);
  let tv, tv2, manager;
  const errors = [];
  const tvOptions = { viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' };
  const screenshot = (page, name) => page.screenshot({ path: 'artifacts/tournament-broadcast/' + name + '.png', animations: 'disabled' });
  const sceneHidden = page => page.locator('#scene').waitFor({ state: 'hidden', timeout: 33_000 });
  if (process.argv.includes('--visual')) {
    mkdirSync('artifacts/tournament-broadcast', { recursive: true });
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    tv = await browser.newPage(tvOptions);
    tv2 = await browser.newPage({ ...tvOptions, reducedMotion: 'reduce' });
    for (const page of [tv, tv2]) {
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => {
        window.playedNotes = 0;
        const original = AudioContext.prototype.createOscillator;
        AudioContext.prototype.createOscillator = function () { window.playedNotes++; return original.call(this); };
      });
      await page.goto(base + '/ao-vivo/' + t.slug, { waitUntil: 'domcontentloaded' });
      await page.locator('#connection.online').waitFor();
      assert.match(await page.locator('#arenaStage').innerText(), /começa em breve/i);
      assert.equal(await page.locator('.standing-row').count(), 8);
    }
    await tv.locator('#soundToggle').click();
    assert.equal(await tv.locator('#soundToggle').getAttribute('aria-pressed'), 'true');
    await tv.locator('#testSound').click();
    assert(await tv.evaluate(() => window.playedNotes > 2));
    await tv.locator('#volume').fill('30');
    await tv.locator('#fullscreen').click();
    await tv.waitForFunction(() => !!document.fullscreenElement);
    await tv.locator('#fullscreen').click();
    await tv.waitForFunction(() => !document.fullscreenElement);
  }

  assert.equal((await call('/start')).status, 200);
  let state = await snapshot();
  assert.equal(state.waiting.length, 10);
  assert.equal(state.events.at(-1).kind, 'ROUND');
  assert(state.players.some(p => p.elo !== null));
  assert(state.players.some(p => p.elo === null));
  assert(state.players.some(p => p.tier?.name === 'Ouro de Impacto' && p.elo >= 1200));
  assert(state.players.some(p => p.tier?.name === 'Prata de Arena' && p.tier.icon === '/assets/ranks/prata.png'));
  const matches = state.waiting;
  assert.equal((await broadcast(matches[0], 1, users[1])).status, 403);
  assert.equal((await broadcast(matches[0], 5)).status, 422);

  if (tv) {
    for (const page of [tv, tv2]) await page.locator('#scene .scene-round').waitFor();
    await tv.waitForFunction(() => {
      const blades = [...document.querySelectorAll('.scene-blade img')];
      return blades.length === 2 && blades.every(blade => blade.naturalWidth > 0);
    });
    assert.deepEqual((await tv.locator('.scene-blade img').evaluateAll(images => images.map(image => image.getAttribute('src')))).sort(), [...standardBladeImages].sort());
    for (const [index, direction] of ['normal', 'reverse'].entries()) {
      const image = tv.locator(`.scene-blade img[src="${standardBladeImages[index]}"]`);
      assert.equal(await image.evaluate(img => getComputedStyle(img).animationDirection), direction);
    }
    assert.equal(await tv.locator('.scene-blade img').first().evaluate(img => getComputedStyle(img).animationName), 'blade-spin');
    assert.equal(await tv2.locator('.scene-blade img').first().evaluate(img => getComputedStyle(img).animationName), 'none');
    await screenshot(tv, 'round-intro');
    await tv2.setViewportSize({ width: 390, height: 900 });
    await screenshot(tv2, 'round-intro-390');
    await tv2.setViewportSize(tvOptions.viewport);
    const pairingViewer = await browser.newPage(tvOptions);
    await pairingViewer.clock.install();
    await pairingViewer.goto(base + '/ao-vivo/' + t.slug, { waitUntil: 'domcontentloaded' });
    await pairingViewer.locator('#connection.online').waitFor();
    assert.equal(await pairingViewer.locator('#arenaCount').textContent(), 'Nenhuma mesa ao vivo');
    assert.equal(await pairingViewer.locator('.pairing-row').count(), 5);
    assert.equal(await pairingViewer.locator('.pairing-row .pairing-number strong').first().innerText(), '01');
    assert(await pairingViewer.locator('#waiting').isHidden());
    await screenshot(pairingViewer, 'pairings-1080');
    await pairingViewer.setViewportSize({ width: 3840, height: 2160 });
    await screenshot(pairingViewer, 'pairings-4k');
    await pairingViewer.setViewportSize({ width: 390, height: 900 });
    assert.equal(await pairingViewer.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await screenshot(pairingViewer, 'pairings-390');
    await pairingViewer.clock.fastForward(9000);
    await pairingViewer.getByText('10 confrontos · Página 2 / 2', { exact: true }).waitFor();
    assert.equal(await pairingViewer.locator('.pairing-row .pairing-number strong').first().innerText(), '06');
    await pairingViewer.close();

    manager = await browser.newPage({ viewport: { width: 390, height: 900 }, extraHTTPHeaders: organizer });
    await manager.goto(base + '/torneio/' + t.slug + '#gestao', { waitUntil: 'domcontentloaded' });
    await manager.locator('[data-manager-panel=divulgacao]').click();
    assert.equal(await manager.getByRole('link', { name: 'Abrir painel' }).getAttribute('href'), '/ao-vivo/' + t.slug);
    await manager.locator('[data-manager-panel=divulgacao]').click();
    await manager.locator('[data-broadcast-match]').first().click();
    await manager.locator('[data-live-table="1"]').click();
    await manager.locator('[data-save-live]').click();
    await manager.getByRole('button', { name: 'Ao vivo · Mesa 1' }).waitFor();
    await tv.locator('.live-grid[data-count="1"]').waitFor();
    assert(await tv.locator('.pairings-board').isHidden());
    assert(await tv.locator('#waiting').isVisible());
    await manager.locator('[data-broadcast-match]').nth(1).click();
    assert(await manager.locator('[data-live-table="1"]').isDisabled());
    await manager.locator('[data-close-live]').click();
    await screenshot(manager, 'manager-390');
  } else assert.equal((await broadcast(matches[0], 1)).status, 200);

  const conflicts = await Promise.all([broadcast(matches[1], 2), broadcast(matches[2], 2)]);
  assert.deepEqual(conflicts.map(r => r.status).sort(), [200, 409]);
  const loser = conflicts[0].status === 409 ? matches[1] : matches[2];
  assert.equal((await broadcast(loser, 3)).status, 200);
  assert.equal((await broadcast(matches[3], 4)).status, 200);
  state = await snapshot();
  assert.deepEqual(state.live.map(match => match.liveTableNo), [1, 2, 3, 4]);
  assert.equal(state.waiting.length, 6);
  assert(!('p1Report' in state.live[0]) && !('tableToken' in state.live[0]));
  if (tv) {
    await tv.locator('.live-card').nth(3).waitFor();
    await tv2.locator('.live-card').nth(3).waitFor();
    await tv.locator('#scene .scene-table').waitFor({ timeout: 8000 });
    await screenshot(tv, 'table-intro');
    const late = await browser.newPage(tvOptions);
    await late.clock.install();
    await late.goto(base + '/ao-vivo/' + t.slug, { waitUntil: 'domcontentloaded' });
    await late.locator('#connection.online').waitFor();
    assert.equal(await late.locator('.live-card').count(), 4);
    assert(await late.locator('#scene').isHidden());
    assert.deepEqual(await late.locator('.live-card').evaluateAll(cards => cards.map(card => getComputedStyle(card).getPropertyValue('--signal'))), ['#61e8ff', '#cbb1ff', '#ffd379', '#a4ffb8']);
    assert.equal(await tv2.locator('.live-card').first().evaluate(card => getComputedStyle(card, '::before').animationName), 'none');
    await late.waitForFunction(() => {
      const photos = [...document.querySelectorAll('.live-card .ranked-portrait-photo img')];
      return photos.filter(photo => photo.naturalWidth > 0).length === 2;
    });
    await screenshot(late, 'four-1080');
    assert(await late.locator('.live-card .elo-frame-prata').count());
    assert(await late.locator('.live-card .elo-frame-ouro').count());
    assert(await late.locator('.live-card .tv-rank-title img[src="/assets/ranks/prata.png"]').count());
    assert.match(await late.locator('.live-card .tv-rank').allTextContents().then(lines => lines.join(' ')), /Ouro de Impacto\s+1\.210 PDL/);
    assert(await late.locator('.live-card .portrait').evaluateAll(portraits => {
      const baseline = portraits.find(portrait => !portrait.classList.contains('ranked-portrait')).offsetWidth;
      return portraits.every(portrait => {
        const photo = portrait.querySelector('.ranked-portrait-photo') || portrait;
        const name = portrait.parentElement.querySelector('strong');
        const spacing = name.getBoundingClientRect().top - portrait.getBoundingClientRect().bottom;
        return Math.abs(photo.offsetWidth - baseline) <= 1 && spacing >= 0 && spacing <= 6;
      });
    }));
    assert.match(await late.locator('.live-card').first().innerText(), /Ana Carolina Nascimento de Albuquerque e Silva/i);
    assert.equal(await late.locator('.live-card').first().evaluate(card => card.scrollHeight > card.clientHeight), false);
    await late.setViewportSize({ width: 3840, height: 2160 });
    await screenshot(late, 'four-4k');
    await late.setViewportSize({ width: 390, height: 900 });
    assert.equal(await late.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await screenshot(late, 'four-390');
    await late.locator('#motionToggle').click();
    assert.equal(await late.locator('#motionToggle').getAttribute('aria-pressed'), 'true');
    const standingPages = new Set();
    for (let i = 0; i < 24; i++) {
      await late.clock.fastForward(5 * 60_000);
      standingPages.add(await late.locator('#standingPage').innerText());
      assert(await late.locator('.standing-row').count() <= 8);
      assert.equal(await late.locator('.live-card').count(), 4);
    }
    assert.equal(standingPages.size, 4);
    assert(await late.locator('#scene').isHidden());
    await late.close();
    await tv.locator('#soundToggle').click();
    assert.equal(await tv.locator('#soundToggle').getAttribute('aria-pressed'), 'false');
    await sceneHidden(tv);
    await tv.waitForFunction(() => document.querySelector('#standingPage')?.textContent.includes('Página 2'), null, { timeout: 30_000 });
  }

  const occupied = state.live[1];
  const before = await prisma.tMatch.findUnique({ where: { id: matches[0].id } });
  assert.equal((await broadcast(occupied, null)).status, 200);
  assert.equal((await broadcast(matches[0], 2)).status, 200);
  const moved = await prisma.tMatch.findUnique({ where: { id: matches[0].id } });
  assert.equal(moved.tableNo, before.tableNo);
  assert.equal(moved.liveStartedAt.getTime(), before.liveStartedAt.getTime());
  assert.equal(moved.liveTableNo, 2);
  const stopped = await prisma.tMatch.findUnique({ where: { id: occupied.id } });
  assert.equal(stopped.status, 'PENDING');
  assert.equal(stopped.winnerId, null);
  assert.equal(stopped.liveTableNo, null);

  if (tv) {
    await tv.locator('.live-grid[data-count="3"]').waitFor();
    await screenshot(tv, 'three-1080');
    assert.equal((await broadcast(matches[3], null)).status, 200);
    await tv.locator('.live-grid[data-count="2"]').waitFor();
    await screenshot(tv, 'two-1080');
    assert.equal((await broadcast(loser, null)).status, 200);
    await tv.locator('.live-grid[data-count="1"]').waitFor();
    await screenshot(tv, 'one-1080');
  }

  // Duas TVs perdem a conexão. O retorno mostra o estado sem vinhetas antigas.
  if (tv) {
    for (const response of streams) response.end();
    await tv.getByText('Reconectando…', { exact: true }).waitFor();
    await tv.locator('#connection.online').waitFor();
    await tv2.locator('#connection.online').waitFor();
    assert(await tv.locator('#scene').isHidden());
    assert(await tv2.locator('#scene').isHidden());
  }
  const player = await prisma.tournamentPlayer.findUnique({ where: { id: moved.p1Id } });
  assert.equal((await call('/report', { matchId: moved.id, result: 'WIN' }, users.find(u => u.id === player.userId))).status, 200);
  assert.equal((await call('/matches/' + moved.id + '/resolve', { winnerId: moved.p1Id })).status, 200);
  if (tv) {
    await tv.locator('.pairings-board').waitFor();
    assert(await tv.locator('#waiting').isHidden());
    assert.equal(await tv.locator('.pairing-row .pairing-number strong').first().innerText(), '02');
  }
  for (const match of matches.slice(1)) assert.equal((await call('/matches/' + match.id + '/resolve', { winnerId: match.p1Id })).status, 200);
  state = await snapshot();
  assert.equal(state.live.length, 0);
  assert.equal(state.waiting.length, 0);
  assert.equal(state.completed, matches.length);
  if (tv) {
    await tv.getByText('Aguardando próxima rodada', { exact: true }).waitFor();
    assert.equal(await tv.locator('.intermission-leader').count(), 3);
    assert.equal(await tv.locator('.standing-rank').first().innerText(), '4');
    assert.equal(await tv.locator('.standing-row').count(), 7);
    assert(standardBladeImages.includes(await tv.locator('.intermission-blade img').getAttribute('src')));
    assert(await tv.locator('.intermission-blade img').evaluate(img =>
      getComputedStyle(img).animationDirection === (img.parentElement.dataset.spin === 'left' ? 'reverse' : 'normal')));
    await screenshot(tv, 'between-rounds-1080');
    await tv2.locator('.intermission').waitFor();
    await tv2.setViewportSize({ width: 390, height: 900 });
    assert.equal(await tv2.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await screenshot(tv2, 'between-rounds-390');
    await tv2.setViewportSize(tvOptions.viewport);
  }
  assert((await prisma.tMatch.findMany({ where: { tournamentId: t.id } })).every(m => m.liveTableNo === null));
  const regular = await (await fetch(api)).json();
  assert.deepEqual(state.standings.map(row => row.playerId), regular.standings.map(row => row.player.id));
  const completed = await prisma.tMatch.findMany({ where: { tournamentId: t.id, round: 1 }, orderBy: { tableNo: 'asc' } });
  assert.equal((await call('/next-round')).status, 200);
  if (tv) {
    await tv.getByText('Rodada 02', { exact: true }).waitFor();
    assert.equal(await tv.evaluate(() => document.querySelector('#roundNumber').textContent), '02');
  }
  const roundTwo = (await snapshot()).waiting;
  assert.equal((await broadcast(roundTwo[0], 1)).status, 200);
  assert.equal((await call('/undo-round', { confirm: true, round: 2 }, users[1])).status, 403);
  if (manager) {
    await manager.reload({ waitUntil: 'domcontentloaded' });
    await manager.locator('#undoRoundBtn').click();
    await manager.getByRole('alertdialog').getByRole('button', { name: 'Voltar uma rodada' }).click();
    await manager.locator('[data-manager-round="2"]').waitFor({ state: 'detached' });
  } else assert.equal((await call('/undo-round', { confirm: true, round: 2 })).status, 200);
  assert.equal((await snapshot()).tournament.round, 1);
  assert.deepEqual(await prisma.tMatch.findMany({ where: { tournamentId: t.id }, orderBy: { tableNo: 'asc' } }), completed);
  assert.equal((await call('/matches/' + completed[0].id + '/resolve', { winnerId: completed[0].p2Id })).status, 200);
  assert.equal((await call('/next-round')).status, 200);
  const played = (await snapshot()).waiting[0];
  assert.equal((await call('/matches/' + played.id + '/resolve', { winnerId: played.p1Id })).status, 200);
  assert.equal((await call('/undo-round', { confirm: true, round: 2 })).status, 409);
  assert.equal((await call('/finish')).status, 200);
  assert.equal((await snapshot()).tournament.status, 'FINISHED');
  if (tv) {
    await tv.locator('.podium-final').waitFor();
    await screenshot(tv, 'podium');
    await prisma.tournament.update({ where: { id: t.id }, data: { visibility: 'PRIVATE' } });
    await tv.getByText('Sem acesso', { exact: true }).waitFor();
  } else await prisma.tournament.update({ where: { id: t.id }, data: { visibility: 'PRIVATE' } });
  assert.equal((await fetch(api + '/broadcast')).status, 404);
  assert.equal((await fetch(api + '/broadcast/stream')).status, 404);
  assert.equal((await fetch(api + '/broadcast', { headers: organizer })).status, 200);
  assert.deepEqual(errors, []);
  console.log('PASS: broadcast persistence, contention, cleanup, standings, privacy, single-round undo' + (tv ? ', two TVs, reconnect, audio, fullscreen, 1080p, 4K and mobile.' : '.'));
} finally {
  await browser?.close();
  for (const response of streams) response.end();
  if (server) await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
}
