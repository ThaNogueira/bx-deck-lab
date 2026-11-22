import * as webpush from 'web-push';
import {prisma} from './db.js';
import {createHash} from 'node:crypto';

let vapidPromise,running=false,timer,rerun=false;
export const clientIdValid=id=>typeof id==='string' && /^[a-f0-9-]{36}$/i.test(id);
export function subscriptionValid(value) {
  try {
    const url=new URL(value.endpoint),host=url.hostname;
    const provider=host==='fcm.googleapis.com' || host==='updates.push.services.mozilla.com' || host==='web.push.apple.com' || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
    return provider && url.protocol==='https:' && !url.port && !url.username && !url.password && value.endpoint.length<=2048 &&
      /^[\w-]{87}$/.test(value.keys.p256dh) && Buffer.from(value.keys.p256dh,'base64url').length===65 &&
      /^[\w-]{22}$/.test(value.keys.auth) && Buffer.from(value.keys.auth,'base64url').length===16;
  } catch {return false;}
}
export function vapidKeys() {
  return vapidPromise??=(async()=>{
    const row=await prisma.setting.upsert({where:{key:'private.webPushVapid'},update:{},create:{key:'private.webPushVapid',value:JSON.stringify(webpush.generateVAPIDKeys())}});
    return JSON.parse(row.value);
  })().catch(error=>{vapidPromise=null;throw error;});
}
export async function queuePush(userId,eventKey,payload,{now=new Date()}={}) {
  const subscriptions=await prisma.webPushSubscription.findMany({where:{userId,authSession:{expiresAt:{gt:now}},user:{status:'ACTIVE'}},select:{id:true}});
  await prisma.$transaction(subscriptions.map(subscription=>prisma.webPushDelivery.upsert({
    where:{subscriptionId_eventKey:{subscriptionId:subscription.id,eventKey}},update:{},
    create:{subscriptionId:subscription.id,eventKey,payloadJson:JSON.stringify({...payload,userId}),availableAt:now,expiresAt:new Date(now.getTime()+90000)},
  })));
  if(process.env.BX_ISOLATED_TEST!=='1'){if(running)rerun=true;schedulePush(0);}
}
export function schedulePush(delay=10000) {
  clearTimeout(timer);timer=setTimeout(()=>flushPushQueue().catch(()=>{}),delay);timer.unref?.();
}
export async function flushPushQueue({send=(...args)=>webpush.sendNotification(...args),now=new Date()}={}) {
  if(running)return;running=true;
  try {
    await prisma.webPushDelivery.deleteMany({where:{expiresAt:{lte:now}}});
    const pending=await prisma.webPushDelivery.findMany({where:{availableAt:{lte:now}},take:30,orderBy:{availableAt:'asc'},include:{subscription:{include:{authSession:true,user:{select:{status:true}}}}}});
    if(!pending.length)return;
    const keys=await vapidKeys();
    await Promise.all(pending.map(async delivery=>{
      const sub=delivery.subscription;
      if(sub.authSession.expiresAt<=now || sub.user.status!=='ACTIVE') {await prisma.webPushSubscription.deleteMany({where:{id:sub.id}});return;}
      try {
        await send({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},delivery.payloadJson,{
          vapidDetails:{...keys,subject:'https://beyxlab.com.br'},TTL:Math.max(1,Math.floor((delivery.expiresAt-now)/1000)),
          timeout:5000,urgency:'normal',topic:createHash('sha256').update(JSON.parse(delivery.payloadJson).sessionId??delivery.eventKey).digest('base64url').slice(0,32),
        });
        await prisma.webPushDelivery.deleteMany({where:{id:delivery.id}});
      }catch(error){
        if(error.statusCode===404 || error.statusCode===410) await prisma.webPushSubscription.deleteMany({where:{id:sub.id}});
        else if(delivery.attempts>=2 || error.statusCode && error.statusCode<429) await prisma.webPushDelivery.deleteMany({where:{id:delivery.id}});
        else await prisma.webPushDelivery.updateMany({where:{id:delivery.id},data:{attempts:{increment:1},availableAt:new Date(Date.now()+5000*(delivery.attempts+1))}});
      }
    }));
  }finally{running=false;if(process.env.BX_ISOLATED_TEST!=='1'){schedulePush(rerun?0:10000);rerun=false;}}
}
