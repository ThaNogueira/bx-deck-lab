// Pure, local analysis. No provider calls and no claims of measured win rates.
export const partName = (part) => part?.displayName || part?.name || 'Peça sem nome';
const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const norm = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const category = (parts, kind) => parts.find((p) => kind.includes(p.kind));

export function physicalTendency(stats) {
  const names = { atk: 'pressão no contato', def: 'estabilidade ao receber impactos', sta: 'retenção de giro' };
  return Object.entries(stats || {}).filter(([key, val]) => names[key] && Number(val) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 2).map(([key]) => names[key]).join(' e ') || null;
}

export function comboProfile(combo) {
  const parts = combo.physical || [];
  const blade = category(parts, ['BLADE', 'MAIN_BLADE', 'OVER_BLADE']);
  const bit = category(parts, ['BIT']);
  const ratchet = category(parts, ['RATCHET']);
  // The tip sets movement; don't label an attacking Blade on Ball as a pure attacker.
  const type = bit?.type || blade?.type || 'Balance';
  const height = Number(partName(ratchet).match(/-(\d{2,3})(?:\D|$)/)?.[1]) || null;
  const aggressive = type === 'Attack';
  const stationary = type === 'Stamina' || type === 'Defense';
  return { parts, blade, bit, ratchet, type, height, aggressive, stationary,
    bladeName: blade ? partName(blade) : 'esta montagem', bitName: bit ? partName(bit) : 'apoio disponível', ratchetName: ratchet ? partName(ratchet) : 'montagem integrada' };
}

function pieceReason(part, profile) {
  const behavior = clean(part.behavior || part.note);
  if (behavior) return `${behavior.replace(/[.!;]+$/, '')}. ${part.kind === 'BIT' ? `No conjunto com ${profile.bladeName}, observe se o trajeto permite acertar o rival antes de perder estabilidade.` : `A utilidade no combo depende de manter o contato compatível com o movimento do ${profile.bitName}.`}`;
  const name = partName(part);
  if (part.kind === 'RATCHET') {
    const height = profile.height;
    return height ? `${name} define a altura de contato. ${height <= 60 ? 'A montagem baixa pode reduzir a exposição lateral, mas deve ser testada para não raspar ao inclinar.' : 'A montagem mais alta muda a região de contato e exige atenção à inclinação e à exposição do ratchet.'} Confira o encaixe antes de lançar; a altura sozinha não garante resistência a burst.` : `${name} define a altura de montagem e parte da superfície que o rival pode atingir. Confira o encaixe e se há contato direto no ratchet durante os testes.`;
  }
  if (part.kind === 'BIT') return `${name} orienta o deslocamento e o apoio na arena. ${profile.aggressive ? 'Seu perfil de ataque pede contato cedo; voltas sem acertar o rival gastam giro e aumentam a chance de sair sozinho.' : profile.stationary ? 'Seu perfil favorece preservar giro; procure apoio estável e observe se os impactos o empurram para as saídas.' : 'Teste uma entrada próxima do centro e outra levemente inclinada para descobrir qual mantém o trajeto mais repetível.'}`;
  if (['BLADE', 'MAIN_BLADE'].includes(part.kind)) return `${name} concentra os contatos com o adversário${physicalTendency(part.stats) ? ` e os dados locais apontam para ${physicalTendency(part.stats)}` : ''}. ${profile.aggressive ? `Com ${profile.bitName}, precisa transformar movimento em acertos antes de perder giro.` : `Com ${profile.bitName}, o desafio é manter o apoio após o impacto, sem depender só da força da Blade.`}`;
  if (part.kind === 'LOCK_CHIP') return `${name} integra o núcleo da montagem CX. Seu encaixe e sua massa participam do conjunto; sem medida local não dá para atribuir uma vantagem específica de peso.`;
  if (part.kind === 'ASSIST_BLADE') return `${name} compõe a região inferior da Blade CX. Observe os contatos em inclinação e se a combinação com ${profile.ratchetName} mantém folga em relação à arena.`;
  if (part.kind === 'OVER_BLADE') return `${name} compõe a região externa da montagem CX. Avalie o contato junto à Main Blade e se o conjunto permanece estável no apoio do ${profile.bitName}.`;
  return `${name} participa da montagem. O catálogo não descreve seu comportamento; valide o encaixe e compare o giro com o conjunto completo antes de atribuir uma vantagem.`;
}

export function fallbackIndividual(combo) {
  const p = comboProfile(combo);
  const base = p.parts.map(partName).join(' + ');
  const summaries = {
    Attack: `${base} coloca a Blade em movimento para buscar contato cedo. A prioridade é converter a primeira passagem em impacto; circular sem acertar deixa o conjunto vulnerável na disputa de giro.`,
    Stamina: `${base} favorece preservar giro no apoio. A Blade precisa atravessar os primeiros impactos sem perder o centro; perseguir o adversário pode gastar a reserva necessária no fim da rodada.`,
    Defense: `${base} busca receber os contatos com apoio firme. Sustentar a posição é mais importante que perseguir o rival, mas sobreviver ao impacto não garante vencer uma disputa longa de giro.`,
    Balance: `${base} combina funções que precisam ser ajustadas na entrada. Comece por um trajeto repetível e observe se a Blade rende mais ao disputar o centro ou ao procurar o primeiro contato.`,
  };
  const launch = p.aggressive
    ? `Com ${p.bitName}, teste uma inclinação leve e uma entrada voltada para a região ocupada pelo rival. Use força que consiga repetir; se passar direto ou sair sozinho, reduza a inclinação antes de aumentar a força.`
    : `Com ${p.bitName}, comece próximo da vertical, mirando uma região central livre. Procure giro firme sem quicar; se ${p.bladeName} perder apoio no primeiro impacto, varie levemente o ponto de entrada e compare o resultado.`;
  const favored = p.aggressive ? 'Oponentes de pouca mobilidade' : 'Atacantes que gastam giro sem acertar';
  const favoredWhy = p.aggressive
    ? `${p.bladeName} tem mais chance de contato útil quando o rival mantém uma posição previsível. A vantagem depende de acertar antes de ${p.bitName} gastar energia em trajetos externos; não é uma vitória garantida contra stamina.`
    : `Se o adversário circula e erra as investidas, ${p.bitName} pode preservar apoio enquanto ele perde giro. A condição é ${p.bladeName} continuar estável, sem ser levado às saídas pelos contatos restantes.`;
  const risk = p.aggressive ? 'Conjuntos estáveis que sobrevivem à abertura' : 'Impacto cedo e disputa de centro';
  const riskWhy = p.aggressive
    ? `Se o rival recebe o primeiro golpe e permanece apoiado, o movimento do ${p.bitName} pode custar a rotação que falta no final. Repetir a mesma entrada facilita que ele sobreviva à abertura.`
    : `${p.bladeName} fica exposta antes de estabilizar. Um rival que acerta nessa janela pode tirar o apoio ou empurrar o conjunto até uma saída; permanecer no centro não elimina esse risco.`;
  const counterTip = p.aggressive
    ? `Mude o ponto de entrada para buscar um contato mais direto, sem recorrer a inclinações extremas. Se ${p.bladeName} continuar sem deslocar o rival, use outra Bey do deck para disputar giro.`
    : `Mude o ponto de entrada para sair da primeira linha de ataque e preserve o lançamento firme. Se ${p.bladeName} sobreviver mas perder no giro, experimente outro combo do deck em vez de apenas aumentar a força.`;
  return { summary: summaries[p.type] || summaries.Balance, launch, favored, favoredWhy, risk, riskWhy, counterTip,
    why: p.parts.map((part) => ({ part: partName(part), reason: pieceReason(part, p) })) };
}

export function fallbackOverview(combos) {
  const profiles = combos.map(comboProfile);
  const attacks = profiles.filter((p) => p.aggressive);
  const holders = profiles.filter((p) => p.stationary);
  const first = profiles[0];
  const deckLabel = !first ? 'Deck em montagem' : attacks.length === profiles.length
    ? `${first.bladeName}: disputa na abertura` : holders.length === profiles.length
      ? `${first.bladeName}: proteger o giro` : `${first.bladeName}: alternar o ritmo`;
  const roles = profiles.map((p) => `${p.bladeName} com ${p.bitName} ${p.aggressive ? 'é a opção para buscar contato cedo' : p.stationary ? 'é a opção para preservar apoio e atravessar a abertura' : 'pede testar a entrada antes de definir sua função'}`);
  const coverage = attacks.length && holders.length
    ? 'Alterne a pressão e a disputa de giro conforme o rival. Se a primeira entrada falhar, escolha o combo que muda essa condição de vitória.'
    : attacks.length === profiles.length
      ? 'As opções dependem de acertar cedo: se o rival sobreviver à abertura, falta uma alternativa claramente voltada à retenção de giro.'
      : 'O conjunto depende de manter estabilidade. Se o adversário dominar o centro ou vencer no giro, variar só a ordem pode não cobrir essa lacuna.';
  return { deckLabel, deck: `${roles.join('; ')}. ${coverage}` };
}

export const NARRATIVE_FIELDS = ['summary', 'launch', 'favored', 'favoredWhy', 'risk', 'riskWhy', 'counterTip'];
export function validCore(value) {
  return !!value && NARRATIVE_FIELDS.every((key) => typeof value[key] === 'string' && clean(value[key]).length >= (['favored', 'risk'].includes(key) ? 4 : 25));
}
export function validWhy(value, combo) {
  return Array.isArray(value?.why) && Array.isArray(combo?.physical) && combo.physical.every((part) => value.why.some((row) => norm(row?.part) === norm(partName(part)) && typeof row?.reason === 'string' && clean(row.reason).length >= 25));
}
export function validOverview(value) {
  return typeof value?.deckLabel === 'string' && clean(value.deckLabel).length >= 5
    && !/identidade do trio|deck (muito )?(ofensivo|defensivo|equilibrado)/i.test(value.deckLabel)
    && typeof value?.deck === 'string' && clean(value.deck).length >= 100;
}
export function sanitizeCore(value) {
  return Object.fromEntries(NARRATIVE_FIELDS.map((key) => [key, clean(value[key]).slice(0, 1000)]));
}
export function sanitizeWhy(value, combo) {
  return combo.physical.map((part) => ({ part: partName(part), reason: clean(value.why.find((row) => norm(row.part) === norm(partName(part))).reason).slice(0, 650) }));
}

export function repairAnalysis(value, combos) {
  const fallback = fallbackOverview(combos);
  const overviewValid = validOverview({ deckLabel: value?.deckLabel, deck: value?.deckSummary });
  return { ...value, combos: combos.map((combo, i) => ({ ...combo, evidence: { ...value?.combos?.[i]?.evidence, ...combo.evidence, metaPresence: value?.combos?.[i]?.evidence?.metaPresence ?? combo.evidence?.metaPresence ?? 0 } })),
    deckLabel: overviewValid ? value.deckLabel : fallback.deckLabel,
    deckSummary: overviewValid ? value.deckSummary : fallback.deck,
    individual: combos.map((combo, i) => {
      const base = fallbackIndividual(combo); const saved = value?.individual?.[i];
      const oldFallback = /^Combo (de pressão|de contenção|focado em|versátil)/.test(saved?.summary || '');
      return { ...base, ...(validCore(saved) && !oldFallback ? sanitizeCore(saved) : {}), why: validWhy(saved, combo) && !oldFallback ? sanitizeWhy(saved, combo) : base.why };
    }),
  };
}
