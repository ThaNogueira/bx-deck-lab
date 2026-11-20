import {prisma} from './db.js';
import {ALL_MISSION_RULES,POWER_THRESHOLDS,rulesForPeriod,levelProgress} from '../public/js/battle-pass/mission-rules.mjs';

const DAY=86400000;
const dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
const timeParts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const parts=(format,date)=>Object.fromEntries(format.formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
const key=date=>date.toISOString().slice(0,10);
function midnight(localDate) {
  const target=localDate.getTime();let time=target;
  for(let i=0;i<3;i++) {const p=parts(timeParts,new Date(time));time+=target-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);}
  return new Date(time).toISOString();
}
export function missionPeriods(now=new Date()) {
  const p=parts(dateParts,now),day=new Date(Date.UTC(p.year,p.month-1,p.day));
  const monday=new Date(day.getTime()-((day.getUTCDay()+6)%7)*DAY);
  const month=new Date(Date.UTC(p.year,p.month-1,1));
  return [
    {cadence:'daily',key:key(day),resetsAt:midnight(new Date(day.getTime()+DAY))},
    {cadence:'weekly',key:key(monday),resetsAt:midnight(new Date(monday.getTime()+7*DAY))},
    {cadence:'monthly',key:key(month).slice(0,7),resetsAt:midnight(new Date(Date.UTC(p.year,p.month,1)))},
  ];
}
const parse=(text)=>{try{return JSON.parse(text);}catch{return [];}};
const parseCounts=text=>{try{const value=JSON.parse(text);return value && typeof value==='object' && !Array.isArray(value)?value:{};}catch{return {};}};
const metric=(rule,metrics,power)=>rule.metric==='power'?(power[rule.minSp]??0):metrics[rule.metric];
const rewardDto=r=>({...r,title:ALL_MISSION_RULES.find(m=>m.id===r.missionKey)?.title??'Missão concluída'});

export async function advanceMissions(tx,userId,launches,now=new Date()) {
  const eligible=launches.filter(r=>r.source==='live' && r.measuredAt && new Date(r.measuredAt)<=new Date(now.getTime()+300000) && now-new Date(r.measuredAt)<=35*DAY);
  if(!eligible.length) return null;
  const groups=new Map();
  for(const launch of eligible.slice().sort((a,b)=>new Date(a.measuredAt)-new Date(b.measuredAt))) {
    const at=new Date(Math.min(now.getTime(),new Date(launch.measuredAt).getTime())),periods=missionPeriods(at);
    for(const period of periods) {
      const id=period.cadence+':'+period.key;
      if(!groups.has(id))groups.set(id,{...period,rows:[]});
      groups.get(id).rows.push({sp:launch.sp,day:periods[0].key});
    }
  }
  const progress=await tx.battlePassProgress.upsert({where:{userId},create:{userId},update:{}});
  const rewards=[];
  for(const group of groups.values()) {
    const identity={userId,cadence:group.cadence,period:group.key};
    const period=await tx.battlePassMissionPeriod.upsert({where:{userId_cadence_period:identity},create:identity,update:{}});
    const rules=rulesForPeriod(group.cadence,group.key,userId,parse(period.missionKeysJson));
    const power=parseCounts(period.powerCountsJson);
    const days=new Set(parse(period.daysJson)),samples=parse(period.samplesJson);let sets=period.sets;
    for(const row of group.rows) {
      if(group.cadence!=='monthly')for(const threshold of POWER_THRESHOLDS)if(row.sp>=threshold)power[threshold]=(power[threshold]??0)+1;
      days.add(row.day);samples.push(row.sp);
      if(samples.length===3) {
        const average=samples.reduce((a,b)=>a+b,0)/3;
        if((Math.max(...samples)-Math.min(...samples))/average<=.2)sets++;
        samples.length=0;
      }
    }
    const count=period.count+group.rows.length;
    await tx.battlePassMissionPeriod.update({where:{id:period.id},data:{count,sets,daysJson:JSON.stringify([...days]),samplesJson:JSON.stringify(samples),powerCountsJson:JSON.stringify(power),missionKeysJson:JSON.stringify(rules.filter(m=>m.metric==='power').map(m=>m.id))}});
    const metrics={count,sets,days:days.size};
    for(const rule of rules.filter(m=>metric(m,metrics,power)>=m.target)) {
      const rewardKey={...identity,missionKey:rule.id};
      if(await tx.battlePassMissionReward.findUnique({where:{userId_cadence_period_missionKey:rewardKey}}))continue;
      rewards.push(await tx.battlePassMissionReward.create({data:{...rewardKey,xp:rule.xp,insignias:rule.insignias}}));
    }
  }
  const updated=await tx.battlePassProgress.update({where:{userId},data:{
    totalXp:{increment:rewards.reduce((sum,r)=>sum+r.xp,0)},insignias:{increment:rewards.reduce((sum,r)=>sum+r.insignias,0)},missionsCompleted:{increment:rewards.length},
  }});
  return {userId,...levelProgress(updated.totalXp),insignias:updated.insignias,completed:updated.missionsCompleted,rewards:rewards.map(rewardDto)};
}

export async function missionState(userId,now=new Date()) {
  const periods=missionPeriods(now),where={userId,OR:periods.map(p=>({cadence:p.cadence,period:p.key}))};
  const [progress,stored,earned,unread,collection]=await Promise.all([
    prisma.battlePassProgress.findUnique({where:{userId}}),prisma.battlePassMissionPeriod.findMany({where}),
    prisma.battlePassMissionReward.findMany({where}),
    prisma.battlePassMissionReward.findMany({where:{userId,announcedAt:null},orderBy:{awardedAt:'asc'},take:50}),
    prisma.battlePassMissionReward.groupBy({by:['cadence'],where:{userId},_sum:{insignias:true}}),
  ]);
  return {userId,now:now.toISOString(),...levelProgress(progress?.totalXp??0),insignias:progress?.insignias??0,completed:progress?.missionsCompleted??0,
    collection:collection.map(c=>({cadence:c.cadence,count:c._sum.insignias??0})),rewards:unread.map(rewardDto),
    periods:periods.map(p=>{
      const saved=stored.find(s=>s.cadence===p.cadence && s.period===p.key),metrics={count:saved?.count??0,sets:saved?.sets??0,days:parse(saved?.daysJson??'[]').length};
      const power=parseCounts(saved?.powerCountsJson??'{}');
      return {...p,missions:rulesForPeriod(p.cadence,p.key,userId,parse(saved?.missionKeysJson??'[]')).map(m=>{
        const done=earned.some(e=>e.missionKey===m.id && e.cadence===p.cadence && e.period===p.key);
        return {...m,progress:done?m.target:Math.min(m.target,metric(m,metrics,power)),done};
      })};
    })};
}
