import { prisma } from './db.js';
import { slugify } from './util.js';
import { extractEmbeddedCatalog, mapKind } from './catalog-data.js';
import { DEFAULTS, setSetting } from './settings.js';

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
  ['SolEclipse', 'Sol Eclipse', 'Balance'],
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
await seedMetaBlades();
await seedCosmetics();
await seedSettings();
await prisma.$disconnect();
console.log('Seed concluído.');
