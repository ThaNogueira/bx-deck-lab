import { prisma } from './db.js';
import { competitionWhere } from './competition-stats.js';
import { calculateRatings } from './rating.js';

// Read-only derived data: no migration, scheduled job, AI call or stale cache.
export async function getCompetitiveLadder() {
  const tournaments = await prisma.tournament.findMany({
    where: { ...competitionWhere, status: 'FINISHED' },
    select: { id: true, slug: true, name: true, startsAt: true, status: true, visibility: true, description: true,
      players: { select: { id: true, userId: true } },
      matches: { select: { id: true, round: true, tableNo: true, p1Id: true, p2Id: true, status: true, winnerId: true } } },
  });
  return calculateRatings(tournaments);
}
