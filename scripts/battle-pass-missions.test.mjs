import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {MISSION_RULES,levelProgress,xpForNextLevel,levelColor} from '../public/js/battle-pass/mission-rules.mjs';
const temp=mkdtempSync(path.join(tmpdir(),'bx-missions-'));
new DatabaseSync(path.join(temp,'qa.db')).close();
process.env.DATABASE_URL='file:'+path.join(temp,'qa.db').replaceAll('\\','/');process.env.NODE_ENV='test';process.env.BX_ISOLATED_TEST='1';
const migrated=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:process.env,encoding:'utf8'});
assert.equal(migrated.status,0,migrated.stderr);
const {prisma}=await import('../server/db.js');
const {missionPeriods,advanceMissions,missionState}=await import('../server/battle-pass-missions.js');
const {default:express}=await import('express');
const {default:router}=await import('../server/routes/battle-pass.js');

test('XP curve increases, starts at level 1 and caps at 100; each level has its own color',()=>{
  assert.equal(levelProgress().level,1);assert.equal(levelProgress(99).level,1);assert.equal(levelProgress(100).level,2);
  let total=0;
  for(let level=1;level<100;level++){if(level>1)assert.ok(xpForNextLevel(level)>xpForNextLevel(level-1));total+=xpForNextLevel(level);}
  assert.equal(levelProgress(total-1).level,99);assert.equal(levelProgress(total).level,100);
  assert.equal(levelProgress(total+1000000).level,100);assert.equal(levelProgress(total).percent,100);assert.equal(levelProgress(total).next,0);
  assert.ok(xpForNextLevel(99)>xpForNextLevel(1)*100);
  assert.equal(new Set(Array.from({length:100},(_,i)=>levelColor(i+1))).size,100);
  assert.equal(MISSION_RULES.length,12);
});
test('calendar resets at São Paulo midnight, Mondays and month boundaries',()=>{
  const before=missionPeriods(new Date('2026-11-23T02:59:59Z')),after=missionPeriods(new Date('2026-11-23T03:00:00Z'));
  assert.equal(before[0].key,'2026-11-22');assert.equal(before[1].key,'2026-11-16');
  assert.equal(after[0].key,'2026-11-23');assert.equal(after[1].key,'2026-11-23');
  assert.equal(before[0].resetsAt,'2026-11-23T03:00:00.000Z');
  assert.equal(missionPeriods(new Date('2026-12-01T02:59:59Z'))[2].key,'2026-11');
  assert.equal(missionPeriods(new Date('2026-12-01T03:00:00Z'))[2].key,'2026-12');
  assert.equal(missionPeriods(new Date('2028-02-28T12:00:00Z'))[2].resetsAt,'2028-03-01T03:00:00.000Z');
});
test('mission API rewards fresh live launches exactly once, excludes history and isolates accounts',async()=>{
  const a=await prisma.user.create({data:{name:'Mission A',email:'a@mission.invalid',slug:'mission-a'}});
  const b=await prisma.user.create({data:{name:'Mission B',email:'b@mission.invalid',slug:'mission-b'}});
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user=req.headers['x-qa-user']===a.id?a:req.headers['x-qa-user']===b.id?b:null;next();});app.use(router);
  app.use((error,_req,res,_next)=>res.status(500).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
  const api=async(path,{who=a.id,method='GET',body}={})=>{
    const r=await fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{'Content-Type':'application/json',...(who?{'x-qa-user':who}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:r.status,data:await r.json()};
  };
  try {
    assert.equal((await api('/api/battle-pass/missions',{who:null})).status,401);
    const initial=(await api('/api/battle-pass/missions')).data;
    assert.equal(initial.level,1);assert.equal(initial.totalXp,0);assert.equal(initial.periods.length,3);
    const at=new Date().toISOString(),device={key:'a'.repeat(64),name:'BEYBLADE_TOOL01'};
    const body={accountId:a.id,device,session:{id:'missions-live-001',startedAt:at,endedAt:null},launches:Array.from({length:30},(_,i)=>({sp:5000,counter:i+1,epoch:0,source:'live',measuredAt:at}))};
    const below=await api('/api/battle-pass/sync',{method:'POST',body:{...body,launches:body.launches.slice(0,29)}});
    assert.equal(below.data.progression.totalXp,380);
    assert.equal((await api('/api/battle-pass/missions')).data.periods[0].missions.find(m=>m.id==='d-flow').done,false);
    const first=await api('/api/battle-pass/sync',{method:'POST',body});assert.equal(first.status,200,JSON.stringify(first.data));
    assert.equal(first.data.progression.rewards.length,1);assert.equal(first.data.progression.totalXp,600);assert.equal(first.data.progression.insignias,8);
    const repeated=await Promise.all(Array.from({length:3},()=>api('/api/battle-pass/sync',{method:'POST',body})));
    assert.ok(repeated.every(r=>r.data.inserted===0));assert.equal((await api('/api/battle-pass/missions')).data.totalXp,600);
    const imported={...body,launches:Array.from({length:100},(_,i)=>({sp:15000,counter:31+i,epoch:0,source:'history',measuredAt:null}))};
    await api('/api/battle-pass/sync',{method:'POST',body:imported});
    const state=(await api('/api/battle-pass/missions')).data;assert.equal(state.totalXp,600);assert.equal(state.insignias,8);
    assert.ok(state.periods[0].missions.every(m=>m.done));assert.equal(state.periods[1].missions[0].progress,30);
    assert.equal((await api('/api/battle-pass/missions',{who:b.id})).data.totalXp,0);
    assert.equal((await api('/api/battle-pass/missions/ack',{who:b.id,method:'POST',body:{accountId:a.id,ids:state.rewards.map(r=>r.id)}})).status,409);
    await api('/api/battle-pass/missions/ack',{who:b.id,method:'POST',body:{accountId:b.id,ids:state.rewards.map(r=>r.id)}});
    assert.equal((await api('/api/battle-pass/missions')).data.rewards.length,4);
    await api('/api/battle-pass/missions/ack',{method:'POST',body:{accountId:a.id,ids:state.rewards.map(r=>r.id)}});
    assert.equal((await api('/api/battle-pass/missions')).data.rewards.length,0);
    await api('/api/battle-pass/sync',{method:'POST',body:{...body,totalXp:999999,insignias:999999,launches:[]}});
    assert.equal((await api('/api/battle-pass/missions')).data.totalXp,600);
    const old={...body,launches:[{sp:5000,counter:1,epoch:1,source:'live',measuredAt:new Date(Date.now()-36*86400000).toISOString()}]};
    await api('/api/battle-pass/sync',{method:'POST',body:old});assert.equal((await api('/api/battle-pass/missions')).data.totalXp,600);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('weekly and monthly missions track different active days and preserve earned rewards across resets',async()=>{
  const user=await prisma.user.create({data:{name:'Regular',email:'regular@mission.invalid',slug:'mission-regular'}}),now=new Date('2026-11-29T20:00:00Z');
  const rows=Array.from({length:750},(_,i)=>({source:'live',sp:6000,measuredAt:new Date(Date.UTC(2026,10,5+Math.floor(i/30),15,0,i%30))}));
  await prisma.$transaction(tx=>advanceMissions(tx,user.id,rows,now),{timeout:15000});
  const state=await missionState(user.id,now);
  assert.ok(state.periods.find(p=>p.cadence==='monthly').missions.every(m=>m.done));
  assert.equal(state.periods.find(p=>p.cadence==='monthly').missions.find(m=>m.metric==='days').progress,15);
  assert.ok(state.periods.find(p=>p.cadence==='weekly').missions.find(m=>m.metric==='days').done);
  const later=await missionState(user.id,new Date('2026-12-01T12:00:00Z'));
  assert.equal(later.totalXp,state.totalXp);assert.equal(later.insignias,state.insignias);
  assert.ok(later.periods.find(p=>p.cadence==='monthly').missions.every(m=>m.progress===0 && !m.done));
});

test('missions completed at the previous target stay complete and do not reward twice',async()=>{
  const user=await prisma.user.create({data:{name:'Existing',email:'existing@mission.invalid',slug:'mission-existing'}}),now=new Date();
  const period=missionPeriods(now)[0].key,identity={userId:user.id,cadence:'daily',period};
  await prisma.battlePassMissionPeriod.create({data:{...identity,count:11}});
  await prisma.battlePassProgress.create({data:{userId:user.id,totalXp:220,insignias:3,missionsCompleted:2}});
  await prisma.battlePassMissionReward.createMany({data:[{...identity,missionKey:'d-first',xp:80,insignias:1},{...identity,missionKey:'d-warmup',xp:140,insignias:2}]});
  const warmup=(await missionState(user.id,now)).periods[0].missions.find(m=>m.id==='d-warmup');
  assert.equal(warmup.done,true);assert.equal(warmup.progress,warmup.target);assert.equal(warmup.target,15);
  const updated=await prisma.$transaction(tx=>advanceMissions(tx,user.id,[{source:'live',sp:5000,measuredAt:now}],now));
  assert.equal(updated.totalXp,220);assert.equal(updated.insignias,3);assert.equal(updated.rewards.length,0);
});
test.after(()=>prisma.$disconnect());
