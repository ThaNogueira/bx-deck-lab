import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRatings, ratingChange, ratingDto, RANK_TIERS } from '../server/rating.js';
const event = (id, extra={}) => ({id,slug:id,name:id,startsAt:`2026-09-${id === 'a' ? '01' : '02'}`,status:'FINISHED',visibility:'PUBLIC',description:null,
  players:['a','b','c','d'].map(id=>({id,userId:id})),
  matches:Array.from({length:3},(_,i)=>[{id:`${i}a`,round:i+1,tableNo:1,p1Id:'a',p2Id:'b',winnerId:'a',status:'DONE'},{id:`${i}b`,round:i+1,tableNo:2,p1Id:'c',p2Id:'d',winnerId:'c',status:'DONE'}]).flat(),...extra});
test('equal, underdog, favorite and draw scoring',()=>{
  assert.equal(ratingChange(1000,1000,1),16);assert.equal(ratingChange(1000,1000,0),-16);
  assert.equal(ratingChange(1000,1000,.5),0);assert(ratingChange(1000,1400,1)>16);assert(ratingChange(1400,1000,1)<16);
});
test('placements require both five duels and two events, preserve zero sum',()=>{
  assert.equal(calculateRatings([event('a')]).byUser.get('a').provisional,true);
  const r=calculateRatings([event('a'),event('b')]);
  assert.equal(r.totals.matches,12);assert.equal(r.byUser.get('a').matches,6);
  assert.equal(r.byUser.get('a').provisional,false);assert.equal(r.byUser.get('a').tier.id,'prata');
  assert.equal([...r.byUser.values()].reduce((s,x)=>s+x.points,0),4000);
  assert.equal(r.byUser.get('a').events,2);
});
test('test/private/incomplete/cancelled events are excluded; link-only counts',()=>{
  for(const extra of [{visibility:'PRIVATE'},{status:'RUNNING'},{status:'CANCELLED'},{description:'[ADMIN TEST] Arena'}]) assert.equal(calculateRatings([event('a',extra)]).totals.matches,0);
  assert.equal(calculateRatings([event('a',{visibility:'LINK_ONLY'})]).totals.matches,6);
});
test('four actual players required; byes and pending matches excluded',()=>{
  const t=event('a');t.matches=t.matches.filter(m=>m.p1Id==='a');assert.equal(calculateRatings([t]).totals.matches,0);
  const b=event('a');b.matches.push({id:'bye',round:4,p1Id:'a',p2Id:null,winnerId:'a',status:'DONE'});b.matches.push({id:'pending',round:5,p1Id:'a',p2Id:'c',status:'PENDING'});
  assert.equal(calculateRatings([b]).totals.matches,6);
});
test('order invariant; duplicate round ignored; deletion and corrections replay',()=>{
  const a=event('a'),b=event('b');const original=calculateRatings([a,b]);
  assert.deepEqual(calculateRatings([b,{...a,matches:[...a.matches].reverse()}]),original);
  const dupe={...a,matches:[...a.matches,{...a.matches[0],id:'zzdup'}]};assert.deepEqual(calculateRatings([dupe,b]),original);
  const corrected={...a,matches:a.matches.map(m=>({...m,winnerId:m.p2Id}))};assert.notEqual(calculateRatings([corrected,b]).byUser.get('a').points,original.byUser.get('a').points);
  assert.equal(calculateRatings([b]).byUser.get('a').events,1);
});
test('tier boundaries, progress and terminal tier',()=>{
  for(const tier of RANK_TIERS){const dto=ratingDto({points:tier.min,peak:tier.min,matches:5,events:2,wins:5,losses:0,ties:0,history:[]});assert.equal(dto.tier.id,tier.id);assert.equal(dto.progress,tier.id==='lenda'?100:0);}
  assert.equal(ratingDto().tier,null);
});
