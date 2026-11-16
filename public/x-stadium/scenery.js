import * as T from './vendor/three.module.min.js';
import { SHELL } from './stadium.js';
import { BLADES } from './rules.js';
import { disposeBey, makeBey } from './bey-model.js';
import { makeLauncher } from './launcher.js';

const tabletop = SHELL.table;
const floor = -6.6;
const cm = value => value/3;
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
  const instance = (shape,surface,tint,x,y,z,w,h,d,rotation=0,roll=0) => {
    const key = shape+':'+surface;
    if (!batches.has(key)) batches.set(key,{shape,surface,items:[]});
    batches.get(key).items.push({tint,x,y,z,w,h,d,rotation,roll});
  };
  const box = (...args) => instance('box','solid',...args);
  const glow = (...args) => instance('box','light',...args);
  const decal = (x,y,z,w,h,draw,{flat=false,transparent=false,angle=0}={}) => {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 160;
    draw(canvas.getContext('2d'));
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    const face = new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,transparent,depthWrite:!transparent}));
    face.position.set(x,y,z);
    face.rotation.set(flat?-Math.PI/2:0,angle,0,'YXZ');
    group.add(face);
  };
  const label = (title,caption,accent,x,y,z,w,h,flat=false) => decal(x,y,z,w,h,ctx=>{
    const background = ctx.createLinearGradient(0,0,384,160);
    background.addColorStop(0,'#253148');background.addColorStop(1,'#0b111b');
    ctx.fillStyle = background;
    ctx.fillRect(0,0,384,160);
    ctx.fillStyle = accent;
    ctx.fillRect(0,0,8,160);
    ctx.font = '800 italic 60px Barlow, sans-serif';
    ctx.fillStyle = '#eef4ff';
    ctx.fillText(title,24,76,336);
    ctx.font = '700 23px Barlow, sans-serif';
    ctx.fillStyle = accent;
    ctx.fillText(caption,26,120,330);
  },{flat});
  const cutaway = (build,axis,edge,side) => {
    const part = stageModel(onAssetReady);
    build(part);
    const wall = part.finish();
    (group.userData.cutaways ??= []).push({wall,axis,edge,side});
    group.add(wall);
  };
  const finish = () => {
    const transform = new T.Object3D();
    const color = new T.Color();
    for (const {shape,surface,items} of batches.values()) {
      const material = surface==='light' ? new T.MeshBasicMaterial() : new T.MeshLambertMaterial();
      const batch = new T.InstancedMesh(shapes[shape](),material,items.length);
      batch.receiveShadow = surface==='table';
      items.forEach(({tint,x,y,z,w,h,d,rotation,roll},i)=>{
        transform.position.set(x,y,z);
        transform.rotation.set(0,rotation,roll);
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
  return {box,glow,instance,label,decal,cutaway,addProp,bey,finish};
}

function ground(model,color,seam,step) {
  model.box(color,0,floor-.25,0,100,.5,100);
  for (let n=-7;n<=7;n++) {
    model.box(seam,n*step,floor+.016,0,.055,.022,100);
    model.box(seam,0,floor+.016,n*step,100,.022,.055);
  }
}

function contactShade(model,w,d) {
  model.decal(0,floor+.032,0,w,d,ctx=>{
    ctx.translate(192,80);
    ctx.scale(1,160/384);
    const shade = ctx.createRadialGradient(0,0,23,0,0,186);
    shade.addColorStop(0,'#0b0c14c4');
    shade.addColorStop(.53,'#0b0c148a');
    shade.addColorStop(1,'#0b0c1400');
    ctx.fillStyle = shade;
    ctx.fillRect(-192,-192,384,384);
  },{flat:true,transparent:true});
}

function prop(model,x,z,angle,base=tabletop) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return (shape,color,dx,y,dz,w,h,d,rotation=0)=>
    model.instance(shape,'solid',color,x+dx*cos+dz*sin,base+y,z+dz*cos-dx*sin,w,h,d,angle+rotation);
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

function chair(model,x,z,angle,tint,base) {
  const part = prop(model,x,z,angle,base);
  for (const lx of [-18,18]) for (const lz of [-17.3,17.3]) {
    part('box',0x34323a,cm(lx),cm(21.5),cm(lz),cm(3.1),cm(43),cm(3.1));
  }
  part('bevel',tint,0,cm(42.7),0,cm(42.5),cm(4.6),cm(42));
  for (const back of [-17.3,17.3]) part('box',0x34323a,cm(back),cm(64),cm(18),cm(2.6),cm(42),cm(2.6));
  part('bevel',tint,0,cm(75),cm(19),cm(44),cm(23),cm(3.8));
  part('box',tint,0,cm(54),cm(19),cm(37),cm(2.9),cm(3.5));
}

function leafPot(model,x,z,base) {
  model.instance('bevel','solid',0xb66c55,x,base+.54,z,1.60,1.08,1.60);
  model.box(0x315a46,x,base+1.39,z,.11,1.38,.11);
  for (let i=0;i<6;i++) {
    const theta = 1.61*i;
    const y = base+1.14+i*.26;
    model.box(i%2 ? 0x518b63 : 0x73a169,x+Math.cos(theta)*.41,y,z+Math.sin(theta)*.41,1.00,.16,.44,-theta,.32);
  }
}

function shopPoster(ctx) {
  ctx.fillStyle = '#162d37';
  ctx.fillRect(0,0,384,160);
  ctx.fillStyle = '#dd765a';
  ctx.beginPath();ctx.moveTo(0,160);ctx.lineTo(304,0);ctx.lineTo(362,0);ctx.lineTo(65,160);ctx.fill();
  ctx.save();ctx.translate(289,78);
  for (let i=0;i<3;i++) {
    ctx.rotate(Math.PI*2/3);
    ctx.fillStyle = '#c5dde0';
    ctx.beginPath();ctx.moveTo(-19,-26);ctx.lineTo(55,-6);ctx.lineTo(55,29);ctx.lineTo(6,38);ctx.fill();
  }
  for (const [radius,tint] of [[37,'#203c48'],[26,'#61b8bf'],[12,'#f6bc79']]) {
    ctx.fillStyle = tint;ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
  ctx.font = '800 italic 48px Barlow, sans-serif';
  ctx.fillStyle = '#fff4df';ctx.fillText('SEMANAL',16,67,200);
  ctx.font = '700 24px Barlow, sans-serif';ctx.fillText('BEYBLADE X',17,103,192);
}

function cardShop(model,accessories,floorY) {
  ground(model,0x685353,0x514446,5.5);
  for (let row=-4;row<=3;row++) for (let col=-4;col<=4;col++) {
    const shade = (row+col)%2===0 ? 0x8e7770 : 0x756361;
    model.box(shade,col*5.5,floor-.045,row*5.5,5.41,.10,5.41);
  }
  contactShade(model,36,28);
  model.box(0x4d302c,0,-1.71,0,26.8,.48,21.8);
  model.box(0x734737,0,tabletop-.33,0,27.5,.68,22.7);
  const wood = [0x9f684c,0xa97152,0xb27a58,0xa67051,0xae7553];
  for (let i=0;i<11;i++) model.instance('box','table',wood[i%wood.length],(i-5)*2.50,tabletop-.145,0,2.47,.29,22.7);
  for (const x of [-11.2,11.2]) for (const z of [-8.6,8.6]) {
    model.box(0x30282d,x,-4.18,z,.74,4.95,.74);
    model.box(0x635066,x,-6.49,z,1.04,.22,1.04);
  }
  for (const z of [-10.94,10.94]) model.box(0xc18661,0,tabletop-.10,z,27.44,.16,.10);
  for (const x of [-13.66,13.66]) model.box(0x784b3c,x,tabletop-.13,0,.10,.15,22.72);
  model.instance('box','table',0x204651,0,tabletop+.006,.14,17.6,.012,17.7);
  for (const x of [-8.64,8.64]) model.box(0xb59269,x,tabletop+.014,.14,.058,.003,17.28);
  for (const z of [-8.51,8.79]) model.box(0xb59269,0,tabletop+.014,z,17.32,.003,.058);
  accessories.cutaway(side=>chair(side,-23.6,-.4,1.16,0x924c4f,floorY),'x',-25,-1);
  accessories.cutaway(side=>chair(side,22.9,-8.9,-1.86,0x3c6a65,floorY),'x',25,1);
  accessories.cutaway(side=>chair(side,-8.55,17.4,.19,0x8b7060,floorY),'z',20,1);

  deckCase(accessories,-10.70,-9.61,-.15,0xc14d5e,['dran',null,'shark']);
  deckCase(accessories,7.41,10.13,.04,0x377a9d,['wizard','silver',null]);
  spareLauncher(accessories,-10.65,2.45,-1.65,0xed426d,true);
  spareLauncher(accessories,10.33,-5.41,2.11,0x2b9fcf);
  spareLauncher(accessories,-5.45,9.75,-.32,0xe7963f);
  accessories.bey('superion',-11.29,tabletop,-2.17,.42);
  accessories.bey('shark',-9.52,tabletop,6.24,-.45);
  accessories.bey('wyvern',10.98,tabletop,-8.38,.3);
  accessories.bey('hells',9.92,tabletop,1.58,-.7);
  looseCord(accessories,10.77,3.72,-.45,0x252a35);
  for (let i=0;i<5;i++) {
    accessories.box(0x302929,5.32+i*.12,tabletop+.06+i*.025,-9.54,3.0,.042,2.09,-.22+i*.06);
  }
  accessories.box(0xdb9a58,5.80,tabletop+.18,-9.54,2.73,.023,1.84,.02);
  accessories.box(0x326469,5.80,tabletop+.21,-9.54,1.26,.015,.91,.81);
  accessories.instance('disc','solid',0xdebd93,-4.78,tabletop+1.68,-9.48,2.55,3.35,2.55);
  accessories.instance('ring','solid',0xf8e2bf,-4.78,tabletop+3.38,-9.48,2.58,1,2.58);
  accessories.instance('disc','solid',0x79544b,-4.78,tabletop+3.28,-9.48,2.07,.04,2.07);
  accessories.instance('ring','solid',0xebba51,1.40,tabletop+.055,9.46,.84,1,.84,.36);
  accessories.instance('disc','solid',0x4bb0bc,2.58,tabletop+.16,9.51,.36,.31,.36);

  model.cutaway(wall=>{
    wall.box(0x30676d,0,1.10,-19.16,40.4,15.4,.66);
    wall.box(0xa68162,0,-4.69,-18.74,40.4,3.68,.21);
    wall.box(0x413337,0,-6.31,-18.61,40.4,.57,.18);
    wall.box(0x21454d,0,8.37,-18.72,40.5,.94,.67);
    wall.box(0xecc48e,0,7.70,-18.33,39.8,.12,.07);
    for (const x of [-18.8,-7.4,8.1,18.8]) wall.box(0x214c54,x,2.18,-18.67,.47,11.9,.37);
    const packs = [0xe08657,0x8a94cc,0x65aebb,0xca695f,0xe3bd79,0x6f9984];
    for (const [center,width] of [[-12.5,8.7],[13.8,9.4]]) {
      wall.box(0x242c35,center,.16,-18.31,width,10.3,.27);
      for (const side of [-1,1]) wall.box(0x594542,center+side*width*.48,.16,-17.48,.25,10.3,1.75);
      for (let row=0;row<4;row++) {
        const y = -4.86+row*2.61;
        wall.box(0x956c53,center,y,-17.48,width,.28,1.85);
        wall.glow(0xcd9b65,center,y-.055,-16.53,width*.90,.075,.035);
        for (let i=0;i<5;i++) {
          const tint = packs[(i+row*2+(center>0?2:0))%packs.length];
          const x = center+(i-2)*1.54;
          const h = .84+.18*((i+row)%3);
          wall.box(tint,x,y+.15+h*.5,-17.19,1.12,h,.66);
          wall.box(0xf2d8ad,x,y+.30,-16.85,.72,.07,.027);
          wall.box(0x39525c,x,y+.38+h*.38,-16.85,.51,.18,.028);
        }
      }
    }
    wall.box(0x1e3540,0,2.87,-18.55,12.3,5.65,.35);
    wall.box(0x78a9ad,0,2.87,-18.35,11.35,4.85,.08);
    for (const x of [-3.57,0,3.57]) {
      wall.box(0x9ec5bb,x,2.87,-18.28,3.34,4.51,.12);
      wall.box(0xcde0c6,x-.71,3.18,-18.20,.22,4.30,.024,0,-.26);
    }
    wall.box(0x224751,0,.32,-18.03,12.6,.32,.57);
    wall.label('CARD CLUB','CARDS & BEYBLADES','#ffbc86',0,6.49,-18.50,10.8,2.80);
    wall.box(0x523d43,2.3,-3.65,-15.47,10.3,5.28,2.91);
    wall.box(0x9c6f58,2.3,-1.02,-15.48,10.7,.27,3.31);
    for (let i=0;i<19;i++) {
      wall.box(i%2===0?0x8d6359:0x74504d,-2.3+i*.51,-3.60,-13.99,.40,4.78,.13);
    }
    wall.box(0x1e303a,4.87,-.16,-15.54,1.81,1.39,.26,.13);
    wall.glow(0x619ea1,4.89,-.17,-15.40,1.55,1.14,.032,.13);
    wall.box(0x34303c,4.87,-.83,-15.56,.66,.19,.63);
    wall.box(0x293e44,-.44,-.73,-14.8,1.44,.18,1.05,-.25);
    leafPot(wall,-5.91,-16.31,floor);
  },'z',-18.65,-1);

  model.cutaway(wall=>{
    wall.box(0x32696d,-20.07,1.08,-5.22,.67,15.38,27.1);
    wall.box(0xa78063,-19.65,-4.68,-5.22,.20,3.67,27.1);
    wall.box(0x3d3539,-19.54,-6.32,-5.22,.19,.55,27.1);
    wall.box(0x1f4b55,-19.76,8.36,-5.22,.65,.9,27.3);
    wall.box(0x23343d,-19.65,2.75,-7.88,.18,5.91,8.89);
    wall.decal(-19.53,2.75,-7.88,8.38,5.48,shopPoster,{angle:Math.PI/2});
    for (const side of [-1,1]) {
      wall.box(0x73504a,-19.31,-.2,side*3.38-7.72,.46,1.96,2.10);
      wall.glow(0xffcf9b,-19.065,-.18,side*3.38-7.72,.039,1.40,1.62);
    }
    leafPot(wall,-17.8,3.1,floor);
    wall.box(0x53434a,-17.83,-5.34,-1.7,2.87,2.54,5.2);
    wall.box(0xa57b61,-17.79,-4.06,-1.7,3.13,.23,5.42);
  },'x',-19.59,-1);
}

function cupDisplay(ctx) {
  const graphic = ctx.createLinearGradient(0,160,384,12);
  graphic.addColorStop(0,'#0c2447');graphic.addColorStop(.54,'#132343');graphic.addColorStop(1,'#285833');
  ctx.fillStyle = graphic;ctx.fillRect(0,0,384,160);
  for (const [i,tint] of ['#505fc4','#35b1cc','#a8e866'].entries()) {
    ctx.fillStyle = tint;
    const x = i*32;
    ctx.beginPath();ctx.moveTo(x,160);ctx.lineTo(x+82,160);ctx.lineTo(x+206,0);ctx.lineTo(x+169,0);ctx.fill();
  }
  ctx.fillStyle = '#d7fca5';
  ctx.font = '850 italic 116px Barlow, sans-serif';ctx.fillText('X',20,124);
  ctx.fillStyle = '#15243d';ctx.fillRect(142,34,221,88);
  ctx.fillStyle = '#f0f8fa';
  ctx.font = '800 italic 42px Barlow, sans-serif';ctx.fillText('STADIUM CUP',149,75,205);
  ctx.fillStyle = '#bde886';
  ctx.font = '800 18px Barlow, sans-serif';ctx.fillText('PALCO PRINCIPAL',151,104,192);
}

function tournament(model,accessories,floorY) {
  ground(model,0x101923,0x263949,8.1);
  contactShade(model,40,36);
  model.instance('bevel','solid',0x151c30,0,-3.40,0,31.1,4.22,25.9);
  model.instance('bevel','table',0x28364a,0,tabletop-.17,0,31.32,.34,26.12);
  for (const [x,color] of [[-10.4,0xb5ed65],[10.4,0x36c8eb]]) {
    model.glow(color,x,tabletop+.032,0,.14,.037,15.9);
    model.box(0x344c65,x*1.12,tabletop+.021,.42,1.92,.029,14.45);
    for (let i=0;i<7;i++) model.glow(color,x*1.14,tabletop+.052,5.13+i*.57,1.28,.029,.10,x<0 ? -.45 : .45);
  }
  model.glow(0x58c5ce,0,-1.42,12.68,14.45,.085,.085);
  model.box(0x41475a,0,-1.68,12.73,15.0,.42,.46);
  model.box(0x131e30,0,-3.53,12.64,13.8,2.23,.48);
  model.label('X STADIUM','CAMPEONATO','#b5ea87',0,tabletop+.018,7.72,7.5,1.93,true);
  for (let step=0;step<6;step++) {
    const rise = (tabletop-floor)*(step+1)/6;
    const z = 15.8+(5-step)*5.6;
    model.box(0x233449,0,floor+rise*.5,z,7.4,rise,5.61);
    model.glow(0x53b1bf,0,floor+rise+.004,z+2.77,7.13,.008,.06);
  }

  model.cutaway(back=>{
    const z = -25;
    for (const sign of [-1,1]) {
      const x = sign*14.6;
      for (const beam of [-.43,.43]) back.box(0x53627b,x+beam,.86,z,.159,13.9,.67);
      for (let r=0;r<8;r++) {
        back.box(0x57667b,x,-5.68+r*1.79,z+.31,.94,.12,.12);
        back.box(0x4b586e,x,-5.04+r*1.79,z+.31,.13,1.84,.12,0,r%2===0?.42:-.42);
      }
      back.glow(sign<0?0xb2f97d:0x5cd3ff,x,7.79,z,1.22,.34,1.12);
    }
    back.box(0x495b73,0,7.15,z,29.36,.31,.92);
    back.box(0x2a3445,0,5.92,z,29.36,.21,.72);
    for (let i=0;i<12;i++) {
      const x = -12.93+i*2.33;
      back.box(0x64728c,x,6.52,z+.40,.115,2.38,.12,0,i%2===0?-.91:.91);
      back.box(0x151e30,x,5.41,z+.48,.86,.75,.87,0,.22);
      back.glow(i%3===0?0xbef88b:0x7ed8ed,x,5.39,z+.929,.50,.26,.029,0,.22);
    }
    back.box(0x131b2b,0,-2.03,z+.02,22.4,3.80,.53);
    back.glow(0x4b8296,0,-2.03,z+.30,21.69,3.47,.047);
    back.decal(0,-2.03,z+.331,21.21,3.22,cupDisplay);
    for (const x of [-11.72,11.72]) {
      back.box(0x243847,x,.98,z+.39,1.03,5.53,.68);
      for (let i=0;i<4;i++) back.glow(x<0?0xa7ea73:0x4dbddd,x,2.94-i*1.31,z+.747,.30,.73,.026);
    }
  },'z',-24.73,-1);
  for (const sign of [-1,1]) {
    accessories.cutaway(stands=>{
      for (let row=0;row<2;row++) {
        const x = sign*(33+row*17);
        const step = cm(row*20+5);
        const base = floorY+step;
        stands.box(0x242f3e,x,floorY+step*.5,-5.6,16.9,step,49);
        for (let seat=0;seat<3;seat++) {
          chair(stands,x,-22+seat*16.4,-sign*Math.PI/2,0x344561,base);
        }
      }
    },'x',sign*25,sign);
  }
}

function diagnosticScreen(ctx) {
  ctx.fillStyle = '#182a37';ctx.fillRect(0,0,384,160);
  ctx.fillStyle = '#d38f48';ctx.fillRect(0,0,384,8);
  ctx.strokeStyle = '#32576a';
  for (let x=18;x<370;x+=29) {ctx.beginPath();ctx.moveTo(x,52);ctx.lineTo(x,142);ctx.stroke();}
  for (let y=52;y<=142;y+=18) {ctx.beginPath();ctx.moveTo(18,y);ctx.lineTo(366,y);ctx.stroke();}
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#7de1de';ctx.beginPath();
  [134,132,87,118,65,82,102,54,86,72,94,63,71].forEach((y,i)=>{
    if (i) ctx.lineTo(19+i*29,y);else ctx.moveTo(19,y);
  });
  ctx.stroke();
  ctx.fillStyle = '#dceeea';ctx.font = '800 24px Barlow, sans-serif';ctx.fillText('GIRO / TELEMETRIA',19,36);
}

function workshop(model,accessories,floorY) {
  ground(model,0x414654,0x323845,7.3);
  contactShade(model,39,28);
  for (const x of [-14.0,14.0]) {
    model.glow(0xe6ab50,x,floor+.026,.7,.19,.033,35.85);
    model.glow(0xa97c45,x*.947,floor+.029,.7,.09,.032,35.85);
    for (let i=0;i<7;i++) model.glow(0xd99a42,x,floor+.03,12.2+i*.49,.83,.018,.16,.72);
    model.box(0x292f3b,x,-3.78,-4.95,1.38,5.64,2.25);
  }
  model.box(0x28383f,0,-3.88,.22,22.95,5.05,19.91);
  model.box(0xf28a48,0,-1.81,10.25,22.32,.39,.17);
  model.instance('bevel','table',0x737b88,0,tabletop-.25,0,25.40,.50,22.45);
  model.instance('bevel','table',0x414a5c,0,tabletop+.005,.03,18.2,.010,16.75);
  for (const x of [-9.68,9.68]) {
    model.glow(0xd69756,x,tabletop+.026,-.37,.12,.031,14.45);
    for (let slot=0;slot<6;slot++) {
      model.box(0x313c48,x*1.11,tabletop+.025,-6.37+slot*2.07,.55,.031,1.54);
    }
  }
  model.label('PIT 03','CALIBRAÇÃO','#ffc47d',0,tabletop+.016,9.39,6.3,1.85,true);
  for (const [x,z,angle] of [[-25,3.2,.24],[25,-4.2,-.28]]) {
    const part = prop(accessories,x,z,angle,floorY);
    part('box',0x292d3b,0,cm(42),0,cm(53),cm(70),cm(42));
    part('box',0x9d483a,0,cm(78),0,cm(54),cm(4),cm(43.5));
    for (const dx of [-20,20]) for (const dz of [-15,15]) {
      part('disc',0x222a32,cm(dx),cm(4),cm(dz),cm(7.5),cm(8),cm(7.5));
    }
    for (let row=0;row<4;row++) {
      part('box',row%2 ? 0xa75442 : 0xb96851,0,cm(19+row*15),cm(21.3),cm(49),cm(13.8),cm(2));
      part('box',0xb2a28d,0,cm(22+row*15),cm(22.7),cm(21),cm(1.2),cm(1.5));
    }
  }
  spareLauncher(accessories,-8.64,9.36,-.32,0xeda24c);
  accessories.bey('hells',10.63,tabletop,4.03,.29);
  accessories.bey('cobalt',-9.78,tabletop,-3.53,-.46);

  model.cutaway(bay=>{
    bay.box(0x3b4b55,0,1.01,-19.14,38.8,15.2,.80);
    bay.box(0x283640,0,-4.36,-18.61,38.92,4.39,.20);
    bay.box(0x28333d,0,7.42,-18.57,38.8,1.42,.48);
    bay.glow(0xf09b51,0,6.68,-18.29,38.4,.099,.052);
    for (const x of [-17.1,-8.85,6.45,17.06]) {
      bay.box(0x25303d,x,.53,-18.28,.88,14.0,.89);
      bay.box(0xe59551,x,2.51,-17.80,.38,6.89,.055);
    }
    bay.box(0x1f2934,-1.17,-.67,-18.52,14.73,11.25,.28);
    for (let i=0;i<15;i++) {
      const y = -5.64+i*.70;
      bay.box(i%2 ? 0x465763 : 0x53646c,-1.14,y,-18.32,13.73,.52,.15);
    }
    bay.box(0x202b36,-1.15,5.01,-18.26,14.77,.63,.36);
    bay.label('GARAGEM 03','OFICINA NEON','#ffb26b',-1.13,6.52,-18.13,10.04,2.35);
    for (const x of [-12.34,11.81]) {
      bay.box(0x343e4a,x,-3.92,-15.6,7.88,5.1,3.02);
      bay.box(0x64717a,x,-1.12,-15.6,8.14,.36,3.34);
      bay.box(0x4b5158,x,1.23,-17.34,7.07,3.93,.53);
      for (let w=0;w<7;w++) for (let h=0;h<4;h++) {
        bay.box(0x333b42,x-2.8+w*.92,-.24+h*.96,-17.06,.084,.087,.027);
      }
      for (let i=0;i<4;i++) {
        const xTool = x-2.13+i*1.32;
        bay.box(i%2===0?0xd5a16a:0xa2b6bd,xTool,1.08,-16.99,.18,1.63,.12,0,-.22+i*.13);
        bay.instance('disc','solid',0xb2c0bf,xTool+.12,1.78,-16.86,.52,.20,.38);
      }
    }
    bay.box(0x1b2832,3.04,.20,-10.87,5.9,1.10,.37,.08);
    bay.decal(3.06,.20,-10.661,5.57,.93,diagnosticScreen,{angle:.08});
    bay.box(0x1c2933,3.04,-.71,-10.87,1.70,.27,1.42);
  },'z',-17.66,-1);
}

const places = {
  standard:{label:'Padrão',sky:0x0e1324},
  shop:{label:'Loja de card game',sky:0x514449,build:cardShop,height:75,widthScale:cm(120)/27.5,depthScale:cm(75)/22.7},
  tournament:{label:'Estande de torneio',sky:0x101620,build:tournament,height:100,widthScale:1.58,depthScale:1.46},
  workshop:{label:'Oficina neon',sky:0x343d48,build:workshop,height:88,widthScale:cm(115)/25.4,depthScale:cm(75)/22.45},
};

export const sceneryOptions = Object.entries(places).map(([key,{label}])=>[key,label]);

export function createScenery(key,onAssetReady) {
  const place = Object.hasOwn(places,key) ? places[key] : places.standard;
  if (!place.build) return {sky:place.sky};
  const model = stageModel(), props = stageModel(onAssetReady);
  // Anchor the furniture to the BX-10 support surface. Props already use the arena's 3 cm unit.
  place.build(model,props,tabletop-cm(place.height));
  const structure = model.finish();
  const heightScale = cm(place.height)/(tabletop-floor);
  structure.scale.set(place.widthScale,heightScale,place.depthScale);
  structure.position.y = tabletop*(1-heightScale);
  const group = props.finish();
  const cuts = (structure.userData.cutaways ?? []).map(cut=>({...cut,edge:cut.edge*structure.scale[cut.axis]}));
  group.userData.cutaways = [...(group.userData.cutaways ?? []),...cuts];
  group.add(structure);
  return {sky:place.sky,group};
}
