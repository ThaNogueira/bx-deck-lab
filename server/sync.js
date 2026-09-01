import { prisma } from './db.js';
import { slugify } from './util.js';

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
  const attempts = [url, `https://r.jina.ai/${url}`];
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
