import { prisma } from './db.js';
import { syncAll } from './sync.js';

const r = await syncAll();
console.log(`Sync concluído: produtos +${r.products.created}/${r.products.updated} • peças +${r.parts.created}/${r.parts.updated} • ${r.links.linked} produtos vinculados.`);
await prisma.$disconnect();
