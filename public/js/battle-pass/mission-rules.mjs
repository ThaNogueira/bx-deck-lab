export const MISSION_RULES = [
  {id:'d-first',cadence:'daily',title:'Primeiro impulso',description:'Faça 1 lançamento.',metric:'count',target:1,xp:80,insignias:1},
  {id:'d-warmup',cadence:'daily',title:'Aquecimento',description:'Faça 15 lançamentos.',metric:'count',target:15,xp:140,insignias:2},
  {id:'d-flow',cadence:'daily',title:'Pegue o ritmo',description:'Faça 30 lançamentos.',metric:'count',target:30,xp:220,insignias:3},
  {id:'d-steady',cadence:'daily',title:'Mão firme',description:'Faça 3 lançamentos seguidos com força parecida. Repita 5 vezes.',metric:'sets',target:5,xp:160,insignias:2},
  {id:'w-reps',cadence:'weekly',title:'Treino em dia',description:'Faça 110 lançamentos na semana.',metric:'count',target:110,xp:600,insignias:8},
  {id:'w-days',cadence:'weekly',title:'Presença na arena',description:'Treine em 5 dias diferentes.',metric:'days',target:5,xp:750,insignias:10},
  {id:'w-steady',cadence:'weekly',title:'Controle de lançamento',description:'Faça 3 lançamentos seguidos com força parecida. Repita 30 vezes.',metric:'sets',target:30,xp:650,insignias:8},
  {id:'w-flow',cadence:'weekly',title:'Semana de evolução',description:'Faça 275 lançamentos na semana.',metric:'count',target:275,xp:1000,insignias:15},
  {id:'m-reps',cadence:'monthly',title:'Fôlego de campeão',description:'Faça 660 lançamentos no mês.',metric:'count',target:660,xp:2200,insignias:30},
  {id:'m-days',cadence:'monthly',title:'Hábito de treino',description:'Treine em 15 dias diferentes.',metric:'days',target:15,xp:2600,insignias:35},
  {id:'m-steady',cadence:'monthly',title:'Precisão constante',description:'Faça 3 lançamentos seguidos com força parecida. Repita 165 vezes.',metric:'sets',target:165,xp:2400,insignias:32},
  {id:'m-routine',cadence:'monthly',title:'Compromisso com a arena',description:'Treine em 25 dias diferentes.',metric:'days',target:25,xp:3600,insignias:50},
];

const dailyPower=(slot,minSp,target,weight)=>({
  id:`d-power-${slot}-${minSp}-${target}`,cadence:'daily',slot,weight,minSp,target,metric:'power',
  title:slot==='shot'?'Na mira':'Potência no treino',
  description:`Faça ${target===1?'1 lançamento':target+' lançamentos'} com ${minSp.toLocaleString('pt-BR')} SP ou mais.`,
  xp:slot==='shot'?120:180,insignias:slot==='shot'?2:3,
});
export const POWER_MISSION_RULES=[
  dailyPower('shot',5000,1,1),dailyPower('shot',8000,1,4),dailyPower('shot',8000,5,3),
  dailyPower('shot',9000,1,2),dailyPower('shot',10000,1,1),
  dailyPower('volume',5000,10,2),dailyPower('volume',6000,10,1),dailyPower('volume',8000,5,4),
  dailyPower('volume',8000,10,2),dailyPower('volume',9000,5,2),dailyPower('volume',10000,5,1),
  {id:'w-power-10000-10',cadence:'weekly',slot:'base',weight:1,minSp:10000,target:10,metric:'power',title:'Impacto semanal',description:'Faça 10 lançamentos com 10.000 SP ou mais.',xp:650,insignias:8},
  {id:'w-power-12000-15',cadence:'weekly',slot:'focus',weight:4,minSp:12000,target:15,metric:'power',title:'Força em evolução',description:'Faça 15 lançamentos com 12.000 SP ou mais.',xp:850,insignias:12},
  {id:'w-power-15000-5',cadence:'weekly',slot:'focus',weight:1,minSp:15000,target:5,metric:'power',title:'Desafio de impacto',description:'Faça 5 lançamentos com 15.000 SP ou mais.',xp:1000,insignias:15},
];
export const POWER_THRESHOLDS=[...new Set(POWER_MISSION_RULES.map(m=>m.minSp))].sort((a,b)=>a-b);
export const ALL_MISSION_RULES=[...MISSION_RULES,...POWER_MISSION_RULES];
function hash(text) {
  let result=2166136261;
  for(let i=0;i<text.length;i++)result=Math.imul(result^text.charCodeAt(i),16777619);
  return result>>>0;
}
export function rulesForPeriod(cadence,period,userId,savedIds=[]) {
  const base=MISSION_RULES.filter(m=>m.cadence===cadence);
  if(savedIds.length)return base.concat(savedIds.map(id=>POWER_MISSION_RULES.find(m=>m.id===id && m.cadence===cadence)).filter(Boolean));
  const slots=cadence==='daily'?['shot','volume']:cadence==='weekly'?['base','focus']:[],selected=[];
  const shotTarget=(Math.floor(Date.parse(period)/86400000)+hash(userId))%2===0?1:5;
  for(const slot of slots) {
    const pool=POWER_MISSION_RULES.filter(m=>m.cadence===cadence && m.slot===slot && (cadence!=='daily' || slot!=='shot' || m.target===shotTarget) && !selected.some(s=>s.minSp===m.minSp && s.target===m.target));
    let roll=hash(`${userId}:${cadence}:${period}:${slot}`)%pool.reduce((sum,m)=>sum+m.weight,0);
    for(const mission of pool){roll-=mission.weight;if(roll<0){selected.push(mission);break;}}
  }
  return base.concat(selected);
}
export const MAX_LEVEL=100;
export const xpForNextLevel=level=>level>=MAX_LEVEL?0:100+25*(level-1)+2*(level-1)**2;
export function levelProgress(totalXp=0) {
  let level=1,remaining=Math.max(0,totalXp),floor=0;
  while(level<MAX_LEVEL && remaining>=xpForNextLevel(level)) {const cost=xpForNextLevel(level);remaining-=cost;floor+=cost;level++;}
  return {level,totalXp,floor,xp:level===MAX_LEVEL?0:remaining,next:xpForNextLevel(level),percent:level===MAX_LEVEL?100:Math.min(100,remaining/xpForNextLevel(level)*100)};
}
export function levelColor(level) {
  const hues=[190,220,270,330,392,408],position=(Math.min(100,Math.max(1,level))-1)/99*5,index=Math.min(4,Math.floor(position));
  return `hsl(${(hues[index]+(hues[index+1]-hues[index])*(position-index))%360} 78% ${58+level*.08}%)`;
}
