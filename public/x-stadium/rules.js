import { SHOOT_HEIGHT, clamp, openingRadius } from './stadium.js';

// One unit is 30 mm. Dimensions shared by the workshop, model and colliders.
export const BLADE_BASE = -.160;
export const BLADE_TOP = .225;
export const GEAR_HEIGHT = .156;
export const GEAR_HALF_HEIGHT = .027;

// Radius and height above the contact face. The first rows also define the
// support used by the physics for each Bit.
export function bitProfile(bit) {
  const r = bit.tip;
  if (bit.shape === 'underFlat') return [[0,0],[r*.89,0],[r,.013],[r,.032],[bit.gear*.89,.068],[bit.gear*.78,.102]];
  if (bit.shape === 'cyclone') return [[0,0],[r*.76,0],[r,.026],[r*.76,.061],[bit.gear*.81,.104]];
  if (bit.shape === 'hexa') return [[0,0],[r*.60,0],[r,.028],[r,.060],[bit.gear*.77,.108]];
  if (bit.shape === 'dot') return [[0,0],[r*.34,0],[r*.54,.014],[r,.039],[r*.92,.067],[bit.gear*.76,.103]];
  if (bit.shape === 'flat') return [[0,0],[r*.88,0],[r,.015],[r,.049],[r*.97,.071],[bit.gear*.75,.102]];
  if (bit.shape === 'taper') return [[0,0],[r*.68,0],[r,.014],[r*1.24,.066],[bit.gear*.76,.106]];
  if (bit.shape === 'pointFlat') return [[0,0],[r*.29,0],[r*.39,.016],[r*.46,.030],[r,.038],[r,.059],[bit.gear*.78,.103]];
  if (bit.shape === 'needle' || bit.shape === 'spike') {
    return [[0,0],[r*.24,0],[r,.017],[r*1.33,.034],[bit.gear*.60,.091],[bit.gear*.82,.114]];
  }
  const tip = [0,.30,.65,.94,1.16,Math.PI/2].map(a => [r*Math.sin(a),r*(1-Math.cos(a))]);
  return [...tip,[bit.gear*.8,Math.max(r+.006,.132)]];
}
export const MAX_LAUNCH_ANGLE = 35;
export const MIN_LAUNCH_SEPARATION = .60;
export const MOVE_USES = 3;
export const GRAMS_PER_MASS_UNIT = 30;
export const specialMove = bit => ({defense:'defense',stamina:'circle'})[bit.type] ?? 'attack';
export const railRating = bit => Math.round(80*bit.grip);
export const RATCHET_OUTLINES = {
  0: [1,1,1,1,1,1,1,1],
  2: [.91,.94,.98,1,1,.98,.91,.87,.87,.88],
  1: [1,1,.96,.85,.79,.76,.75,.75,.75,.75,.76,.79,.85,.96,1,1],
  3: [.89,.96,1,1,.95,.90,.85,.85,.87],
  4: [.88,.94,.995,1,.986,.934,.882,.861,.865],
  5: [.91,.94,.98,1,1,.98,.935,.90],
  8: [.90,.94,.98,1,1,.98,.94,.90],
};
export const ratchetLobes = ratchet => ratchet.teeth || 4;
export const BLADES = {
  dran: { key: 'dran', name: 'Dran Sword', type: 'ATAQUE', image: './assets/dran-sword.png', color: 0x1746b9, accent: 0x229cfd, mass: 1.14, hit: 1.31, stamina: .96, radius: .805, lobes: 3, spinDirection: -1, catch: .42, deflect: .03 },
  hells: { key: 'hells', name: 'Hells Scythe', type: 'EQUILÍBRIO', image: './assets/hells-scythe.png', color: 0xc32b13, accent: 0xff5625, mass: 1.10, hit: .91, stamina: 1.12, radius: .775, lobes: 4, spinDirection: -1, catch: .20, deflect: .24 },
  knight: { key: 'knight', name: 'Knight Shield', type: 'DEFESA', image: './assets/knight-shield.png', color: 0x08612e, accent: 0x1abe55, mass: 1.08, hit: .70, stamina: 1.06, radius: .785, lobes: 3, spinDirection: -1, catch: .06, deflect: .12 },
  shark: {key:'shark',name:'Shark Scale',type:'ATAQUE',image:'./assets/shark.png',color:0x292061,accent:0xf029a5,ratchetColor:0x251e83,bitColor:0x27328a,mass:1.23,hit:1.38,stamina:.89,radius:.800,lobes:3,spinDirection:-1,catch:.52,deflect:.03,base:-.119,upper:.84,stock:['4-50','UF'],trait:'Upper Attack · o perfil baixo levanta a rival em contatos por baixo.'},
  wizard: {key:'wizard',name:'Wizard Rod',type:'RESISTÊNCIA',image:'./assets/wizard.png',color:0xd58d03,accent:0xffd51d,mass:1.18,hit:.73,stamina:1.30,radius:.842,lobes:5,spinDirection:-1,catch:.055,deflect:.22,outerMass:1.22,stock:['5-70','DB'],trait:'Peso periférico · o aro largo conserva giro e amortece contatos leves.'},
  cobalt: {key:'cobalt',name:'Cobalt Dragoon',type:'ATAQUE',image:'./assets/cobalt.png',color:0x17399d,accent:0x15b5e8,ratchetColor:0x18245e,bitColor:0x164ba7,mass:1.27,hit:1.29,stamina:1.03,radius:.815,lobes:3,spinDirection:1,catch:.40,deflect:.13,stock:['2-60','C'],trait:'Giro à esquerda · percorre o trilho no sentido oposto e pode equalizar o giro em contatos com rotação contrária.'},
  aero: {key:'aero',name:'Aero Pegasus',type:'ATAQUE',image:'./assets/aero.png',color:0x0b59b8,accent:0x42e683,metal:0x2b72ba,mass:1.29,hit:1.36,stamina:1.04,radius:.817,lobes:3,spinDirection:-1,catch:.43,deflect:.12,outerMass:1.12,smash:.31,stock:['3-70','A'],trait:'Ataque pesado · as pontas das asas ampliam impactos frontais.'},
  superion: {key:'superion',name:'Suppress Superion',type:'EQUILÍBRIO',image:'./assets/superion.png',color:0xc6b174,accent:0xf5cc44,ratchetColor:0xd4dfe2,bitColor:0xce312b,mass:1.34,hit:1.04,stamina:1.09,radius:.813,lobes:2,spinDirection:-1,catch:.24,deflect:.25,rigid:.23,stock:['0-70','LP'],trait:'BX Expand · o metal até o centro reduz o recuo e fortalece a resposta aos impactos.'},
  wyvern: {key:'wyvern',name:'Wyvern Hover',type:'DEFESA',image:'./assets/wyvern.png',color:0x599321,accent:0xc0e655,ratchetColor:0xc7ded1,bitColor:0x4b991f,mass:1.17,hit:.94,stamina:1.07,radius:.836,lobes:2,spinDirection:-1,catch:.27,deflect:.20,verticalGuard:.48,stock:['8-80','B'],trait:'Perfil oval · as rampas desviam golpes vindos de cima ou de baixo.'},
  silver: {key:'silver',name:'Silver Wolf',type:'RESISTÊNCIA',image:'./assets/silver.png',color:0x1f7476,accent:0x51d5da,ratchetColor:0x252c32,bitColor:0xd6c341,mass:1.24,hit:.76,stamina:1.19,radius:.824,lobes:6,spinDirection:-1,catch:.12,deflect:.20,freeRing:.56,stock:['3-80','FB'],trait:'Anel livre · desacopla a borda do núcleo para conservar giro nos choques.'},
  glory: {key:'glory',name:'Glory Valkyrie',type:'ATAQUE',image:'./assets/glory.png',color:0x1750a8,accent:0xffbd37,bitColor:0x1643a4,mass:1.43,hit:1.28,stamina:.98,radius:.818,lobes:3,spinDirection:-1,catch:.37,deflect:.09,integrated:true,bound:.62,stock:[null,'LF'],trait:'UX Expand · a mola rebate impactos e ajuda a saltar de volta dos bolsos.'},
};
export const RATCHETS = {
  '1-60': { mm: 6, radius: .488, mass: .104, lock: 1.05, balance: .96, teeth: 1, pocketJump: .52 },
  '3-60': { mm: 6, radius: .466, mass: .105, lock: 1.12, balance: 1.06, teeth: 3 },
  '4-60': { mm: 6, radius: .482, mass: .114, lock: 1.00, balance: 1.11, teeth: 4 },
  '3-80': { mm: 8, radius: .466, mass: .119, lock: .88, balance: .91, teeth: 3 },
  '4-80': { mm: 8, radius: .482, mass: .129, lock: .78, balance: .95, teeth: 4 },
  '0-70': {mm:7,radius:.453,mass:.120,lock:1.19,balance:1.13,teeth:0},
  '2-60': {mm:6,radius:.474,mass:.108,lock:.95,balance:.99,teeth:2},
  '4-50': {mm:5,radius:.473,mass:.100,lock:1.06,balance:1.08,teeth:4},
  '5-70': {mm:7,radius:.480,mass:.124,lock:1.04,balance:1.12,teeth:5},
  '3-70': {mm:7,radius:.466,mass:.112,lock:1.00,balance:1.01,teeth:3},
  '8-80': {mm:8,radius:.477,mass:.135,lock:.91,balance:.99,teeth:8},
};
const integratedBase = {mm:5.7,radius:.435,mass:0,lock:1.19,balance:1.06,teeth:0,pocketJump:.82};
export const BIT_TYPES = {
  attack: 'Ataque',
  balance: 'Equilíbrio',
  defense: 'Defesa',
  stamina: 'Resistência',
};
export const BITS = {
  // Style blends the measured launch profiles. Grip governs the Xtreme Line.
  F:  { name: 'Flat', type: 'attack', shape: 'flat', style: 1, grip: 1.08, drain: 1.49, attack: 1.17, balance: .89, height: .232, tip: .136, friction: .122, gear: .201, teeth: 12 },
  LF: { name: 'Low Flat', type: 'attack', shape: 'flat', style: .98, grip: 1.10, drain: 1.63, attack: 1.23, balance: .95, height: .198, tip: .143, friction: .143, gear: .201, teeth: 12 },
  R:  { name: 'Rush', type: 'attack', shape: 'flat', style: .86, grip: 1.20, drain: 1.20, attack: 1.10, balance: .94, height: .227, tip: .105, friction: .091, gear: .195, teeth: 10 },
  GF: { name: 'Gear Flat', type: 'attack', shape: 'flat', style: 1, grip: 1.24, drain: 1.79, attack: 1.26, balance: .82, height: .237, tip: .152, friction: .151, gear: .231, teeth: 16 },
  A:  {name:'Accel',type:'attack',shape:'flat',style:1,grip:1.21,drain:1.62,attack:1.25,balance:.90,height:.224,tip:.142,friction:.133,gear:.222,teeth:12},
  C:  {name:'Cyclone',type:'attack',shape:'cyclone',style:.92,grip:1.16,drain:1.38,attack:1.20,balance:.91,height:.231,tip:.125,friction:.113,gear:.211,teeth:12},
  UF: {name:'Under Flat',type:'attack',shape:'underFlat',style:.93,grip:1.10,drain:1.37,attack:1.18,balance:.96,height:.185,tip:.133,friction:.125,gear:.201,teeth:12},
  T:  { name: 'Taper', type: 'balance', shape: 'taper', style: .55, grip: .91, drain: .82, attack: .91, balance: 1.02, height: .232, tip: .103, friction: .078, gear: .190, teeth: 12 },
  P:  { name: 'Point', type: 'balance', shape: 'pointFlat', style: .44, grip: .97, drain: .88, attack: .94, balance: 1.05, height: .229, tip: .106, friction: .066, gear: .196, teeth: 12 },
  U:  { name: 'Unite', type: 'balance', shape: 'pointFlat', style: .32, grip: .87, drain: .80, attack: .83, balance: 1.10, height: .235, tip: .089, friction: .057, gear: .190, teeth: 12 },
  LP: {name:'Low Point',type:'balance',shape:'pointFlat',style:.46,grip:.98,drain:.90,attack:.98,balance:1.09,height:.195,tip:.109,friction:.069,gear:.194,teeth:12},
  GP: {name:'Gear Point',type:'balance',shape:'pointFlat',style:.62,grip:1.13,drain:1.04,attack:1.04,balance:.99,height:.233,tip:.111,friction:.083,gear:.225,teeth:16},
  HT: {name:'High Taper',type:'balance',shape:'taper',style:.52,grip:.90,drain:.83,attack:.87,balance:.97,height:.268,tip:.105,friction:.079,gear:.192,teeth:12},
  N:  { name: 'Needle', type: 'defense', shape: 'needle', style: .06, grip: .68, drain: .61, attack: .68, balance: 1.21, height: .228, tip: .039, friction: .161, gear: .177, teeth: 12 },
  HN: { name: 'High Needle', type: 'defense', shape: 'needle', style: .08, grip: .71, drain: .57, attack: .71, balance: 1.12, height: .266, tip: .035, friction: .140, gear: .180, teeth: 12 },
  S:  { name: 'Spike', type: 'defense', shape: 'spike', style: .025, grip: .62, drain: .67, attack: .66, balance: 1.18, height: .227, tip: .025, friction: .211, gear: .177, teeth: 12 },
  H:  {name:'Hexa',type:'defense',shape:'hexa',style:.17,grip:.79,drain:.73,attack:.79,balance:1.24,height:.236,tip:.088,friction:.137,gear:.190,teeth:12,facets:6},
  GN: {name:'Gear Needle',type:'defense',shape:'needle',style:.13,grip:.95,drain:.71,attack:.79,balance:1.15,height:.231,tip:.040,friction:.156,gear:.216,teeth:16},
  D:  {name:'Dot',type:'defense',shape:'dot',style:.11,grip:.75,drain:.64,attack:.72,balance:1.19,height:.233,tip:.067,friction:.145,gear:.184,teeth:12},
  B:  { name: 'Ball', type: 'stamina', shape: 'ball', style: 0, grip: .74, drain: .54, attack: .73, balance: 1.14, height: .229, tip: .128, friction: .028, gear: .184, teeth: 12, roll:.54 },
  O:  { name: 'Orb', type: 'stamina', shape: 'ball', style: 0, grip: .67, drain: .48, attack: .66, balance: 1.15, height: .232, tip: .088, friction: .020, gear: .181, teeth: 12, roll:.36 },
  DB: { name: 'Disk Ball', type: 'stamina', shape: 'disk', style: .04, grip: .66, drain: .46, attack: .71, balance: 1.23, height: .241, tip: .114, friction: .023, gear: .184, teeth: 12, roll:.44 },
  FB: {name:'Free Ball',type:'stamina',shape:'ball',style:.04,grip:.68,drain:.42,attack:.69,balance:1.16,height:.232,tip:.117,friction:.021,gear:.184,teeth:12,roll:.41,freeTip:true},
  GB: {name:'Gear Ball',type:'stamina',shape:'ball',style:.14,grip:.96,drain:.60,attack:.76,balance:1.08,height:.235,tip:.124,friction:.033,gear:.216,teeth:16,roll:.35},
  G:  {name:'Glide',type:'stamina',shape:'ball',style:.09,grip:.77,drain:.44,attack:.73,balance:1.20,height:.231,tip:.099,friction:.017,gear:.194,teeth:12,roll:.39},
};
export const DEFAULTS = [
  { blade: 'dran', ratchet: '3-60', bit: 'F', angle: 3, heading: -35, power: 94, point: [-3.65, 1.25] },
  { blade: 'hells', ratchet: '4-60', bit: 'T', angle: -5, heading: 34, power: 94, point: [3.50, -1.48] },
];
export const STAMINA = [
  { blade: 'hells', ratchet: '4-60', bit: 'B', angle: 9, heading: 18, power: 92, point: [-2.35, .4] },
  { blade: 'hells', ratchet: '4-60', bit: 'B', angle: -9, heading: -18, power: 85, point: [2.35, -.55] },
];
export const ATTACK = [
  { blade: 'dran', ratchet: '3-60', bit: 'F', angle: 0, heading: -150, power: 98, point: [-3.48, 1.55] },
  { blade: 'dran', ratchet: '3-60', bit: 'F', angle: 0, heading: 115, power: 94, point: [3.30, .92] },
];

export function launchVector(config) {
  const [x, z] = config.point, r = Math.hypot(x, z) || 1;
  const angle = (config.heading ?? 0) * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return { x: (-x * cos + z * sin) / r, z: (-x * sin - z * cos) / r };
}

export function launchPose(config) {
  const lean = config.angle * Math.PI / 180;
  const direction = launchVector(config);
  const s = Math.sin(lean / 2);
  const [x,z] = config.point;
  return { position: { x,y:SHOOT_HEIGHT,z }, rotation: { x: direction.z*s, y: 0, z: -direction.x*s, w: Math.cos(lean/2) }, direction };
}

export function launchRelease(config) {
  const {bit} = getParts(config);
  const settle = clamp((Math.abs(config.angle)-9)/26,0,1) * bit.style;
  return {settle,fall:-4.6,fraction:(1-.86*settle)*(.15+.18*bit.style)};
}

export function getParts(config) {
  const blade = BLADES[config.blade], bit = BITS[config.bit];
  const ratchet = blade.integrated ? integratedBase : RATCHETS[config.ratchet];
  const ratchetBottom = (blade.base ?? BLADE_BASE)-ratchet.mm/30;
  const standing = bit.height - ratchetBottom;
  const balance = bit.balance * ratchet.balance;
  const burstLock = ratchet.lock * (bit.type === 'attack' || config.bit === 'T' ? 2.45 : bit.type === 'balance' ? 1.3 : 1);
  const bitMass = .028+bit.height*.068+bit.gear*.064+bit.tip*.075+(bit.shape === 'disk' ? .030 : 0);
  const mass = blade.mass+ratchet.mass+bitMass;
  return { blade, ratchet, bit, bitMass, ratchetBottom, standing, balance, burstLock, mass };
}

export function sanitizeConfig(config, side) {
  const preset = DEFAULTS[side];
  const blade = Object.hasOwn(BLADES, config?.blade) ? config.blade : preset.blade;
  const rawPoint = Array.isArray(config?.point) ? config.point : preset.point;
  const x = clamp(Number.isFinite(rawPoint[0]) ? rawPoint[0] : preset.point[0],-5.2,5.2);
  const z = clamp(Number.isFinite(rawPoint[1]) ? rawPoint[1] : preset.point[1],-5.2,5.2);
  const sign = side === 0 ? -1 : 1;
  const sx = sign * Math.max(MIN_LAUNCH_SEPARATION,x*sign);
  const limit = openingRadius(Math.atan2(z,sx)) - BLADES[blade].radius - .13;
  const scale = Math.min(1,limit/Math.hypot(sx,z));
  const heading = Number.isFinite(config?.heading) ? config.heading : preset.heading;
  return {
    blade,
    ratchet: BLADES[blade].integrated ? null :
      Object.hasOwn(RATCHETS,config?.ratchet) ? config.ratchet : BLADES[blade].stock?.[0] ?? preset.ratchet,
    bit: Object.hasOwn(BITS, config?.bit) ? config.bit : BLADES[blade].stock?.[1] ?? preset.bit,
    angle: clamp(Number.isFinite(config?.angle) ? config.angle : preset.angle, -MAX_LAUNCH_ANGLE, MAX_LAUNCH_ANGLE),
    heading: ((heading % 360 + 540) % 360) - 180,
    power: clamp(Number.isFinite(config?.power) ? config.power : preset.power, 45, 100),
    point: [sign*Math.max(MIN_LAUNCH_SEPARATION-.04,Math.abs(sx * scale)), z * scale],
  };
}
