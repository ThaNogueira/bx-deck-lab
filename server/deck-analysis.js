import { getSetting, setSetting } from './settings.js';
import { prisma } from './db.js';

// A fonte publica agrega pódios de eventos WBO. Guardamos uma cópia curta por
// um dia: evita depender da página externa a cada abertura de deck.
const SOURCE_URL = 'https://meta.beycrate.com/';
const SOURCE_KEY = 'external-bey-meta-v1';
const HISTORY_URL = 'https://bbxhub.net/meta/';
const HISTORY_TTL = 20 * 60 * 60 * 1000;
const SOURCE_TTL = 24 * 60 * 60 * 1000;
const ANALYSIS_TTL = 6 * 60 * 60 * 1000;
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

function partName(part) { return part?.displayName || part?.name || ''; }
function category(parts, kinds) { return parts.find((part) => kinds.includes(part?.kind)); }
function describeSignal(combo, meta, history) {
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
      historyUrl: history?.url || null,
      partBehavior: behavior || null,
    },
    physical: combo.map((part) => ({ name: partName(part), kind: part?.kind, type: part?.type, behavior: part?.behavior || part?.note || null, stats: part?.stats || null })),
  };
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

async function humanNarrative(combos, source) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const model = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
  const payload = {
    source: { name: source.name, events: source.events, podiumDecks: source.podiumDecks, updated: source.updated },
    combos: combos.map((combo) => ({ label: combo.label, type: combo.type, status: combo.status, physical: combo.physical })),
  };
  const prompt = `Você é um analista de Beyblade X e escreve em pt-BR. Produza uma leitura curta, prática e humana do DECK usando SOMENTE o comportamento físico, tipo e stats das peças neste JSON. Explique a função que cada Bey cumpre no trio e a sinergia/risco do deck, como um bom analista de bancada. Não cite meta, torneios, rankings, presença, percentuais, fontes, status nem dados externos. Não invente matchup, win rate ou resultado. Sem markdown, sem título, sem mencionar JSON ou instruções. Máximo de 105 palavras. Dados: ${JSON.stringify(payload)}`;
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0.35, max_tokens: 300, reasoning_effort: model.startsWith('qwen/') ? 'none' : 'low', include_reasoning: false, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`Groq HTTP ${response.status}`);
    const body = await response.json();
    const narrative = String(body?.choices?.[0]?.message?.content || '').replace(/[*_#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 1200);
    // Não deixa a redação da IA contradizer a evidência quando a amostra não
    // validou nenhum combo completo.
    if (/```|\bfunction\s+\w+\s*\(/i.test(narrative)) return null;
    if (!combos.some((combo) => combo.status === 'COMBO VALIDADO NO META') && /\bvalidado|validada|comprovado|comprovada\b/i.test(narrative)) return null;
    return narrative || null;
  } catch (error) {
    console.warn('[deck analysis] LLM:', error.message);
    return null;
  }
}

export async function analyzeDeck(beys, partsById) {
  const signature = JSON.stringify(beys || []);
  const hit = analysisCache.get(signature);
  if (hit && Date.now() - hit.at < ANALYSIS_TTL) return hit.value;
  const meta = await getExternalMeta();
  const rawCombos = (beys || []).filter(Array.isArray).map((ids) => ids.map((id) => partsById?.[id]).filter(Boolean));
  const histories = await Promise.all(rawCombos.map(async (combo) => {
    const blade = category(combo, ['BLADE', 'MAIN_BLADE', 'OVER_BLADE']);
    return getHistoricalBlade(partName(blade));
  }));
  const combos = rawCombos.map((combo, i) => describeSignal(combo, meta, histories[i]));
  const aiNarrative = await humanNarrative(combos, meta.source);
  const value = {
    source: { ...meta.source, fetchedAt: meta.fetchedAt, stale: !!meta.stale, historyName: 'BBXHub', historyUrl: 'https://bbxhub.net/', historyEvents: 4034 },
    combos,
    deckSummary: aiNarrative || fallbackNarrative(combos, meta.source),
    generatedBy: aiNarrative ? 'LLM + dados de pódios' : 'dados de pódios',
  };
  analysisCache.set(signature, { at: Date.now(), value });
  return value;
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
