export const MISSION_RULES = [
  {id:'d-first',cadence:'daily',title:'Primeiro impulso',description:'Faça 2 lançamentos.',metric:'count',target:2,xp:80,insignias:1},
  {id:'d-warmup',cadence:'daily',title:'Aquecimento',description:'Faça 11 lançamentos.',metric:'count',target:11,xp:140,insignias:2},
  {id:'d-flow',cadence:'daily',title:'Pegue o ritmo',description:'Faça 28 lançamentos.',metric:'count',target:28,xp:220,insignias:3},
  {id:'d-steady',cadence:'daily',title:'Mão firme',description:'Complete 2 trios com SPs próximos (até 20%).',metric:'sets',target:2,xp:160,insignias:2},
  {id:'w-reps',cadence:'weekly',title:'Treino em dia',description:'Faça 110 lançamentos na semana.',metric:'count',target:110,xp:600,insignias:8},
  {id:'w-days',cadence:'weekly',title:'Presença na arena',description:'Treine em 4 dias diferentes.',metric:'days',target:4,xp:750,insignias:10},
  {id:'w-steady',cadence:'weekly',title:'Controle de lançamento',description:'Complete 28 trios com SPs próximos (até 20%).',metric:'sets',target:28,xp:650,insignias:8},
  {id:'w-flow',cadence:'weekly',title:'Semana de evolução',description:'Faça 275 lançamentos na semana.',metric:'count',target:275,xp:1000,insignias:15},
  {id:'m-reps',cadence:'monthly',title:'Fôlego de campeão',description:'Faça 660 lançamentos no mês.',metric:'count',target:660,xp:2200,insignias:30},
  {id:'m-days',cadence:'monthly',title:'Hábito de treino',description:'Treine em 14 dias diferentes.',metric:'days',target:14,xp:2600,insignias:35},
  {id:'m-steady',cadence:'monthly',title:'Precisão constante',description:'Complete 165 trios com SPs próximos (até 20%).',metric:'sets',target:165,xp:2400,insignias:32},
  {id:'m-routine',cadence:'monthly',title:'Compromisso com a arena',description:'Treine em 22 dias diferentes.',metric:'days',target:22,xp:3600,insignias:50},
];
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
