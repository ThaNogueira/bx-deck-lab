import { getSetting, setSetting } from './settings.js';

// A fonte publica agrega pódios de eventos WBO. Guardamos uma cópia curta por
// um dia: evita depender da página externa a cada abertura de deck.
const SOURCE_URL = 'https://meta.beycrate.com/';
const SOURCE_KEY = 'external-bey-meta-v1';
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

async function getExternalMeta() {
  const saved = await getSetting(SOURCE_KEY);
  if (saved?.fetchedAt && Date.now() - new Date(saved.fetchedAt).getTime() < SOURCE_TTL && saved.blades?.length) return saved;
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

function partName(part) { return part?.displayName || part?.name || ''; }
function category(parts, kinds) { return parts.find((part) => kinds.includes(part?.kind)); }
function describeSignal(combo, meta) {
  const parts = combo.map(partName).filter(Boolean);
  const blade = category(combo, ['BLADE', 'MAIN_BLADE', 'OVER_BLADE']);
  const ratchet = category(combo, ['RATCHET']);
  const bit = category(combo, ['BIT']);
  const bladeRow = meta.blades.find((row) => compact(row.blade) === compact(partName(blade)))
    || meta.blades.find((row) => compact(partName(blade)).includes(compact(row.blade)) || compact(row.blade).includes(compact(partName(blade))));
  const comboText = compact(parts.join(' '));
  const exact = bladeRow?.builds.find((build) => {
    const candidate = compact(build.label);
    return [partName(ratchet), partName(bit)].filter(Boolean).every((name) => candidate.includes(compact(name)));
  });
  const type = blade?.type || bit?.type || 'Balance';
  let status = 'SEM AMOSTRA PÚBLICA';
  let summary = 'Ainda não há dado de pódio suficiente nessa amostra pública para validar este conjunto completo.';
  if (exact) {
    status = 'COMBO VALIDADO NO META';
    summary = `${exact.label} aparece entre os builds de pódio registrados; nesta janela, essa variação representa ${exact.percent}% dos builds listados para ${bladeRow.blade}.`;
  } else if (bladeRow) {
    status = 'BASE PRESENTE NO META';
    summary = `${bladeRow.blade} esteve em ${bladeRow.appearance}% dos decks de pódio da janela. A configuração exata não apareceu entre os builds mais recorrentes, então o ponto de teste é a combinação com ${partName(ratchet) || 'o ratchet'} e ${partName(bit) || 'o bit'}.`;
  }
  const behavior = [blade?.behavior, bit?.behavior, blade?.note, bit?.note].filter(Boolean)[0];
  return {
    label: parts.join(' '), type, status, summary,
    evidence: {
      blade: bladeRow?.blade || partName(blade) || null,
      bladePodiumShare: bladeRow?.appearance || null,
      exactBuild: exact?.label || null,
      exactBuildShare: exact?.percent || null,
      partBehavior: behavior || null,
    },
  };
}

function fallbackNarrative(combos, source) {
  const verified = combos.filter((combo) => combo.status === 'COMBO VALIDADO NO META').length;
  const based = combos.filter((combo) => combo.status === 'BASE PRESENTE NO META').length;
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
    combos: combos.map((combo) => ({ label: combo.label, type: combo.type, status: combo.status, evidence: combo.evidence })),
  };
  const prompt = `Você é um analista competitivo de Beyblade X e escreve em pt-BR. Faça uma leitura curta, humana e útil de um deck de 3 Beys usando SOMENTE os fatos deste JSON. Não invente win rate, matchup, ranking, resultado, "confiável" ou "comprovado". Para cada Bey, copie o valor do campo status EXATAMENTE como está, em letras maiúsculas: nunca chame de validado algo com status BASE PRESENTE NO META ou SEM AMOSTRA PÚBLICA. Dê a função declarada pelo tipo e uma conclusão cuidadosa em até 115 palavras. Não mencione JSON, regras, instruções, limitações da IA ou o ato de evitar afirmações. Sem markdown, sem título. Dados: ${JSON.stringify(payload)}`;
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
  const combos = (beys || []).filter(Array.isArray).map((ids) => describeSignal(ids.map((id) => partsById?.[id]).filter(Boolean), meta));
  const aiNarrative = await humanNarrative(combos, meta.source);
  const value = {
    source: { ...meta.source, fetchedAt: meta.fetchedAt, stale: !!meta.stale },
    combos,
    deckSummary: aiNarrative || fallbackNarrative(combos, meta.source),
    generatedBy: aiNarrative ? 'LLM + dados de pódios' : 'dados de pódios',
  };
  analysisCache.set(signature, { at: Date.now(), value });
  return value;
}
