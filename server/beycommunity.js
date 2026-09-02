import { prisma } from './db.js';
import { slugify } from './util.js';

/**
 * Sincronização com a BeyCommunity — a base mais completa de Beyblade X.
 * O site não expõe API pública, mas as páginas de listagem embutem o banco
 * inteiro no payload RSC do Next.js (self.__next_f). Extraímos:
 *  - bits/blades/ratchets: JSON puro com stats (atk/def/sta/dash/burst),
 *    peso, variantes de cor (imagens) e OS PRODUTOS de cada peça;
 *  - lock-chips/assist/main/over blades: cards com nome + imagem;
 *  - /products/ e /hasbro/: tabela com código, slug, nome, tipo e linha.
 */

const BASE = 'https://beycommunity.com/en/x';

async function fetchHtml(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (BXDeckLab catalog sync)', Accept: 'text/html' },
    signal: AbortSignal.timeout(25_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  return r.text();
}

/** Junta os fragmentos self.__next_f.push([1,"…"]) e desescapa a string JS. */
function flightText(html) {
  const parts = [];
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\[\s\S])*)"\]\)/g;
  let m;
  while ((m = re.exec(html))) parts.push(m[1]);
  return parts.join('').replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
}

/** Extrai objetos JSON balanceados que contenham a chave-alvo. */
function extractObjects(text, mustHave) {
  const out = [];
  const seen = new Set();
  let i = 0;
  while ((i = text.indexOf(mustHave, i)) !== -1) {
    let start = -1, depth = 0;
    for (let j = i; j >= 0 && j > i - 20_000; j--) {
      const c = text[j];
      if (c === '}') depth++;
      else if (c === '{') { if (depth === 0) { start = j; break; } depth--; }
    }
    if (start >= 0 && !seen.has(start)) {
      seen.add(start);
      let d = 0, inStr = false, esc = false, end = -1;
      for (let j = start; j < text.length && j < start + 100_000; j++) {
        const c = text[j];
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (c === '"') inStr = !inStr;
        else if (!inStr) {
          if (c === '{') d++;
          else if (c === '}') { d--; if (d === 0) { end = j; break; } }
        }
      }
      if (end > 0) {
        try { out.push(JSON.parse(text.slice(start, end + 1))); i = end; } catch { /* fragmento não-JSON */ }
      }
    }
    i += mustHave.length;
  }
  return out;
}

const normKey = (s) => slugify(s).replace(/-/g, '');
const titleFromSlug = (slug) => String(slug).split('-').map((w) => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
const brandFromCode = (code) => (/^(BX|UX|CX|BXA|BXG)/i.test(code || '') ? 'TAKARA_TOMY' : /^[GF]\d/i.test(code || '') ? 'HASBRO' : 'OTHER');
const lineFromCode = (code, brand) =>
  /^BX/i.test(code || '') ? 'BX' : /^UX/i.test(code || '') ? 'UX' : /^CX/i.test(code || '') ? 'CX' : brand === 'HASBRO' ? 'HASBRO' : 'OTHER';

// ---------------------------------------------------------------------------
// Produtos (tabelas TT + Hasbro)
// ---------------------------------------------------------------------------

function parseProductRows(text) {
  const out = [];
  // Cada linha da tabela: célula com o código, link com slug e nome, chip de tipo, série
  const rowRe = /"children":"([A-Z0-9-]{2,14})"\}\s*\],\s*\["\$","\$L[0-9a-f]+",null,\{"children":\["\$","\$L\d+",null,\{"href":"\/en\/x\/products\/([^/"]+)\/"/g;
  let m;
  while ((m = rowRe.exec(text))) {
    const code = m[1];
    const slug = m[2];
    const tail = text.slice(m.index, m.index + 1600);
    const name = tail.match(/"children":"([^"]{3,90})"\}\]\}/)?.[1] || null;
    const chips = [...tail.matchAll(/"children":"([^"]{3,40})"\}\]?\}\]/g)].map((x) => x[1]);
    const typeChip = chips.find((c) => /(Starter|Booster|Random Booster|Set|Stadium|Launcher|Grip|Accessory|Customize|Entry|Anniversary|Tool)/i.test(c));
    const seriesChip = tail.match(/"children":"((?:Basic|Unique|Custom|X Over|Others|Multipack)[^"]{0,40})"/)?.[1] || null;
    if (!name) continue;
    out.push({ code, slug, name, type: typeChip || null, series: seriesChip });
  }
  return out;
}

const categoryOf = (type) => {
  const t = String(type || '').toLowerCase();
  if (t.includes('random booster')) return 'RANDOM_BOOSTER';
  if (t.includes('booster')) return 'BOOSTER';
  if (t.includes('starter') || t.includes('entry')) return 'STARTER';
  if (t.includes('set') || t.includes('multipack') || t.includes('anniversary')) return 'SET';
  if (t) return 'ACCESSORY';
  return null;
};

/** Acha (ou cria) um produto pelo slug da BeyCommunity / código / nome. */
async function upsertProduct(rec, brandHint) {
  const brand = brandFromCode(rec.code) === 'OTHER' && brandHint ? brandHint : brandFromCode(rec.code);
  let product =
    (rec.slug && (await prisma.product.findFirst({ where: { bcSlug: rec.slug } }))) ||
    (rec.code && (await prisma.product.findFirst({ where: { code: rec.code.toUpperCase() } }))) ||
    (rec.name && (await prisma.product.findFirst({ where: { slug: slugify(rec.name) } }))) ||
    (rec.slug && (await prisma.product.findFirst({ where: { slug: rec.slug } })));

  const data = {
    bcSlug: rec.slug || undefined,
    code: rec.code ? rec.code.toUpperCase() : undefined,
    brand,
    line: lineFromCode(rec.code, brand),
    ...(rec.name ? { name: rec.name } : {}),
    ...(categoryOf(rec.type) ? { category: categoryOf(rec.type) } : {}),
    ...(rec.series ? { notes: rec.series } : {}),
  };
  if (product) {
    // não sobrescreve nome/categoria que o admin possa ter ajustado à mão, só completa
    const patch = { bcSlug: data.bcSlug, line: product.line ?? data.line };
    if (!product.code && data.code) patch.code = data.code;
    if (product.brand === 'OTHER' && brand !== 'OTHER') patch.brand = brand;
    if (!product.category && data.category) patch.category = data.category;
    if (!product.notes && data.notes) patch.notes = data.notes;
    return { product: await prisma.product.update({ where: { id: product.id }, data: patch }), created: false };
  }
  let slug = rec.slug || slugify(`${rec.code || ''} ${rec.name || ''}`);
  if (await prisma.product.findUnique({ where: { slug } })) slug = `${slug}-${(rec.code || 'x').toLowerCase()}`;
  return {
    product: await prisma.product.create({
      data: {
        slug,
        name: rec.name || (rec.slug ? titleFromSlug(rec.slug) : rec.code),
        code: data.code || null,
        brand,
        line: data.line,
        category: data.category ?? null,
        notes: data.notes ?? null,
        bcSlug: rec.slug || null,
      },
    }),
    created: true,
  };
}

export async function syncBCProducts() {
  let created = 0, updated = 0;
  for (const [url, brandHint] of [[`${BASE}/products/`, 'TAKARA_TOMY'], [`${BASE}/hasbro/`, 'HASBRO']]) {
    const rows = parseProductRows(flightText(await fetchHtml(url)));
    for (const rec of rows) {
      try {
        const r = await upsertProduct(rec, brandHint);
        r.created ? created++ : updated++;
      } catch { /* linha ruim não derruba o sync */ }
    }
    if (!rows.length) throw new Error(`Nenhum produto extraído de ${url} (layout mudou?)`);
  }
  return { created, updated };
}

// ---------------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------------

const JSON_CATEGORIES = [
  ['bits', 'BIT'],
  ['blades', 'BLADE'],
  ['ratchets', 'RATCHET'],
];
const CARD_CATEGORIES = [
  ['lock-chips', 'LOCK_CHIP', null],
  ['assist-blades', 'ASSIST_BLADE', null],
  ['main-blades', 'MAIN_BLADE', null],
  ['metal-blades', 'MAIN_BLADE', null], // Metal Blades CX Expand (Blitz etc.)
  ['over-blades', 'OVER_BLADE', null],
  ['ribs', 'BIT', 'RIB'], // Ratchet-Integrated Bits (Turbo, Operate)
];

function parseCardCategory(text, path) {
  const out = [];
  const re = new RegExp(`"href":"/en/x/${path}/([^/"]+)/"`, 'g');
  let m;
  while ((m = re.exec(text))) {
    const tail = text.slice(m.index, m.index + 900);
    const img = tail.match(/"src":"(https:\/\/cdn\.shopify\.com[^"]+)"/)?.[1] || null;
    const name = tail.match(/"alt":"([^"]+)"/)?.[1] || titleFromSlug(m[1]);
    if (!out.some((x) => x.slug === m[1])) out.push({ slug: m[1], name, image: img });
  }
  return out;
}

async function loadPartIndex() {
  const parts = await prisma.part.findMany({ where: { parentId: null } });
  const byKey = new Map();
  const byBcSlug = new Map();
  const register = (p) => {
    if (p.bcSlug) byBcSlug.set(p.bcSlug, p);
    let aliases = [];
    try { aliases = JSON.parse(p.aliasesJson); } catch {}
    for (const n of [p.name, p.displayName, ...aliases]) {
      const k = normKey(n);
      if (k && !byKey.has(k)) byKey.set(k, p);
    }
  };
  parts.forEach(register);
  return { parts, byKey, byBcSlug, register };
}

async function upsertBCPart(idx, kind, rec, subKind = null) {
  rec.slug = rec.slug || slugify(rec.name); // ratchets não têm slug no payload
  const existing =
    idx.byBcSlug.get(rec.slug) ||
    idx.byKey.get(normKey(rec.name)) ||
    null;

  const stats = rec.attack != null || rec.defense != null || rec.stamina != null
    ? { atk: rec.attack ?? undefined, def: rec.defense ?? undefined, sta: rec.stamina ?? undefined, dash: rec.dash ?? undefined, burst: rec.burst_resistance ?? undefined }
    : null;
  const images = (rec.variants || []).map((v) => v.image_url).filter(Boolean);
  const image = rec.image || images[0] || null;

  if (existing) {
    const data = { bcSlug: rec.slug };
    // stats da BeyCommunity são mais completos (dash/burst): mescla por cima
    if (stats) {
      let old = {};
      try { old = JSON.parse(existing.statsJson || '{}') || {}; } catch {}
      data.statsJson = JSON.stringify({ ...old, ...Object.fromEntries(Object.entries(stats).filter(([, v]) => v != null)) });
    }
    if (rec.weight != null) data.weightGrams = rec.weight;
    if (images.length) data.imagesJson = JSON.stringify(images.slice(0, 12));
    // imagem principal: melhora, mas nunca sobrescreve upload manual do admin
    if (image && (!existing.imageUrl || !existing.imageUrl.startsWith('/uploads/'))) data.imageUrl = image;
    if (!existing.type && rec.type) data.type = rec.type;
    const updated = await prisma.part.update({ where: { id: existing.id }, data });
    Object.assign(existing, updated);
    idx.register(existing);
    return { part: existing, created: false };
  }

  let slug = slugify(rec.name) || rec.slug;
  if (await prisma.part.findUnique({ where: { slug } })) slug = `${kind.toLowerCase().replace('_', '-')}-${slug}`;
  const created = await prisma.part.create({
    data: {
      slug,
      kind,
      subKind,
      name: rec.name,
      displayName: rec.name,
      type: rec.type || null,
      statsJson: stats ? JSON.stringify(stats) : null,
      weightGrams: rec.weight ?? null,
      imageUrl: image,
      imagesJson: JSON.stringify(images.slice(0, 12)),
      bcSlug: rec.slug,
      source: 'beycommunity',
    },
  });
  idx.parts.push(created);
  idx.register(created);
  return { part: created, created: true };
}

export async function syncBCParts() {
  const idx = await loadPartIndex();
  let created = 0, updated = 0, linked = 0;
  const productCache = new Map(); // bcSlug -> product.id

  async function linkProducts(part, products) {
    for (const pr of products || []) {
      if (!pr?.slug) continue;
      let productId = productCache.get(pr.slug);
      if (!productId) {
        const { product } = await upsertProduct({ slug: pr.slug, code: pr.code, name: null }, null);
        productId = product.id;
        productCache.set(pr.slug, productId);
      }
      await prisma.productPart.upsert({
        where: { productId_partId: { productId, partId: part.id } },
        update: {},
        create: { productId, partId: part.id },
      });
      linked++;
    }
  }

  for (const [path, kind] of JSON_CATEGORIES) {
    const text = flightText(await fetchHtml(`${BASE}/${path}/`));
    const entities = extractObjects(text, '"variants"').filter((o) => o.name && Array.isArray(o.variants));
    for (const rec of entities) {
      try {
        const r = await upsertBCPart(idx, kind, rec);
        r.created ? created++ : updated++;
        await linkProducts(r.part, rec.products);
      } catch { /* segue */ }
    }
  }
  for (const [path, kind, subKind] of CARD_CATEGORIES) {
    const text = flightText(await fetchHtml(`${BASE}/${path}/`));
    for (const rec of parseCardCategory(text, path)) {
      try {
        const r = await upsertBCPart(idx, kind, rec, subKind);
        r.created ? created++ : updated++;
      } catch { /* segue */ }
    }
  }
  return { created, updated, linked };
}

/**
 * Foto da caixa + data de lançamento: só existem na página individual de cada
 * produto (og:image e releaseDate no payload). Visita apenas os que ainda não
 * têm, com 4 requisições em paralelo.
 */
export async function syncBCProductDetails({ limit = 400 } = {}) {
  const pending = await prisma.product.findMany({
    where: { bcSlug: { not: null }, OR: [{ imageUrl: null }, { releaseDate: null }] },
    take: limit,
  });
  let updated = 0, failed = 0;
  const queue = [...pending];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const p = queue.shift();
      try {
        const html = await fetchHtml(`${BASE}/products/${p.bcSlug}/`);
        const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || null;
        const rel = html.match(/releaseDate\\?":\\?"(\d{4}-\d{2}-\d{2})/)?.[1] || null;
        const data = {};
        if (og && !p.imageUrl) data.imageUrl = og;
        if (rel && !p.releaseDate) data.releaseDate = new Date(`${rel}T00:00:00Z`);
        if (Object.keys(data).length) {
          await prisma.product.update({ where: { id: p.id }, data });
          updated++;
        }
      } catch {
        failed++;
      }
    }
  }));
  return { scanned: pending.length, updated, failed };
}

export async function syncBeyCommunity() {
  const products = await syncBCProducts();
  const parts = await syncBCParts();
  const details = await syncBCProductDetails();
  await prisma.syncLog.create({
    data: {
      source: 'BeyCommunity (banco completo)',
      ok: true,
      message: `produtos +${products.created}/${products.updated} • peças +${parts.created}/${parts.updated} • ${parts.linked} vínculos • fotos/datas de ${details.updated} produtos${details.failed ? ` (${details.failed} falharam)` : ''}`,
    },
  });
  return { products, parts, details };
}
