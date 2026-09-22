// Run only in a disposable container with its own SQLite file and no host data volume.
import assert from 'node:assert/strict';
if (process.env.NODE_ENV !== 'test' || !process.env.DATABASE_URL?.includes('/tmp/deck-ai-qa')) throw new Error('Isolated QA database required');
import express from 'express';
import { prisma } from '../server/db.js';
import { setSetting } from '../server/settings.js';
import { fallbackIndividual, fallbackOverview } from '../server/deck-analysis-physical.js';
import { processDeckAnalysisQueueOnce, getDeckAnalysisQueueStatus, recoverDeckAnalyses } from '../server/deck-analysis.js';
import deckRoutes from '../server/routes/decks.js';
import adminRoutes from '../server/routes/admin.js';

const realFetch = globalThis.fetch;
let providerCalls = 0;
globalThis.fetch = async (url, options) => {
  if (!String(url).includes('api.groq.com')) return realFetch(url, options);
  providerCalls++;
  const request = JSON.parse(options.body);
  const prompt = request.messages.at(-1).content;
  const data = JSON.parse(prompt.split('Dados: ')[1]);
  const value = Array.isArray(data) ? fallbackOverview(data) : fallbackIndividual(data);
  return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }], model: 'mock', usage: { prompt_tokens: 100, completion_tokens: 200 } });
};
await setSetting('external-bey-meta-v2', { fetchedAt: new Date().toISOString(), source: { name: 'QA' }, blades: [{ blade: 'Shark Scale', appearance: 22 }] });
await setSetting('flags', { decks: true });
const user = await prisma.user.create({ data: { email: 'user@qa.invalid', slug: 'user-qa', name: 'QA User' } });
const admin = await prisma.user.create({ data: { email: 'admin@qa.invalid', slug: 'admin-qa', name: 'QA Admin', role: 'ADMIN' } });
for (const part of [
  { id: 'blade', name: 'Shark Scale', kind: 'BLADE', type: 'Attack', statsJson: '{"atk":70,"def":15,"sta":15}', behavior: 'Contatos inclinados para levantar o oponente.' },
  { id: 'ratchet', name: '1-60', kind: 'RATCHET' }, { id: 'bit', name: 'Rush', kind: 'BIT', type: 'Attack' },
  { id: 'ball', name: 'Ball', kind: 'BIT', type: 'Stamina' },
  { id: 'blade-color', name: 'Shark Scale', kind: 'BLADE', parentId: 'blade' },
]) await prisma.part.create({ data: { slug: part.id, displayName: part.name, ...part } });
const app = express(); app.use(express.json());
app.use((req, res, next) => { req.user = req.headers['x-test-role'] === 'ADMIN' ? admin : req.headers['x-test-role'] === 'USER' ? user : null; next(); });
app.use(deckRoutes); app.use(adminRoutes);
app.use((error, req, res, next) => res.status(500).json({ error: error.message }));
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
async function request(path, { role = 'USER', body, method = body ? 'POST' : 'GET' } = {}) {
  const response = await realFetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'x-test-role': role }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}
async function settle() {
  for (let i = 0; i < 100 && (await getDeckAnalysisQueueStatus()).active; i++) await new Promise((resolve) => setTimeout(resolve, 20));
}
async function drain() {
  for (let i = 0; i < 30; i++) {
    await settle();
    const row = await prisma.setting.findUnique({ where: { key: 'deck-ai-queue-v4' } });
    const state = JSON.parse(row.value);
    if (!state.jobs.some((j) => ['queued', 'retry', 'running'].includes(j.status))) return;
    state.nextCallAt = 0;
    await prisma.setting.update({ where: { key: row.key }, data: { value: JSON.stringify(state) } });
    await processDeckAnalysisQueueOnce();
  }
  throw new Error('Queue did not drain');
}
try {
  const created = await request('/api/decks', { body: { title: 'QA analysis', beys: [['blade-color', 'ratchet', 'bit']] } });
  assert.equal(created.status, 200); const deck = created.data.deck;
  await settle();
  let view = await request(`/api/decks/${deck.slug}/analysis`, { role: '' });
  assert.ok(view.data.pending); assert.ok(view.data.analysis.individual[0].why.length === 3);
  assert.match(view.data.analysis.combos[0].physical[0].behavior, /inclinados/);
  const callsBeforeReads = providerCalls;
  await Promise.all(Array.from({ length: 12 }, () => request(`/api/decks/${deck.slug}/analysis`, { role: '' })));
  assert.equal(providerCalls, callsBeforeReads, 'Public reads must not generate');
  assert.equal((await request(`/api/decks/${deck.id}/analysis/refresh`, { body: {} })).status, 403);
  assert.equal((await request('/api/admin/deck-analysis/queue/clear', { body: {} })).status, 403);
  await drain();
  view = await request(`/api/decks/${deck.slug}/analysis`, { role: '' });
  assert.equal(view.data.pending, false); assert.equal(view.data.analysis.quality, 'llm');
  assert.equal(providerCalls, 3, 'One Bey has core, why and overview');
  const saved = JSON.stringify(view.data.analysis);
  const refreshes = await Promise.all(Array.from({ length: 5 }, () => request(`/api/decks/${deck.id}/analysis/refresh`, { role: 'ADMIN', body: {} })));
  assert.ok(refreshes.every((r) => r.status === 202));
  assert.equal(new Set(refreshes.map((r) => r.data.jobId)).size, 1);
  assert.ok((await request(`/api/decks/${deck.slug}/analysis`)).data.analysis, 'Keep previous output during refresh');
  await drain();
  assert.equal(providerCalls, 6, 'Repeated admin clicks still generate once');
  await request(`/api/decks/${deck.id}`, { method: 'PATCH', body: { beys: [['blade-color', 'ratchet', 'ball']] } });
  await drain();
  view = await request(`/api/decks/${deck.slug}/analysis`);
  assert.equal(view.data.analysis.combos[0].type, 'Stamina');
  assert.notEqual(JSON.stringify(view.data.analysis), saved);
  const callsAfterEdit = providerCalls;
  await request(`/api/decks/${deck.id}`, { method: 'PATCH', body: { title: 'Rename only' } });
  await request(`/api/decks/${deck.id}/copy`, { body: {} });
  await request(`/api/decks/${deck.id}/duplicate`, { body: {} });
  await settle(); assert.equal(providerCalls, callsAfterEdit, 'Copies reuse saved composition');
  await request(`/api/decks/${deck.id}`, { method: 'PATCH', body: { isPublic: false } });
  assert.equal((await request(`/api/decks/${deck.slug}/analysis`, { role: '' })).status, 404);
  assert.equal((await request(`/api/decks/${deck.slug}/analysis`, { role: 'ADMIN' })).status, 200);
  await recoverDeckAnalyses(); await settle();
  assert.equal(providerCalls, callsAfterEdit, 'Recovery does not regenerate completed decks');
  console.log(JSON.stringify({ passed: true, checks: ['create', 'public-read-only', 'admin-authorization', 'deduplicated-refresh', 'edit', 'copy', 'duplicate', 'private-deck', 'parent-metadata', 'recovery'], providerCalls }));
} finally { server.close(); await prisma.$disconnect(); }
