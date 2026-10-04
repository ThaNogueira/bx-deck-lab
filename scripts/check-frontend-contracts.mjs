import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
// Migration-stage guard: only add the new stylesheet to existing entry points.
let count = 0;
for (const file of readdirSync('public').filter(name => name.endsWith('.html'))) {
  if (['elos.html','ranking.html'].includes(file)) {
    const html = readFileSync(`public/${file}`, 'utf8');
    for (const hook of ['id="topbar"', '/js/shared.js', ...(file === 'elos.html' ? ['id="eloTiers"','id="eloGap"','/js/elos.js'] : ['id="rankingOrder"','id="rankingSearch"','id="rankingTable"','BX.rankBadge'])]) assert(html.includes(hook), `Missing ranking hook: ${hook}`);
    continue;
  }
  if (file === 'u.html') {
    const html = readFileSync(`public/${file}`, 'utf8');
    for (const hook of ['id="topbar"', 'id="app"', 'id="competition"', '/js/shared.js', '/js/profile-competition.js', '/ui/profile-competition.css', 'BX.renderCompetition', 'BX.avatarHtml', 'pcolGrid', 'reportBtn']) assert(html.includes(hook), `Missing public-profile hook: ${hook}`);
    continue; // API, pagination, empty state and responsive layout covered by competition-profile.integration.mjs.
  }
  if (file === 'perfil.html') {
    const html = readFileSync(`public/${file}`, 'utf8');
    for (const hook of ['BX.requireLogin', 'id="app"', 'data-frame', 'frameId: current.frameId', 'Automática · elo', 'rating: competition?.rating']) assert(html.includes(hook));
    continue;
  }
  if (['icones.html','entrar.html','index.html'].includes(file)) {
    const html=readFileSync(`public/${file}`,'utf8');
    assert(html.includes('id="topbar"') && html.includes(file==='index.html'?'id="view-builder"':'id="app"'));
    assert(html.includes('/js/shared.js') && html.includes('type="module"'));
    continue; // Migrated routes have dedicated React e2e coverage.
  }
  if (file === 'torneio.html' || file === 'torneios.html' || file === 'novo-torneio.html') {
    const html = readFileSync(`public/${file}`, 'utf8');
    assert(html.includes('/js/shared.js'));
    if (file === 'torneio.html') {
      for (const id of ['viewBox', 'renderPairings', 'renderManage', 'joinBtn', 'saveT', 'uploadCover', 'uploadPhotos']) assert(html.includes(id));
    } else if (file === 'torneios.html') {
      assert(html.includes('href="/torneios/novo"'));
      assert(!html.includes('newModal') && !html.includes('tCreate'));
    } else {
      for (const id of ['id="form"', 'id="store"', 'id="cover"', '/api/stores', 'storeId']) assert(html.includes(id));
    }
    continue;
  }
  const before = execFileSync('git', ['show', `HEAD:public/${file}`], { encoding:'utf8' }).replace(/\r/g, '');
  const after = readFileSync(`public/${file}`, 'utf8').replace(/\r/g, '');
  const strip = text => text.replace('  <link rel="stylesheet" href="/design-system.css" />\n', '');
  assert.equal(strip(after), strip(before), `Unexpected HTML contract change: ${file}`);
  count++;
}
console.log(`${count} entry points: existing scripts, IDs, forms and content unchanged.`);
