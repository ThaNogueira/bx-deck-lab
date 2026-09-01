import { prisma } from './db.js';
import { syncProducts } from './sync.js';

const result = await syncProducts();
console.log(`Sync concluído: ${result.created} criados, ${result.updated} atualizados.`);
await prisma.$disconnect();
