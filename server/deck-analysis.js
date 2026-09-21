import { getSetting, setSetting } from './settings.js';
import { prisma } from './db.js';
import { createHash } from 'node:crypto';
import { json } from './util.js';

// A fonte publica agrega pódios de eventos WBO. Guardamos uma cópia curta por
// um dia: evita depender da página externa a cada abertura de deck.
const SOURCE_URL = 'https://meta.beycrate.com/?window=3m';
const SOURCE_KEY = 'external-bey-meta-v2';
const HISTORY_URL = 'https://bbxhub.net/meta/';
const HISTORY_OVERVIEW_URL = 'https://bbxhub.net/';
const HISTORY_OVERVIEW_KEY = 'external-bey-history-overview-v1';
const HISTORY_TTL = 20 * 60 * 60 * 1000;
const SOURCE_TTL = 24 * 60 * 60 * 1000;
const ANALYSIS_TTL = 6 * 60 * 60 * 1000;
const ANALYSIS_STORE_PREFIX = 'deck-ai-analysis-v3:';
const analysisCache = new Map();

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

const historySlug = (name) => String(name || '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const historyLines = (html) => decode(String(html || '').replace(/<\/(?:tr|li|p|h[1-6])>/gi, '\n').replace(/<[^>]+>/g, ' ')).split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);

async function getHistoricalBlade(name, { force = false } = {}) {
  const slug = historySlug(name);
  if (!slug) return null;
  const key = `external-bey-history-v1:${slug}`;
  const saved = await getSetting(key);
  if (!force && saved?.fetchedAt && Date.now() - new Date(saved.fetchedAt).getTime() < HISTORY_TTL) return saved;
  try {
    const response = await fetch(`${HISTORY_URL}${slug}`, { headers: { 'User-Agent': 'BX-Deck-Lab meta reader/1.0 (+https://bxdecklab.com)' }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const lines = historyLines(html);
    const placement = lines.find((line) => /tracked top placements/i.test(line)) || '';
    const total = Number((placement.match(/from\s+([\d,]+)\s+tracked/i) || [])[1]?.replace(',', '')) || null;
    if (!total) return null;
    const rank = Number((lines.find((line) => /^#\d+ of \d+$/i.test(line)) || '').match(/^#(\d+)/)?.[1]) || null;
    const tier = lines.find((line) => /^[SABC]\s+/.test(line)) || null;
    const wins = Number((lines[lines.findIndex((line) => line === 'Tournament wins') + 1] || '').replace(/,/g, '')) || null;
    const builds = [...html.matchAll(/<tr class="border-t[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => text(cell[1]));
      const uses = Number((cells[1] || '').match(/\d+/)?.[0]);
      const percent = Number((cells[2] || '').match(/\d+/)?.[0]);
      return cells[0] && uses && percent ? { label: cells[0], uses, percent } : null;
    }).filter(Boolean);
    const fresh = { fetchedAt: new Date().toISOString(), name, url: `${HISTORY_URL}${slug}`, total, rank, tier, wins, builds };
    await setSetting(key, fresh);
    return fresh;
  } catch (error) {
    return saved || null;
  }
}

async function getGlobalHistory() {
  const saved = await getSetting(HISTORY_OVERVIEW_KEY);
  if (saved?.fetchedAt && Date.now() - new Date(saved.fetchedAt).getTime() < HISTORY_TTL && saved.comboCount) return saved;
  try {
    const response = await fetch(HISTORY_OVERVIEW_URL, { headers: { 'User-Agent': 'BX-Deck-Lab meta reader/1.0 (+https://bxdecklab.com)' }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const plain = text(await response.text());
    const match = plain.match(/([\d,]+)\s+(?:winning\s+)?combos/i);
    const eventMatch = plain.match(/([\d,]+)\s+events\s+scanned/i);
    const fresh = {
      fetchedAt: new Date().toISOString(),
      comboCount: Number((match?.[1] || '').replace(/,/g, '')) || 40_709,
      eventCount: Number((eventMatch?.[1] || '').replace(/,/g, '')) || 4_034,
    };
    await setSetting(HISTORY_OVERVIEW_KEY, fresh);
    return fresh;
  } catch { return saved?.comboCount ? saved : { comboCount: 40_709, eventCount: 4_034 }; }
}

function partName(part) { return part?.displayName || part?.name || ''; }
function category(parts, kinds) { return parts.find((part) => kinds.includes(part?.kind)); }
function describeSignal(combo, meta, history, globalHistory) {
  const parts = combo.map(partName).filter(Boolean);
  const blade = category(combo, ['BLADE', 'MAIN_BLADE', 'OVER_BLADE']);
  const ratchet = category(combo, ['RATCHET']);
  const bit = category(combo, ['BIT']);
  const bladeRow = meta.blades.find((row) => compact(row.blade) === compact(partName(blade)))
    || meta.blades.find((row) => compact(partName(blade)).includes(compact(row.blade)) || compact(row.blade).includes(compact(partName(blade))));
  const exact = bladeRow?.builds.find((build) => {
    return norm(build.label) === norm(parts.join(' '));
  });
  const historicExact = history?.builds?.find((build) => {
    return norm(build.label) === norm(parts.join(' '));
  });
  const type = blade?.type || bit?.type || 'Balance';
  let status = 'SEM AMOSTRA PÚBLICA';
  let summary = 'Ainda não há dado de pódio suficiente nessa amostra pública para validar este conjunto completo.';
  if (exact) {
    status = 'COMBO VALIDADO NO META';
    summary = `Setup de ${type} alinhado ao recorte competitivo atual.`;
  } else if (bladeRow) {
    status = 'BASE PRESENTE NO META';
    summary = `A Blade tem presença no Top 3; este setup é uma variação fora dos builds mais recorrentes.`;
  } else if (historicExact) {
    status = 'COMBO VALIDADO NO HISTÓRICO';
    summary = `Setup de ${type} com histórico global de Top 3.`;
  } else if (history) {
    status = 'BASE PRESENTE NO HISTÓRICO';
    summary = `A Blade tem histórico global de Top 3; este setup ainda não está entre os mais recorrentes.`;
  }
  const behavior = [blade?.behavior, bit?.behavior, blade?.note, bit?.note].filter(Boolean)[0];
  return {
    label: parts.join(' '), type, status, summary,
    evidence: {
      blade: bladeRow?.blade || partName(blade) || null,
      bladePodiumShare: bladeRow?.appearance || null,
      exactBuild: exact?.label || null,
      exactBuildShare: exact?.percent || null,
      historicalBuild: historicExact?.label || null,
      historicalUses: historicExact?.uses || null,
      historicalShare: historicExact?.percent || null,
      // Uso da Blade na amostra ampla de decks competitivos da janela atual.
      // Não é taxa de vitória: cada deck que a inclui conta uma vez.
      metaPresence: bladeRow?.appearance ?? 0,
      historyUrl: history?.url || null,
      partBehavior: behavior || null,
    },
    physical: combo.map((part) => ({ name: partName(part), kind: part?.kind, type: part?.type, behavior: part?.behavior || part?.note || null, stats: part?.stats || null })),
  };
}

function fallbackIndividual(combo) {
  const profiles = {
    Attack: { summary: 'Combo de pressão que busca contato cedo e jogadas explosivas.', launch: 'Entre com inclinação baixa e acelere o movimento para buscar as linhas externas.', favored: 'stamina passiva', favoredWhy: 'A pressão constante força o oponente a gastar rotação antes de estabilizar.', risk: 'defesa pesada', riskWhy: 'Estruturas firmes absorvem o impacto inicial e podem devolver o contato.', counterTip: 'Varie a inclinação e evite insistir na mesma linha de entrada.' },
    Defense: { summary: 'Combo de contenção, feito para absorver contato e controlar o ritmo.', launch: 'Use lançamento estável e centralizado, preservando a linha para receber o impacto.', favored: 'ataque sem controle', favoredWhy: 'Entradas previsíveis perdem energia ao bater em uma estrutura estável.', risk: 'stamina limpa', riskWhy: 'Um rival que evita contato pode vencer na rotação.', counterTip: 'Aproxime o ponto de contato aos poucos, sem abrir demais a defesa.' },
    Stamina: { summary: 'Combo focado em manter rotação e sobreviver até o fim da rodada.', launch: 'Priorize um lançamento limpo no centro para reduzir atrito desnecessário.', favored: 'ataque que se expõe', favoredWhy: 'Após gastar energia em investidas, o rival tende a cair antes na rotação.', risk: 'ataque de impacto', riskWhy: 'Um contato muito forte pode tirar o combo da sua zona de estabilidade.', counterTip: 'Ajuste a inclinação para não entregar uma entrada direta na parede.' },
    Balance: { summary: 'Combo versátil, capaz de alternar entre pressão e sobrevivência conforme a rodada.', launch: 'Comece com linha controlada e ajuste a inclinação conforme o adversário ocupa a arena.', favored: 'combos muito especializados', favoredWhy: 'A versatilidade permite responder sem depender de uma única condição de vitória.', risk: 'pressão muito bem direcionada', riskWhy: 'Um rival que impõe o ritmo pode impedir a adaptação do conjunto.', counterTip: 'Escolha uma entrada consciente e não deixe o rival definir o primeiro contato.' },
  };
  const profile = profiles[combo.type] || profiles.Balance;
  return { ...profile, why: combo.physical.map((part) => ({ part: part.name, reason: part.behavior || physicalTendency(part.stats) || 'Contribui para a estrutura e o comportamento do conjunto.' })) };
}

function fallbackNarrative(combos, source) {
  const verified = combos.filter((combo) => combo.status.startsWith('COMBO VALIDADO')).length;
  const based = combos.filter((combo) => combo.status.startsWith('BASE PRESENTE')).length;
  const missing = combos.length - verified - based;
  const pieces = [];
  if (verified) pieces.push(`${verified} combo${verified > 1 ? 's' : ''} tem histórico direto de pódio`);
  if (based) pieces.push(`${based} usa uma Blade que já aparece no meta, mas com configuração diferente`);
  if (missing) pieces.push(`${missing} ainda precisa de teste de mesa para ganhar evidência`);
  return `${pieces.join('; ')}. Leitura baseada em ${source.events || 'eventos'} da janela pública do Beycrate Meta, não em uma tier list opinativa.`;
}

function physicalTendency(stats) {
  const values = Object.entries(stats || {})
    .map(([key, raw]) => [key, Number(raw) > 10 ? Number(raw) / 10 : Number(raw)])
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b[1] - a[1]);
  const names = { atk: 'pressão de ataque', def: 'resistência a impacto', sta: 'retenção de rotação' };
  return values.slice(0, 2).map(([key]) => names[key]).filter(Boolean).join(' e ') || null;
}

let llmQueue = Promise.resolve();
let lastLlmBatchAt = 0;
let llmPending = 0;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function queueLlmBatch(work) {
  if (llmPending > 0) return null;
  llmPending++;
  const run = async () => {
    // Uma análise completa reserva menos de 700 tokens de saída. Damos uma
    // janela entre decks para não somar dois lotes no limite de 1k/minuto.
    const remaining = 45_000 - (Date.now() - lastLlmBatchAt);
    if (remaining > 0) await pause(remaining);
    try { return await work(); }
    finally { lastLlmBatchAt = Date.now(); llmPending--; }
  };
  const result = llmQueue.catch(() => null).then(run);
  llmQueue = result.catch(() => null);
  return result;
}

export const isDeckAnalysisBusy = () => llmPending > 0;

function compactCombo(combo) {
  return {
    label: combo.label,
    type: combo.type,
    physical: combo.physical.map((part) => ({ name: part.name, kind: part.kind, type: part.type, behavior: part.behavior, tendency: physicalTendency(part.stats) })),
  };
}

async function groqJson(apiKey, model, prompt, maxTokens) {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0.35, max_tokens: maxTokens, reasoning_effort: model.startsWith('qwen/') ? 'none' : 'low', include_reasoning: false, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`Groq HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    return JSON.parse(String((await response.json())?.choices?.[0]?.message?.content || '{}'));
  } catch (error) {
    console.warn('[deck analysis] LLM:', error.message);
    return null;
  }
}

function cleanBeyNarrative(bey) {
  return { summary: String(bey?.summary || '').slice(0, 700), launch: String(bey?.launch || '').slice(0, 550), favored: String(bey?.favored || '').slice(0, 250), favoredWhy: String(bey?.favoredWhy || '').slice(0, 450), risk: String(bey?.risk || '').slice(0, 250), riskWhy: String(bey?.riskWhy || '').slice(0, 450), counterTip: String(bey?.counterTip || '').slice(0, 450), why: Array.isArray(bey?.why) ? bey.why.slice(0, 7).map((item) => ({ part: String(item?.part || '').slice(0, 100), reason: String(item?.reason || '').slice(0, 350) })) : [] };
}

async function humanNarrative(combos) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const model = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
  return queueLlmBatch(async () => {
    const beys = [];
    for (const combo of combos) {
      const prompt = `Você é analista de Beyblade X em pt-BR. Responda APENAS JSON válido: {"summary":"texto","launch":"dica detalhada","favored":"arquétipo","favoredWhy":"explicação física","risk":"arquétipo","riskWhy":"explicação física","counterTip":"dica de resposta","why":[{"part":"nome","reason":"função no conjunto"}]}. Analise SOMENTE este combo. Seja específico e prático: summary até 28 palavras; launch, favoredWhy, riskWhy e counterTip até 22 palavras; why com uma frase útil por peça. Fale de linha, inclinação, contato, ritmo, rotação e comportamento na arena quando for relevante. Não mostre números, stats, meta, torneios ou percentuais; use-os apenas como raciocínio interno. Matchups são tendências, não garantias. Dados: ${JSON.stringify(compactCombo(combo))}`;
      const result = await groqJson(apiKey, model, prompt, 220);
      beys.push(result ? cleanBeyNarrative(result) : null);
      await pause(1_200);
    }
    const deckPrompt = `Você é analista de Beyblade X em pt-BR. Responda APENAS JSON válido: {"deckLabel":"rótulo curto de 2 a 6 palavras","deck":"análise de até 45 palavras"}. Crie uma identidade específica ao trio, explique a sinergia, o plano de jogo e o principal risco; nunca use "deck ofensivo", "equilibrado", "de stamina" ou "defensivo". Não mostre números, stats, meta, torneios ou percentuais. Dados: ${JSON.stringify({ combos: combos.map(compactCombo) })}`;
    const overview = await groqJson(apiKey, model, deckPrompt, 160);
    if (!overview && !beys.some(Boolean)) return null;
    return { deckLabel: String(overview?.deckLabel || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 90), deck: String(overview?.deck || '').slice(0, 1400), beys };
  });
}

const analysisKey = (signature) => `${ANALYSIS_STORE_PREFIX}${createHash('sha256').update(signature).digest('hex')}`;

export async function analyzeDeck(beys, partsById, { force = false } = {}) {
  const signature = JSON.stringify(beys || []);
  const hit = analysisCache.get(signature);
  if (!force && hit && Date.now() - hit.at < ANALYSIS_TTL) return hit.value;
  const stored = !force ? await getSetting(analysisKey(signature)) : null;
  if (stored?.signature === signature && stored?.value?.generatedBy === 'LLM + dados de pódios') {
    analysisCache.set(signature, { at: Date.now(), value: stored.value });
    return stored.value;
  }
  const meta = await getExternalMeta();
  const globalHistory = await getGlobalHistory();
  const rawCombos = (beys || []).filter(Array.isArray).map((ids) => ids.map((id) => partsById?.[id]).filter(Boolean));
  const histories = await Promise.all(rawCombos.map(async (combo) => {
    const blade = category(combo, ['BLADE', 'MAIN_BLADE', 'OVER_BLADE']);
    return getHistoricalBlade(partName(blade));
  }));
  const combos = rawCombos.map((combo, i) => describeSignal(combo, meta, histories[i], globalHistory));
  const aiNarrative = await humanNarrative(combos);
  const value = {
    source: { ...meta.source, fetchedAt: meta.fetchedAt, stale: !!meta.stale, historyName: 'BBXHub', historyUrl: 'https://bbxhub.net/', historyEvents: 4034 },
    combos,
    deckLabel: aiNarrative?.deckLabel || 'IDENTIDADE DO TRIO',
    deckSummary: aiNarrative?.deck || fallbackNarrative(combos, meta.source),
    individual: combos.map((combo, index) => aiNarrative?.beys?.[index] || fallbackIndividual(combo)),
    generatedBy: aiNarrative ? 'LLM + dados de pódios' : 'dados de pódios',
  };
  analysisCache.set(signature, { at: Date.now(), value });
  // Só uma resposta completa da IA entra no cache persistente. Se a cota
  // externa estiver temporariamente indisponível, uma visita posterior pode
  // tentar novamente em vez de congelar o fallback genérico no deck.
  if (aiNarrative) await setSetting(analysisKey(signature), { signature, generatedAt: new Date().toISOString(), value });
  return value;
}

/** Utilitário pontual de manutenção. Não é chamado pelo site: depois desta
 * migração, a leitura é reaproveitada e só muda se as peças do deck mudarem. */
export async function refreshExistingDeckAnalysesOnce() {
  analysisCache.clear();
  const decks = await prisma.communityDeck.findMany({
    where: { status: 'VISIBLE' },
    select: { beysJson: true },
  });
  const seen = new Set();
  let refreshed = 0;
  let pendingRetry = 0;
  for (const deck of decks) {
    const beys = json(deck.beysJson, []);
    const signature = JSON.stringify(beys);
    if (!Array.isArray(beys) || !beys.length || seen.has(signature)) continue;
    seen.add(signature);
    const ids = [...new Set(beys.flat())];
    const parts = await prisma.part.findMany({ where: { id: { in: ids } } });
    const partMap = Object.fromEntries(parts.map((part) => [part.id, {
      ...part,
      stats: json(part.statsJson, null),
    }]));
    const analysis = await analyzeDeck(beys, partMap, { force: true });
    refreshed++;
    if (analysis.generatedBy !== 'LLM + dados de pódios') pendingRetry++;
    // Limite gratuito do modelo: 8k tokens por minuto. A pausa deixa espaço
    // para prompts longos e também para quem estiver usando o site.
    await new Promise((resolve) => setTimeout(resolve, 20_000));
  }
  return { uniqueDecks: seen.size, refreshed, pendingRetry };
}

/** Atualiza o recorte competitivo todas as manhãs; peças sem cache continuam
 * sendo pesquisadas sob demanda uma única vez e guardadas por 20 horas. */
export function scheduleDeckAnalysisJobs() {
  const refresh = () => getExternalMeta({ force: true }).then(() => console.log('[deck analysis] meta diário atualizado')).catch((error) => console.warn('[deck analysis] meta diário:', error.message));
  const next = new Date();
  next.setHours(7, 15, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  setTimeout(() => { refresh(); setInterval(refresh, 24 * 60 * 60 * 1000); }, next - new Date()).unref();
}
