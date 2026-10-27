// Authentication regression checks use only a disposable database.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
const temp = mkdtempSync(path.join(tmpdir(), 'bx-session-'));
new DatabaseSync(path.join(temp, 'test.db')).close();
process.env.DATABASE_URL = `file:${path.join(temp, 'test.db').replaceAll('\\', '/')}`;
process.env.NODE_ENV = 'test'; process.env.BX_ISOLATED_TEST = '1';
const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { encoding: 'utf8', env: process.env });
assert.equal(migration.status, 0, migration.stderr);
const { prisma } = await import('../server/db.js');
const { default: express } = await import('express');
const { createSession, sessionMiddleware, requireUser } = await import('../server/auth.js');
const { default: auth } = await import('../server/routes/auth.js');
let server, base;
const start = async userId => {
  const app = express(); app.use(express.json());
  app.use((req, res, next) => {
    req.cookies = Object.fromEntries((req.headers.cookie || '').split(';').filter(v => v.includes('=')).map(v => { const i = v.indexOf('='); return [v.slice(0, i).trim(), v.slice(i + 1).trim()]; }));
    next();
  });
  app.use(sessionMiddleware, auth);
  app.post('/test/login', async (req, res) => { await createSession(res, userId); res.json({ ok: true }); });
  app.get('/test/private', requireUser, (req, res) => res.json({ id: req.user.id }));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.on('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
};
const request = (route, cookie, method = 'GET') => fetch(base + route, { method, headers: cookie ? { Cookie: cookie } : {} });
const login = async () => (await request('/test/login', null, 'POST')).headers.get('set-cookie').split(';')[0];
try {
  const user = await prisma.user.create({ data: { name: 'Session test', slug: 'session-test', email: 'session@test.invalid' } });
  await start(user.id);
  const cookie = await login();
  const session = await prisma.authSession.findFirst({ where: { userId: user.id } });
  assert(session.expiresAt > new Date(Date.now() + 29 * 86400000));
  let response = await request('/api/me', cookie);
  assert.equal((await response.json()).user.id, user.id);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.match(response.headers.get('vary'), /Cookie/);
  assert.equal(response.headers.get('set-cookie'), null, 'Do not renew on every asset or request');
  // A new server process can read the same opaque session from the database.
  await new Promise(resolve => server.close(resolve)); await start(user.id);
  assert.equal((await (await request('/api/me', cookie)).json()).user.id, user.id);
  await prisma.authSession.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + 3600000) } });
  const parallel = await Promise.all([request('/api/me', cookie), request('/api/me', cookie)]);
  assert(parallel.some(r => r.headers.get('set-cookie')?.includes('bx_session=')));
  for (const r of parallel) assert.equal((await r.json()).user.id, user.id);
  const renewed = await prisma.authSession.findUnique({ where: { id: session.id } });
  assert(renewed.expiresAt > new Date(Date.now() + 29 * 86400000));
  assert.equal(await prisma.authSession.count(), 1, 'Renewal must keep the existing token');
  assert.equal((await request('/api/me', cookie)).headers.get('set-cookie'), null);
  // A database error must not become a successful anonymous response or revoke cookies.
  const originalFind = prisma.authSession.findUnique, originalError = console.error;
  try {
    prisma.authSession.findUnique = async () => { throw new Error('Simulated transient database failure'); };
    console.error = () => {};
    response = await request('/api/me', cookie); assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'AUTH_UNAVAILABLE');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal((await request('/test/private', cookie)).status, 503);
  } finally { prisma.authSession.findUnique = originalFind; console.error = originalError; }
  assert.equal((await (await request('/api/me', cookie)).json()).user.id, user.id);
  const secondCookie = await login();
  assert.equal((await request('/api/auth/logout', cookie, 'POST')).status, 200);
  assert.equal((await (await request('/api/me', cookie)).json()).user, null);
  assert.equal((await (await request('/api/me', secondCookie)).json()).user.id, user.id, 'Logging out must not revoke other devices');
  const remaining = await prisma.authSession.findFirst();
  const expiredAt = new Date(Date.now() - 60000);
  await prisma.authSession.update({ where: { id: remaining.id }, data: { expiresAt: expiredAt } });
  response = await request('/api/me', secondCookie);
  assert.equal((await response.json()).user, null); assert.equal(response.headers.get('set-cookie'), null);
  assert.equal((await prisma.authSession.findUnique({ where: { id: remaining.id } })).expiresAt.getTime(), expiredAt.getTime());
  assert.equal((await request('/test/private', secondCookie)).status, 401);
  assert.match((await request('/api/me')).headers.get('cache-control'), /no-store/);

  // Shared client retries temporary failures and discards failed promise caches.
  const source = readFileSync('public/js/shared.js', 'utf8');
  const client = source.slice(source.indexOf('  let mePromise'), source.indexOf('  let sitePromise'));
  let calls = 0, failCount = 1;
  const context = { setTimeout: callback => callback(), api: async (route, options) => {
    assert.equal(route, '/api/me'); assert.equal(options.cache, 'no-store'); calls++;
    if (failCount-- > 0) throw Object.assign(new Error('Temporary failure'), { status: 503 });
    return { user: { id: user.id } };
  } };
  vm.runInNewContext(client + '\nthis.testMe = me;', context);
  assert.equal((await context.testMe()).id, user.id); assert.equal(calls, 2);
  await context.testMe(); assert.equal(calls, 2);
  failCount = 2; await assert.rejects(context.testMe(true));
  assert.equal((await context.testMe()).id, user.id);
  console.log('PASS: session persistence, activity renewal, concurrent requests, transient DB/client errors, private caching, expiry and per-device logout.');
} finally { if (server) await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); }
