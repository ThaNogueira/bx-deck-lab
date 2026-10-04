import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompetitionStats, tournamentBeys } from '../server/competition-stats.js';
const parts = [
  {id:'shark',kind:'BLADE',displayName:'Shark Scale'}, {id:'red',parentId:'shark',kind:'BLADE'},
  {id:'rod',kind:'BLADE'}, {id:'blast',kind:'MAIN_BLADE'}, {id:'lock',kind:'LOCK_CHIP'}, {id:'assist',kind:'ASSIST_BLADE'},
  {id:'160',kind:'RATCHET'}, {id:'960',kind:'RATCHET'}, {id:'rush',kind:'BIT'}, {id:'ball',kind:'BIT'},
];
const match = (outcome, round = 1) => ({round,tableNo:1,p1Id:'p',p2Id:outcome === 'bye' ? null : 'q',winnerId:outcome === 'W' || outcome === 'bye' ? 'p' : outcome === 'L' ? 'q' : null,status:'DONE'});
const event = (id, overrides = {}) => ({id,slug:id,name:id,startsAt:`2026-09-${String(Number(id.replace(/\D/g,'')) || 1).padStart(2,'0')}T12:00:00Z`,status:'FINISHED',visibility:'PUBLIC',placement:1,
  players:[{id:'p',userId:'u',manualDeckJson:JSON.stringify([['shark','160','rush']])},{id:'q',userId:'other'}],matches:[match('W')],...overrides});
test('excludes private, test and canceled; includes link-only; ongoing only in history', () => {
  const out=buildCompetitionStats('u',[event('1'),event('2',{visibility:'PRIVATE'}),event('3',{description:'[ADMIN TEST] demo'}),event('4',{status:'CANCELED'}),event('5',{visibility:'LINK_ONLY'}),event('6',{status:'RUNNING'})],parts);
  assert.equal(out.summary.events,2); assert.equal(out.summary.wins,2); assert.equal(out.tournaments.length,3);
});
test('BYE, pending and administrative losses do not distort win rate; draws break streaks', () => {
  const t=event('1',{matches:[match('W',1),match('bye',2),match('W',3),match('L',4),match('D',5),{...match('W',6),status:'PENDING'},match('W',7)]});
  t.players[0].lateLosses=2;
  const {summary:s,recent}=buildCompetitionStats('u',[t],parts);
  assert.equal(s.matches,5); assert.equal(s.winRate,60); assert.equal(s.byes,1); assert.equal(s.administrativeLosses,2);
  assert.equal(s.bestStreak,2); assert.equal(s.currentStreak,1); assert.equal(recent.length,5); assert.equal(s.ties,1);
});
test('unique top three blades group recolors and select conditional ratchet/bit from real combos', () => {
  const ts=Array.from({length:10},(_,i)=>event(String(i+1)));
  ts[0].players[0].manualDeckJson=JSON.stringify([['red','960','ball'],['shark','160','rush'],['rod','960','ball'],['lock','blast','assist','160','ball']]);
  ts[1].players[0].manualDeckJson=JSON.stringify([['shark','160','ball']]);
  const out=buildCompetitionStats('u',ts,parts);
  assert.deepEqual(out.favoriteBeys[0].ids,['shark','160','rush']);
  assert.equal(out.favoriteBeys[0].uses,10); assert.equal(out.favoriteBeys[0].usageRate,100);
  assert.equal(new Set(out.favoriteBeys.map(b=>b.bladeId)).size,3);
});
test('all history is counted, not limited to 40; medals and monthly samples agree', () => {
  const ts=Array.from({length:60},(_,i)=>event(`e${i}`,{startsAt:new Date(2026,0,i+1),placement:i%3+1}));
  const out=buildCompetitionStats('u',ts,parts);
  assert.equal(out.summary.events,60); assert.equal(out.summary.gold,20); assert.equal(out.summary.silver,20); assert.equal(out.summary.bronze,20);
  assert.equal(out.recent.length,10); assert.equal(out.summary.bestStreak,60);
  assert.equal(out.monthly.reduce((n,m)=>n+m.matches,0),60);
});
test('empty/malformed decks and empty profiles are safe; unknown rate is not 0%', () => {
  for(const raw of ['null','{}','broken']) assert.deepEqual(tournamentBeys({manualDeckJson:raw}),[]);
  assert.deepEqual(tournamentBeys({manualDeckJson:'[["shark","160","rush"]]',deck:{beysJson:'[["rod"]]'}}),[['shark','160','rush']]);
  const empty=buildCompetitionStats('u',[],parts);
  assert.equal(empty.summary.winRate,null); assert.deepEqual(empty.favoriteBeys,[]);
  const out=buildCompetitionStats('u',[event('1',{players:[{id:'p',userId:'u'}]})],parts);
  assert.equal(out.summary.decksRecorded,0); assert.deepEqual(out.favoriteBeys,[]);
});
