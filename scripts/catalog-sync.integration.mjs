import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { parseHubHtml } from '../server/hub-catalog.js';

const temp = fs.mkdtempSync(path.join(tmpdir(), 'bx-catalog-sync-'));
new DatabaseSync(path.join(temp, 'qa.db')).close();
process.env.DATABASE_URL = 'file:' + path.join(temp, 'qa.db').replaceAll('\\', '/');
process.env.NODE_ENV = 'test'; process.env.BX_ISOLATED_TEST = '1'; process.env.CHECKPOINT_DISABLE = '1';
const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: process.env, encoding: 'utf8' });
assert.equal(migration.status, 0, migration.stderr);
const { prisma } = await import('../server/db.js');
const { syncParts, parseByyParts } = await import('../server/sync.js');
const { applyCatalogSupplements, AERO_BX53 } = await import('../server/catalog-supplements.js');
const card = (id, folder, filename, name, extra = '') => `<div id="${id}" class="card"><div><img src="https://img.beybladehub.app/${folder}/${filename}.webp"/></div><div><span translate="no">${name}</span><span>Attack</span>${extra}</div></div>`;
const html = {
  blades: card('blade-ArPg', 'blades-db', 'ArPg', 'Aero Pegasus')
    + card('blade-cx-chip-R', 'blades-cx', 'chip-R', 'Round')
    + card('blade-BsBr', 'blades-db', 'BsBr', 'Bison Burrow', '<span>Fused</span>')
    + card('blade-HvRg', 'blades-db', 'HvRg', 'Heaven&#x27;s Ring'),
  bits: card('bit-Tr', 'bits', 'Tr', 'Turbo', '<span>Fused</span>')
    + card('bit-Z', 'bits', 'Z', 'Zap') + '<footer>Fused identifies an integrated Bit</footer>',
  ratchets: card('ratchet-3-70', 'ratchets', '3-70', '3-70'),
};
const byy = '| Blade | Code | ATK/DEF/STA | Weight | Spin | Geometry | Notes |\n'
  + '| Attack Type Blades |\n| Aero Pegasus | UX-00 | 60/25/30 | 38g | Right | 3 pts | Attack |\n'
  + '| Pegasus Blast | CX-07 | 60/20/20 | 40g | Right | 3 pts | assembled |';
const originalFetch = globalThis.fetch;
let server;
try {
  assert.equal(parseByyParts(byy).length, 1, 'CX assemblies must never become standalone blades');
  const bits = parseHubHtml(html.bits, 'bits');
  assert.equal(bits.find(p => p.name === 'Zap').kind, 'bit', 'footer metadata must not leak into the last card');
  assert.equal(bits.find(p => p.name === 'Turbo').kind, 'rib');
  assert.equal(parseHubHtml(html.blades, 'blades').find(p => p.name === "Heaven's Ring").kind, 'blade');
  assert.equal(parseHubHtml('<div id="blade-X"><img src="https://img.beybladehub.app/blades-db/X.webp"><span translate="no">Unclosed', 'blades').length, 0);

  const parent = await prisma.part.create({ data: { name: 'AeroPegasus', displayName: 'Aero Pegasus', slug: 'aeropegasus', kind: 'BLADE', type: 'Attack', imageUrl: '/uploads/manual-aero.png' } });
  await prisma.part.create({ data: { name: 'Round', displayName: 'Round', slug: 'round', kind: 'ASSIST_BLADE' } });
  await prisma.part.create({ data: { name: 'Normal Bit', displayName: 'Normal Bit', slug: 'normal-bit', kind: 'BIT', abbrev: 'Tr' } });
  await prisma.part.create({ data: { name: 'Valor Bison', displayName: 'Valor Bison', slug: 'valor-bison', kind: 'BLADE', subKind: 'INTEGRATED', aliasesJson: '["Bison Burrow"]' } });
  globalThis.fetch = async url => {
    if (String(url).includes('byybladebuilder')) return new Response(byy);
    const category = String(url).split('/').pop();
    return new Response(html[category] || '', { status: html[category] ? 200 : 404 });
  };
  const first = await syncParts();
  assert.equal(first.failed, 0);
  assert.equal(first.sources.filter(s => !s.error).length, 4);
  assert.equal((await prisma.part.findUnique({ where: { id: parent.id } })).imageUrl, '/uploads/manual-aero.png');
  assert.equal(await prisma.part.count({ where: { name: 'Round', kind: 'LOCK_CHIP' } }), 1, 'matching must include part category');
  assert.equal(await prisma.part.count({ where: { name: 'Turbo', subKind: 'RIB' } }), 1, 'a normal bit with the same abbreviation must not absorb a RIB');
  assert.equal(await prisma.part.count({ where: { kind: 'BLADE', subKind: 'INTEGRATED' } }), 1);
  const count = await prisma.part.count();
  await syncParts();
  assert.equal(await prisma.part.count(), count, 'repeat imports must be idempotent');

  await prisma.part.create({ data: { name: 'SolEclipse', displayName: 'Sol Eclipse', slug: 'soleclipse', kind: 'BLADE', hidden: true } });
  await prisma.part.create({ data: { name: 'Eclipse', displayName: 'Eclipse', slug: 'eclipse', kind: 'MAIN_BLADE', imageUrl: 'https://img.beybladehub.app/blades-cx/main-Ec.webp' } });

  const product = await prisma.product.create({ data: { name: 'All-in-One Set', slug: 'bx53', code: 'BX-53' } });
  const old = await prisma.part.create({ data: { name: parent.name, displayName: parent.displayName, slug: 'aero-old-color', kind: parent.kind, parentId: parent.id, imageUrl: 'old.png' } });
  const placeholder = await prisma.part.create({ data: { name: parent.name, displayName: parent.displayName, slug: 'aero-placeholder', kind: parent.kind, parentId: parent.id, imageUrl: '/coming.png', variantLabel: 'Coming' } });
  await prisma.productPart.create({ data: { partId: old.id, productId: product.id } });
  await applyCatalogSupplements(); await applyCatalogSupplements();
  const variant = await prisma.part.findUnique({ where: { slug: AERO_BX53.slug } });
  assert.equal(variant.parentId, parent.id);
  const repaired = await prisma.part.findUnique({ where: { id: placeholder.id } });
  assert.equal(repaired.imageUrl, parent.imageUrl);
  assert.equal(repaired.variantLabel, 'Sem cor definida');
  assert.equal(await prisma.part.count({ where: { slug: AERO_BX53.slug } }), 1);
  assert(await prisma.part.findUnique({ where: { id: old.id } }), 'old colors remain available to existing decks');
  assert.equal(await prisma.productPart.count({ where: { productId: product.id, partId: old.id } }), 0);
  assert.equal(await prisma.productPart.count({ where: { productId: product.id, partId: variant.id } }), 1);

  const { default: express } = await import('express');
  const { default: catalog } = await import('../server/routes/catalog.js');
  const app = express(); app.use((req, _res, next) => { if (req.headers['x-test-staff']) req.user = { role: 'ADMIN' }; next(); }); app.use(catalog);
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const headers of [{}, { 'x-test-staff': '1' }]) {
    const page = await originalFetch(base + '/peca/soleclipse', { redirect: 'manual', headers });
    assert.equal(page.status, 301); assert.equal(page.headers.get('location'), '/peca/eclipse');
    const api = await originalFetch(base + '/api/parts/soleclipse', { headers });
    const result = await api.json();
    assert.equal(api.status, 200); assert.equal(result.part.kind, 'MAIN_BLADE');
    assert.equal(result.part.slug, 'eclipse'); assert.equal(result.part.imageUrl, '/assets/parts/eclipse.webp');
  }

  globalThis.fetch = async () => new Response('changed layout');
  const failed = await syncParts();
  assert.equal(failed.sources.filter(s => s.error).length, 4);
  assert.equal((await prisma.syncLog.findFirst({ orderBy: { createdAt: 'desc' } })).ok, false, 'HTTP 200 with an empty parse is not a successful sync');
  console.log('Catalog sync: parsing, categories, manual images, idempotence, BX-53 color/link and failure logging passed.');
} finally {
  globalThis.fetch = originalFetch;
  if (server) await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
}
