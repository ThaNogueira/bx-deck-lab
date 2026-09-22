import { randomUUID } from 'node:crypto';

export const pendingJob = (job) => ['queued', 'running', 'retry'].includes(job?.status);
export const emptyQueue = () => ({ jobs: [], nextCallAt: 0, lastSuccessAt: null, lastError: null, lease: null });

/** Optimistic updates and a database lease serialize ALL workers/processes.
 * A step checkpoints both its answer and the public analysis in one transaction.
 * The provider call is never inside a database transaction. */
export function createAnalysisQueue({ read, compareAndSwap, step, now = Date.now, interval = 70_000, leaseMs = 180_000 }) {
  async function mutate(change) {
    for (let i = 0; i < 40; i++) {
      const { raw, state } = await read();
      const result = change(state);
      if (result?.skip) return result.value;
      if (await compareAndSwap(raw, state, result?.record)) return result?.value;
    }
    throw new Error('Fila ocupada: tente novamente em alguns segundos.');
  }
  const enqueue = (job, { force = false, record } = {}) => mutate((state) => {
    const existing = state.jobs.find((item) => item.signature === job.signature);
    if (existing && (pendingJob(existing) || !force)) return { skip: true, value: existing };
    const fresh = { ...job, id: randomUUID(), status: 'queued', queuedAt: now(), stage: 0, attempts: 0, completed: 0, partial: {}, error: null, nextAttemptAt: 0 };
    state.jobs = state.jobs.filter((item) => item.signature !== job.signature);
    state.jobs.push(fresh);
    return { value: fresh, record };
  });
  const clear = () => mutate((state) => {
    let cancelled = 0;
    for (const job of state.jobs) {
      if (!pendingJob(job) || (state.lease?.jobId === job.id && state.lease.until > now())) continue;
      Object.assign(job, { status: 'cancelled', finishedAt: now(), error: null });
      cancelled++;
    }
    return { value: { cancelled, active: !!state.lease && state.lease.until > now() } };
  });
  const retryFailed = () => mutate((state) => {
    let retried = 0;
    for (const job of state.jobs) {
      if (job.status !== 'failed') continue;
      Object.assign(job, { status: 'queued', attempts: 0, error: null, nextAttemptAt: 0 });
      retried++;
    }
    return { value: { retried } };
  });
  async function tick() {
    const token = randomUUID();
    const job = await mutate((state) => {
      if (state.nextCallAt > now() || state.lease?.until > now()) return { skip: true, value: null };
      const item = state.jobs.find((candidate) => pendingJob(candidate) && (!candidate.nextAttemptAt || candidate.nextAttemptAt <= now()));
      if (!item) return { skip: true, value: null };
      state.lease = { token, jobId: item.id, until: now() + leaseMs };
      state.nextCallAt = now() + interval;
      Object.assign(item, { status: 'running', startedAt: item.startedAt || now(), updatedAt: now(), attempts: item.attempts + 1 });
      return { value: structuredClone(item) };
    });
    if (!job) return false;
    let result; let failure;
    try { result = await step(job); } catch (error) { failure = error; }
    await mutate((state) => {
      // An expired worker cannot publish over a newer worker's checkpoint.
      if (state.lease?.token !== token || state.lease.until <= now()) return { skip: true };
      const item = state.jobs.find((candidate) => candidate.id === job.id);
      if (!item) { state.lease = null; return {}; }
      if (failure) {
        const retryable = failure.retryable !== false;
        const retry = retryable && (failure.rateLimited || item.attempts < 5);
        const wait = Math.max(interval, failure.retryAfterMs || Math.min(15 * 60_000, interval * 2 ** Math.min(item.attempts - 1, 4)));
        item.status = retry ? 'retry' : 'failed';
        item.error = String(failure.message || failure).replace(/gsk_[\w-]+/g, '[redacted]').slice(0, 350);
        item.nextAttemptAt = retry ? now() + wait : 0;
        item.updatedAt = now();
        state.lastError = item.error;
        if (failure.rateLimited || failure.providerUnavailable) state.nextCallAt = Math.max(state.nextCallAt, now() + wait);
      } else {
        Object.assign(item, result.patch, { attempts: 0, error: null, updatedAt: now(), nextAttemptAt: 0 });
        item.status = result.done ? 'completed' : 'queued';
        if (result.done) { item.finishedAt = now(); state.lastSuccessAt = new Date(now()).toISOString(); }
        state.lastError = null;
        state.nextCallAt = Math.max(state.nextCallAt, now() + interval, result.nextCallAt || 0);
      }
      state.lease = null;
      return { record: result?.record };
    });
    return true;
  }
  return { enqueue, clear, retryFailed, tick, read: async () => (await read()).state };
}
