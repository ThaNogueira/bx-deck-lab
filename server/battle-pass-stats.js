import { prisma } from './db.js';

export async function battlePassStats(userId) {
  const [stats,sessions,live,recent] = await Promise.all([
    prisma.battlePassLaunch.aggregate({where:{userId},_count:{_all:true},_avg:{sp:true},_min:{sp:true},_max:{sp:true}}),
    prisma.battlePassTraining.count({where:{userId,launchCount:{gt:0}}}),
    prisma.battlePassLaunch.count({where:{userId,source:'live'}}),
    prisma.battlePassLaunch.findMany({where:{userId},orderBy:[{syncedAt:'desc'},{epoch:'desc'},{counter:'desc'}],take:20,select:{sp:true,measuredAt:true,source:true}}),
  ]);
  const values = recent.slice(0,10).map(r=>r.sp), previous = recent.slice(10).map(r=>r.sp);
  const average = list=>list.length?list.reduce((a,b)=>a+b,0)/list.length:0;
  const recentAverage = average(values), previousAverage = average(previous);
  const deviation = values.length?Math.sqrt(average(values.map(sp=>(sp-recentAverage)**2))):0;
  return {count:stats._count._all,average:stats._avg.sp??0,best:stats._max.sp??0,minimum:stats._min.sp??0,
    sessions,live,imported:stats._count._all-live,recentAverage,
    variation:values.length>=2 && recentAverage?Math.round(deviation/recentAverage*100):null,
    trend:values.length===10 && previous.length===10 && previousAverage?(recentAverage-previousAverage)/previousAverage*100:null,
    recent:recent.reverse(),lastSp:recent.at(-1)?.sp??null};
}
