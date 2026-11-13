import { BLADE_BASE } from './rules.js';

const TAU = Math.PI*2;
export const FREE_RING_PROFILE = [[.57,-.154],[.701,-.137],[.753,-.095],[.748,-.070],[.660,-.059]];

// One repeating sector per row, with the main tips, shoulders and recesses
// placed from the top views. The same samples form the visible metal and hulls.
const profiles = {
  dran: [.924,.912,.895,.882,.874,.864,.859,.859,.861,.849,.855,.853,.856,.858,.848,.957,
    .974,.976,.968,.957,.953,.953,.954,.948,.953,.958,.957,.964,.971,.970,.955,.945,
    .940,.938,.931,.931,.927,.978,1,.996,.983,.970,.964,.955,.951,.945,.945,.941],
  hells: [.994,.996,1,.997,.996,.998,.999,.998,.999,1,1,1,.996,.996,.998,.989,.961,.938,
    .927,.934,.945,.960,.976,.978,.982,.987,.977,.954,.965,.983,.994,.994,.994,.997,.997,.994],
  knight: [.944,.974,.995,1,.989,.971,.962,.959,.972,.987,.989,.978,.967,.959,.956,.954,.942,.932],
  shark: [.86,.81,.79,.83,.92,.985,1,.984,.958,.918,.884,.851,.842,.901,.963,.951,.917,.889,.907,.893],
  wizard: [.971,.980,.989,.997,1,.998,.989,.983,.979,.975,.981,.989,.987,.981,.974,.970],
  cobalt: [.84,.876,.941,.988,1,.994,.979,.951,.915,.88,.85,.834,.81,.835,.904,.976,.963,.925,.889,.86],
  aero: [.855,.878,.941,.981,.997,1,.997,.982,.955,.928,.904,.889,.94,.976,.971,.952,.923,.910,.891,.867],
  superion: [.874,.879,.902,.930,.965,.977,.963,.946,.932,.925,.957,.989,1,.991,.978,.964,.946,.949,.957,.937,.914,.892,.875,.866],
  wyvern: [.797,.814,.849,.883,.914,.951,.976,.993,1,.999,.987,.972,.960,.951,.930,.901,.867,.839,.812,.800],
  silver: [.963,.976,.997,1,.989,.973,.955,.962,.983,.994,.985,.969,.958,.955],
  glory: [.886,.916,.952,.975,.973,.951,.924,.912,.928,.966,.993,1,.998,.982,.959,.942,.926,.912,.901,.892],
};

const divisions = {
  dran: [14,24,36], hells: [18,27], knight: [7], shark: [2,12], wizard: [15], cobalt: [12,0],
  aero: [0,11], superion: [9,23], wyvern: [0,13], silver: [6,13], glory: [0,7],
};

export function bladeOutline(blade) {
  return Array.from({length:blade.lobes},() => profiles[blade.key]).flat();
}

export function bladeLevels(blade) {
  const r = blade.radius;
  const base = blade.base ?? BLADE_BASE;
  if (blade.key === 'dran' || blade.key === 'hells') {
    const bladeEdge = blade.key === 'dran' ? .986 : .997;
    return [
      [.53,base,0],[r*.93,base*.69,r*.74,2],[r*.99,-.067,r,0],
      [r,.013,r,0],[r*bladeEdge,.073,r,1],[r*.958,.120,r*.93,0],
      [r*.924,.155,r*.88,1],[.50,.092,r*.04,2],
    ];
  }
  const lowEdge = blade.upper ? .82 : blade.verticalGuard ? .91 : .975;
  const highEdge = blade.verticalGuard ? .92 : blade.upper ? 1.006 : .983;
  return [
    [.534,base,0], [r*.86,base*.70,r*.65,2], [r*lowEdge,-.065,r,0],
    [r,.004,r,0], [r*highEdge,.071,r,1], [r*.93,.123,r*.83,0],
    [blade.rigid ? .55 : blade.key === 'dran' ? .578 : .612,.139,r*.16,1], [.507,.086,r*.08,2],
  ];
}

export function bladeHullSectors(blade) {
  const outline = bladeOutline(blade), perLobe = profiles[blade.key].length;
  const seams = Array.from({length:blade.lobes},(_,i)=>divisions[blade.key].map(point=>i*perLobe+point))
    .flat().sort((a,b)=>a-b);
  const levels = [...bladeLevels(blade).slice(0,7),[.379,.207,0]];
  return seams.map((start,index) => {
    const end = seams[index+1] ?? seams[0]+outline.length;
    const vertices = [];
    for (const [radius,y,contour] of levels) {
      vertices.push(0,y,0);
      for (let point = start; point <= end; point++) {
        const angle = TAU*point/outline.length;
        const r = radius+(outline[point%outline.length]-1)*contour;
        vertices.push(r*Math.cos(angle),y,r*Math.sin(angle));
      }
    }
    return Float32Array.from(vertices);
  });
}

export function bladeContact(blade,angle) {
  const profile = profiles[blade.key];
  const phase = ((angle*blade.lobes/TAU%1)+1)%1*profile.length;
  const index = Math.floor(phase), a = profile[index], b = profile[(index+1)%profile.length];
  const reach = a+(b-a)*(phase-index);
  const before = profile[(index+profile.length-2)%profile.length];
  const after = profile[(index+3)%profile.length];
  return {
    reach,
    slope: (b-a)*profile.length*blade.lobes/TAU,
    prominence: Math.max(0,reach-Math.min(before,after)),
  };
}
