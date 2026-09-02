import { Router } from 'express';
import { prisma } from '../db.js';
import { isStaff } from '../auth.js';
import { googleSearchUrl, json, KIND_ORDER } from '../util.js';

const router = Router();
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);

export function partDto(p) {
  return {
    id: p.id,
    slug: p.slug,
    kind: p.kind,
    subKind: p.subKind,
    name: p.name,
    displayName: p.displayName,
    aliases: json(p.aliasesJson, []),
    abbrev: p.abbrev,
    type: p.type,
    stats: json(p.statsJson, null),
    note: p.note,
    behavior: p.behavior,
    imageUrl: p.imageUrl,
    images: json(p.imagesJson, []),
    weightGrams: p.weightGrams,
    banned: p.banned,
    hidden: p.hidden,
    parentId: p.parentId || null,
    variantLabel: p.variantLabel || null,
    variantOrder: p.variantOrder || 0,
  };
}

/** Recolor (peça-filha) em formato compacto. */
export const variantDto = (c) => ({ id: c.id, slug: c.slug, imageUrl: c.imageUrl, label: c.variantLabel || 'Cor', order: c.variantOrder || 0 });

/** Anexa `variants` (peças-filhas) a uma lista de peças-pai. */
export async function withVariants(parts) {
  const ids = parts.map((p) => p.id);
  if (!ids.length) return [];
  const kids = await prisma.part.findMany({ where: { parentId: { in: ids } }, orderBy: { variantOrder: 'asc' } });
  return parts.map((p) => ({ ...partDto(p), variants: kids.filter((k) => k.parentId === p.id).map(variantDto) }));
}

export function productDto(p) {
  return {
    id: p.id,
    slug: p.slug,
    code: p.code,
    line: p.line,
    name: p.name,
    brand: p.brand,
    category: p.category,
    beyType: p.beyType,
    imageUrl: p.imageUrl,
    releaseDate: p.releaseDate,
    hidden: p.hidden,
    notes: p.notes,
    googleUrl: googleSearchUrl(p.name, p.brand),
  };
}

/** Índice compacto para o componente PartTag (item 11) — cache 60s. */
let indexCache = { at: 0, body: null };
router.get('/api/parts-index', ah(async (_req, res) => {
  if (Date.now() - indexCache.at > 60_000) {
    const parts = await prisma.part.findMany({ where: { hidden: false } });
    indexCache = {
      at: Date.now(),
      body: parts.map((p) => ({
        id: p.id, slug: p.slug, kind: p.kind, subKind: p.subKind,
        name: p.name, display: p.displayName, aliases: json(p.aliasesJson, []),
        abbrev: p.abbrev, type: p.type, img: p.imageUrl,
        parentId: p.parentId || null, variantLabel: p.variantLabel || null,
      })),
    };
  }
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ parts: indexCache.body });
}));

export function invalidatePartsIndex() {
  indexCache = { at: 0, body: null };
}

router.get('/api/parts', ah(async (req, res) => {
  const { query = '', kind = '', all = '' } = req.query;
  const where = {};
  if (!isStaff(req.user)) where.hidden = false;
  if (kind && KIND_ORDER.includes(String(kind))) where.kind = String(kind);
  if (all !== '1') where.parentId = null; // catálogo lista só as peças-pai (recolors vêm em `variants`)
  let parts = await prisma.part.findMany({ where, orderBy: [{ kind: 'asc' }, { displayName: 'asc' }] });
  const q = String(query).toLowerCase().trim();
  if (q) {
    parts = parts.filter((p) =>
      [p.name, p.displayName, p.abbrev, ...json(p.aliasesJson, [])]
        .some((v) => v && String(v).toLowerCase().includes(q)),
    );
  }
  res.json({ parts: all === '1' ? parts.map(partDto) : await withVariants(parts) });
}));

router.get('/api/parts/:slug', ah(async (req, res) => {
  let part = await prisma.part.findUnique({
    where: { slug: req.params.slug },
    include: { products: { include: { product: true } } },
  });
  let selectedVariant = null;
  if (part?.parentId) { // slug de uma cor → página da peça-pai com a cor pré-selecionada
    selectedVariant = part.id;
    part = await prisma.part.findUnique({ where: { id: part.parentId }, include: { products: { include: { product: true } } } });
  }
  if (!part || (part.hidden && !isStaff(req.user))) return res.status(404).json({ error: 'Peça não encontrada.' });
  const [withKids] = await withVariants([part]);
  // produtos em que cada COR aparece (vínculos das peças-filhas)
  if (withKids.variants.length) {
    const kidLinks = await prisma.productPart.findMany({ where: { partId: { in: withKids.variants.map((v) => v.id) } }, include: { product: true } });
    for (const v of withKids.variants) {
      v.products = kidLinks.filter((l) => l.partId === v.id && (!l.product.hidden || isStaff(req.user)))
        .map((l) => ({ id: l.product.id, slug: l.product.slug, code: l.product.code, name: l.product.name, imageUrl: l.product.imageUrl, googleUrl: googleSearchUrl(l.product.name, l.product.brand) }));
    }
    // a lista geral de produtos da peça inclui também os produtos das cores
    for (const l of kidLinks) if (!part.products.some((pp) => pp.product.id === l.productId)) part.products.push({ product: l.product });
  }
  const products = part.products
    .map((pp) => pp.product)
    .filter((p) => !p.hidden || isStaff(req.user))
    .sort((a, b) => (a.line || 'Z').localeCompare(b.line || 'Z') || (a.code || '').localeCompare(b.code || ''));
  res.json({ part: withKids, selectedVariant, products: products.map(productDto) });
}));

const LINE_RANK = { BX: 0, UX: 1, CX: 2, HASBRO: 3, OTHER: 4 };
const codeNum = (code) => {
  const m = String(code || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 9999;
};

router.get('/api/products', ah(async (req, res) => {
  const { query = '', line = '', brand = '' } = req.query;
  const where = {};
  if (!isStaff(req.user)) where.hidden = false;
  if (line) where.line = String(line);
  if (brand) where.brand = String(brand);
  let products = await prisma.product.findMany({ where });
  const q = String(query).toLowerCase().trim();
  if (q) {
    products = products.filter((p) =>
      [p.name, p.code, p.notes].some((v) => v && String(v).toLowerCase().includes(q)),
    );
  }
  // Ordem por linha e número: BX-01, BX-02… UX-01… CX-01… (item 6)
  products.sort((a, b) =>
    (LINE_RANK[a.line] ?? 9) - (LINE_RANK[b.line] ?? 9) ||
    codeNum(a.code) - codeNum(b.code) ||
    a.name.localeCompare(b.name),
  );
  res.json({ products: products.map(productDto) });
}));

router.get('/api/products/:slug', ah(async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { slug: req.params.slug },
    include: { parts: { include: { part: true } } },
  });
  if (!product || (product.hidden && !isStaff(req.user))) return res.status(404).json({ error: 'Produto não encontrado.' });
  // "Contém essas peças", agrupado na ordem de montagem (item 6).
  // Quando o produto já tem a COR específica (peça-filha), a peça-pai genérica sai da lista.
  const withColor = new Set(product.parts.filter((pp) => pp.part.parentId).map((pp) => pp.part.parentId));
  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    parts: product.parts
      .filter((pp) => pp.part.kind === kind && (!pp.part.hidden || isStaff(req.user)) && !(!pp.part.parentId && withColor.has(pp.part.id)))
      .map((pp) => ({ ...partDto(pp.part), qty: pp.qty })),
  })).filter((g) => g.parts.length > 0);
  res.json({ product: productDto(product), partsByKind: grouped });
}));

export default router;
