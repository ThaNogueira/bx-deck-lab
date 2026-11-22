import {prisma} from './db.js';
import {queuePush,clientIdValid} from './web-push.js';

const listeners=new Map();
export function listenTraining(userId,listener) {
  if(!listeners.has(userId))listeners.set(userId,new Set());listeners.get(userId).add(listener);
  return ()=>{const set=listeners.get(userId);set?.delete(listener);if(!set?.size)listeners.delete(userId);};
}
const publish=(userId,payload)=>{for(const listener of listeners.get(userId)??[])listener(payload);};
export const captureValid=value=>value && clientIdValid(value.clientId) && (value.bladeId==null || typeof value.bladeId==='string' && value.bladeId.length<=160) && (value.deviceName==null || typeof value.deviceName==='string' && value.deviceName.length<=40);
export async function trainingSnapshot(userId,id,now=Date.now()) {
  const session=await prisma.battlePassTraining.findFirst({where:{id,userId},include:{launches:{where:{sp:{gt:0}},orderBy:[{epoch:'desc'},{counter:'desc'}],take:60,select:{id:true,sp:true,counter:true,source:true,measuredAt:true}}}});
  if(!session)return null;
  const [stats,blade]=await Promise.all([
    prisma.battlePassLaunch.aggregate({where:{userId,sessionId:id,sp:{gt:0}},_count:{_all:true},_avg:{sp:true},_max:{sp:true}}),
    session.captureBladeId?prisma.part.findFirst({where:{id:session.captureBladeId,kind:'BLADE'},select:{id:true,name:true,displayName:true,imageUrl:true}}):null,
  ]);
  return {id:session.id,clientId:session.captureClientId,deviceName:session.captureDeviceName??'Outro aparelho',startedAt:session.startedAt,endedAt:session.endedAt,lastSeenAt:session.liveSeenAt,
    status:session.endedAt?'ended':session.liveSeenAt && now-session.liveSeenAt.getTime()<60000?'active':'paused',
    count:stats._count._all,average:stats._avg.sp??0,best:stats._max.sp??0,lastSp:session.launches[0]?.sp??null,
    blade:blade?{id:blade.id,name:blade.displayName||blade.name,image:blade.imageUrl}:null,launches:session.launches.reverse()};
}
export async function activeTraining(userId) {
  const sessions=await prisma.battlePassTraining.findMany({where:{userId,endedAt:null,captureClientId:{not:null},liveSeenAt:{gt:new Date(Date.now()-6*3600000)}},orderBy:{liveSeenAt:'desc'},take:6,select:{id:true}});
  return Promise.all(sessions.map(s=>trainingSnapshot(userId,s.id)));
}
export async function trainingChanged(userId,id,{launchId}={}) {
  const session=await trainingSnapshot(userId,id);if(!session)return;
  const latest=session.launches.find(r=>r.id===launchId),fresh=latest?.measuredAt && Date.now()-new Date(latest.measuredAt).getTime()<90000;
  const event={type:fresh?'launch':'session',eventId:fresh?launchId:null,session};publish(userId,event);
  if(fresh) await queuePush(userId,launchId,{type:'battle-pass-launch',eventId:launchId,sessionId:id,sp:latest.sp,
    title:Number(latest.sp).toLocaleString('pt-BR')+' SP · Lançamento',
    body:(session.blade?.name??'Battle Pass')+' · Média '+Math.round(session.average).toLocaleString('pt-BR')+' SP',
    icon:session.blade?.image??'/assets/pwa/icon-192.png',url:'/battle-pass?session='+encodeURIComponent(id),at:latest.measuredAt});
}
