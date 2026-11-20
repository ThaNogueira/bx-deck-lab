import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {summarizeSession,formatDuration} from '../public/js/battle-pass/session-stats.mjs';
const temp=mkdtempSync(path.join(tmpdir(),'bx-sessions-'));
new DatabaseSync(path.join(temp,'qa.db')).close();
process.env.DATABASE_URL='file:'+path.join(temp,'qa.db').replaceAll('\\','/');process.env.NODE_ENV='test';process.env.BX_ISOLATED_TEST='1';
const migrated=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:process.env,encoding:'utf8'});assert.equal(migrated.status,0,migrated.stderr);
const {prisma}=await import('../server/db.js');
const {default:express}=await import('express');
const {default:routes}=await import('../server/routes/battle-pass.js');

test('session summary separates imports, uses measured duration and compares weighted live averages',()=>{
  const session={id:'stats-session',startedAt:'2026-11-20T12:00:00Z',endedAt:'2026-11-20T13:00:00Z'};
  const rows=[{source:'history',sp:30000,measuredAt:null},...[10000,11000,12000,13000,14000,15000].map((sp,i)=>({source:'live',sp,measuredAt:`2026-11-20T12:${String(10+i).padStart(2,'0')}:00Z`}))];
  const data=summarizeSession(session,rows,[{id:'previous',average:7500,liveCount:4}]);
  assert.equal(data.stats.count,6);assert.equal(data.stats.importedCount,1);assert.equal(data.stats.best,15000);assert.equal(data.stats.average,12500);assert.equal(data.stats.median,12500);
  assert.equal(data.session.durationMs,3600000);assert.ok(Math.abs(data.comparison.change-66.6666667)<.0001);
  assert.ok(Math.abs(data.stats.withinChange-27.272727)<.0001);
  assert.equal(formatDuration(3600000),'1h 0min');assert.equal(formatDuration(null),'—');
  const imported=summarizeSession(session,rows.slice(0,1));assert.equal(imported.session.durationMs,null);assert.equal(imported.comparison.change,null);
  const unclosed=summarizeSession({...session,endedAt:null},rows);assert.equal(unclosed.session.durationExact,false);assert.equal(unclosed.session.durationMs,15*60000);
});

test('private session overview attributes XP, reward logs and levels exactly once and preserves legacy unknowns',async()=>{
  const user=await prisma.user.create({data:{name:'Session Blader',slug:'session-blader',email:'session@qa.invalid'}}),other=await prisma.user.create({data:{name:'Other',slug:'session-other',email:'other@qa.invalid'}});
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user=req.headers['x-user']===user.id?user:req.headers['x-user']===other.id?other:null;next();});app.use(routes);
  app.use((error,_req,res,_next)=>res.status(500).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
  const api=async(url,{who=user.id,body}={})=>{const response=await fetch('http://127.0.0.1:'+server.address().port+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(who?{'x-user':who}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};
  const now=Date.now(),iso=time=>new Date(time).toISOString(),device={key:'c'.repeat(64),name:'BEYBLADE_TOOL01'};
  const payload=(id,start,end,values,counter)=>({accountId:user.id,device,session:{id,startedAt:iso(start),endedAt:iso(end)},launches:values.map((sp,i)=>({sp,counter:counter+i,epoch:0,source:'live',measuredAt:iso(start+5*60000+i*1000)}))});
  try{
    const previous=payload('overview-previous',now-2*3600000,now-3600000,[6000,7000,8000,9000],1);
    assert.equal((await api('/api/battle-pass/sync',{body:previous})).status,200);
    const current=payload('overview-current',now-3600000,now,[10000,11000,12000,13000,14000,15000],5);
    current.launches.push({sp:30000,counter:11,epoch:0,source:'history',measuredAt:null});
    const synced=await api('/api/battle-pass/sync',{body:current});assert.equal(synced.status,200,JSON.stringify(synced.data));
    assert.equal((await api('/api/battle-pass/sessions/overview-current/overview',{who:null})).status,401);
    assert.equal((await api('/api/battle-pass/sessions/overview-current/overview',{who:other.id})).status,404);
    const data=(await api('/api/battle-pass/sessions/overview-current/overview')).data;
    assert.equal(data.stats.count,6);assert.equal(data.stats.best,15000);assert.equal(data.stats.importedCount,1);assert.equal(data.session.durationMs,3600000);
    assert.equal(data.record.isNew,false);assert.equal(data.record.previousBest,30000);assert.equal(data.comparison.sessionCount,1);
    const gained=synced.data.progression.rewards.reduce((sum,r)=>sum+r.xp,0);
    assert.equal(data.progression.xp,gained);assert.equal(data.progression.missions,synced.data.progression.rewards.length);assert.equal(data.progression.tracked,true);
    assert.ok(data.progression.rewards.every(r=>r.title && r.description));assert.ok(data.progression.events.every(e=>e.xpAfter>e.xpBefore));
    const events=await prisma.battlePassTrainingGain.count();
    const duplicate=await api('/api/battle-pass/sync',{body:current});assert.equal(duplicate.data.inserted,0);
    assert.equal((await api('/api/battle-pass/sessions/overview-current/overview')).data.progression.xp,gained);
    assert.equal(await prisma.battlePassTrainingGain.count(),events);
    assert.ok(!JSON.stringify(data).includes('@qa.invalid'));assert.ok(!JSON.stringify(data).includes(device.key));
    const training=await prisma.battlePassTraining.findUnique({where:{id:'overview-current'}});
    await prisma.battlePassTraining.create({data:{id:'overview-legacy',userId:user.id,deviceId:training.deviceId,startedAt:new Date(now-3*3600000)}});
    const legacy=(await api('/api/battle-pass/sessions/overview-legacy/overview')).data;
    assert.equal(legacy.progression.tracked,false);assert.equal(legacy.progression.startLevel,null);assert.equal(legacy.session.durationMs,null);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test.after(()=>prisma.$disconnect());
