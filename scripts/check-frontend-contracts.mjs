import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
// Migration-stage guard: only add the new stylesheet to existing entry points.
let count = 0;
for (const file of readdirSync('public').filter(name => name.endsWith('.html'))) {
  if (['icones.html','entrar.html'].includes(file)) {
    const html=readFileSync(`public/${file}`,'utf8');
    assert(html.includes('id="topbar"') && html.includes('id="app"'));
    assert(html.includes('/js/shared.js') && html.includes('type="module"'));
    continue; // Migrated routes have dedicated React e2e coverage.
  }
  const before = execFileSync('git', ['show', `HEAD:public/${file}`], { encoding:'utf8' }).replace(/\r/g, '');
  const after = readFileSync(`public/${file}`, 'utf8').replace(/\r/g, '');
  const strip = text => text.replace('  <link rel="stylesheet" href="/design-system.css" />\n', '');
  assert.equal(strip(after), strip(before), `Unexpected HTML contract change: ${file}`);
  count++;
}
console.log(`${count} entry points: existing scripts, IDs, forms and content unchanged.`);
