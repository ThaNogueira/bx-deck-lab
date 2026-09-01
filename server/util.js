export const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function json(v, fallback = null) {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function siteUrl() {
  return (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

/** Slug único: tenta o base e vai acrescentando -2, -3… */
export async function uniqueSlug(model, base, excludeId = null) {
  const root = slugify(base) || 'item';
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const found = await model.findUnique({ where: { slug: candidate } });
    if (!found || found.id === excludeId) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/** Link de busca do Google Shopping por um produto (item 5/6 — sem scraping). */
export function googleSearchUrl(productName, brand) {
  const q = `Beyblade X ${productName}${brand === 'HASBRO' ? ' Hasbro' : ''}`;
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}`;
}

export function waLink(phone, message) {
  const digits = String(phone || '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

const KIND_VALUES = ['BLADE', 'LOCK_CHIP', 'OVER_BLADE', 'MAIN_BLADE', 'ASSIST_BLADE', 'RATCHET', 'BIT'];
export function isValidKind(k) {
  return KIND_VALUES.includes(k);
}

/** Ordem de montagem (de cima para baixo) usada nas páginas de produto. */
export const KIND_ORDER = ['BLADE', 'LOCK_CHIP', 'OVER_BLADE', 'MAIN_BLADE', 'ASSIST_BLADE', 'RATCHET', 'BIT'];
