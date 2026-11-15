import { BLADES, RATCHETS, BITS, getParts, railRating, sanitizeConfig } from './rules.js';
import { clamp } from './stadium.js';

export const partKinds = {blade:BLADES,ratchet:RATCHETS,bit:BITS};

export function hasRepeatedParts(beys) {
  return Object.keys(partKinds).some(kind=>{
    const parts = beys.map(bey=>bey[kind]).filter(Boolean);
    return new Set(parts).size !== parts.length;
  });
}

export function validateLineup(beys) {
  if (!Array.isArray(beys) || beys.length !== 3 || beys.some(bey=>!bey ||
    !Object.hasOwn(BLADES,bey.blade) || !Object.hasOwn(BITS,bey.bit) ||
    (BLADES[bey.blade].integrated ? bey.ratchet !== null : !Object.hasOwn(RATCHETS,bey.ratchet)))) return null;
  const lineup = beys.map(bey=>sanitizeConfig(bey,0));
  return hasRepeatedParts(lineup) ? null : lineup;
}

export const lineupKeys = beys => beys.map(({blade,ratchet,bit})=>[blade,ratchet,bit].join('/'));

export function loadoutStats(config) {
  const {blade,bit,balance} = getParts(config);
  return [['Impacto',blade.hit*bit.attack*62],['Giro',42*Math.sqrt(blade.stamina/bit.drain)],
    ['Estabilidade',(balance-.50)*93],['Trilho',railRating(bit)]]
    .map(([label,value])=>[label,Math.round(clamp(value,0,100))]);
}
