import * as T from './vendor/three.module.min.js';
import { SHELL } from './stadium.js';
import { BLADES } from './rules.js';
import { disposeBey, makeBey } from './bey-model.js';
import { makeLauncher } from './launcher.js';

const tabletop = SHELL.table;
const cm = value => value/3;
const floor = tabletop-cm(75);
const shapes = {
  box: () => new T.BoxGeometry(1,1,1),
  bevel: () => new T.CylinderGeometry(.54,.54,1,8).rotateY(Math.PI/8),
  disc: () => new T.CylinderGeometry(.5,.5,1,14),
  ring: () => new T.RingGeometry(.38,.5,20).rotateX(-Math.PI/2),
};

function stageModel(onAssetReady) {
  const group = new T.Group();
  const batches = new Map();
  const staticMeshes = new Map();
  const addProp = (figure,x,y,z,angle) => {
    figure.position.set(x,y,z);
    figure.rotation.y = angle;
    figure.updateMatrixWorld(true);
    const position = new T.Vector3(), normal = new T.Vector3(), normalMatrix = new T.Matrix3();
    figure.traverse(mesh=>{
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry, {position:vertices,normal:normals,uv} = geometry.attributes;
      const index = geometry.index;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const ranges = geometry.groups.length ? geometry.groups : [{start:0,count:index?.count ?? vertices.count,materialIndex:0}];
      normalMatrix.getNormalMatrix(mesh.matrixWorld);
      for (const {start,count,materialIndex} of ranges) {
        const material = materials[materials.length===1 ? 0 : materialIndex];
        const metallic = material.metalness>.5;
        const key = material.map ?? (metallic?'metal':'plastic');
        if (!staticMeshes.has(key)) staticMeshes.set(key,{metallic,map:material.map,positions:[],normals:[],uvs:[],colors:[]});
        const data = staticMeshes.get(key), color = material.color;
        for (let i=start;i<start+count;i++) {
          const vertex = index ? index.getX(i) : i;
          position.fromBufferAttribute(vertices,vertex).applyMatrix4(mesh.matrixWorld);
          normal.fromBufferAttribute(normals,vertex).applyNormalMatrix(normalMatrix);
          data.positions.push(position.x,position.y,position.z);
          data.normals.push(normal.x,normal.y,normal.z);
          data.colors.push(color.r,color.g,color.b);
          if (data.map) data.uvs.push(uv.getX(vertex),uv.getY(vertex));
        }
      }
    });
    disposeBey({holder:figure});
  };
  const instance = (shape,tint,x,y,z,w,h,d,rotation=0) => {
    if (!batches.has(shape)) batches.set(shape,[]);
    batches.get(shape).push({tint,x,y,z,w,h,d,rotation});
  };
  const box = (...args) => instance('box',...args);
  const finish = () => {
    const transform = new T.Object3D();
    const color = new T.Color();
    const material = new T.MeshLambertMaterial();
    for (const [shape,items] of batches) {
      const batch = new T.InstancedMesh(shapes[shape](),material,items.length);
      batch.receiveShadow = shape==='box';
      items.forEach(({tint,x,y,z,w,h,d,rotation},i)=>{
        transform.position.set(x,y,z);
        transform.rotation.y = rotation;
        transform.scale.set(w,h,d);
        transform.updateMatrix();
        batch.setMatrixAt(i,transform.matrix);
        batch.setColorAt(i,color.setHex(tint));
      });
      batch.computeBoundingSphere();
      group.add(batch);
    }
    // The tabletop props share a few draw calls while retaining their original silhouettes and crests.
    for (const data of staticMeshes.values()) {
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(data.positions,3));
      geometry.setAttribute('normal',new T.Float32BufferAttribute(data.normals,3));
      geometry.setAttribute('color',new T.Float32BufferAttribute(data.colors,3));
      if (data.map) geometry.setAttribute('uv',new T.Float32BufferAttribute(data.uvs,2));
      const material = new T.MeshStandardMaterial({
        vertexColors:true,map:data.map ?? null,metalness:data.metallic ? .78 : .16,roughness:data.metallic ? .29 : .48,
      });
      group.add(new T.Mesh(geometry,material));
    }
    return group;
  };
  const bey = (key,x,y,z,angle) => {
    const [ratchet,bit] = BLADES[key].stock ?? (key==='dran' ? ['3-60','F'] : key==='hells' ? ['4-60','T'] : ['3-80','N']);
    const {holder,standing} = makeBey({blade:key,ratchet,bit},undefined,onAssetReady);
    addProp(holder,x,y+standing,z,angle);
  };
  return {box,instance,addProp,bey,finish};
}

function prop(model,x,z,angle,base=tabletop) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return (shape,color,dx,y,dz,w,h,d,rotation=0)=>
    model.instance(shape,color,x+dx*cos+dz*sin,base+y,z+dz*cos-dx*sin,w,h,d,angle+rotation);
}

function deckCase(model,x,z,angle,lid,blades) {
  const part = prop(model,x,z,angle);
  part('bevel',0x282c35,0,.19,.98,6.26,.36,2.29);
  part('bevel',0x171b24,0,.39,.97,6.04,.17,2.16);
  part('bevel',lid,0,.09,-1.18,6.29,.17,2.13);
  part('bevel',0x413340,0,.187,-1.18,5.96,.049,1.91);
  part('bevel',lid,0,.22,-1.18,5.70,.052,1.68);
  for (const edge of [-.05,1.98]) part('box',0x343a47,0,.44,edge,5.80,.20,.12);
  for (const end of [-2.90,2.90]) {
    part('box',0x343a47,end,.44,.97,.12,.20,1.99);
    part('box',0x282e38,end*.64,.36,-.08,.44,.19,.41);
    part('box',lid,end*.64,.355,2.04,.49,.18,.29);
    part('box',lid,end*.93,.29,-1.19,.12,.22,1.71);
  }
  for (const edge of [-2.12,-.25]) {
    part('box',lid,0,.28,edge,5.77,.21,.13);
  }
  [-1.92,0,1.92].forEach((slot,i)=>{
    part('disc',0x0c111a,slot,.485,.97,1.66,.043,1.66);
    part('ring',0x424752,slot,.516,.97,1.81,1,1.81);
    const key = blades[i];
    if (key) model.bey(key,x+slot*Math.cos(angle)+.97*Math.sin(angle),tabletop+.506,z+.97*Math.cos(angle)-slot*Math.sin(angle),angle+.52*i);
  });
}

function spareLauncher(model,x,z,angle,accent,ripcord=false) {
  const launcher = makeLauncher(accent,ripcord?'ripcord':'string');
  launcher.setPull(ripcord?2.36:.78);
  const y = -new T.Box3().setFromObject(launcher.group).min.y;
  model.addProp(launcher.group,x,tabletop+y+.022,z,angle);
}

function looseCord(model,x,z,angle,color) {
  const part = prop(model,x,z,angle);
  const points = [[-.86,-.66],[-.56,-.55],[-.08,-.38],[.12,-.16],[.11,.02],[-.11,.20],[-.38,.27],[-.52,.44],[-.41,.65],[.05,.71],[.51,.46],[.68,.22],[.87,.08]];
  for (let i=1;i<points.length;i++) {
    const [ax,az] = points[i-1], [bx,bz] = points[i];
    part('box',color,(ax+bx)*.5,.057,(az+bz)*.5,Math.hypot(bx-ax,bz-az)+.063,.074,.073,-Math.atan2(bz-az,bx-ax));
  }
  part('box',0x171e27,1.01,.109,.04,.39,.19,.46,.25);
}

function chair(model,x,z,angle) {
  const part = prop(model,x,z,angle,floor);
  const tint = 0x456479;
  const frame = 0x343e49;
  for (const lx of [-18,18]) for (const lz of [-17.3,17.3]) {
    part('box',frame,cm(lx),cm(21.5),cm(lz),cm(3.1),cm(43),cm(3.1));
  }
  part('bevel',tint,0,cm(42.7),0,cm(42.5),cm(4.6),cm(42));
  for (const back of [-17.3,17.3]) part('box',frame,cm(back),cm(60),cm(18),cm(2.6),cm(36),cm(2.6));
  part('bevel',tint,0,cm(71),cm(19),cm(44),cm(20),cm(3.8));
  part('box',frame,0,cm(52),cm(18),cm(37),cm(2.9),cm(3.5));
}

const tableWidth = cm(120), tableDepth = cm(75);
// The chairs face local -Z. Leave clearance for each seat before placing it at a table edge.
const chairOffset = cm(22+6);
const chairs = [
  [-tableWidth/2-chairOffset,0,-Math.PI/2],
  [tableWidth/2+chairOffset,0,Math.PI/2],
  [0,-tableDepth/2-chairOffset,Math.PI],
  [0,tableDepth/2+chairOffset,0],
];
const defaultSky = 0x0e1324;
const tableSky = 0x111a2c;

function makeTabletop() {
  const x = tableWidth/2-.10, z = tableDepth/2-.10, r = .82;
  const outline = new T.Shape();
  outline.moveTo(-x+r,-z);
  outline.lineTo(x-r,-z);
  outline.quadraticCurveTo(x,-z,x,-z+r);
  outline.lineTo(x,z-r);
  outline.quadraticCurveTo(x,z,x-r,z);
  outline.lineTo(-x+r,z);
  outline.quadraticCurveTo(-x,z,-x,z-r);
  outline.lineTo(-x,-z+r);
  outline.quadraticCurveTo(-x,-z,-x+r,-z);
  outline.closePath();
  const depth = cm(3.6), bevelThickness = .12;
  const geometry = new T.ExtrudeGeometry(outline,{
    depth,steps:1,curveSegments:4,bevelSegments:1,bevelThickness,bevelSize:.10,
  }).rotateX(-Math.PI/2);
  const wood = new T.MeshLambertMaterial({color:0xa07559});
  const top = new T.Mesh(geometry,wood);
  top.position.y = tabletop-depth-bevelThickness;
  top.receiveShadow = true;
  return top;
}

function makeBackdrop() {
  const group = new T.Group();
  group.name = 'Quadriculado';
  const ground = new T.Mesh(new T.PlaneGeometry(260,260),new T.MeshBasicMaterial({color:tableSky,toneMapped:false}));
  ground.rotation.x = -Math.PI/2;
  ground.position.y = floor;
  group.add(ground);
  const grid = new T.GridHelper(240,48,0x3a5374,0x314660);
  grid.position.y = floor+.014;
  grid.material.transparent = true;
  grid.material.opacity = .38;
  grid.material.toneMapped = false;
  group.add(grid);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const shade = (x,z,w,d,alpha) => {
    ctx.save();
    ctx.translate(128+x*2.56,128+z*2.56);
    ctx.scale(w*2.56,d*2.56);
    const gradient = ctx.createRadialGradient(0,0,.18,0,0,1);
    gradient.addColorStop(0,'rgba(5,8,16,'+alpha+')');
    gradient.addColorStop(1,'rgba(5,8,16,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(-1,-1,2,2);
    ctx.restore();
  };
  shade(0,0,28,19,.76);
  for (const [x,z] of chairs) shade(x,z,9,9,.48);
  const shadow = new T.Mesh(new T.PlaneGeometry(100,100),new T.MeshBasicMaterial({
    map:new T.CanvasTexture(canvas),transparent:true,depthWrite:false,
  }));
  shadow.rotation.x = -Math.PI/2;
  shadow.position.y = floor+.025;
  group.add(shadow);
  return group;
}

export const sceneryOptions = [['standard','Padrão'],['shop','Mesa de Beyblade']];

export function createScenery(key,onAssetReady) {
  if (key!=='shop') return {sky:defaultSky};

  const model = stageModel(onAssetReady);
  const legTop = tabletop-cm(4);
  const legHeight = legTop-floor;
  for (const x of [-17.4,17.4]) {
    for (const z of [-9.6,9.6]) {
      model.box(0x313742,x,floor+legHeight*.5,z,1.36,legHeight,1.36);
      model.box(0x252b36,x,floor+.23,z,1.65,.46,1.65);
    }
    model.box(0x3e4248,x,legTop-1.42,0,1.17,2.83,20.3);
  }
  for (const z of [-9.6,9.6]) model.box(0x3e4248,0,legTop-1.42,z,34.4,2.83,1.17);
  const matColor = 0x294b55, line = 0x64838b;
  model.box(matColor,0,tabletop+.017,.20,22.6,.034,18.4);
  for (const x of [-11.05,11.05]) model.box(line,x,tabletop+.038,.20,.052,.012,17.9);
  for (const z of [-8.75,9.15]) model.box(line,0,tabletop+.038,z,22.15,.012,.052);
  for (const [x,z,angle] of chairs) chair(model,x,z,angle);

  deckCase(model,-10.7,-9.61,-.15,0xb46572,['dran',null,'shark']);
  deckCase(model,7.41,10.13,.04,0x417892,['wizard','silver',null]);
  spareLauncher(model,-10.65,2.45,-1.65,0xdf5277,true);
  spareLauncher(model,10.33,-5.41,2.11,0x2b9fcf);
  spareLauncher(model,-5.45,9.75,-.32,0xe7963f);
  model.bey('superion',-11.74,tabletop,-2.17,.42);
  model.bey('shark',-9.52,tabletop+.034,6.24,-.45);
  model.bey('wyvern',10.98,tabletop+.034,-8.38,.3);
  model.bey('hells',9.92,tabletop+.034,1.58,-.7);
  looseCord(model,12.12,3.72,-.45,0x252a35);
  model.instance('ring',0xd1ab58,1.40,tabletop+.055,9.70,.84,1,.84,.36);
  model.instance('disc',0x4bb0bc,2.58,tabletop+.16,9.81,.36,.31,.36);

  const group = model.finish();
  group.add(makeTabletop(),makeBackdrop());
  return {sky:tableSky,group};
}
