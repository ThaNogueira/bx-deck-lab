import {prisma} from './db.js';
import {ALL_MISSION_RULES,levelProgress} from '../public/js/battle-pass/mission-rules.mjs';
import {summarizeSession} from '../public/js/battle-pass/session-stats.mjs';

export async function sessionOverview(userId,id) {
  const session=await prisma.battlePassTraining.findFirst({where:{id,userId},include:{
    launches:{orderBy:[{epoch:'asc'},{counter:'asc'}],select:{sp:true,source:true,measuredAt:true}},
    missionRewards:{orderBy:{awardedAt:'asc'}},gains:{orderBy:[{createdAt:'asc'},{id:'asc'}]},
  }});
  if(!session)return null;
  const firstLive=session.launches.filter(r=>r.source==='live' && r.measuredAt).map(r=>r.measuredAt.getTime()).sort((a,b)=>a-b)[0];
  const [previous,user,progress,previousRecord]=await Promise.all([
    prisma.battlePassTraining.findMany({where:{userId,OR:[{startedAt:{lt:session.startedAt}},{startedAt:session.startedAt,id:{lt:id}}],launches:{some:{source:'live'}}},
      orderBy:[{startedAt:'desc'},{id:'desc'}],take:5,include:{launches:{where:{source:'live'},select:{sp:true,source:true,measuredAt:true}}}}),
    prisma.user.findUnique({where:{id:userId},select:{name:true,slug:true,avatarUrl:true}}),
    prisma.battlePassProgress.findUnique({where:{userId}}),
    prisma.battlePassLaunch.aggregate({where:{userId,OR:[
      {sessionId:{not:id},source:'live',measuredAt:{lt:new Date(firstLive??session.startedAt)}},
      {source:'history',session:{startedAt:{lte:session.startedAt}}},
    ]},_max:{sp:true}}),
  ]);
  const summaries=previous.map(p=>{const summary=summarizeSession(p,p.launches);return {id:p.id,startedAt:p.startedAt,...summary.stats};});
  const overview=summarizeSession(session,session.launches,summaries),events=session.gains.map(g=>({at:g.createdAt,xpBefore:g.xpBefore,xpAfter:g.xpAfter,fromLevel:levelProgress(g.xpBefore).level,toLevel:levelProgress(g.xpAfter).level}));
  const levels=[...new Set(events.flatMap(e=>Array.from({length:e.toLevel-e.fromLevel},(_,i)=>e.fromLevel+i+1)))].sort((a,b)=>a-b);
  const rewards=session.missionRewards.map(r=>({id:r.id,title:r.missionTitle??ALL_MISSION_RULES.find(m=>m.id===r.missionKey)?.title??'Missão concluída',description:r.missionDescription??'',xp:r.xp,insignias:r.insignias,cadence:r.cadence,at:r.awardedAt}));
  return {...overview,user:{...user,level:levelProgress(progress?.totalXp??0).level},
    record:{previousBest:previousRecord._max.sp??0,isNew:overview.stats.liveCount>0 && previousRecord._max.sp>0 && overview.stats.best>previousRecord._max.sp},
    progression:{tracked:session.startXp!==null,xp:rewards.reduce((sum,r)=>sum+r.xp,0),insignias:rewards.reduce((sum,r)=>sum+r.insignias,0),
      missions:rewards.length,startLevel:session.startXp===null?null:levelProgress(session.startXp).level,endLevel:session.lastXp===null?null:levelProgress(session.lastXp).level,
      levels,rewards,events}};
}
