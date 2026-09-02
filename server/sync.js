import { prisma } from './db.js';
import { slugify } from './util.js';
import { mapKind } from './catalog-data.js';
import { syncProductCombos } from './beycommunity.js';

/**
 * Sincronização do catálogo de PRODUTOS com as listas públicas da
 * BeyCommunity (Takara Tomy + Hasbro) — porta do parser que o frontend já
 * usava (parseBeyCommunityProducts), rodando no servidor via r.jina.ai
 * (que expõe as tabelas como Markdown). Item 2.8: o admin dispara e vê o log.
 */

const SOURCES = [
  { brand: 'TAKARA_TOMY', url: 'https://beycommunity.com/en/x/products/' },
  { brand: 'HASBRO', url: 'https://beycommunity.com/en/x/hasbro/' },
];

const stripMd = (v) =>
  String(v || '')
    .replace(/<br\s*\/?>/gi, ' / ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#]/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function fetchRemoteText(url) {
  // r.jina.ai primeiro: os parsers do servidor esperam Markdown, não HTML.
  const attempts = [`https://r.jina.ai/${url}`, url];
  let last;
  for (const target of attempts) {
    try {
      const r = await fetch(target, {
        headers: { Accept: 'text/plain,text/html,*/*' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const t = await r.text();
      if (t.length > 80) return t;
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error('Fonte indisponível');
}

function parseProducts(text, brand) {
  const out = [];
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const heading = raw.trim().match(/^##\s+(.+)/);
    if (heading) {
      section = stripMd(heading[1]).trim();
      continue;
    }
    const line = stripMd(raw).trim();
    if (!line.includes('|')) continue;
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(stripMd).map((x) => x.trim()).filter(Boolean);
    if (cells.length < 3 || /^code$/i.test(cells[0]) || /^[-: ]+$/.test(cells[0])) continue;
    const code = cells[0];
    if (!/(?:BX|UX|CX|BXC|BXG|BXH|G|F)[A-Z0-9-]*/i.test(code || '')) continue;
    const typeRe = /^(Starter|Booster|Random Booster|Deck Set|Battle Set|Multipack Sets|Entry Set|Customize Set|Anniversary|Stadium|Launcher|Grip|Accessory|Blade|Bit|Tool)$/i;
    let typeIndex = -1;
    for (let i = 2; i < cells.length; i++) {
      if (typeRe.test(cells[i])) { typeIndex = i; break; }
    }
    if (typeIndex < 2) continue;
    const name = cells.slice(1, typeIndex).join(' | ');
    const type = cells[typeIndex];
    if (!name) continue;
    out.push({ brand, code: code.toUpperCase(), name, type, section });
  }
  return out;
}

const lineOf = (code, brand) => {
  if (/^BX/i.test(code)) return 'BX';
  if (/^UX/i.test(code)) return 'UX';
  if (/^CX/i.test(code)) return 'CX';
  return brand === 'HASBRO' ? 'HASBRO' : 'OTHER';
};

const categoryOf = (type) => {
  const t = String(type || '').toLowerCase();
  if (t.includes('random booster')) return 'RANDOM_BOOSTER';
  if (t.includes('booster')) return 'BOOSTER';
  if (t.includes('starter') || t.includes('entry')) return 'STARTER';
  if (t.includes('set') || t.includes('multipack') || t.includes('anniversary')) return 'SET';
  return 'ACCESSORY';
};

// ---------------------------------------------------------------------------
// Peças: Byyblade X HQ (stats de blades/ratchets/bits) + BeybladeHub
// (nomes canônicos e IMAGENS) — porta dos parsers do frontend.
// ---------------------------------------------------------------------------

const PART_SOURCES = {
  byy: 'https://byybladebuilder.com/parts',
  hubBlades: 'https://beybladehub.app/parts/blades',
  hubRatchets: 'https://beybladehub.app/parts/ratchets',
  hubBits: 'https://beybladehub.app/parts/bits',
};

const normKey = (s) => slugify(s).replace(/-/g, '');
const parseStatsCell = (v) => {
  const m = String(v || '').match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  return m ? { atk: +m[1], def: +m[2], sta: +m[3] } : null;
};
const inferType = (stats) => {
  if (!stats) return '';
  const a = +stats.atk || 0, d = +stats.def || 0, st = +stats.sta || 0;
  const sorted = [a, d, st].sort((x, y) => y - x);
  if (sorted[0] - sorted[1] <= Math.max(3, sorted[0] * 0.12)) return 'Balance';
  return sorted[0] === a ? 'Attack' : sorted[0] === d ? 'Defense' : 'Stamina';
};

function extractImages(text) {
  const out = [];
  let m;
  const md = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+[^)]*)?\)/g;
  while ((m = md.exec(text))) out.push({ alt: stripMd(m[1]), url: m[2], pos: m.index });
  return out;
}
const HUB_TYPE = (raw) => /攻擊/.test(raw) ? 'Attack' : /防守/.test(raw) ? 'Defense' : /持久/.test(raw) ? 'Stamina' : /均衡/.test(raw) ? 'Balance' : '';
function hubEnglishName(block) {
  for (const line of block.split(/\r?\n/).map(stripMd).map((x) => x.trim()).filter(Boolean)) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9 .&'’\-]{1,48}?)(?=[぀-ヿ])/);
    if (m && !/^(Image|Right|Left|Attack|Defense|Stamina|Balance)$/i.test(m[1].trim())) return m[1].trim();
  }
  return '';
}

/** Byyblade X HQ: tabelas completas de blades, ratchets e bits com stats. */
function parseByyParts(text) {
  const out = [];
  let section = '', pending = '', bladeType = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/All Beyblade X Blades/i.test(line)) { section = 'blade'; pending = ''; bladeType = ''; continue; }
    if (/All Beyblade X Ratchets/i.test(line)) { section = 'ratchet'; pending = ''; continue; }
    if (/All Beyblade X Bits/i.test(line)) { section = 'bit'; pending = ''; continue; }
    if (section === 'blade') {
      const tm = stripMd(line).match(/^(Attack|Defense|Stamina|Balance) Type Blades/i);
      if (tm) { bladeType = tm[1][0].toUpperCase() + tm[1].slice(1).toLowerCase(); pending = ''; continue; }
    }
    if (!line.includes('|')) {
      if (section === 'blade' && line && !/^[-#]/.test(line) && line.length < 80) pending = stripMd(line);
      continue;
    }
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(stripMd);
    if (cells.some((x) => /ATK\/DEF\/STA|---/.test(x))) continue;
    if (section === 'blade' && cells.length >= 6) {
      let name = cells[0];
      const aliases = [];
      if (/^Hasbro:/i.test(name)) { aliases.push(name.replace(/^Hasbro:\s*/i, '')); name = pending || aliases[0]; }
      else {
        const hm = name.match(/Hasbro:\s*([^/]+)/i);
        if (hm) aliases.push(hm[1].trim());
        name = name.split(/Hasbro:/i)[0].replace(/\s*\/\s*$/, '').trim();
      }
      const stats = parseStatsCell(cells[2]);
      if (!name || !stats) continue;
      const notes = cells.slice(6).join(' ');
      const integrated = /ratchet[- ]integrated|integrated.*ratchet/i.test(notes);
      out.push({ kind: integrated ? 'integrated' : 'blade', name, aliases, type: bladeType || inferType(stats), stats, note: [cells[5], notes].filter(Boolean).join(' — ').slice(0, 900) });
      pending = '';
    } else if (section === 'ratchet' && cells.length >= 6 && /^[0-9M]+-\d{2}$/i.test(cells[0])) {
      out.push({ kind: 'ratchet', name: cells[0], abbrev: cells[0], stats: parseStatsCell(cells[3]), note: cells.slice(6).join(' ').slice(0, 900) });
    } else if (section === 'bit' && cells.length >= 9) {
      const name = cells[0], abbr = cells[1];
      if (!name || !abbr || !/^[A-Za-z]{1,3}$/.test(abbr)) continue;
      const stats = parseStatsCell(cells[4]);
      if (stats) stats.dash = parseFloat(cells[5]) || 0;
      const integrated = /Ratchet-Integrated/i.test(cells.slice(8).join(' '));
      out.push({ kind: integrated ? 'rib' : 'bit', name, abbrev: abbr, type: cells[3] || inferType(stats), stats, behavior: (cells.slice(9).join(' ') || cells[8] || '').slice(0, 900), banned: abbr.toUpperCase() === 'MN' });
    }
  }
  return out;
}

/** BeybladeHub: um card por peça, com imagem — a melhor fonte de fotos. */
function parseHubCatalog(text, which) {
  const imgs = extractImages(text);
  const out = [];
  for (let i = 0; i < imgs.length; i++) {
    const im = imgs[i];
    const end = imgs[i + 1]?.pos || Math.min(text.length, im.pos + 1400);
    const block = text.slice(im.pos, Math.min(end, im.pos + 1400));
    if (which === 'blades') {
      if (!/(上蓋|blade|fused|重量)/i.test(im.alt || '')) continue;
      const name = hubEnglishName(block);
      if (!name) continue;
      const integrated = /Fused|Ratchet[- ]Integrated|一體型|一体型/i.test(block);
      out.push({ kind: integrated ? 'integrated' : 'blade', name, image: im.url });
    } else if (which === 'ratchets') {
      if (!/ratchet/i.test(im.alt || '')) continue;
      const m = block.match(/\b([0-9M]+-\d{2})\b/i);
      if (m) out.push({ kind: 'ratchet', name: m[1].toUpperCase(), abbrev: m[1].toUpperCase(), image: im.url });
    } else if (which === 'bits') {
      const am = (im.alt || '').match(/^([A-Za-z]{1,3})\s+bit/i);
      if (!am) continue;
      const name = hubEnglishName(block) || am[1];
      const integrated = /Fused|Ratchet[- ]Integrated|一體型|一体型/i.test(block);
      out.push({ kind: integrated ? 'rib' : 'bit', name, abbrev: am[1].toUpperCase(), type: HUB_TYPE(block), image: im.url });
    }
  }
  return out;
}

/** Índice em memória de todas as peças por nome/alias normalizado. */
async function loadPartIndex() {
  const parts = await prisma.part.findMany({ where: { parentId: null } });
  const byKey = new Map();
  const register = (p) => {
    let aliases = [];
    try { aliases = JSON.parse(p.aliasesJson); } catch {}
    for (const n of [p.name, p.displayName, ...aliases]) {
      const k = normKey(n);
      if (k && !byKey.has(k)) byKey.set(k, p);
    }
  };
  parts.forEach(register);
  return { parts, byKey, register };
}

async function upsertPartRecord(idx, rec) {
  const { kind, subKind } = mapKind(rec.kind);
  const keys = [rec.name, ...(rec.aliases || [])].map(normKey).filter(Boolean);
  let existing = null;
  for (const k of keys) { if (idx.byKey.has(k)) { existing = idx.byKey.get(k); break; } }
  // Bits também casam pela sigla (H = Hexa)
  if (!existing && rec.abbrev && ['bit', 'rib', 'ratchet'].includes(rec.kind)) {
    existing = idx.parts.find((p) => p.kind === kind && (p.abbrev || '').toUpperCase() === rec.abbrev.toUpperCase());
  }

  if (existing) {
    const data = {};
    let aliases = [];
    try { aliases = JSON.parse(existing.aliasesJson); } catch {}
    const known = new Set([existing.name, existing.displayName, ...aliases].map(normKey));
    const fresh = [rec.name, ...(rec.aliases || [])].filter((n) => n && !known.has(normKey(n)));
    if (fresh.length) data.aliasesJson = JSON.stringify([...aliases, ...fresh].slice(0, 12));
    if (!existing.statsJson && rec.stats) data.statsJson = JSON.stringify(rec.stats);
    if (!existing.type && rec.type) data.type = rec.type;
    if (!existing.imageUrl && rec.image) data.imageUrl = rec.image;
    if (!existing.abbrev && rec.abbrev) data.abbrev = rec.abbrev;
    if (!existing.note && rec.note) data.note = rec.note;
    if (!existing.behavior && rec.behavior) data.behavior = rec.behavior;
    if (rec.banned) data.banned = true;
    if (!Object.keys(data).length) return 'kept';
    const updated = await prisma.part.update({ where: { id: existing.id }, data });
    Object.assign(existing, updated);
    idx.register(existing);
    return 'updated';
  }

  let slug = slugify(rec.name);
  if (!slug) return 'kept';
  if (await prisma.part.findUnique({ where: { slug } })) slug = slugify(`${kind.toLowerCase()}-${rec.name}`);
  const created = await prisma.part.create({
    data: {
      slug,
      kind,
      subKind,
      name: rec.name,
      displayName: rec.name,
      aliasesJson: JSON.stringify(rec.aliases || []),
      abbrev: rec.abbrev || null,
      type: rec.type || null,
      statsJson: rec.stats ? JSON.stringify(rec.stats) : null,
      note: rec.note || null,
      behavior: rec.behavior || null,
      imageUrl: rec.image || null,
      banned: !!rec.banned,
      source: 'sync',
    },
  });
  idx.parts.push(created);
  idx.register(created);
  return 'created';
}

export async function syncParts() {
  const jobs = await Promise.allSettled([
    fetchRemoteText(PART_SOURCES.byy),
    fetchRemoteText(PART_SOURCES.hubBlades),
    fetchRemoteText(PART_SOURCES.hubRatchets),
    fetchRemoteText(PART_SOURCES.hubBits),
  ]);
  const records = [];
  if (jobs[0].status === 'fulfilled') records.push(...parseByyParts(jobs[0].value));
  if (jobs[1].status === 'fulfilled') records.push(...parseHubCatalog(jobs[1].value, 'blades'));
  if (jobs[2].status === 'fulfilled') records.push(...parseHubCatalog(jobs[2].value, 'ratchets'));
  if (jobs[3].status === 'fulfilled') records.push(...parseHubCatalog(jobs[3].value, 'bits'));

  const sourcesOk = jobs.filter((j) => j.status === 'fulfilled').length;
  if (!records.length) {
    await prisma.syncLog.create({ data: { source: 'peças (Byyblade HQ + BeybladeHub)', ok: false, message: `Nenhuma peça extraída (${sourcesOk}/4 fontes responderam)` } });
    return { created: 0, updated: 0 };
  }
  const idx = await loadPartIndex();
  let created = 0, updated = 0;
  for (const rec of records) {
    try {
      const r = await upsertPartRecord(idx, rec);
      if (r === 'created') created++;
      if (r === 'updated') updated++;
    } catch { /* segue para a próxima peça */ }
  }
  await prisma.syncLog.create({
    data: { source: 'peças (Byyblade HQ + BeybladeHub)', ok: true, message: `${records.length} registros de ${sourcesOk}/4 fontes — ${created} peças novas, ${updated} enriquecidas (stats/imagens/apelidos)` },
  });
  return { created, updated };
}

/**
 * Vincula automaticamente produto → peças pelo nome do produto
 * ("DranSword 3-60F" → Blade DranSword + Ratchet 3-60 + Bit Flat).
 * Só para starters/boosters ainda sem vínculo; o resto fica para o admin.
 */
export async function autoLinkProducts() {
  const idx = await loadPartIndex();
  const bladeKeys = [];
  for (const p of idx.parts) {
    if (p.kind !== 'BLADE') continue;
    let aliases = [];
    try { aliases = JSON.parse(p.aliasesJson); } catch {}
    for (const n of [p.name, p.displayName, ...aliases]) {
      const k = normKey(n);
      if (k.length >= 5) bladeKeys.push([k, p.id]);
    }
  }
  bladeKeys.sort((a, b) => b[0].length - a[0].length);
  const ratchetByCode = new Map(idx.parts.filter((p) => p.kind === 'RATCHET').map((p) => [p.name.toUpperCase(), p.id]));
  const bitByAbbrev = new Map(idx.parts.filter((p) => p.kind === 'BIT' && p.abbrev).map((p) => [p.abbrev.toUpperCase(), p.id]));

  const products = await prisma.product.findMany({
    where: { category: { in: ['STARTER', 'BOOSTER'] }, parts: { none: {} } },
  });
  let linked = 0;
  for (const product of products) {
    const cleanName = product.name.replace(/\([^)]*\)/g, ' ');
    const rm = cleanName.match(/\b([0-9M]-\d{2})\s*([A-Za-z]{1,3})?\b/);
    if (!rm) continue;
    const ratchetId = ratchetByCode.get(rm[1].toUpperCase());
    const bitId = rm[2] ? bitByAbbrev.get(rm[2].toUpperCase()) : null;
    const nameKey = normKey(cleanName.slice(0, rm.index));
    const blade = bladeKeys.find(([k]) => nameKey.includes(k));
    if (!blade || !ratchetId) continue;
    const partIds = [blade[1], ratchetId, ...(bitId ? [bitId] : [])];
    for (const partId of partIds) {
      await prisma.productPart.upsert({
        where: { productId_partId: { productId: product.id, partId } },
        update: {},
        create: { productId: product.id, partId },
      });
    }
    linked++;
  }
  if (linked) {
    await prisma.syncLog.create({ data: { source: 'vínculo produto→peças (automático)', ok: true, message: `${linked} produtos vinculados às suas peças` } });
  }
  return { linked };
}

/**
 * Funde uma peça duplicada na canônica: move vínculos com produtos, itens
 * de coleção (somando), referências em decks/combos e favoritos, preserva
 * os nomes como apelidos e apaga a duplicata. (Mesma regra do merge do admin.)
 */
async function mergeParts(fromId, toId) {
  const [from, to] = await Promise.all([
    prisma.part.findUnique({ where: { id: fromId } }),
    prisma.part.findUnique({ where: { id: toId } }),
  ]);
  if (!from || !to || from.id === to.id) return false;
  for (const link of await prisma.productPart.findMany({ where: { partId: from.id } })) {
    await prisma.productPart.upsert({
      where: { productId_partId: { productId: link.productId, partId: to.id } },
      update: {},
      create: { productId: link.productId, partId: to.id, qty: link.qty },
    });
  }
  for (const item of await prisma.collectionItem.findMany({ where: { partId: from.id } })) {
    const ex = await prisma.collectionItem.findUnique({ where: { userId_partId: { userId: item.userId, partId: to.id } } });
    if (ex) await prisma.collectionItem.update({ where: { id: ex.id }, data: { qty: ex.qty + item.qty } });
    else await prisma.collectionItem.create({ data: { userId: item.userId, partId: to.id, qty: item.qty, forSale: item.forSale, condition: item.condition, priceCents: item.priceCents } });
  }
  for (const d of await prisma.communityDeck.findMany({ where: { beysJson: { contains: from.id } } })) {
    const beys = JSON.parse(d.beysJson).map((bey) => bey.map((id) => (id === from.id ? to.id : id)));
    await prisma.communityDeck.update({ where: { id: d.id }, data: { beysJson: JSON.stringify(beys) } });
  }
  for (const c of await prisma.combo.findMany({ where: { partsJson: { contains: from.id } } })) {
    const parts = JSON.parse(c.partsJson).map((id) => (id === from.id ? to.id : id));
    await prisma.combo.update({ where: { id: c.id }, data: { partsJson: JSON.stringify(parts) } });
  }
  await prisma.user.updateMany({ where: { favoritePartId: from.id }, data: { favoritePartId: to.id } });
  let aliases = [];
  try { aliases = JSON.parse(to.aliasesJson); } catch {}
  let fromAliases = [];
  try { fromAliases = JSON.parse(from.aliasesJson); } catch {}
  const merged = [...new Set([...aliases, from.name, from.displayName, ...fromAliases])]
    .filter((x) => x && x !== to.name && x !== to.displayName);
  await prisma.part.update({
    where: { id: to.id },
    data: {
      aliasesJson: JSON.stringify(merged.slice(0, 12)),
      imageUrl: to.imageUrl || from.imageUrl,
      statsJson: to.statsJson || from.statsJson,
      type: to.type || from.type,
      abbrev: to.abbrev || from.abbrev,
      weightGrams: to.weightGrams ?? from.weightGrams,
      bcSlug: to.bcSlug || from.bcSlug,
    },
  });
  await prisma.part.delete({ where: { id: from.id } });
  return true;
}

/**
 * Duplicatas por grafia entre as fontes (ex.: "Disc Ball" × "Disk Ball"):
 * bits e ratchets que compartilham a mesma sigla/código são a mesma peça.
 * A que tem bcSlug (BeyCommunity) é a canônica; empate → a mais antiga.
 */
export async function dedupeParts() {
  let merged = 0;
  // grafias equivalentes entre fontes (a chave de nome ignora estas diferenças)
  // grafias equivalentes entre fontes: disk/disc, yielding/yield
  const NAME_ALIASES = { yielding: 'yield' };
  const nameKey = (p) => [p.name, p.displayName].map((n) => { const k = normKey(n).replace(/disk/g, 'disc'); return NAME_ALIASES[k] || k; }).find(Boolean) || '';
  for (const kind of ['BIT', 'RATCHET']) {
    const parts = await prisma.part.findMany({ where: { kind, parentId: null }, orderBy: { createdAt: 'asc' } });
    const groups = new Map();
    const add = (key, p) => { if (!key) return; if (!groups.has(key)) groups.set(key, new Set()); groups.get(key).add(p); };
    for (const p of parts) {
      if (p.abbrev) add('A:' + String(p.abbrev).toUpperCase().trim(), p);
      add('N:' + nameKey(p), p);
    }
    for (const [key, set] of groups) groups.set(key, [...set]);
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const canon = group.find((p) => p.bcSlug && p.abbrev) || group.find((p) => p.bcSlug) || group.find((p) => p.abbrev) || group[0];
      for (const dup of group) {
        if (dup.id === canon.id) continue;
        // RIB e bit comum podem dividir sigla legitimamente — só funde o mesmo subtipo
        if ((dup.subKind || null) !== (canon.subKind || null)) continue;
        if (!(await prisma.part.findUnique({ where: { id: dup.id } }))) continue; // já fundida por outro grupo
        if (!(await prisma.part.findUnique({ where: { id: canon.id } }))) continue;
        if (await mergeParts(dup.id, canon.id)) merged++;
      }
    }
  }
  if (merged) {
    await prisma.syncLog.create({ data: { source: 'dedupe de peças (mesma sigla)', ok: true, message: `${merged} duplicata(s) fundida(s)` } });
  }
  return { merged };
}

/**
 * Recolors como peças-filhas: para cada peça-pai com 2+ imagens (galeria da
 * BeyCommunity), garante uma peça-filha por cor, com id próprio, herdando
 * nome/stats/sigla do pai. Casa pela URL da imagem; nunca apaga filhas (podem
 * estar em coleções/decks). Rótulo padrão "Cor N" (admin pode renomear).
 */
/**
 * Rótulo da cor a partir do nome do arquivo da imagem (BeyCommunity nomeia
 * "0-80-Green.png", "Ratchet-1-60-UX-01.webp", "1-60-CX08.png"...). Remove o
 * nome/sigla da peça e palavras genéricas; o que sobra é a cor/produto.
 */
export function variantLabelFromUrl(url, part) {
  try {
    let f = decodeURIComponent(String(url).split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '');
    f = f.replace(/_[0-9a-f-]{16,}$/i, '').replace(/[_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    const drop = new Set(['ratchet', 'blade', 'bit', 'lock', 'chip', 'assist', 'main', 'over', 'metal', 'rib', 'integrated', 'beyblade', 'x', 'image', 'img', 'png', 'webp']);
    for (const n of [part.displayName, part.name, part.abbrev]) for (const t of String(n || '').toLowerCase().split(/[^a-z0-9]+/)) if (t) drop.add(t);
    // ratchets: "1-60" vira tokens 1 e 60 — remove também a sigla inteira
    let s = f;
    if (part.abbrev) s = s.replace(new RegExp(part.abbrev.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'ig'), ' ');
    const tokens = s.split(/[^A-Za-z0-9]+/).filter((t) => t && !drop.has(t.toLowerCase()));
    if (!tokens.length || tokens.every((t) => /^\d+$/.test(t))) return null;
    let label = tokens.join(' ').replace(/\b(BX|UX|CX|G)\s?(\d{1,4})\b/gi, (_, a, b) => `${a.toUpperCase()}-${b}`);
    label = label.replace(/\b([a-z])/g, (m) => m.toUpperCase()).trim();
    return label.length > 1 && label.length <= 40 ? label : null;
  } catch { return null; }
}

export async function syncVariants() {
  const parents = await prisma.part.findMany({ where: { parentId: null } });
  const children = await prisma.part.findMany({ where: { parentId: { not: null } } });
  const byParent = new Map();
  for (const c of children) { if (!byParent.has(c.parentId)) byParent.set(c.parentId, []); byParent.get(c.parentId).push(c); }
  let created = 0, updated = 0;
  for (const p of parents) {
    let imgs = [];
    try { imgs = JSON.parse(p.imagesJson || '[]'); } catch {}
    const urls = [...new Set([p.imageUrl, ...imgs].filter(Boolean))];
    if (urls.length < 2) continue;
    const mine = byParent.get(p.id) || [];
    for (let n = 0; n < urls.length; n++) {
      const url = urls[n];
      const inherit = {
        kind: p.kind, subKind: p.subKind, name: p.name, displayName: p.displayName, abbrev: p.abbrev,
        type: p.type, statsJson: p.statsJson, weightGrams: p.weightGrams, banned: p.banned, hidden: p.hidden,
        variantOrder: n, imageUrl: url, aliasesJson: '[]', source: 'variante',
      };
      const autoLabel = variantLabelFromUrl(url, p) || `Cor ${n + 1}`;
      const ex = mine.find((c) => c.imageUrl === url);
      if (ex) {
        // rótulo automático só substitui rótulo automático (admin pode ter renomeado)
        if (!ex.variantLabel || /^Cor \d+$/.test(ex.variantLabel)) inherit.variantLabel = autoLabel;
        await prisma.part.update({ where: { id: ex.id }, data: inherit }); updated++; continue;
      }
      let slug = `${p.slug}-cor-${n + 1}`;
      if (await prisma.part.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
      await prisma.part.create({ data: { ...inherit, slug, parentId: p.id, variantLabel: autoLabel } });
      created++;
    }
  }
  if (created) await prisma.syncLog.create({ data: { source: 'recolors (peças-filhas)', ok: true, message: `${created} cor(es) nova(s)` } });
  return { created, updated };
}

/** Sincronização completa: BeyCommunity (banco inteiro) + enriquecimento. */
export async function syncAll(actor = null) {
  // 1) BeyCommunity: produtos com código + peças com stats/peso/variantes e
  //    a relação peça↔produto oficial deles
  let bc = { products: { created: 0, updated: 0 }, parts: { created: 0, updated: 0, linked: 0 } };
  try {
    const { syncBeyCommunity } = await import('./beycommunity.js');
    bc = await syncBeyCommunity();
  } catch (e) {
    await prisma.syncLog.create({ data: { source: 'BeyCommunity (banco completo)', ok: false, message: String(e?.message || e).slice(0, 400) } });
  }
  // 2) Enriquecimento: stats do Byyblade HQ + imagens do BeybladeHub para o
  //    que ficou sem, e apelidos Hasbro
  const parts = await syncParts();
  // 3) Vínculo heurístico para produtos que ainda ficaram órfãos
  const links = await autoLinkProducts();
  const dedupe = await dedupeParts();
  const variants = await syncVariants();
  let combos = { scanned: 0, linked: 0, failed: 0 };
  try { combos = await syncProductCombos(); } catch (e) { await prisma.syncLog.create({ data: { source: 'cores por produto', ok: false, message: String(e.message || e) } }); }
  return {
    dedupe,
    variants,
    combos,
    products: bc.products,
    parts: {
      created: bc.parts.created + parts.created,
      updated: bc.parts.updated + parts.updated,
    },
    links: { linked: (bc.parts.linked || 0) + links.linked },
    created: bc.products.created + bc.parts.created + parts.created,
    updated: bc.products.updated + bc.parts.updated + parts.updated,
  };
}

/** Auto-sync: no boot (se o último sync ok tiver mais de 24h) e a cada 24h. */
export function scheduleAutoSync() {
  const run = async () => {
    try {
      // recolors (peças-filhas) são derivadas do que já está no banco: garante sempre, é barato
      const v = await syncVariants();
      if (v.created) console.log('[sync] recolors: +' + v.created + ' cor(es) como peças-filhas');
      const last = await prisma.syncLog.findFirst({ where: { ok: true }, orderBy: { createdAt: 'desc' } });
      if (last && Date.now() - last.createdAt.getTime() < 24 * 3600e3) return;
      console.log('[sync] catálogo com mais de 24h — sincronizando…');
      const r = await syncAll();
      console.log(`[sync] ok: +${r.created} novos, ${r.updated} atualizados, ${r.links.linked} produtos vinculados`);
    } catch (e) {
      console.error('[sync]', e);
    }
  };
  setTimeout(run, 5000).unref();
  setInterval(run, 6 * 3600e3).unref();
}

export async function syncProducts(actor = null) {
  let createdTotal = 0;
  let updatedTotal = 0;
  for (const src of SOURCES) {
    try {
      const text = await fetchRemoteText(src.url);
      const items = parseProducts(text, src.brand);
      if (!items.length) throw new Error('Parser não encontrou produtos (formato da fonte mudou?)');
      let created = 0;
      let updated = 0;
      for (const item of items) {
        const existing = await prisma.product.findFirst({ where: { brand: item.brand, code: item.code } });
        if (existing) {
          if (existing.name !== item.name) {
            await prisma.product.update({ where: { id: existing.id }, data: { name: item.name } });
            updated++;
          }
          continue;
        }
        // Produto do seed sem código pode ser o mesmo item: casa por nome.
        const byName = await prisma.product.findFirst({ where: { slug: slugify(item.name) } });
        if (byName && !byName.code) {
          await prisma.product.update({
            where: { id: byName.id },
            data: { code: item.code, brand: item.brand, line: lineOf(item.code, item.brand), category: categoryOf(item.type) },
          });
          updated++;
          continue;
        }
        let slug = slugify(`${item.brand === 'HASBRO' ? 'hasbro-' : ''}${item.code}-${item.name}`).slice(0, 80);
        if (await prisma.product.findUnique({ where: { slug } })) slug = `${slug}-${Date.now() % 10_000}`;
        await prisma.product.create({
          data: {
            slug,
            code: item.code,
            name: item.name,
            brand: item.brand,
            line: lineOf(item.code, item.brand),
            category: categoryOf(item.type),
            notes: item.section || null,
          },
        });
        created++;
      }
      createdTotal += created;
      updatedTotal += updated;
      await prisma.syncLog.create({
        data: { source: src.url, ok: true, message: `${items.length} itens lidos — ${created} criados, ${updated} atualizados${actor ? ` (por ${actor.name})` : ''}` },
      });
    } catch (e) {
      await prisma.syncLog.create({ data: { source: src.url, ok: false, message: String(e?.message || e).slice(0, 500) } });
    }
  }
  return { created: createdTotal, updated: updatedTotal };
}
