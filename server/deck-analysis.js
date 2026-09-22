import { getSetting, setSetting } from './settings.js';
import { prisma } from './db.js';
import { createHash } from 'node:crypto';
import { json } from './util.js';
import { createAnalysisQueue, emptyQueue, pendingJob } from './deck-analysis-queue.js';
import { groqJson } from './deck-analysis-provider.js';
import { partName, physicalTendency, fallbackIndividual, fallbackOverview, repairAnalysis, validCore, validWhy, validOverview, sanitizeCore, sanitizeWhy } from './deck-analysis-physical.js';

const SOURCE_URL = 'https://meta.beycrate.com/?window=3m';
const SOURCE_KEY = 'external-bey-meta-v2';
const SOURCE_TTL = 24 * 60 * 60 * 1000;
const ANALYSIS_STORE_PREFIX = 'deck-ai-analysis-v3:';
const QUEUE_KEY = 'deck-ai-queue-v4';
const REPAIR_KEY = 'deck-ai-repair-v4';
const VERSION = 4;
const norm = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const compact = (value) => norm(value).replace(/\s/g, '');
const decode = (value) => String(value || '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x2F;/g, '/');
const text = (html) => decode(String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const pct = (value) => Number(String(value || '').replace(',', '.').replace('%', '')) || 0;

function parseSource(html) {
  const heading = text((html.match(/<p class="context-line"[^>]*>([\s\S]*?)<\/p>/i) || [])[1]);
  const context = heading.match(/([\d,]+)\s+events?\s*[·•]\s*([\d,]+)\s+podium decks?/i);
  const updated = text((html.match(/<p class="update-line"[^>]*>([\s\S]*?)<\/p>/i) || [])[1]);
  const blades = [];

  for (const block of html.split(/<details class="blade-row"[^>]*>/i).slice(1)) {
    const blade = text((block.match(/class="blade-name"[^>]*>([\s\S]*?)<\/span>/i) || [])[1]);
    const appearance = pct(text((block.match(/class="pct-highlight"[^>]*>([\s\S]*?)<\/span>/i) || [])[1]));
    if (!blade) continue;
    const builds = [];
    for (const row of block.matchAll(/<li class="combo-row"[^>]*>([\s\S]*?)<\/li>/gi)) {
      const rowText = text(row[1]);
      const percent = pct((rowText.match(/(\d+(?:[.,]\d+)?)%/) || [])[1]);
      const clean = rowText.replace(/\s*\d+(?:[.,]\d+)?%\s*$/, '').trim();
      if (clean) builds.push({ label: `${blade} ${clean}`.trim(), percent });
    }
    blades.push({ blade, appearance, builds });
  }
  if (!blades.length) throw new Error('A fonte externa não trouxe linhas de meta reconhecíveis.');
  return {
    fetchedAt: new Date().toISOString(),
    source: { name: 'Beycrate Meta', url: SOURCE_URL, events: Number((context?.[1] || '').replace(',', '')) || null, podiumDecks: Number((context?.[2] || '').replace(',', '')) || null, updated: updated || null },
    blades,
  };
}

async function getExternalMeta({ force = false } = {}) {
  const saved = await getSetting(SOURCE_KEY);
  if (!force && saved?.fetchedAt && Date.now() - new Date(saved.fetchedAt).getTime() < SOURCE_TTL && saved.blades?.length) return saved;
  try {
    const response = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'BX-Deck-Lab meta reader/1.0 (+https://bxdecklab.com)' }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const fresh = parseSource(await response.text());
    await setSetting(SOURCE_KEY, fresh);
    return fresh;
  } catch (error) {
    if (saved?.blades?.length) return { ...saved, stale: true };
    throw error;
  }
}


const signatureOf = (beys) => JSON.stringify(beys || []);
const analysisKey = (signature) => ANALYSIS_STORE_PREFIX + createHash('sha256').update(signature).digest('hex');
const recordOf = (signature, value) => ({ key: analysisKey(signature), value: JSON.stringify({ signature, generatedAt: value.generatedAt, value }) });

async function loadParts(beys) {
  const parts = await prisma.part.findMany({ where: { id: { in: [...new Set(beys.flat())] } } });
  const parentIds = parts.map((p) => p.parentId).filter(Boolean);
  const parents = parentIds.length ? await prisma.part.findMany({ where: { id: { in: parentIds } } }) : [];
  return Object.fromEntries(parts.map((part) => {
    const parent = parents.find((p) => p.id === part.parentId);
    return [part.id, { ...part, type: part.type || parent?.type,
      behavior: part.behavior || parent?.behavior || part.note || parent?.note || null,
      stats: json(part.statsJson, null) || json(parent?.statsJson, null),
      weightGrams: part.weightGrams ?? parent?.weightGrams ?? null }];
  }));
}
function signals(beys, parts, meta = null) {
  return beys.map((ids) => {
    const physical = ids.map((id) => parts[id]).filter(Boolean).map((part) => ({
      name: partName(part), kind: part.kind, subKind: part.subKind, type: part.type,
      behavior: part.behavior || part.note || null, stats: part.stats || null, weightGrams: part.weightGrams ?? null,
    }));
    const blade = physical.find((p) => ['BLADE', 'MAIN_BLADE'].includes(p.kind));
    const bit = physical.find((p) => p.kind === 'BIT');
    const row = meta?.blades?.find((entry) => compact(entry.blade) === compact(blade?.name));
    return { label: physical.map(partName).join(' '), type: bit?.type || blade?.type || 'Balance', physical,
      evidence: { blade: blade?.name || null, metaPresence: row?.appearance || 0, sampleScope: 'podium-decks' } };
  });
}
function localAnalysis(combos) {
  const overview = fallbackOverview(combos);
  return { version: VERSION, combos, deckLabel: overview.deckLabel, deckSummary: overview.deck,
    individual: combos.map(fallbackIndividual), quality: 'local', generatedBy: 'local',
    generatedAt: new Date().toISOString(), provenance: { overview: false, core: [], why: [] } };
}
async function storedValue(beys) {
  const signature = signatureOf(beys);
  const row = await prisma.setting.findUnique({ where: { key: analysisKey(signature) } });
  const saved = json(row?.value, null);
  return saved?.signature === signature ? saved.value : null;
}
/** Read-only: no queuing, provider calls or external requests. */
export async function getStoredDeckAnalysis(beys) {
  const saved = await storedValue(beys);
  if (saved?.version === VERSION) return saved;
  const combos = signals(beys, await loadParts(beys));
  return saved ? repairAnalysis(saved, combos) : localAnalysis(combos);
}
function compose(job, partial, base) {
  const old = repairAnalysis(base, base.combos);
  const complete = base.combos.every((_, i) => partial['core' + i] && partial['why' + i]) && !!partial.overview;
  return { ...old, version: VERSION,
    individual: base.combos.map((combo, i) => ({ ...old.individual[i], ...(partial['core' + i] || {}),
      why: partial['why' + i] || old.individual[i].why })),
    deckLabel: partial.overview?.deckLabel || old.deckLabel, deckSummary: partial.overview?.deck || old.deckSummary,
    quality: complete ? 'llm' : 'mixed', generatedBy: complete ? 'llm' : 'mixed',
    generatedAt: new Date().toISOString(), jobId: job.id,
    provenance: { overview: !!partial.overview, core: base.combos.map((_, i) => !!partial['core' + i]), why: base.combos.map((_, i) => !!partial['why' + i]) } };
}
const compactCombo = (combo) => ({ label: combo.label, physical: combo.physical.map((part) => ({
  name: part.name, kind: part.kind, type: part.type, behavior: part.behavior,
  tendency: ['BLADE', 'MAIN_BLADE', 'BIT'].includes(part.kind) ? physicalTendency(part.stats) : null,
  assemblyRole: ({ RATCHET: 'Define altura de montagem e exposição dos pontos de contato; não libera energia, não é motor nem controla diretamente a duração do giro.', BIT: 'A ponta toca a arena e influencia apoio, atrito e deslocamento. Uma ponta baixa não é, por si, uma fraqueza contra ataques por baixo.', LOCK_CHIP: 'Parte central da montagem CX; massa e encaixe sem propriedades não documentadas.', MAIN_BLADE: 'Principal superfície de contato da montagem CX.', ASSIST_BLADE: 'Componente inferior da montagem CX; use apenas propriedades documentadas.', OVER_BLADE: 'Componente externo da montagem CX; use apenas propriedades documentadas.' })[part.kind] || 'Superfície de contato com o adversário; não invente formato ausente.',
})) });
async function runStep(job) {
  let base = job.base;
  if (!job.stage) {
    const meta = await getExternalMeta().catch(() => null);
    if (meta) base = { ...base, source: { ...meta.source, fetchedAt: meta.fetchedAt, stale: !!meta.stale },
      combos: base.combos.map((combo) => {
        const blade = combo.physical.find((part) => ['BLADE', 'MAIN_BLADE'].includes(part.kind));
        const row = meta.blades.find((entry) => compact(entry.blade) === compact(blade?.name));
        return { ...combo, evidence: { ...combo.evidence, metaPresence: row?.appearance || 0, sampleScope: 'podium-decks' } };
      }) };
  }
  const partial = { ...job.partial };
  const comboIndex = Math.floor(job.stage / 2);
  const combo = base.combos[comboIndex];
  let prompt; let validate; let tokens; let key;
  const guidance = 'Use somente as propriedades fornecidas; trate o que falta como incerto. Sem números de status, pesos, percentuais ou estatísticas de torneios no texto. Escreva dicas práticas e específicas às peças, com tendências de confronto e maneiras de responder. As decisões acontecem ANTES de soltar a Bey: é impossível manobrar, perseguir ou desviar manualmente depois. Alterar a força não altera a altura física do Bit. Use arquétipos em português, como atacantes móveis ou stamina central; não use Spin, Defensive, Attack como nomes de adversários. Não repita nomes só para preencher texto.';
  if (combo && job.stage % 2 === 0) {
    key = 'core' + comboIndex; tokens = 800; validate = validCore;
    prompt = guidance + ' Analise este combo. JSON com summary (35 palavras), launch (até 50 palavras com inclinação moderada, região de entrada, intensidade repetível e ajuste se der errado), favored (arquétipo), favoredWhy (até 35 palavras explicando o contato), risk (arquétipo), riskWhy (até 35 palavras explicando o risco) e counterTip (até 40 palavras com resposta). Relacione o apoio do Bit, a altura do Ratchet e o contato da Blade. Se não há descrição da Blade, não invente seu formato. Dados: ' + JSON.stringify(compactCombo(combo));
  } else if (combo) {
    key = 'why' + comboIndex; tokens = 650; validate = (value) => validWhy(value, combo);
    prompt = guidance + ' Explique cada peça deste combo, incluindo as peças CX. JSON {"why":[{"part":"nome exato","reason":"explicação"}]}. Inclua TODOS os nomes enviados. Por peça, até 30 palavras sobre sua função física e relação com outra peça; não atribua ao Ratchet a função do Bit. Dados: ' + JSON.stringify(compactCombo(combo));
  } else {
    key = 'overview'; tokens = 500; validate = validOverview;
    prompt = guidance + ' JSON {"deckLabel":"título particular de 2 a 8 palavras","deck":"texto de 90 a 130 palavras"}. Analise a complementaridade do deck: função de cada Bey, situações para escolher cada uma e uma lacuna. Use pelo menos duas Blades por nome quando houver duas. Evite rótulos genéricos como identidade do trio, deck ofensivo e tripla sinergia. Não invente cobertura distinta quando os combos fazem a mesma coisa. Dados: ' + JSON.stringify(base.combos.map((combo, i) => ({ ...compactCombo(combo), analysis: partial['core' + i] })));
  }
  const result = await groqJson({ prompt, maxTokens: tokens, validate });
  partial[key] = key.startsWith('core') ? sanitizeCore(result.value) : key.startsWith('why') ? sanitizeWhy(result.value, combo) : { deckLabel: result.value.deckLabel.trim().slice(0, 110), deck: result.value.deck.trim().slice(0, 1800) };
  const value = compose(job, partial, base);
  value.model = result.model;
  const stage = job.stage + 1;
  return { patch: { partial, base, stage, completed: stage, usage: { input: (job.usage?.input || 0) + (result.usage?.prompt_tokens || 0), output: (job.usage?.output || 0) + (result.usage?.completion_tokens || 0) } },
    done: stage >= base.combos.length * 2 + 1, record: recordOf(job.signature, value) };
}
async function readQueue() {
  const row = await prisma.setting.findUnique({ where: { key: QUEUE_KEY } });
  return { raw: row?.value ?? null, state: row ? json(row.value, emptyQueue()) : emptyQueue() };
}
async function compareAndSwap(raw, state, record) {
  try {
    return await prisma.$transaction(async (tx) => {
      if (raw === null) await tx.setting.create({ data: { key: QUEUE_KEY, value: JSON.stringify(state) } });
      else {
        const result = await tx.setting.updateMany({ where: { key: QUEUE_KEY, value: raw }, data: { value: JSON.stringify(state) } });
        if (!result.count) return false;
      }
      if (record) await tx.setting.upsert({ where: { key: record.key }, create: record, update: { value: record.value } });
      return true;
    });
  } catch (error) { if (['P2002', 'P2034', 'P1008'].includes(error.code)) return false; throw error; }
}
const worker = createAnalysisQueue({ read: readQueue, compareAndSwap, step: runStep });
let workerTick = false;
export async function processDeckAnalysisQueueOnce() {
  if (workerTick) return;
  workerTick = true;
  try { await worker.tick(); } catch (error) { console.warn('[deck analysis] worker:', error.message); }
  finally { workerTick = false; }
}
const tick = processDeckAnalysisQueueOnce;
export async function getDeckAnalysisState(beys) {
  const state = await worker.read();
  const job = state.jobs.find((item) => item.signature === signatureOf(beys));
  const pending = pendingJob(job);
  return { pending, status: job?.status || 'idle', position: pending ? state.jobs.filter(pendingJob).findIndex((item) => item.id === job.id) + 1 : null,
    completed: job?.completed || 0, total: job?.base?.combos?.length * 2 + 1 || 0,
    nextAttemptAt: pending ? Math.max(job.nextAttemptAt || 0, state.nextCallAt || 0) : null,
    error: job?.status === 'failed' ? 'A análise detalhada não pôde ser concluída. A leitura disponível foi preservada.' : null };
}
export const isDeckAnalysisPending = async (beys) => (await getDeckAnalysisState(beys)).pending;
export const isDeckAnalysisBusy = async () => (await worker.read()).jobs.some(pendingJob);
export async function getDeckAnalysisQueueStatus() {
  const state = await worker.read();
  const pending = state.jobs.filter(pendingJob);
  const active = state.lease?.until > Date.now() ? state.jobs.find((job) => job.id === state.lease.jobId) : null;
  return { active: !!active, queued: pending.length - (active ? 1 : 0), waiting: pending.length,
    activeSince: active?.startedAt ? new Date(active.startedAt).toISOString() : null,
    lastSuccessAt: state.lastSuccessAt, lastError: state.lastError, nextCallAt: state.nextCallAt,
    configured: !!process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
    failed: state.jobs.filter((job) => job.status === 'failed').length,
    jobs: state.jobs.filter((job) => pendingJob(job) || job.status === 'failed').map((job) => ({
      id: job.id, title: job.title || job.base?.combos?.map((combo) => combo.label).join(' / '),
      status: job.status, completed: job.completed, total: job.base.combos.length * 2 + 1,
      attempts: job.attempts, error: job.error, queuedAt: job.queuedAt,
      nextAttemptAt: Math.max(job.nextAttemptAt || 0, state.nextCallAt || 0),
    })) };
}
export const clearDeckAnalysisQueue = () => worker.clear();
export const retryFailedDeckAnalyses = async () => { const result = await worker.retryFailed(); void tick(); return result; };
/** Durable acceptance only; never hold an HTTP request open for generation. */
export async function queueDeckAnalysis(beys, _partsById, { force = false, title = null } = {}) {
  if (!Array.isArray(beys) || !beys.length || beys.some((bey) => !Array.isArray(bey) || !bey.length)) throw new Error('Deck sem peças para analisar.');
  const signature = signatureOf(beys);
  const existing = await storedValue(beys);
  if (!force && existing && ((existing.version === VERSION && existing.quality === 'llm') || (existing.version !== VERSION && !legacyBroken(existing)))) return { queued: false };
  const combos = signals(beys, await loadParts(beys));
  if (combos.some((combo, i) => combo.physical.length !== beys[i].length)) throw new Error('Uma peça do deck não existe no catálogo.');
  const base = existing ? repairAnalysis(existing, combos) : localAnalysis(combos);
  base.version = VERSION;
  base.quality ||= 'mixed';
  const previousJob = (await worker.read()).jobs.find((job) => job.signature === signature);
  const job = await worker.enqueue({ signature, beys, base, title }, { force: force || ['failed', 'cancelled'].includes(previousJob?.status), record: recordOf(signature, base) });
  void tick();
  return { queued: pendingJob(job), jobId: job.id };
}
export const analyzeDeck = queueDeckAnalysis;
export async function refreshExistingDeckAnalysesOnce() {
  const decks = await prisma.communityDeck.findMany({ where: { status: 'VISIBLE' }, select: { beysJson: true, title: true } });
  const seen = new Set(); let refreshed = 0;
  for (const deck of decks) {
    const beys = json(deck.beysJson, []); const signature = signatureOf(beys);
    if (!beys.length || seen.has(signature)) continue;
    seen.add(signature);
    if ((await queueDeckAnalysis(beys, null, { force: true, title: deck.title })).queued) refreshed++;
  }
  return { uniqueDecks: seen.size, refreshed };
}
function legacyBroken(value) {
  return !value || !validOverview({ deckLabel: value.deckLabel, deck: value.deckSummary })
    || !value.combos?.length || value.combos.some((combo, i) => {
      const item = value.individual?.[i];
      return !validCore(item) || !validWhy(item, combo)
        || /^Combo (de pressão|de contenção|focado em|versátil)/.test(item.summary);
    });
}
/** One-time repair of broken old results. Public reads never call this. */
export async function recoverDeckAnalyses() {
  const migrated = await prisma.setting.findUnique({ where: { key: REPAIR_KEY } });
  const decks = await prisma.communityDeck.findMany({ where: { status: 'VISIBLE' }, select: { beysJson: true, title: true } });
  const seen = new Set(); let repaired = 0;
  for (const deck of decks) {
    const beys = json(deck.beysJson, []); const signature = signatureOf(beys);
    if (!beys.length || seen.has(signature)) continue;
    seen.add(signature);
    const value = await storedValue(beys);
    const hasJob = (await worker.read()).jobs.some((job) => job.signature === signature);
    if (hasJob || (value && (migrated || !legacyBroken(value)))) continue;
    await queueDeckAnalysis(beys, null, { title: deck.title });
    repaired++;
  }
  if (!migrated) await prisma.setting.upsert({ where: { key: REPAIR_KEY }, create: { key: REPAIR_KEY, value: JSON.stringify({ at: new Date().toISOString(), repaired }) }, update: {} });
  return { repaired };
}
let scheduled = false;
export function scheduleDeckAnalysisJobs() {
  if (scheduled) return;
  scheduled = true;
  setInterval(() => void tick(), 3000).unref();
  setTimeout(() => recoverDeckAnalyses().catch((error) => console.warn('[deck analysis] recuperação:', error.message)), 1500).unref();
  setInterval(() => recoverDeckAnalyses().catch((error) => console.warn('[deck analysis] recuperação:', error.message)), 5 * 60_000).unref();
  const refresh = () => getExternalMeta({ force: true }).catch((error) => console.warn('[deck analysis] meta diário:', error.message));
  const next = new Date(); next.setHours(7, 15, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  setTimeout(() => { void refresh(); setInterval(refresh, 24 * 60 * 60 * 1000).unref(); }, next - new Date()).unref();
}
