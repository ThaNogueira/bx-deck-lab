const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
export const percentChange=(value,baseline)=>baseline>0?(value-baseline)/baseline*100:null;
export function formatDuration(ms) {
  if(ms==null)return '—';
  const seconds=Math.max(0,Math.floor(ms/1000)),minutes=Math.floor(seconds/60),hours=Math.floor(minutes/60);
  return hours?`${hours}h ${minutes%60}min`:minutes?`${minutes}min`:seconds+'s';
}
export function summarizeSession(session,launches,previous=[]) {
  const live=launches.filter(row=>row.source==='live' && row.measuredAt),selected=live.length?live:launches;
  const values=selected.map(row=>row.sp),average=mean(values),sorted=values.slice().sort((a,b)=>a-b);
  const sample=Math.min(10,Math.floor(values.length/2)),startAverage=sample?mean(values.slice(0,sample)):null,endAverage=sample?mean(values.slice(-sample)):null;
  const lastAt=live.length?new Date(live.reduce((last,row)=>Math.max(last,Date.parse(row.measuredAt)),0)).toISOString():null;
  const effectiveEnd=session.endedAt??lastAt;
  const stats={count:values.length,liveCount:live.length,importedCount:launches.length-live.length,source:live.length?'live':'history',
    average,best:values.reduce((best,sp)=>Math.max(best,sp),0),minimum:values.length?values.reduce((min,sp)=>Math.min(min,sp),Infinity):0,
    median:sorted.length?(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2:0,
    variation:values.length>=2 && average?Math.sqrt(mean(values.map(sp=>(sp-average)**2)))/average*100:null,
    startAverage,endAverage,withinChange:sample>=3?percentChange(endAverage,startAverage):null};
  const comparable=live.length?previous.filter(p=>p.liveCount>0):[];
  const baselineCount=comparable.reduce((sum,p)=>sum+p.liveCount,0);
  const baselineAverage=baselineCount?comparable.reduce((sum,p)=>sum+p.average*p.liveCount,0)/baselineCount:null;
  return {session:{id:session.id,startedAt:session.startedAt,endedAt:session.endedAt,lastLaunchAt:lastAt,
    durationMs:live.length && effectiveEnd?Math.max(0,Date.parse(effectiveEnd)-Date.parse(session.startedAt)):null,durationExact:!!session.endedAt},
    stats,comparison:{baselineAverage,sessionCount:comparable.length,change:percentChange(average,baselineAverage),
      lastChange:percentChange(average,comparable[0]?.average),sessions:comparable.slice().reverse()},
    launches:selected.map(row=>({sp:row.sp,measuredAt:row.measuredAt??null,source:row.source}))};
}
