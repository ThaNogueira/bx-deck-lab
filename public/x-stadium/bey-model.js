import * as T from './vendor/three.module.min.js';
import { BLADE_BASE, BLADE_TOP, GEAR_HEIGHT, GEAR_HALF_HEIGHT, RATCHET_OUTLINES, bitProfile, getParts, ratchetLobes } from './rules.js';
import { FREE_RING_PROFILE, bladeLevels, bladeOutline } from './blade-shape.js';

const TAU = Math.PI * 2;
const material = (color, roughness, metalness, extra = {}) =>
  new T.MeshStandardMaterial({ color, roughness, metalness, ...extra });

const CREST_CROP = { 'Dran Sword':[222,219,91], 'Hells Scythe':[230,241,92], 'Knight Shield':[191,177,72] };
const crestCache = new Map();

function crest(blade, onLoad) {
  const known = crestCache.get(blade.name);
  if (known) {
    if (onLoad && !known.ready) known.listeners.add(onLoad);
    return known.texture;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#15202a';
  ctx.fillRect(0, 0, 192, 192);
  ctx.font = 'italic 800 120px Barlow, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#' + blade.accent.toString(16).padStart(6, '0');
  ctx.fillText(blade.name[0], 96, 100);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  const entry = { texture, ready: false, listeners: new Set(onLoad ? [onLoad] : []) };
  crestCache.set(blade.name, entry);
  const img = new Image();
  img.onload = () => {
    const [x,y,r] = CREST_CROP[blade.name] ?? blade.crest ?? [210,210,77];
    ctx.drawImage(img, x-r, y-r, r*2, r*2, 0, 0, 192, 192);
    texture.needsUpdate = true;
    entry.ready = true;
    for (const notify of entry.listeners) notify();
    entry.listeners.clear();
  };
  img.src = blade.image;
  return texture;
}

function mesh(parent, geometry, mat, y = 0) {
  const part = new T.Mesh(geometry, mat);
  part.position.y = y;
  parent.add(part);
  return part;
}

function lathe(parent, points, mat, segments = 32) {
  return mesh(parent, new T.LatheGeometry(points.map(p => new T.Vector2(...p)), segments), mat);
}

function disc(parent, inner, outer, y, mat) {
  const geo = new T.RingGeometry(inner, outer, 48).rotateX(-Math.PI / 2);
  return mesh(parent, geo, mat, y);
}

// Walk from the underside to the top of the shell. Each ring can follow a
// different amount of the outline to model shoulders, bevels and recesses.
function moldedShell(parent, outline, levels, materials) {
  const count = outline.length;
  const positions = [], facesByMaterial = materials.map(() => []);
  for (const [radius, y, contour] of levels) {
    outline.forEach((fraction, i) => {
      const a = TAU * i / count;
      const r = radius + (fraction - 1) * contour;
      positions.push(r * Math.cos(a), y, r * Math.sin(a));
    });
  }
  for (let row = 0; row < levels.length - 1; row++) {
    const faces = facesByMaterial[levels[row+1][3] ?? 0];
    for (let i = 0; i < count; i++) {
      const a = row * count + i, b = row * count + (i + 1) % count;
      const c = a + count, d = b + count;
      faces.push(a,c,b,b,c,d);
    }
  }
  const faces = facesByMaterial.flat();
  const geo = new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(positions, 3))
    .setIndex(faces).toNonIndexed();
  geo.computeVertexNormals();
  let offset = 0;
  facesByMaterial.forEach((indices,material) => {
    if (indices.length) geo.addGroup(offset,indices.length,material);
    offset += indices.length;
  });
  return mesh(parent, geo, materials);
}

// Detail patches use polar coordinates within one lobe. They share a draw
// call and leave the molded outline intact when the rotor is viewed on edge.
function relief(parent, lobes, patches, mat) {
  const positions = [];
  for (let lobe = 0; lobe < lobes; lobe++) {
    for (const patch of patches) {
      const vertices = patch.map(([offset,r,y]) => {
        const a = (lobe + offset) * TAU / lobes;
        return [r * Math.cos(a), y, r * Math.sin(a)];
      });
      const contour = vertices.map(([x,,z]) => new T.Vector2(x, -z));
      const clockwise = T.ShapeUtils.isClockWise(contour);
      for (const tri of T.ShapeUtils.triangulateShape(contour, [])) {
        const [a,b,c] = tri;
        const up = (vertices[b][2] - vertices[a][2]) * (vertices[c][0] - vertices[a][0]) -
          (vertices[b][0] - vertices[a][0]) * (vertices[c][2] - vertices[a][2]);
        for (const i of up >= 0 ? tri : [a,c,b]) positions.push(...vertices[i]);
      }
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i], b = vertices[(i + 1) % vertices.length];
        const lowA = [a[0], a[1] - .043, a[2]], lowB = [b[0], b[1] - .043, b[2]];
        positions.push(...(clockwise ? [...lowA,...a,...b,...lowA,...b,...lowB] : [...lowA,...b,...a,...lowA,...lowB,...b]));
      }
    }
  }
  const geo = new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return mesh(parent, geo, mat);
}

function cutoutRing(parent,blade,outline,level,material,edge) {
  const dran = blade.key === 'dran', lobes = blade.lobes;
  const [radius,y,contour] = level;
  const polar = (a,r) => new T.Vector2(r*Math.cos(a),-r*Math.sin(a));
  const perimeter = outline.map((reach,i)=>polar(i*TAU/outline.length,radius+(reach-1)*contour));
  const holes = [outline.map((_,i)=> {
    const a = i*TAU/outline.length;
    return polar(a,dran ? .539+.025*Math.cos(a*3+.52) : .557+.011*Math.cos(a*4-.24));
  })];
  const slot = dran ? [[.61,.675],[.68,.705],[.88,.688],[.96,.628],[.86,.600],[.67,.616]] :
    [[.43,.662],[.52,.690],[.67,.688],[.76,.646],[.69,.608],[.50,.621]];
  for (let i=0;i<lobes;i++) holes.push(slot.map(([a,r])=>polar((i+a)*TAU/lobes,r)));
  const nodes = [perimeter,...holes].flat();
  const positions = nodes.flatMap(p=>[p.x,y,-p.y]);
  const indices = T.ShapeUtils.triangulateShape(perimeter,holes).flat();
  const top = new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3)).setIndex(indices);
  top.computeVertexNormals();
  mesh(parent,top,material);
  const sides = [];
  for (const hole of holes) {
    hole.forEach((a,i)=> {
      const b = hole[(i+1)%hole.length];
      const v = [a.x,y,-a.y], w = [b.x,y,-b.y], u = [a.x,y-.092,-a.y], t = [b.x,y-.092,-b.y];
      sides.push(...v,...w,...u,...w,...t,...u);
    });
  }
  const cuts = new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(sides,3));
  cuts.computeVertexNormals();
  mesh(parent,cuts,edge);
}

function buildClassicBlade(parent,blade,outline,levels,{resin,tint,steel,bright,edge,core}) {
  const dran = blade.key === 'dran';
  cutoutRing(parent,blade,outline,levels.at(-2),bright,edge);
  const bodyResin = dran ? resin : material(0x910d26,.24,.21);
  const crestRim = dran ? tint : material(0xd72442,.27,.25);
  lathe(parent,[[.31,-.123],[.477,-.100],[.532,-.062],[.554,.025],[.545,.083],[.500,.127],[.401,.142],[.356,.148]],bodyResin,48);
  lathe(parent,[[.348,.150],[.391,.150],[.410,.170],[.394,.199],[.367,.206]],crestRim,48);
  const dark = material(dran ? 0x14296e : 0x540b18,.23,.32);
  const accent = dran ? [[.02,.405,.174],[.13,.480,.151],[.24,.540,.144],[.42,.517,.166],[.38,.449,.168],[.24,.410,.177]] :
    [[.03,.411,.167],[.08,.469,.161],[.20,.541,.146],[.43,.536,.147],[.52,.489,.159],[.47,.404,.167]];
  relief(parent,3,[accent],dark);
  const rim = dran ? [
    [[.31,.685,.157],[.324,.737,.156],[.391,.750,.191],[.57,.708,.188],[.60,.639,.171],[.43,.683,.166]],
    [[.745,.674,.161],[.783,.731,.171],[.832,.762,.205],[.91,.748,.175],[1.005,.697,.158],[.923,.666,.167]],
  ] : [
    [[.025,.586,.157],[.071,.670,.163],[.156,.742,.170],[.24,.726,.178],[.253,.670,.167],[.141,.621,.178]],
    [[.771,.610,.155],[.822,.636,.160],[.902,.703,.157],[.957,.703,.172],[.956,.670,.188],[.864,.607,.178]],
  ];
  relief(parent,blade.lobes,rim,steel);
  const arm = [[.685,.594,.163],[.707,.554,.192],[.726,.408,.220],[.751,.378,.222],
    [.776,.402,.221],[.815,.549,.184],[.840,.593,.157],[.752,.552,.183]];
  relief(parent,3,[arm],bright);
  relief(parent,3,[[[.739,.506,.202],[.742,.448,.216],[.760,.436,.215],[.774,.451,.211],[.773,.502,.202]]],edge);
  relief(parent,3,[[[.750,.490,.205],[.751,.454,.218],[.761,.448,.217],[.767,.455,.215],[.765,.488,.206]]],core);
}

function buildBlade(parent, key, blade, colors, onLoad) {
  const { steel, bright, edge, resin, tint, core } = colors;
  const classic = key === 'dran' || key === 'hells';
  const outline = bladeOutline(blade), levels = bladeLevels(blade);
  moldedShell(parent,outline,classic ? levels.slice(0,-1) : levels,[steel, bright, edge]);
  if (classic) buildClassicBlade(parent,blade,outline,levels,colors);
  else lathe(parent, [[.27,-.117],[.519,-.10],[.552,-.042],[.56,.048],[.521,.060],[.379,.060],[.342,.052]],core);
  lathe(parent, [[.333,.058],[.385,.096],[.391,.151],[.375,.188],[.349,.207],[.329,.207]], core);
  disc(parent, .329, .352, .210, bright);
  disc(parent, .349, .375, .203, edge);
  mesh(parent, new T.CircleGeometry(.332, 48).rotateX(-Math.PI / 2),
    material(0xffffff, .45, .13, { map: crest(blade, onLoad) }), BLADE_TOP - .013);

  if (classic) return;
  if (key === 'knight') {
    lathe(parent,[[.390,.080],[.436,.106],[.508,.118],[.555,.113],[.574,.091]],resin);
    relief(parent,3,[
      [[.05,.436,.127],[.09,.542,.140],[.24,.556,.137],[.31,.525,.127],[.25,.436,.128]],
      [[.46,.417,.125],[.45,.504,.147],[.62,.554,.142],[.77,.533,.137],[.73,.428,.125]],
    ],tint);
    relief(parent,3,[
      [[.15,.653,.132],[.25,.734,.159],[.38,.757,.152],[.53,.727,.154],[.59,.648,.155],
        [.52,.607,.165],[.44,.534,.167],[.39,.397,.169],[.31,.411,.160],[.28,.520,.164],[.23,.615,.145]],
      [[.64,.642,.132],[.71,.697,.157],[.82,.721,.151],[.95,.655,.144],[.82,.615,.153]],
    ],bright);
    relief(parent,3,[
      [[.30,.659,.169],[.39,.689,.172],[.47,.673,.168],[.42,.581,.176],[.37,.479,.176]],
    ],edge);
  } else {
    buildBladeDetails(parent,blade,colors);
  }
}

function buildBladeDetails(parent,blade,{resin,tint,edge,bright,core}) {
  const outer = blade.radius;
  const accents = {
    shark: [[.06,.42],[.18,.55],[.39,.66],[.52,.70],[.49,.58],[.34,.46]],
    wizard: [[.04,.39],[.21,.56],[.30,.68],[.48,.70],[.57,.59],[.40,.45],[.28,.41]],
    cobalt: [[.03,.42],[.24,.49],[.35,.60],[.68,.70],[.64,.57],[.43,.46]],
    aero: [[.06,.42],[.27,.47],[.39,.60],[.60,.72],[.56,.61],[.40,.47],[.28,.41]],
    superion: [[.08,.41],[.15,.54],[.29,.63],[.47,.66],[.49,.59],[.31,.48]],
    wyvern: [[.03,.41],[.12,.49],[.27,.55],[.43,.66],[.61,.64],[.52,.52],[.31,.43]],
    silver: [[.11,.41],[.28,.54],[.48,.64],[.66,.66],[.60,.56],[.41,.43]],
    glory: [[.06,.40],[.18,.50],[.36,.61],[.55,.72],[.64,.67],[.45,.49],[.29,.41]],
  };
  const pattern = accents[blade.key];
  relief(parent,blade.lobes,[pattern.map(([a,r])=>[a,r,.147+(r-.40)*.085])],resin);
  relief(parent,blade.lobes,[pattern.map(([a,r])=>[a+.18,.43+(r-.42)*.67,.159])],tint);
  const leading = blade.spinDirection>0 ? .26 : .53;
  relief(parent,blade.lobes,[[[leading-.15,outer*.83,.130],[leading,outer*.955,.127],
    [leading+.13,outer*.905,.141],[leading+.23,outer*.77,.166],[leading+.04,outer*.70,.154]]],bright);
  if (blade.upper) {
    relief(parent,3,[[[.19,.568,.151],[.23,.738,.147],[.34,.743,.137],[.29,.578,.154]]],edge);
  }
  if (blade.key === 'cobalt') {
    lathe(parent,[[.37,.109],[.424,.119],[.432,.135],[.410,.142],[.389,.141]],material(0x8c2435,.28,.25),36);
  }
  if (blade.smash) {
    relief(parent,3,[[[.09,.38,.158],[.16,.46,.163],[.37,.49,.167],[.51,.55,.156],
      [.50,.60,.152],[.34,.55,.162],[.11,.48,.161]]],material(0xe2edda,.26,.24));
  }
  if (blade.rigid) {
    relief(parent,4,[[[.12,.362,.194],[.20,.436,.184],[.29,.580,.145],[.37,.579,.150],[.28,.423,.197]]],bright);
  }
  if (blade.outerMass > 1.15) {
    const bolt = new T.CylinderGeometry(.047,.06,.024,8);
    const recess = new T.CylinderGeometry(.026,.026,.009,8);
    for (let i=0;i<blade.lobes;i++) {
      const a = TAU*(i+.34)/blade.lobes;
      const stud = mesh(parent,bolt,edge,.143);
      stud.position.set(Math.cos(a)*outer*.83,.143,Math.sin(a)*outer*.83);
      const cap = mesh(parent,recess,bright,.159);
      cap.position.set(stud.position.x,.159,stud.position.z);
    }
  }
  if (blade.verticalGuard) {
    relief(parent,2,[[[.18,.63,.142],[.32,.73,.151],[.52,.77,.145],[.70,.68,.143],
      [.63,.64,.148],[.51,.72,.151],[.34,.68,.156]]],bright);
  }
  if (blade.freeRing) {
    relief(parent,3,[[[.16,.39,.169],[.20,.53,.170],[.38,.58,.155],[.52,.52,.155],[.38,.42,.165]]],core);
  }
  if (blade.bound) {
    lathe(parent,[[.355,.130],[.392,.138],[.415,.166],[.401,.190],[.375,.198]],tint,30);
    relief(parent,3,[[[.20,.425,.16],[.26,.505,.168],[.35,.491,.178],[.32,.422,.168]]],core);
  }
}

function buildRatchet(parent, blade, ratchet, bottom, { resin, tint, nylon, core,ratchetShell }) {
  const r = ratchet.radius;
  const lobe = RATCHET_OUTLINES[ratchet.teeth];
  const outline = Array.from({length:ratchetLobes(ratchet)},()=>lobe).flat();
  const seat = blade.base ?? BLADE_BASE;
  if (blade.integrated) {
    lathe(parent,[[.15,bottom+.012],[.20,bottom],[.32,bottom],[.43,bottom+.047],[.47,seat-.023],[.40,seat+.012]],resin,32);
    return lathe(parent,[[.19,bottom+.018],[.27,bottom+.016],[.33,bottom+.024],[.34,bottom+.051]],tint,24);
  }
  moldedShell(parent, outline, [
    [.175,bottom+.022,0],[.255,bottom+.005,0],[r*.83,bottom,r*.59,0],
    [r*.96,bottom+.028,r*.86,1],[r,bottom+.069,r,0],[r*.98,seat-.028,r,0],
    [r*.92,seat+.012,r*.80,1],[.244,seat+.02,0,0],
  ],[ratchetShell,tint]);
  lathe(parent,[[.133,bottom+.045],[.169,bottom+.040],[.238,bottom+.047],[.275,bottom+.066]],nylon,24);
  lathe(parent,[[.119,bottom+.030],[.148,bottom+.036],[.168,bottom+.051]],core,24);
  const lock = new T.BoxGeometry(.117,.018,.188);
  const screw = new T.CylinderGeometry(.027,.029,.012,8);
  for (const sign of [-1,1]) {
    const plate = mesh(parent,lock,nylon,bottom+.061);
    plate.position.x = sign*.213;
    const inset = mesh(parent,screw,core,bottom+.044);
    inset.position.x = sign*.226;
  }
}

function buildBit(parent,bit,standing,{resin,bitResin,nylon}) {
  const origin = new T.Group();
  origin.position.y = -standing;
  parent.add(origin);
  const r = bit.gear;
  const profile = bitProfile(bit);
  if (bit.name === 'Glide') lathe(origin,profile.slice(0,5),nylon,28);
  lathe(origin,[...(bit.name === 'Glide' ? profile.slice(4) : profile),[r*.79,.143],[r*.79,.179],[r*.73,.194],
    [r*.73,bit.height],[r*.51,bit.height+.04],[r*.51,bit.height+.094],[0,bit.height+.094]],bitResin,bit.facets??24);
  const outline = Array.from({ length: bit.teeth }, () => [.79, .985, 1, .80]).flat();
  moldedShell(origin, outline, [
    [r*.62,GEAR_HEIGHT-.031,0], [r*.90,GEAR_HEIGHT-GEAR_HALF_HEIGHT,r*.76,0],
    [r,GEAR_HEIGHT-.015,r,1], [r,GEAR_HEIGHT+.017,r,1],
    [r*.90,GEAR_HEIGHT+GEAR_HALF_HEIGHT,r*.64,0], [r*.61,GEAR_HEIGHT+.031,0,0],
  ], [bitResin, resin]);
  if (bit.shape === 'disk') {
    lathe(origin, [[r*.74,.094],[.237,.098],[.249,.116],[.232,.132],[r*.72,.133]], nylon);
  }
  if (bit.freeTip) lathe(origin,[[r*.96,.085],[r*1.02,.098],[r*1.02,.115],[r*.91,.123]],nylon,24);
}

export function makeBey(config, player, onTextureLoad) {
  const { blade, ratchet, bit, ratchetBottom, standing } = getParts(config);
  const holder = new T.Group(), under = new T.Group(), rotor = new T.Group();
  holder.add(rotor);
  rotor.add(under);
  const colors = {
    steel: material(blade.bound ? 0xe5e9ed : blade.metal??0xb6bfca,.23,blade.bound ? .56 : .91,{envMapIntensity:1.34}),
    bright: material(blade.bound ? 0xf5f6fa : blade.metal??0xe5eaf2,.16,blade.bound ? .52 : .88,{envMapIntensity:1.48}),
    edge: material(0x657188,.28,.88,{envMapIntensity:1.17}),
    core: material(0x222932, .31, .42),
    resin: material(blade.color, .26, .28),
    tint: material(blade.accent, .25, .28),
    nylon: material(0xe4ecec,.38,.05),
    ratchetShell:material(blade.ratchetColor??blade.color,.20,.18,{envMapIntensity:1.2}),
    bitResin:material(blade.bitColor??blade.accent,.22,.13),
  };
  buildBlade(rotor, config.blade, blade, colors, onTextureLoad);
  const boundPlate = buildRatchet(blade.integrated ? rotor : under,blade,ratchet,ratchetBottom,colors);
  let freeRing;
  if (blade.freeRing) {
    freeRing = new T.Group();
    rotor.add(freeRing);
    lathe(freeRing,FREE_RING_PROFILE,colors.ratchetShell,36);
    relief(freeRing,6,[[[.04,.703,-.130],[.10,.727,-.112],[.23,.727,-.112],[.26,.703,-.130]]],colors.core);
  }
  buildBit(under, bit, standing, colors);
  let exposure;
  if (player !== undefined) {
    disc(rotor, .375, .390, .198, new T.MeshBasicMaterial({ color: player === 0 ? 0x51b4ff : 0xff8847 }));
    const blurMaterials = [colors.steel, colors.bright, colors.tint].map(mat => {
      const soft = mat.clone();
      soft.transparent = true;
      soft.depthWrite = false;
      return soft;
    });
    const r = blade.radius;
    const blur = moldedShell(rotor, Array(48).fill(1), [
      [r*.83,-.027,0], [r*.974,.024,0,0], [r*.968,.097,0,0],
      [r*.898,.177,0,1], [r*.784,.177,0,0], [r*.674,.159,0,2], [.40,.172,0,2],
    ], blurMaterials);
    blur.visible = false;
    exposure = radians => {
      const alpha = Math.max(0, Math.min(.64, (radians - .22) * .82));
      blur.visible = alpha > 0;
      for (const mat of blurMaterials) mat.opacity = alpha;
    };
  }
  return {holder,rotor,under,standing,blade,freeRing,boundPlate,setExposure:exposure};
}

export function disposeBey({ holder }) {
  const materials = new Set();
  holder.traverse(item => {
    item.geometry?.dispose();
    if (item.material) for (const mat of [item.material].flat()) materials.add(mat);
  });
  for (const mat of materials) mat.dispose();
}
