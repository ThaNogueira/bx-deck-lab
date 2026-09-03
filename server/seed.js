import { prisma } from './db.js';
import { slugify } from './util.js';
import { extractEmbeddedCatalog, mapKind } from './catalog-data.js';
import { DEFAULTS, setSetting } from './settings.js';
import { mergeParts } from './sync.js';

const normKey = (s) => slugify(s).replace(/-/g, '');

/**
 * Seed idempotente: peças e produtos do snapshot embutido no app.js,
 * cosméticos padrão e configurações. Rode quantas vezes quiser.
 */

async function seedParts() {
  const { PARTS, STOCK } = extractEmbeddedCatalog();
  const appIdToDbId = new Map();
  let created = 0;

  for (const p of Object.values(PARTS)) {
    const { kind, subKind } = mapKind(p.kind);
    let slug = slugify(p.display || p.name);
    const clash = await prisma.part.findUnique({ where: { slug } });
    const existing = await prisma.part.findFirst({ where: { kind, name: p.name, parentId: null } });
    if (existing) {
      appIdToDbId.set(p.id, existing.id);
      continue;
    }
    if (clash) slug = slugify(`${kind.toLowerCase()}-${p.display || p.name}`);
    const row = await prisma.part.create({
      data: {
        slug,
        kind,
        subKind,
        name: p.name,
        displayName: p.display || p.name,
        aliasesJson: JSON.stringify(p.aliases || []),
        abbrev: p.abbrev || null,
        type: p.type || null,
        statsJson: p.stats ? JSON.stringify(p.stats) : null,
        note: p.note || null,
        behavior: p.behavior || null,
        banned: !!p.banned,
        source: p.source || 'app snapshot',
        imageUrl: p.image || null,
      },
    });
    appIdToDbId.set(p.id, row.id);
    created++;
  }

  let products = 0;
  for (const s of STOCK) {
    const slug = slugify(s.label);
    const exists = await prisma.product.findUnique({ where: { slug } });
    if (exists) continue;
    const product = await prisma.product.create({
      data: {
        slug,
        name: s.label,
        brand: 'OTHER', // snapshot não traz marca/código — sync ou admin completam
        category: 'STARTER',
        beyType: s.type || null,
        line: /custom line/i.test(s.system || '') ? 'CX' : /ux/i.test(s.system || '') ? 'UX' : 'BX',
        notes: s.system || null,
      },
    });
    for (const appPartId of s.pieces || []) {
      const dbId = appIdToDbId.get(appPartId);
      if (dbId) {
        await prisma.productPart.upsert({
          where: { productId_partId: { productId: product.id, partId: dbId } },
          update: {},
          create: { productId: product.id, partId: dbId },
        });
      }
    }
    products++;
  }
  console.log(`Peças novas: ${created} • Produtos novos: ${products}`);
}

/**
 * Peças do snapshot que já existem no banco: completa apelidos, tipo, stats e
 * imagem que faltam, e funde na canônica qualquer outra peça do mesmo tipo cujo
 * nome bata com um apelido declarado (ex.: "Bison Burrow" criada pela
 * sincronização do BeybladeHub é a mesma "Valor Bison" do snapshot). Idempotente.
 */
async function refreshSnapshotParts() {
  const { PARTS } = extractEmbeddedCatalog();
  let enriched = 0, merged = 0;
  for (const p of Object.values(PARTS)) {
    if (p.parentId) continue;
    const { kind, subKind } = mapKind(p.kind);
    const canon = await prisma.part.findFirst({ where: { kind, name: p.name, parentId: null } });
    if (!canon) continue;
    let aliases = [];
    try { aliases = JSON.parse(canon.aliasesJson); } catch {}
    const known = new Set([canon.name, canon.displayName, ...aliases].map(normKey));
    const fresh = [p.display, ...(p.aliases || [])].filter((n) => n && !known.has(normKey(n)));
    const data = {};
    if (fresh.length) data.aliasesJson = JSON.stringify([...aliases, ...fresh].slice(0, 12));
    if (!canon.type && p.type) data.type = p.type;
    if (!canon.statsJson && p.stats) data.statsJson = JSON.stringify(p.stats);
    if (!canon.imageUrl && p.image) data.imageUrl = p.image;
    if (!canon.behavior && p.behavior) data.behavior = p.behavior;
    if (Object.keys(data).length) { await prisma.part.update({ where: { id: canon.id }, data }); enriched++; }
    // duplicatas: outra peça-pai do mesmo tipo com nome/apelido igual a um apelido da canônica
    const keys = new Set([canon.name, canon.displayName, p.display, ...aliases, ...(p.aliases || [])].map(normKey).filter(Boolean));
    const siblings = await prisma.part.findMany({ where: { kind, subKind: subKind ?? null, parentId: null, NOT: { id: canon.id } } });
    for (const s of siblings) {
      let sa = [];
      try { sa = JSON.parse(s.aliasesJson); } catch {}
      if (![s.name, s.displayName, ...sa].some((n) => keys.has(normKey(n)))) continue;
      if (await mergeParts(s.id, canon.id)) { merged++; console.log(`Peça duplicada fundida: ${s.displayName} → ${canon.displayName}`); }
    }
  }
  console.log(`Peças do snapshot completadas: ${enriched} • duplicatas fundidas: ${merged}`);
}

/** Blades de meta citadas nos decks populares, mas fora do snapshot embutido. */
const META_BLADES = [
  ['WizardRod', 'Wizard Rod', 'Stamina'],
  ['DranBuster', 'Buster Dran', 'Attack'],
  ['AeroPegasus', 'Aero Pegasus', 'Attack'],
  ['SharkScale', 'Scale Shark', 'Attack'],
  ['WyvernHover', 'Hover Wyvern', 'Balance'],
  ['SilverWolf', 'Silver Wolf', 'Stamina'],
  ['PhoenixWing', 'Soar Phoenix', 'Attack'],
  ['WhaleWave', 'Wave Whale', 'Balance'],
  ['CobaltDragoon', 'Cobalt Dragoon', 'Balance'],
  ['CobaltDrake', 'Cobalt Drake', 'Attack'],
  ['HellsChain', 'Chain Incendio', 'Balance'],
  ['KnightMail', 'Mail Knight', 'Defense'],
  ['KnightLance', 'Lance Knight', 'Defense'],
  ['TyrannoBeat', 'Beat Tyranno', 'Attack'],
  ['GhostCircle', 'Ghost Circle', 'Stamina'],
  ['ImpactDrake', 'Impact Drake', 'Attack'],
  ['CrimsonGaruda', 'Crimson Garuda', 'Balance'],
  ['SamuraiSaber', 'Samurai Saber', 'Attack'],
  ['ShinobiShadow', 'Shadow Shinobi', 'Stamina'],
];

async function seedMetaBlades() {
  let created = 0;
  for (const [name, display, type] of META_BLADES) {
    const existing = await prisma.part.findFirst({ where: { kind: 'BLADE', name, parentId: null } });
    if (existing) continue;
    let slug = slugify(name);
    if (await prisma.part.findUnique({ where: { slug } })) slug = `blade-${slug}`;
    await prisma.part.create({
      data: {
        slug,
        kind: 'BLADE',
        name,
        displayName: name.replace(/([a-z])([A-Z])/g, '$1 $2'),
        aliasesJson: JSON.stringify([display]),
        type,
        source: 'meta seed',
      },
    });
    created++;
  }
  console.log(`Blades de meta novas: ${created}`);
}

/** Entradas que viraram "peça" por citação em decks mas não são: um bey CX inteiro (Lock Chip + Main Blade). Ficam ocultas. */
const NOT_PARTS = [['BLADE', 'SolEclipse']];
async function hideBogusParts() {
  for (const [kind, name] of NOT_PARTS) {
    const r = await prisma.part.updateMany({ where: { kind, name, parentId: null, hidden: false }, data: { hidden: true } });
    if (r.count) console.log(`Ocultada entrada que não é peça: ${name}`);
  }
}

/** Peças CX que a sincronização antiga do BeybladeHub gravou como Blade: a URL da foto diz o tipo certo. Funde se a peça certa já existir. */
const CX_BY_IMAGE = { chip: 'LOCK_CHIP', main: 'MAIN_BLADE', assist: 'ASSIST_BLADE', over: 'OVER_BLADE', metal: 'MAIN_BLADE' };
async function fixMisfiledCxParts() {
  const rows = await prisma.part.findMany({ where: { kind: 'BLADE', parentId: null, imageUrl: { contains: 'blades-cx/' } } });
  let fixed = 0, merged = 0;
  for (const r of rows) {
    const m = r.imageUrl.match(/blades-cx\/(chip|main|assist|over|metal)-/);
    const kind = m && CX_BY_IMAGE[m[1]];
    if (!kind) continue;
    const keys = new Set([r.name, r.displayName, ...JSON.parse(r.aliasesJson || '[]')].map(normKey));
    const proper = (await prisma.part.findMany({ where: { kind, parentId: null } })).find((p) => [p.name, p.displayName, ...JSON.parse(p.aliasesJson || '[]')].some((n) => keys.has(normKey(n))));
    if (proper) { if (await mergeParts(r.id, proper.id)) merged++; }
    else { await prisma.part.update({ where: { id: r.id }, data: { kind, subKind: null } }); fixed++; }
  }
  if (fixed || merged) console.log(`Peças CX reclassificadas: ${fixed} • fundidas na peça certa: ${merged}`);
}

async function seedCosmetics() {
  const frames = [
    ['Linha X', 'x-line'],
    ['Xtreme Rush', 'xtreme'],
    ['Ember', 'ember'],
    ['Cobalt', 'cobalt'],
    ['Campeão', 'champion'],
    ['Phantom', 'phantom'],
  ];
  const stickers = [
    ['Raio', '⚡'], ['Fogo', '🔥'], ['Vortex', '🌀'], ['Troféu', '🏆'],
    ['Impacto', '💥'], ['Escudo', '🛡️'], ['Estrela', '⭐'], ['Alvo', '🎯'],
  ];
  for (const [name, styleKey] of frames) {
    const found = await prisma.cosmetic.findFirst({ where: { kind: 'FRAME', styleKey } });
    if (!found) {
      await prisma.cosmetic.create({
        data: { kind: 'FRAME', name, styleKey, isDefault: styleKey !== 'champion' },
      });
    }
  }
  for (const [name, emoji] of stickers) {
    const found = await prisma.cosmetic.findFirst({ where: { kind: 'STICKER', styleKey: emoji } });
    if (!found) {
      await prisma.cosmetic.create({ data: { kind: 'STICKER', name, styleKey: emoji, isDefault: true } });
    }
  }
  console.log('Cosméticos ok.');
}

async function seedSettings() {
  for (const key of Object.keys(DEFAULTS)) {
    const row = await prisma.setting.findUnique({ where: { key } });
    if (!row) await setSetting(key, DEFAULTS[key]);
  }
  console.log('Configurações ok.');
}

await seedParts();
await refreshSnapshotParts();
await seedMetaBlades();
await hideBogusParts();
await fixMisfiledCxParts();
await seedCosmetics();
await seedSettings();
await prisma.$disconnect();
console.log('Seed concluído.');
