import fs from 'node:fs';
import path from 'node:path';

/**
 * Extrai o catálogo embutido no public/app.js (registro PARTS + produtos
 * STOCK) sem duplicar dados: avalia só o prelúdio de dados do IIFE, que não
 * toca DOM. Usado pelo seed.
 */
export function extractEmbeddedCatalog() {
  const src = fs.readFileSync(path.resolve('public/app.js'), 'utf8');
  const start = src.indexOf('const DEFAULT_TEXT');
  const end = src.indexOf('const POPULAR =');
  if (start < 0 || end < 0) throw new Error('Não achei o bloco de dados no public/app.js');
  const prelude = src.slice(start, end);
  const fn = new Function(`'use strict';\n${prelude}\nreturn { PARTS, STOCK, BIT_PROFILE, BLADE_PROFILE };`);
  return fn();
}

/** kind do app.js -> (kind, subKind) do banco */
export function mapKind(kind) {
  switch (kind) {
    case 'blade': return { kind: 'BLADE', subKind: null };
    case 'integrated': return { kind: 'BLADE', subKind: 'INTEGRATED' };
    case 'lock': return { kind: 'LOCK_CHIP', subKind: null };
    case 'over': return { kind: 'OVER_BLADE', subKind: null };
    case 'main': return { kind: 'MAIN_BLADE', subKind: null };
    case 'assist': return { kind: 'ASSIST_BLADE', subKind: null };
    case 'ratchet': return { kind: 'RATCHET', subKind: null };
    case 'bit': return { kind: 'BIT', subKind: null };
    case 'rib': return { kind: 'BIT', subKind: 'RIB' };
    default: return { kind: 'BLADE', subKind: null };
  }
}
