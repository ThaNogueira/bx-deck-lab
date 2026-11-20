import { Router } from 'express';
import { prisma } from '../db.js';
import { requireUser } from '../auth.js';
import { battlePassStats } from '../battle-pass-stats.js';
import { advanceMissions,missionState } from '../battle-pass-missions.js';
import { sessionOverview } from '../battle-pass-sessions.js';

const router = Router();
const ah = handler => (req,res,next)=>handler(req,res).catch(next);
const idPattern = /^[\w-]{8,80}$/;
const validDate = value => typeof value==='string' && Number.isFinite(Date.parse(value));
const bounded = (value,max) => Number.isInteger(value) && value>=0 && value<=max;
const deviceData = value => value && /^[a-f0-9]{64}$/.test(value.key) &&
  typeof value.name==='string' && value.name.length>0 && value.name.length<=80 &&
  (value.localId===undefined || typeof value.localId==='string' && value.localId.length<=200);
const writes = new Map();
async function serialize(userId,action) {
  const previous = writes.get(userId)??Promise.resolve();
  const pending = previous.catch(()=>{}).then(action);
  writes.set(userId,pending);
  try {return await pending;} finally {if(writes.get(userId)===pending) writes.delete(userId);}
}

router.use('/api/battle-pass',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});

router.get('/api/battle-pass/ranking',ah(async(req,res)=>{
  const mode = req.query.sort==='average'?'average':'best';
  const groups = await prisma.battlePassLaunch.groupBy({by:['userId'],
    where:{user:{battlePassPublic:true,status:'ACTIVE'}},having:{sp:{_count:{gte:10}}},
    _max:{sp:true},_avg:{sp:true},_count:{_all:true},
    orderBy:mode==='average'?[{_avg:{sp:'desc'}},{userId:'asc'}]:[{_max:{sp:'desc'}},{userId:'asc'}],take:50});
  const users = await prisma.user.findMany({where:{id:{in:groups.map(g=>g.userId)}},select:{id:true,name:true,slug:true,avatarUrl:true}});
  res.json({sort:mode,minimumLaunches:10,entries:groups.map((g,i)=>({place:i+1,user:users.find(u=>u.id===g.userId),best:g._max.sp,average:g._avg.sp,count:g._count._all}))});
}));

router.use('/api/battle-pass',requireUser,(req,res,next)=>{
  if (req.method!=='GET' && req.body?.accountId!==req.user.id) return res.status(409).json({error:'Sua conta mudou. Recarregue a página para continuar.'});
  next();
});

router.patch('/api/battle-pass/preferences',ah(async(req,res)=>{
  if (typeof req.body.public!=='boolean') return res.status(422).json({error:'Preferência inválida.'});
  await prisma.user.update({where:{id:req.user.id},data:{battlePassPublic:req.body.public}});
  res.json({public:req.body.public});
}));

router.get('/api/battle-pass/missions',ah(async(req,res)=>res.json(await missionState(req.user.id))));
router.post('/api/battle-pass/missions/ack',ah(async(req,res)=>{
  if(!Array.isArray(req.body.ids) || req.body.ids.length>100 || req.body.ids.some(id=>typeof id!=='string' || id.length>80)) return res.status(422).json({error:'Conquistas inválidas.'});
  await prisma.battlePassMissionReward.updateMany({where:{userId:req.user.id,id:{in:req.body.ids},announcedAt:null},data:{announcedAt:new Date()}});
  res.json({ok:true});
}));

router.get('/api/battle-pass',ah(async(req,res)=>{
  const userId = req.user.id, page = Math.max(1,Math.min(100000,Number(req.query.page)||1));
  const [summary,total,sessions,devices,user] = await Promise.all([
    battlePassStats(userId),
    prisma.battlePassTraining.count({where:{userId}}),
    prisma.battlePassTraining.findMany({where:{userId},orderBy:[{startedAt:'desc'},{id:'desc'}],skip:(Math.floor(page)-1)*10,take:10,
      include:{device:{select:{name:true}},launches:{orderBy:[{epoch:'desc'},{counter:'desc'}],take:30}}}),
    prisma.battlePassDevice.findMany({where:{userId},select:{key:true,name:true,lastCounter:true,epoch:true,lastUsedAt:true}}),
    prisma.user.findUnique({where:{id:userId},select:{battlePassPublic:true}}),
  ]);
  const live=await prisma.battlePassLaunch.groupBy({by:['sessionId'],where:{userId,source:'live',sessionId:{in:sessions.map(s=>s.id)}},_count:{_all:true},_avg:{sp:true},_max:{sp:true}});
  res.json({summary,public:user.battlePassPublic,sessions:sessions.map(s=>{const stats=live.find(v=>v.sessionId===s.id);return {...s,liveCount:stats?._count._all??0,liveAverageSp:stats?._avg.sp??0,liveBestSp:stats?._max.sp??0};}),devices,total,page:Math.floor(page),pages:Math.max(1,Math.ceil(total/10))});
}));

router.get('/api/battle-pass/sessions/:id',ah(async(req,res)=>{
  const session = await prisma.battlePassTraining.findFirst({where:{id:req.params.id,userId:req.user.id}});
  if (!session) return res.status(404).json({error:'Sessão não encontrada.'});
  const page = Math.max(1,Math.min(100000,Math.floor(Number(req.query.page)||1)));
  const launches = await prisma.battlePassLaunch.findMany({where:{sessionId:session.id,userId:req.user.id},orderBy:[{epoch:'desc'},{counter:'desc'}],skip:(page-1)*30,take:30});
  res.json({launches,page,pages:Math.max(1,Math.ceil(session.launchCount/30))});
}));

router.get('/api/battle-pass/sessions/:id/overview',ah(async(req,res)=>{
  const result=await sessionOverview(req.user.id,req.params.id);
  if(!result)return res.status(404).json({error:'Sessão não encontrada.'});
  res.json(result);
}));

router.post('/api/battle-pass/devices',ah(async(req,res)=>{
  const device = req.body;
  if (!deviceData(device)) return res.status(422).json({error:'Dispositivo inválido.'});
  const result = await prisma.battlePassDevice.upsert({
    where:{userId_key:{userId:req.user.id,key:device.key}},
    create:{userId:req.user.id,key:device.key,name:device.name,localId:device.localId},
    update:{name:device.name,localId:device.localId,lastUsedAt:new Date()},
  });
  res.json({counter:result.lastCounter,epoch:result.epoch});
}));

router.post('/api/battle-pass/sync',ah(async(req,res)=>{
  const {device,session,launches} = req.body??{}, userId = req.user.id;
  if (!deviceData(device) || !session || !idPattern.test(session.id) ||
    !validDate(session.startedAt) || session.endedAt!==null && !validDate(session.endedAt) ||
    !Array.isArray(launches) || launches.length>100 || req.body.simulated) {
    return res.status(422).json({error:'Sessão inválida.'});
  }
  const start = new Date(session.startedAt), end = session.endedAt ? new Date(session.endedAt) : null;
  if (start.getTime()>Date.now()+300000 || end && end<start) return res.status(422).json({error:'Datas da sessão inválidas.'});
  for (const row of launches) {
    if (!bounded(row.sp,65535) || !row.sp || !bounded(row.counter,65535) || !bounded(row.epoch,1000000) ||
      !['live','history'].includes(row.source) || row.source==='history' && row.measuredAt!==null ||
      row.source==='live' && (!validDate(row.measuredAt) || Date.parse(row.measuredAt)>Date.now()+300000) ||
      row.simulated || row.combo!==undefined && (typeof row.combo!=='string' || row.combo.length>200)) {
      return res.status(422).json({error:'Lançamento inválido.'});
    }
  }
  const result = await serialize(userId,()=>prisma.$transaction(async tx=>{
    const dev = await tx.battlePassDevice.upsert({where:{userId_key:{userId,key:device.key}},
      create:{userId,key:device.key,name:device.name,localId:device.localId},
      update:{lastUsedAt:new Date()}});
    const existing = await tx.battlePassTraining.findUnique({where:{id:session.id}});
    if (existing && (existing.userId!==userId || existing.deviceId!==dev.id)) return {forbidden:true};
    const accountProgress=await tx.battlePassProgress.findUnique({where:{userId}});
    const training = await tx.battlePassTraining.upsert({where:{id:session.id},
      create:{id:session.id,userId,deviceId:dev.id,startedAt:start,endedAt:end,startXp:accountProgress?.totalXp??0,lastXp:accountProgress?.totalXp??0},
      update:{...(end?{endedAt:end}:{})}});
    let inserted = 0;const fresh=[];
    for (const row of launches) {
      const identity = {userId,deviceId:dev.id,epoch:row.epoch,counter:row.counter};
      const saved = await tx.battlePassLaunch.findUnique({where:{userId_deviceId_epoch_counter:identity}});
      if (saved) {
        if (saved.sp!==row.sp) throw Object.assign(new Error('O contador já possui outro SP. Reconecte e leia o histórico.'),{battlePassConflict:true});
        continue;
      }
      fresh.push(await tx.battlePassLaunch.create({data:{...identity,sessionId:training.id,sp:row.sp,source:row.source,
        measuredAt:row.measuredAt ? new Date(row.measuredAt) : null,comboJson:row.combo?JSON.stringify({label:row.combo}):null}}));
      inserted++;
    }
    const stats = await tx.battlePassLaunch.aggregate({where:{sessionId:training.id},_count:{_all:true},_avg:{sp:true},_max:{sp:true}});
    await tx.battlePassTraining.update({where:{id:training.id},data:{
      launchCount:stats._count._all,averageSp:stats._avg.sp??0,bestSp:stats._max.sp??0}});
    const latest = await tx.battlePassLaunch.findFirst({where:{userId,deviceId:dev.id},orderBy:[{epoch:'desc'},{counter:'desc'}]});
    if (latest) await tx.battlePassDevice.update({where:{id:dev.id},data:{lastCounter:latest.counter,epoch:latest.epoch}});
    const progression=await advanceMissions(tx,userId,fresh,new Date(),training.id);
    await tx.battlePassTraining.update({where:{id:training.id},data:{lastXp:progression?.totalXp??accountProgress?.totalXp??0}});
    return {inserted,progression};
  })).catch(error=>{
    if (error.battlePassConflict) return {conflict:error.message};
    throw error;
  });
  if (result.forbidden) return res.status(403).json({error:'Esta sessão pertence a outra conta ou dispositivo.'});
  if (result.conflict) return res.status(409).json({error:result.conflict});
  res.json(result);
}));

export default router;
