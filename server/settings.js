import { prisma } from './db.js';
import { json } from './util.js';

/**
 * Configurações persistidas na tabela Setting (JSON por chave), com cache em
 * memória de 15s — o suficiente para não bater no banco a cada request.
 */

export const DEFAULTS = {
  site: {
    name: 'BX Deck Lab',
    tagline: '3-on-3 deck builder',
    about: '',
    socials: { instagram: '', youtube: '', discord: '', whatsapp: '' },
  },
  flags: { sales: true, signup: true, tournaments: true, decks: true },
  maintenance: { on: false, message: 'Voltamos já! O site está em manutenção rápida.' },
  bannedWords: [],
  featuredNote: '',
};

const cache = new Map(); // key -> {value, at}
const TTL = 15_000;

export async function getSetting(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const row = await prisma.setting.findUnique({ where: { key } });
  const value = row ? json(row.value, DEFAULTS[key]) : structuredClone(DEFAULTS[key] ?? null);
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function setSetting(key, value) {
  await prisma.setting.upsert({
    where: { key },
    update: { value: JSON.stringify(value) },
    create: { key, value: JSON.stringify(value) },
  });
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function flags() {
  return { ...DEFAULTS.flags, ...(await getSetting('flags')) };
}

/**
 * Filtro de palavras proibidas (2.3): retorna a primeira palavra encontrada
 * ou null. Comparação por palavra inteira, sem acentos, caso-insensível.
 */
export async function findBannedWord(...texts) {
  const words = (await getSetting('bannedWords')) || [];
  if (!words.length) return null;
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  const blob = ` ${texts.map(norm).join(' ')} `.replace(/[^a-z0-9]+/g, ' ');
  for (const w of words) {
    const nw = norm(w).replace(/[^a-z0-9]+/g, ' ').trim();
    if (nw && blob.includes(` ${nw} `)) return w;
  }
  return null;
}

/** Middleware: recusa conteúdo com palavras proibidas. */
export function moderateFields(...fields) {
  return async (req, res, next) => {
    try {
      const texts = fields.map((f) => req.body?.[f]).filter(Boolean);
      const hit = await findBannedWord(...texts);
      if (hit) return res.status(422).json({ error: `Conteúdo bloqueado pelo filtro de palavras ("${hit}").` });
      next();
    } catch (e) {
      next(e);
    }
  };
}
