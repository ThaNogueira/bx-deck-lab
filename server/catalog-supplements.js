import { prisma } from './db.js';

// Correções verificadas que a fonte principal ainda não disponibiliza.
// A cor é filha da Aero Pegasus: não é uma Blade nova e não duplica stats.
export const AERO_BX53 = {
  slug: 'aero-pegasus-bx53-blue-cyan',
  label: 'Azul / Ciano · BX-53',
  image: '/assets/parts/aero-pegasus-bx53.webp',
  renderSource: 'https://img.beybladehub.app/blades-color/ArPg-bx53-blue-cyan_7we.webp',
  catalogSource: 'https://beybladehub.app/en/parts/combos/BX-53',
  officialSource: 'https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx53.html',
};

export const ECLIPSE_RENDER = {
  image: '/assets/parts/eclipse.webp',
  source: 'https://img.beybladehub.app/blades-cx/main-Ec.webp',
};

export async function applyCatalogSupplements(db = prisma) {
  return db.$transaction(async tx => {
    const eclipse = await tx.part.updateMany({ where: { kind: 'MAIN_BLADE', name: 'Eclipse', parentId: null,
      OR: [{ imageUrl: null }, { imageUrl: ECLIPSE_RENDER.source }] },
    data: { imageUrl: ECLIPSE_RENDER.image } });
    const parent = await tx.part.findFirst({ where: { kind: 'BLADE', parentId: null,
      name: { in: ['AeroPegasus', 'Aero Pegasus'] } }, orderBy: { createdAt: 'asc' } });
    let variant = null;
    if (parent) {
      const previous = await tx.part.findUnique({ where: { slug: AERO_BX53.slug } });
      const fields = { kind: parent.kind, subKind: parent.subKind, parentId: parent.id,
        name: parent.name, displayName: parent.displayName, type: parent.type,
        statsJson: parent.statsJson, weightGrams: parent.weightGrams,
        variantLabel: AERO_BX53.label, variantOrder: 20,
        imageUrl: previous?.imageUrl?.startsWith('/uploads/') ? previous.imageUrl : AERO_BX53.image,
        source: AERO_BX53.catalogSource };
      variant = await tx.part.upsert({ where: { slug: AERO_BX53.slug },
        create: { ...fields, slug: AERO_BX53.slug }, update: fields });
      const product = await tx.product.findFirst({ where: { code: 'BX-53' } });
      if (product) {
        // O vínculo antigo do BX-53 apontava para o render da Aero original.
        // Corrige só o vínculo do produto; preserva peças e decks existentes.
        const siblings = await tx.part.findMany({ where: { parentId: parent.id, id: { not: variant.id } }, select: { id: true } });
        await tx.productPart.deleteMany({ where: { productId: product.id, partId: { in: siblings.map(p => p.id) } } });
        await tx.productPart.upsert({ where: { productId_partId: { productId: product.id, partId: variant.id } },
          create: { productId: product.id, partId: variant.id }, update: {} });
      }
    }
    // Placeholders e URLs antigas da wiki não são renders de recolors.
    // Preserva os IDs usados em decks/coleções e mostra o render de referência.
    const broken = await tx.part.findMany({ where: { parentId: { not: null }, imageUrl: { in: [
      '/coming.png',
      'https://static.wikia.nocookie.net/beyblade/images/5/5f/BladeDranSword.png',
      'https://static.wikia.nocookie.net/beyblade/images/4/46/Ratchet4-60.png',
      'https://static.wikia.nocookie.net/beyblade/images/a/ad/BitTaper.png',
    ] } }, include: { parent: true } });
    let repairedVariants = 0;
    for (const child of broken) {
      if (!child.parent?.imageUrl || child.parent.imageUrl === child.imageUrl) continue;
      await tx.part.update({ where: { id: child.id }, data: { imageUrl: child.parent.imageUrl,
        ...(['Coming', 'Bi Aper'].includes(child.variantLabel) ? { variantLabel: 'Sem cor definida' } : {}) } });
      repairedVariants++;
    }
    // Esta URL da wiki responde 403; o Hub tem render da mesma peça.
    const repaired = await tx.part.updateMany({ where: { kind: 'BLADE', parentId: null,
      name: 'Tusk Mammoth', imageUrl: { startsWith: 'https://static.wikia.nocookie.net/beyblade/images/e/e2/Tusk_Mammoth_' } },
    data: { imageUrl: 'https://img.beybladehub.app/blades-db/MmTs.webp' } });
    return { aeroVariant: variant?.id || null, repairedImages: repaired.count + repairedVariants + eclipse.count };
  });
}
