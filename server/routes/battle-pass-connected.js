import {Router} from 'express';
import {createHash} from 'node:crypto';
import {prisma} from '../db.js';
import {requireUser} from '../auth.js';
import {activeTraining,trainingSnapshot,trainingChanged,listenTraining,captureValid} from '../battle-pass-connected.js';
import {vapidKeys,subscriptionValid,clientIdValid,queuePush} from '../web-push.js';

const router=Router(),ah=handler=>(req,res,next)=>handler(req,res).catch(next);
router.use(['/api/battle-pass/connected','/api/battle-pass/push'],requireUser,(req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(req.method!=='GET' && req.body?.accountId!==req.user.id)return res.status(409).json({error:'Sua conta mudou. Recarregue a página.'});
  const origin=req.headers.origin;if(origin && (!URL.canParse(origin) || new URL(origin).host!==req.headers.host))return res.status(403).json({error:'Origem inválida.'});
  next();
});
router.get('/api/battle-pass/connected',ah(async(req,res)=>res.json({sessions:await activeTraining(req.user.id)})));
router.get('/api/battle-pass/connected/sessions/:id',ah(async(req,res)=>{
  const session=await trainingSnapshot(req.user.id,req.params.id);if(!session)return res.status(404).json({error:'Sessão não encontrada.'});res.json({session});
}));
router.get('/api/battle-pass/connected/events',ah(async(req,res)=>{
  const userId=req.user.id,tokenHash=createHash('sha256').update(req.cookies?.bx_session??'').digest('hex');
  res.status(200).set({'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no','Cache-Control':'no-store, no-transform'});res.flushHeaders();
  let timer;const send=payload=>{if(!res.destroyed){res.write('data: '+JSON.stringify(payload)+'\n\n');res.flush?.();}};
  const authorized=async()=>{const auth=await prisma.authSession.findUnique({where:{tokenHash},include:{user:{select:{status:true}}}});return auth && auth.userId===userId && auth.expiresAt>new Date() && auth.user.status==='ACTIVE';};
  const unlisten=listenTraining(userId,payload=>{authorized().then(valid=>{if(valid)send(payload);else res.end();}).catch(()=>res.end());});
  req.on('close',()=>{clearInterval(timer);unlisten();});
  send({type:'hello',sessions:await activeTraining(userId)});
  if(res.destroyed){unlisten();return;}
  timer=setInterval(async()=>{
    try{const auth=await prisma.authSession.findUnique({where:{tokenHash},include:{user:{select:{status:true}}}});
      if(!auth || auth.userId!==userId || auth.expiresAt<=new Date() || auth.user.status!=='ACTIVE'){res.end();return;}
      res.write(': heartbeat\n\n');res.flush?.();
    }catch{res.end();}
  },20000);timer.unref?.();
}));
router.post('/api/battle-pass/connected/presence',ah(async(req,res)=>{
  if(!captureValid(req.body) || typeof req.body.id!=='string')return res.status(422).json({error:'Sessão inválida.'});
  const changed=await prisma.battlePassTraining.updateMany({where:{id:req.body.id,userId:req.user.id,captureClientId:req.body.clientId,endedAt:null},data:{liveSeenAt:new Date(),captureBladeId:req.body.bladeId??null,...(req.body.deviceName?{captureDeviceName:req.body.deviceName}:{}),...(req.body.ended===true?{endedAt:new Date()}:{})}});
  if(!changed.count)return res.status(404).json({error:'Sessão não encontrada.'});
  await trainingChanged(req.user.id,req.body.id);res.json({ok:true});
}));
router.get('/api/battle-pass/push',ah(async(req,res)=>{
  const keys=await vapidKeys();const enabled=clientIdValid(req.query.installationId)?!!await prisma.webPushSubscription.findFirst({where:{userId:req.user.id,installationId:req.query.installationId}}):false;
  res.json({publicKey:keys.publicKey,enabled});
}));
router.post('/api/battle-pass/push',ah(async(req,res)=>{
  const {subscription,installationId}=req.body;
  if(!clientIdValid(installationId) || !subscriptionValid(subscription))return res.status(422).json({error:'Inscrição de notificações inválida.'});
  const tokenHash=createHash('sha256').update(req.cookies?.bx_session??'').digest('hex');
  const auth=await prisma.authSession.findUnique({where:{tokenHash}});if(!auth || auth.userId!==req.user.id)return res.sendStatus(401);
  if(await prisma.webPushSubscription.count({where:{userId:req.user.id}})>=10 && !await prisma.webPushSubscription.findFirst({where:{userId:req.user.id,installationId}}))return res.status(422).json({error:'Limite de aparelhos atingido.'});
  await prisma.$transaction(async tx=>{
    await tx.webPushSubscription.deleteMany({where:{OR:[{userId:req.user.id,installationId},{endpoint:subscription.endpoint}]}});
    await tx.webPushSubscription.create({data:{userId:req.user.id,authSessionId:auth.id,installationId,endpoint:subscription.endpoint,p256dh:subscription.keys.p256dh,auth:subscription.keys.auth}});
  });res.json({enabled:true});
}));
router.delete('/api/battle-pass/push',ah(async(req,res)=>{
  if(!clientIdValid(req.body.installationId))return res.status(422).json({error:'Aparelho inválido.'});
  await prisma.webPushSubscription.deleteMany({where:{userId:req.user.id,installationId:req.body.installationId}});res.json({enabled:false});
}));
router.post('/api/battle-pass/push/test',ah(async(req,res)=>{
  await queuePush(req.user.id,'test-'+Math.floor(Date.now()/15000),{type:'battle-pass-test',title:'BX Lab · Notificações ativas',body:'Os próximos lançamentos chegam por aqui.',url:'/battle-pass',icon:'/assets/pwa/icon-192.png',at:new Date()});res.json({ok:true});
}));
export default router;
