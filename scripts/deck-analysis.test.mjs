import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalysisQueue, emptyQueue } from '../server/deck-analysis-queue.js';
import { groqJson, AnalysisProviderError, durationMs } from '../server/deck-analysis-provider.js';
import { fallbackIndividual, fallbackOverview, validCore, validWhy, validOverview, repairAnalysis } from '../server/deck-analysis-physical.js';

const combo = { physical: [
  { name: 'Shark Scale', kind: 'BLADE', type: 'Attack', stats: { atk: 70, def: 15, sta: 15 } },
  { name: '1-60', kind: 'RATCHET' }, { name: 'Rush', kind: 'BIT', type: 'Attack' },
] };
function fixture(step) {
  let raw = null; let clock = 1000; const records = new Map();
  const deps = { now: () => clock, interval: 70, leaseMs: 180, step,
    read: async () => ({ raw, state: raw ? JSON.parse(raw) : emptyQueue() }),
    compareAndSwap: async (expected, state, record) => {
      if (raw !== expected) return false;
      raw = JSON.stringify(state); if (record) records.set(record.key, record.value); return true;
    } };
  return { make: () => createAnalysisQueue(deps), advance: (time = 71) => { clock += time; }, records };
}
const job = (signature = 'one') => ({ signature, beys: [['x']], base: { combos: [combo] } });
const success = (j) => ({ patch: { stage: j.stage + 1, completed: j.stage + 1, partial: { saved: true } }, done: true, record: { key: j.signature, value: 'saved' } });

test('concurrent force requests deduplicate and workers serialize across instances', async () => {
  let calls = 0; const f = fixture(async (j) => { calls++; return success(j); });
  const a = f.make(); const b = f.make();
  const accepted = await Promise.all([a.enqueue(job(), { force: true }), b.enqueue(job(), { force: true })]);
  assert.equal(accepted[0].id, accepted[1].id);
  await Promise.all([a.tick(), b.tick()]);
  assert.equal(calls, 1); assert.equal(f.records.get('one'), 'saved');
  await a.tick(); assert.equal(calls, 1);
});
test('partial progress survives a restart; completed stages are not repeated', async () => {
  const stages = []; const f = fixture(async (j) => { stages.push(j.stage); return { ...success(j), done: j.stage === 1 }; });
  const first = f.make(); await first.enqueue(job()); await first.tick();
  const restarted = f.make(); await restarted.tick(); assert.deepEqual(stages, [0]);
  f.advance(); await restarted.tick(); assert.deepEqual(stages, [0, 1]);
  assert.equal((await restarted.read()).jobs[0].status, 'completed');
});
test('429 applies a global cooldown and resumes the same stage', async () => {
  let calls = 0; const f = fixture(async (j) => { calls++; if (calls === 1) throw new AnalysisProviderError('quota', { rateLimited: true, retryAfterMs: 500 }); return success(j); });
  const q = f.make(); await q.enqueue(job()); await q.enqueue(job('two')); await q.tick();
  f.advance(499); await q.tick(); assert.equal(calls, 1);
  f.advance(2); await q.tick(); assert.equal((await q.read()).jobs[0].status, 'completed');
  assert.equal((await q.read()).jobs[1].stage, 0);
});
test('clear keeps active request and saved output; cancelled jobs do not reappear', async () => {
  let finish; const f = fixture((j) => new Promise((resolve) => { finish = () => resolve(success(j)); }));
  const q = f.make(); await q.enqueue(job()); await q.enqueue(job('two'));
  const running = q.tick(); while (!finish) await Promise.resolve();
  assert.deepEqual(await q.clear(), { cancelled: 1, active: true });
  finish(); await running;
  assert.equal(f.records.get('one'), 'saved');
  assert.equal((await q.read()).jobs[1].status, 'cancelled');
});
test('expired worker cannot overwrite newer output', async () => {
  let finish; let calls = 0;
  const f = fixture(async (j) => { calls++; if (calls === 1) return new Promise((r) => { finish = () => r({ ...success(j), record: { key: 'one', value: 'stale' } }); }); return success(j); });
  const q = f.make(); await q.enqueue(job()); const running = q.tick();
  while (!finish) await Promise.resolve(); f.advance(181);
  await f.make().tick(); finish(); await running;
  assert.equal(f.records.get('one'), 'saved');
});
test('invalid response stops after bounded retries and admin resumes checkpoint', async () => {
  const f = fixture(async () => { throw new AnalysisProviderError('invalid JSON'); });
  const q = f.make(); await q.enqueue(job());
  for (let i = 0; i < 5; i++) { await q.tick(); f.advance(10000); }
  assert.equal((await q.read()).jobs[0].status, 'failed');
  assert.equal((await q.retryFailed()).retried, 1);
  assert.equal((await q.read()).jobs[0].stage, 0);
});
test('provider refuses truncated JSON even when the prefix parses', async () => {
  await assert.rejects(groqJson({ apiKey: 'test', prompt: '', validate: () => true,
    fetchImpl: async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }) }), /incompleta/);
});
test('provider validates all required fields', async () => {
  await assert.rejects(groqJson({ apiKey: 'test', prompt: '', validate: validCore,
    fetchImpl: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{}' } }] }) }), /campos/);
});
test('retry-after and daily reset are respected', async () => {
  assert.equal(durationMs('1m30s'), 90000);
  await assert.rejects(groqJson({ apiKey: 'test', prompt: '', validate: () => true,
    fetchImpl: async () => Response.json({ error: { message: 'limit' } }, { status: 429, headers: { 'retry-after': '600' } }) }), (error) => error.rateLimited && error.retryAfterMs >= 600000);
});
test('local fallback covers every field and CX part without fabricated metrics', () => {
  const analysis = fallbackIndividual(combo);
  assert.ok(validCore(analysis)); assert.ok(validWhy(analysis, combo));
  assert.match(analysis.summary, /Shark Scale.*1-60.*Rush/);
  assert.doesNotMatch(analysis.summary, /70|15|pódio/);
  const cx = { physical: [...combo.physical, { name: 'Emperor', kind: 'LOCK_CHIP' }, { name: 'Heavy', kind: 'ASSIST_BLADE' }, { name: 'Over', kind: 'OVER_BLADE' }] };
  assert.ok(validWhy(fallbackIndividual(cx), cx));
  assert.ok(validOverview(fallbackOverview([combo, cx])));
});
test('fallback changes with the actual Bit, not just the Blade type', () => {
  const stamina = { physical: [...combo.physical.slice(0, 2), { name: 'Ball', kind: 'BIT', type: 'Stamina' }] };
  assert.notEqual(fallbackIndividual(combo).launch, fallbackIndividual(stamina).launch);
  assert.match(fallbackIndividual(stamina).summary, /preservar giro/);
});
test('broken legacy results are repaired without regenerating good sections', () => {
  const old = { deckLabel: 'IDENTIDADE DO TRIO', deckSummary: 'meta', individual: [{ summary: 'Combo versátil' }] };
  const fixed = repairAnalysis(old, [combo]);
  assert.ok(validOverview({ deckLabel: fixed.deckLabel, deck: fixed.deckSummary }));
  assert.ok(validWhy(fixed.individual[0], combo));
});
