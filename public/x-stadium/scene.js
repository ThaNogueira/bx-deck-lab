import * as T from './vendor/three.module.min.js';
import { BITS, BLADES, MAX_LAUNCH_ANGLE, launchPose, launchRelease } from './rules.js';
import { launchSpeed } from './motion.js';
import { disposeBey, makeBey } from './bey-model.js';
import { makeLauncher } from './launcher.js';
import { TAU, RIDGE, RAIL, SHELL, SHOOT_HEIGHT, coverAngles, coverPoint, coverGeometry, coverCollarGeometry, coverSideGeometry, openingRadius, shellRadius,
  floorGeometry, floorAt, height, mouthRadius, pocketGeometry, pocketWalls,
  polarPoint, railFrame, railRadius, rimShelfGeometry, rimWallGeometry, sectors, stripGeometry, trayRadius, clamp } from './stadium.js';

const mat = (color, roughness = .6, metalness = 0, extra = {}) => new T.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const yAxis = new T.Vector3(0, 1, 0);
const plane = (w, h) => new T.PlaneGeometry(w, h).rotateX(-Math.PI / 2);

function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const result = new T.Mesh(geometry, material);
  result.position.set(x, y, z);
  parent.add(result);
  return result;
}

function ring(parent, inner, outer, material, y, segments = 96, start = 0, length = TAU) {
  return mesh(parent, new T.RingGeometry(inner, outer, segments, 1, -start - length, length).rotateX(-Math.PI / 2), material, 0, y);
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'));
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function textTexture(text, color) {
  return canvasTexture(512, 112, ctx => {
    ctx.font = 'italic 800 87px Barlow, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 59, 490);
  });
}

function buildLoft(positions, indices) {
  const geo = new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(positions, 3)).setIndex(indices).toNonIndexed();
  geo.computeVertexNormals();
  return geo;
}

function archGeometry(r1, r2, y1, y2, start, end) {
  const pts = [], faces = [];
  const count = Math.ceil((end - start) / .065);
  for (let i = 0; i <= count; i++) {
    const a = start + (end - start) * i / count;
    pts.push(r1 * Math.cos(a), y1, r1 * Math.sin(a), r2 * Math.cos(a), y2, r2 * Math.sin(a));
    if (i < count) faces.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  return buildLoft(pts, faces);
}

function floor(scene) {
  const { vertices, faces } = floorGeometry();
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geo.setIndex(faces);
  geo.computeVertexNormals();
  const color = new T.Color();
  const colors = [];
  for (let i = 0; i < vertices.length; i += 3) {
    const [x, z] = [vertices[i], vertices[i + 2]];
    const r = Math.hypot(x, z);
    const t = clamp(r / 6.08, 0, 1);
    color.set(0xc5cdcb).lerp(new T.Color(0x869c96), t ** 2.5);
    colors.push(color.r, color.g, color.b);
  }
  geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  const bowl = mesh(scene, geo, mat(0xffffff, .49, .28, { vertexColors: true }));
  bowl.receiveShadow = true;

  const line = new T.MeshBasicMaterial({ color: 0xc7e8d8, transparent: true, opacity: .23, depthWrite: false, side: T.DoubleSide });
  for (const r of [1.02, RIDGE, RIDGE + .085]) {
    mesh(scene, archGeometry(r - .012, r + .012, height(r - .012) + .013, height(r + .012) + .013, 0, TAU), line);
  }
  const centerTexture = canvasTexture(768, 768, ctx => {
    ctx.translate(384, 384);
    ctx.strokeStyle = '#e8fff060';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 180, 0, TAU); ctx.stroke();
    for (const a of [0, 1, 2, 3]) {
      ctx.save(); ctx.rotate(a * Math.PI / 2);
      ctx.fillStyle = '#e8fff073'; ctx.fillRect(-1.5, -190, 3, 22); ctx.restore();
    }
    ctx.font = 'italic 800 275px Barlow, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e9fff092'; ctx.fillText('X', 2, -4);
  });
  // Subdivide the decal so it follows the curved playing surface.
  const decalGeo = new T.PlaneGeometry(3.85, 3.85, 24, 24).rotateX(-Math.PI / 2);
  const attribute = decalGeo.attributes.position;
  for (let i = 0; i < attribute.count; i++) attribute.setY(i, height(Math.hypot(attribute.getX(i), attribute.getZ(i))) + .021);
  mesh(scene, decalGeo, new T.MeshBasicMaterial({ map: centerTexture, transparent: true, opacity: .73, depthWrite: false }));
}

function stadium(scene) {
  const panel = mat(0x85999b, .37, .23, { side: T.DoubleSide });
  const shell = mat(0xbecfce, .30, .21, { side: T.DoubleSide });
  const rim = mat(0xb1c1bc, .34, .19, { side: T.DoubleSide });
  const plastic = (color, opacity, roughness = .19) => mat(color,roughness,.24,{
    transparent: true, opacity, side: T.DoubleSide, depthWrite: false, forceSinglePass: true,
  });
  const glass = plastic(0xb3c9ce,.28);
  const upperGlass = plastic(0xd7e7e9,.20,.21);
  const flange = plastic(0xd9e7e5,.61,.25);
  const collar = plastic(0xc6d7df,.38,.28);
  const ribs = plastic(0xc9e0e3,.47,.24);
  const green = mat(0x459226, .42, .10, { emissive: 0x2b6d1f, emissiveIntensity: .22, side: T.DoubleSide });
  const teethMaterial = mat(0x69bd3b, .45, .11, { emissive: 0x26791e, emissiveIntensity: .12 });
  const pocketPlastic = plastic(0xb3c8ca,.32,.24);
  const pocketRim = plastic(0xd1e1e1,.65,.22);
  const support = mat(0x263a3a, .55, .24);
  const drawStrip = (angles, first, second, material, order = 0) => {
    const {vertices, faces} = stripGeometry(angles, first, second);
    const part = mesh(scene, buildLoft(vertices, faces), material);
    part.receiveShadow = true;
    part.renderOrder = order;
    return part;
  };
  const outer = (a, inset, y) => polarPoint(shellRadius(a)-inset,a,y);
  const base = drawStrip(coverAngles, a => outer(a,.31,SHELL.table+.17), a => outer(a,.07,-.46),panel);
  base.castShadow = true;
  drawStrip(coverAngles, a => outer(a,.27,-.51), a => outer(a,-.045,-.40),shell);
  drawStrip(coverAngles, a => outer(a,-.045,-.40), a => outer(a,0,-.29),flange,4);
  const [sides,shoulder] = coverSideGeometry();
  mesh(scene,buildLoft(sides.vertices,sides.faces),glass).renderOrder = 5;
  mesh(scene,buildLoft(shoulder.vertices,shoulder.faces),flange).renderOrder = 5;
  const cover = coverGeometry();
  mesh(scene, buildLoft(cover.vertices,cover.faces),upperGlass).renderOrder = 6;
  const [opening,openingFlange] = coverCollarGeometry();
  mesh(scene,buildLoft(opening.vertices,opening.faces),collar).renderOrder = 7;
  mesh(scene,buildLoft(openingFlange.vertices,openingFlange.faces),flange).renderOrder = 7;
  drawStrip(coverAngles, a => coverPoint(a,.05,.014), a => coverPoint(a,.11,.014),collar,7);

  for (const center of [-2.28,-.86,.78,Math.PI-.78]) {
    const band = [center-.085,center-.067,center+.067,center+.085];
    drawStrip(band, a => coverPoint(a,.27,.026), a => coverPoint(a,.89,.03),ribs,7);
    const [x,y,z] = coverPoint(center,.91,.029);
    const tab = mesh(scene,new T.BoxGeometry(.34,.085,.25),support,x,y,z);
    tab.rotation.y = Math.PI/2-center;
  }

  const track = (a,radial,y) => polarPoint(railRadius(a)+radial,a,height(railRadius(a)-RAIL.floorOffset,a)+y);
  for (const sector of sectors) {
    const { angles, pocket } = sector;
    drawStrip(angles, a => track(a,RAIL.toothDepth,-.014), a => track(a,RAIL.toothDepth,RAIL.top-.008),green);
    drawStrip(angles, a => track(a,RAIL.toothDepth,RAIL.top-.008), a => track(a,RAIL.width,RAIL.top-.021),green);
    drawStrip(angles, a => track(a,RAIL.width,RAIL.top-.028), a => track(a,RAIL.width,-.013),green);
    if (!pocket) {
      const shelf = rimShelfGeometry(angles);
      mesh(scene,buildLoft(shelf.vertices,shelf.faces),rim).receiveShadow = true;
      const wall = rimWallGeometry(angles);
      mesh(scene,buildLoft(wall.vertices,wall.faces),collar).renderOrder = 3;
      continue;
    }
    const tray = pocketGeometry(sector);
    for (const [key, geometry] of Object.entries(tray)) {
      const surface = mesh(scene,buildLoft(geometry.vertices,geometry.faces),key === 'lip' ? pocketRim : pocketPlastic);
      surface.receiveShadow = true;
      surface.renderOrder = 3;
    }
    const {back,sides} = pocketWalls(sector);
    for (const wall of [back,...sides]) {
      const surface = mesh(scene,buildLoft(wall.vertices,wall.faces),pocketPlastic);
      surface.renderOrder = 4;
    }
    drawStrip(angles,a=>polarPoint(trayRadius(pocket,a)-.045,a,pocket.bottom+.035),
      a=>polarPoint(trayRadius(pocket,a)+.015,a,pocket.bottom+.071),pocketRim,4);
    const center = trayRadius(pocket,pocket.angle)-.42;
    const label = pocket.points === 3 ? 'XTREME' : 'OVER';
    const badge = mesh(scene,plane(pocket.points === 3 ? 2 : 1.42,.36),new T.MeshBasicMaterial({
      map:textTexture(label,'#dcecee'),transparent:true,opacity:.72,depthWrite:false,
    }),...polarPoint(center,pocket.angle,pocket.bottom+.04));
    badge.rotation.y = Math.PI / 2 - pocket.angle;
    badge.renderOrder = 3;
  }

  const teeth = new T.InstancedMesh(new T.BoxGeometry(RAIL.toothDepth + .015,RAIL.top-RAIL.bottom,.052), teethMaterial, 248);
  const dummy = new T.Object3D();
  for (let i = 0; i < teeth.count; i++) {
    const a = TAU * i / teeth.count;
    const rail = railFrame(Math.cos(a),Math.sin(a));
    dummy.position.set(rail.x+RAIL.toothDepth*.5*rail.nx,rail.y,rail.z+RAIL.toothDepth*.5*rail.nz);
    dummy.rotation.y = -Math.atan2(rail.nz,rail.nx);
    dummy.updateMatrix();
    teeth.setMatrixAt(i,dummy.matrix);
  }
  scene.add(teeth);
  for (const x of [-6.38,6.38]) for (const z of [-5.93,6.25]) {
    const foot = mesh(scene,new T.BoxGeometry(.93,.44,.87),shell,x,SHELL.table+.23,z);
    foot.castShadow = true;
    mesh(scene,new T.BoxGeometry(.55,.12,.43),support,x,-.76,z);
  }
}

function environment(renderer, scene, mobile) {
  const studio = new T.Scene();
  studio.background = new T.Color(0x556266);
  const lightCard = (color, w, h, x, y, z, power) => {
    const card = mesh(studio, new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(power), side: T.DoubleSide }), x, y, z);
    card.lookAt(0, 0, 0);
  };
  lightCard(0xe6f9ff, 12, 7, -5, 7, 1, 4);
  lightCard(0xafff93, 6, 4, 4, 3, -6, 2);
  lightCard(0xf3f6ff, 8, 3, 5, 8, 5, 2.5);
  const pmrem = new T.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio, .034, .1, 100, { size: mobile ? 128 : 256 }).texture;
  scene.environmentIntensity = .69;
  pmrem.dispose();
  studio.traverse(item => { item.geometry?.dispose(); item.material?.dispose(); });

  scene.add(new T.HemisphereLight(0xd9eafb, 0x51675b, 1.63));
  const main = new T.DirectionalLight(0xf6fcff, 2.25);
  main.position.set(-6, 13, 5);
  main.castShadow = true;
  const shadowSize = mobile ? 512 : 1024;
  main.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(main.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: .5, far: 31 });
  main.shadow.normalBias = .027;
  main.shadow.bias = -.0002;
  main.shadow.radius = 2;
  scene.add(main);
  const rim = new T.DirectionalLight(0xc3ff8f, 1.28);
  rim.position.set(5, 4, -8);
  scene.add(rim);

  const ground = mesh(scene, plane(110,110), mat(0x1a2522, .87, .1), 0, SHELL.table);
  ground.receiveShadow = true;
  const grid = new T.GridHelper(80, 56, 0x34473c, 0x34443c);
  grid.position.y = SHELL.table+.01;
  grid.material.transparent = true;
  grid.material.opacity = .39;
  scene.add(grid);
  for (const x of [-9.2, 9.2]) {
    for (const z of [-7.6, 7.6]) {
      const marker = new T.Group();
      scene.add(marker);
      marker.position.set(x, SHELL.table+.017, z);
      marker.rotation.y = Math.sign(x * z) === 1 ? 0 : Math.PI;
      const markerMat = new T.MeshBasicMaterial({ color: 0x647d49, transparent: true, opacity: .6 });
      for (let i = 0; i < 3; i++) {
        const stripe = mesh(marker, plane(.13,.59), markerMat, i * .23);
        stripe.rotation.y = -.53;
      }
    }
  }
}

function startShadowTexture() {
  return canvasTexture(64, 64, ctx => {
    const falloff = ctx.createRadialGradient(32,32,3,32,32,31);
    falloff.addColorStop(0,'#08110fbb');
    falloff.addColorStop(.56,'#08110f70');
    falloff.addColorStop(1,'#08110f00');
    ctx.fillStyle = falloff;
    ctx.fillRect(0,0,64,64);
  });
}

function makeAim(color) {
  const g = new T.Group();
  const material = new T.MeshBasicMaterial({ color, transparent: true, opacity: .92, depthWrite: false, side: T.DoubleSide });
  const halo = new T.MeshBasicMaterial({ color, transparent: true, opacity: .19, depthWrite: false, side: T.DoubleSide });
  ring(g, .80, .85, material, 0, 42);
  ring(g, .72, 1.02, halo, -.012, 42);
  for (let i = 0; i < 5; i++) mesh(g, plane(.036, .135), material, 0, 0, -1.06 - i * .20);
  const arrow = new T.Shape();
  arrow.moveTo(0, 0); arrow.lineTo(-.17, -.29); arrow.lineTo(0, -.19); arrow.lineTo(.17, -.29); arrow.closePath();
  mesh(g, new T.ShapeGeometry(arrow).rotateX(-Math.PI / 2), material, 0, 0, -2.31);
  g.renderOrder = 7;
  g.children.forEach(child => { child.renderOrder = 7; });
  return g;
}

function makeLaunchArea(player,color) {
  const group = new T.Group();
  const start = player === 0 ? Math.PI*.5 : -Math.PI*.5;
  const angles = Array.from({length:65},(_,i)=>start + Math.PI*i/64);
  const {vertices,faces} = stripGeometry(angles,() => [0,0,0],a => polarPoint(openingRadius(a)-.08,a));
  const guide = new T.MeshBasicMaterial({color,transparent:true,opacity:.10,side:T.DoubleSide,depthWrite:false});
  const fill = mesh(group,buildLoft(vertices,faces),guide);
  fill.renderOrder = 3;
  const points = [[0,0,0],...angles.map(a=>polarPoint(openingRadius(a)-.08,a)),[0,0,0]];
  const line = new T.Line(new T.BufferGeometry().setFromPoints(points.map(p=>new T.Vector3(...p))),
    new T.LineBasicMaterial({color,transparent:true,opacity:.52,depthWrite:false}));
  line.renderOrder = 8;
  group.add(line);
  group.visible = false;
  return group;
}

export class ArenaView {
  constructor(container, launchControls) {
    this.container = container;
    this.launchControls = launchControls;
    this.mobile = matchMedia('(any-pointer: coarse)').matches;
    this.renderScale = 1;
    this.graphics = 'auto';
    this.slowFrames = 0;
    this.dirty = true;
    this.scene = new T.Scene();
    this.scene.background = new T.Color(0x293830);
    this.renderer = new T.WebGLRenderer({ antialias: !this.mobile, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.17;
    container.append(this.renderer.domElement);
    environment(this.renderer, this.scene, this.mobile);
    stadium(this.scene);
    floor(this.scene);
    this.camera = new T.PerspectiveCamera(43, 1, .12, 100);
    this.cameraMode = 'orbit';
    this.azimuth = .35;
    this.elevation = .80;
    this.zoom = 1;
    this.focus = new T.Vector3(0, 1.05, .44);
    this.pan = new T.Vector3();
    this.frameGuide = container.parentElement.querySelector('.arena-fit');
    this.stage = container.parentElement;
    this.framing = {width:0,height:0,phase:''};
    this.arenaBounds = [
      ...[-1,1].flatMap(sign=>[-5.5,6.4].map(z=>new T.Vector3(sign*6.8,.08,z))),
      ...[-1,1].flatMap(sign=>[-3.7,4.4].map(z=>new T.Vector3(sign*4.3,4.05,z))),
    ];
    this.beys = [];
    const colors = [0x51b4ff,0xff9959];
    this.aims = colors.map(makeAim);
    this.launchAreas = colors.map((color,i)=>makeLaunchArea(i,color));
    this.launchers = colors.map(makeLauncher);
    this.scene.add(...this.aims,...this.launchAreas,...this.launchers.map(l=>l.group));
    this.raycaster = new T.Raycaster();
    this.sparks = [];
    this.sparkGeometry = new T.BoxGeometry(.065,.065,.19);
    this.sparkMaterial = new T.MeshBasicMaterial({ color: 0xffffb1 });
    this.railMaterial = new T.MeshBasicMaterial({ color: 0xceff4b });
    this.impactRings = Array.from({length:4},()=> {
      const ring = mesh(this.scene,new T.RingGeometry(.78,1,36).rotateX(-Math.PI/2),
        new T.MeshBasicMaterial({color:0xffd499,transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide}),0,0,0);
      ring.visible = false;
      ring.renderOrder = 5;
      return {ring,life:0,strength:0};
    });
    this.nextPosition = new T.Vector3();
    this.nextRotation = new T.Quaternion();
    this.spinAxis = new T.Vector3();
    this.endAxis = new T.Vector3();
    this.swingRotation = new T.Quaternion();
    this.spinRotation = new T.Quaternion();
    this.twistRotation = new T.Quaternion();
    this.cameraTarget = new T.Vector3();
    this.launchPoint = new T.Vector3();
    this.launchPlane = new T.Plane(yAxis,-SHOOT_HEIGHT);
    this.cursor = new T.Vector2();
    this.contactShadowMap = startShadowTexture();
    this.shadows = [0,1].map(() => this.makeContactShadow());
    this.reflexAuras = colors.map(color => {
      const material = new T.MeshBasicMaterial({color, transparent:true, depthWrite:false, blending:T.AdditiveBlending});
      const aura = ring(this.scene,.95,1.04,material,0,48);
      aura.visible = false;
      aura.renderOrder = 4;
      return aura;
    });
    this.smoke = colors.map(color => {
      const map = canvasTexture(32,32,ctx => {
        const gradient = ctx.createRadialGradient(16,16,1,16,16,16);
        gradient.addColorStop(0,'#fff');
        gradient.addColorStop(1,'#fff0');
        ctx.fillStyle = gradient;
        ctx.fillRect(0,0,32,32);
      });
      const puffs = Array.from({length:6}, () => {
        const puff = new T.Sprite(new T.SpriteMaterial({map,color,depthWrite:false,transparent:true}));
        puff.visible = false;
        this.scene.add(puff);
        return puff;
      });
      return puffs;
    });
    this.trails = [this.makeTrail(0x4aacff), this.makeTrail(0xff874a)];
    const observer = new ResizeObserver(() => this.resize());
    observer.observe(container);
    observer.observe(this.frameGuide);
    this.bindPointer();
    this.resize();
  }

  makeTrail(color) {
    const points = Array.from({ length: 13 }, () => new T.Vector3());
    const geometry = new T.BufferGeometry().setFromPoints(points);
    geometry.attributes.position.setUsage(T.DynamicDrawUsage);
    const line = new T.Line(geometry,new T.LineBasicMaterial({color,transparent:true,opacity:.65,depthWrite:false,blending:T.AdditiveBlending}));
    line.frustumCulled = false;
    line.visible = false;
    this.scene.add(line);
    const sparks = new T.InstancedMesh(this.sparkGeometry,new T.MeshBasicMaterial({color,transparent:true,opacity:.76,
      depthWrite:false,blending:T.AdditiveBlending}),8);
    sparks.frustumCulled = false;
    sparks.count = 0;
    sparks.renderOrder = 4;
    this.scene.add(sparks);
    return {line,points,sparks,dummy:new T.Object3D(),dash:false};
  }

  makeContactShadow() {
    const geometry = plane(2.12,2.12);
    const mat = new T.MeshBasicMaterial({ map: this.contactShadowMap, transparent: true, depthWrite: false });
    const shadow = mesh(this.scene, geometry, mat);
    shadow.renderOrder = 1;
    return shadow;
  }

  placeShadow(shadow, bey) {
    const {x,y,z} = bey.holder.position, r = Math.hypot(x,z);
    shadow.visible = r < mouthRadius(Math.atan2(z,x)) - .21;
    if (!shadow.visible) return;
    const floorY = floorAt(x,z);
    const above = Math.max(0,y - bey.standing - floorY);
    shadow.position.set(x,floorY + .022,z);
    shadow.rotation.set(-(floorAt(x,z+.1) - floorY)*10,0,(floorAt(x+.1,z) - floorY)*10);
    shadow.scale.setScalar(1 + .22 * above);
    shadow.material.opacity = .86 * Math.exp(-1.8 * above);
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    const ratio = this.graphics === 'auto' ? (this.mobile ? Math.min(devicePixelRatio, 1, Math.sqrt(520_000 / (w * h))) * this.renderScale : Math.min(devicePixelRatio, 1.35)) :
      Math.min(devicePixelRatio, {low:.7,medium:1,high:1.5}[this.graphics]);
    if (w !== this.width || h !== this.height || ratio !== this.renderer.getPixelRatio()) {
      this.renderer.setDrawingBufferSize(w, h, ratio);
      this.width = w;
      this.height = h;
    }
    this.camera.aspect = w / h;
    this.framing.phase = '';
    this.updateFraming();
    this.dirty = true;
    if (this.inspection) this.inspection.dirty = true;
  }

  setGraphics(quality) {
    this.graphics = quality;
    this.renderScale = 1;
    this.slowFrames = 0;
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.needsUpdate = true;
    this.resize();
  }

  updateFraming() {
    const { width: w, height: h } = this;
    const phase = this.stage.dataset.phase;
    if (w === this.framing.width && h === this.framing.height && phase === this.framing.phase) return;
    const guide = this.frameGuide.getBoundingClientRect(), bounds = this.container.getBoundingClientRect();
    const panel = phase === 'qte' ? this.stage.querySelector('.qte-panel') : null;
    const besidePanel = panel && matchMedia('(max-height:460px) and (orientation:landscape)').matches;
    const panelBounds = panel?.getBoundingClientRect();
    const top = panel ? this.stage.querySelector('.top-bar').getBoundingClientRect().bottom + 8 : guide.top;
    const bottom = besidePanel ? bounds.bottom - 12 : panel ? panelBounds.top - 8 : guide.bottom;
    const visibleHeight = Math.max(1, bottom - top);
    const visibleWidth = besidePanel ? panelBounds.left - bounds.left - 20 : panel ? w*.86 : Math.max(w*.39,guide.width);
    const centerX = besidePanel ? 10 + visibleWidth*.5 : panel ? w*.5 : guide.left-bounds.left+guide.width*.5;
    const centerY = top - bounds.top + visibleHeight*.5;
    this.camera.setViewOffset(w,h,w*.5-centerX,h*.5-centerY,w,h);
    this.framing = {width:w,height:h,phase,visibleWidth,
      visibleHeight:panel ? visibleHeight : Math.max(h*.36,visibleHeight)};
    this.dirty = true;
  }

  fitDistance(y,z,azimuth,elevation) {
    const {height,visibleWidth,visibleHeight} = this.framing;
    const tangent = Math.tan(T.MathUtils.degToRad(this.camera.fov*.5));
    const halfX = tangent*visibleWidth/height, halfY = tangent*visibleHeight/height;
    const cos = Math.cos(azimuth), sin = Math.sin(azimuth);
    const high = Math.sin(elevation), flat = Math.cos(elevation);
    let distance = 0;
    for (const point of this.arenaBounds) {
      const front = point.x*sin+(point.z-z)*cos, up = point.y-y;
      const across = point.x*cos-(point.z-z)*sin;
      distance = Math.max(distance,front*flat+up*high+Math.max(Math.abs(across)/halfX,Math.abs(up*flat-front*high)/halfY));
    }
    return distance*1.035;
  }

  setCamera(mode) {
    this.cameraMode = mode;
    this.pan.set(0,0,0);
    this.zoom = 1;
    if (mode === 'orbit') {
      this.azimuth = .35; this.elevation = .80; this.zoom = 1;
    }
    if (mode === 'top') {
      this.azimuth = 0; this.elevation = 1.568; this.zoom = 1;
    }
    if (mode === 'follow') {
      this.azimuth = .35; this.elevation = .74;
    }
  }

  setCameraLocked(locked) {
    this.lockedCamera = locked ? {focus:this.focus.clone(), distance:this.cameraDistance} : null;
  }

  changeZoom(factor) {
    if (this.lockedCamera) return;
    this.zoom = clamp(this.zoom*factor,.43,1.88);
  }

  panCamera(dx,dy) {
    if (this.lockedCamera) return;
    const amount = this.camera.position.distanceTo(this.focus)*.79/Math.max(1,this.container.clientHeight);
    this.pan.x -= (dx*Math.cos(this.azimuth)+dy*Math.sin(this.azimuth))*amount;
    this.pan.z += (dx*Math.sin(this.azimuth)-dy*Math.cos(this.azimuth))*amount;
    this.pan.clampLength(0,9);
  }

  bindPointer() {
    const canvas = this.renderer.domElement;
    const pointers = new Map();
    const pointAt = e => {
      const rect = canvas.getBoundingClientRect();
      this.cursor.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);
      this.raycaster.setFromCamera(this.cursor,this.camera);
      return this.raycaster.ray.intersectPlane(this.launchPlane,this.launchPoint);
    };
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.button !== 1 && e.button !== 2 || pointers.size >= 2) return;
      if (pointers.size) {
        for (const p of pointers.values()) {
          if (p.changed) this.launchControls.commit();
          p.mode = 'orbit';
        }
      }
      const active = !pointers.size && e.button === 0 && !e.altKey ? this.launchControls.active() : null;
      const target = active ? pointAt(e) : null;
      const aiming = target && target.x*(active.player === 0 ? -1 : 1) >= 0 &&
        Math.hypot(target.x,target.z) < openingRadius(Math.atan2(target.z,target.x))+.15;
      const mode = aiming ? e.shiftKey ? 'angle' : 'aim' : e.altKey || e.button === 1 ? 'pan' : 'orbit';
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,mode,
        angle:active?.config.angle,changed:false});
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (pointers.size > 1) {
        const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)[1];
        const before = Math.hypot(p.x - other.x, p.y - other.y);
        const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        if (before > 8 && after > 8) this.changeZoom(before/after);
        this.panCamera(dx*.5,dy*.5);
      } else if (p.mode === 'aim') {
        if (p.changed || Math.hypot(e.clientX-p.sx,e.clientY-p.sy) > 4) {
          const target = pointAt(e);
          if (target) {
            this.launchControls.change({point:[target.x,target.z]});
            p.changed = true;
          }
        }
      } else if (p.mode === 'angle') {
        this.launchControls.change({angle:clamp(Math.round(p.angle+(e.clientX-p.sx)*.29),-MAX_LAUNCH_ANGLE,MAX_LAUNCH_ANGLE)});
        p.changed = true;
      } else if (p.mode === 'pan' || this.cameraMode === 'top') {
        this.panCamera(dx,dy);
      } else if (!this.lockedCamera) {
        this.azimuth -= dx * .008;
        this.elevation = clamp(this.elevation + dy * .007,.22,1.55);
      }
      Object.assign(p, { x: e.clientX, y: e.clientY });
    });
    canvas.addEventListener('pointerup', e => {
      const pointer = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointer?.mode === 'aim' && !pointer.changed) {
        const target = pointAt(e);
        if (target) this.launchControls.change({point:[target.x,target.z]});
      }
      if (pointer?.mode === 'aim' || pointer?.changed && pointer.mode === 'angle') this.launchControls.commit();
    });
    const cancel = e => {
      const pointer = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointer?.changed) this.launchControls.commit();
    };
    canvas.addEventListener('pointercancel',cancel);
    canvas.addEventListener('lostpointercapture',cancel);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY*(e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1);
      this.changeZoom(Math.exp(clamp(delta*.0014,-.42,.42)));
    }, { passive: false });
  }

  setLoadouts(configs) {
    for (const old of this.beys) {
      this.scene.remove(old.holder);
      disposeBey(old);
    }
    this.beys = configs.map((config,i) => makeBey(config,i, () => { this.dirty = true; }));
    this.dirty = true;
    this.scene.add(...this.beys.map(b => b.holder));
    for (const trail of this.trails) trail.dash = trail.line.visible = false;
  }

  inspectLoadout(canvas, config) {
    if (!this.inspection) {
      const scene = new T.Scene();
      scene.background = new T.Color(0x141d1a);
      scene.environment = this.scene.environment;
      scene.environmentIntensity = .82;
      scene.add(new T.HemisphereLight(0xf0f7ff, 0x83988b, 2.3));
      const key = new T.DirectionalLight(0xe7f3ff, 1.95);
      key.position.set(-2,4,3);
      scene.add(key);
      this.inspection = { scene, camera: new T.PerspectiveCamera(34, 1, .1, 20),
        azimuth: -.26, elevation: .38, dirty: false };
    }
    const preview = this.inspection;
    preview.observer?.disconnect();
    if (preview.bey) {
      preview.scene.remove(preview.bey.holder);
      disposeBey(preview.bey);
    }
    preview.canvas = canvas;
    preview.context = canvas.getContext('2d');
    preview.bey = makeBey(config, undefined, () => { preview.dirty = true; });
    preview.scene.add(preview.bey.holder);
    preview.observer = new ResizeObserver(() => { preview.dirty = true; });
    preview.observer.observe(canvas);
    preview.dirty = true;
    let lastPointer;
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      lastPointer = { x: e.clientX, y: e.clientY, id: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (lastPointer?.id !== e.pointerId) return;
      preview.azimuth -= (e.clientX-lastPointer.x) * .012;
      preview.elevation = clamp(preview.elevation + (e.clientY-lastPointer.y) * .012, -.63, 1.56);
      Object.assign(lastPointer, { x: e.clientX, y: e.clientY });
      preview.dirty = true;
    });
    canvas.addEventListener('lostpointercapture', () => { lastPointer = null; });
  }

  inspectAngle(fromAbove) {
    if (!this.inspection) return;
    this.inspection.elevation = fromAbove ? 1.56 : .12;
    this.inspection.dirty = true;
  }

  closeInspection() {
    const preview = this.inspection;
    if (!preview?.bey) return;
    preview.observer.disconnect();
    preview.scene.remove(preview.bey.holder);
    disposeBey(preview.bey);
    preview.bey = preview.canvas = preview.context = null;
    preview.dirty = false;
  }

  drawInspection() {
    const preview = this.inspection;
    if (!preview?.dirty || !preview.canvas?.isConnected || !preview.canvas.clientWidth) return;
    const { renderer } = this, { canvas, camera } = preview;
    const width = Math.min(this.container.clientWidth, canvas.clientWidth), height = canvas.clientHeight;
    if (this.container.clientHeight < height || width < 1) return;
    const ratio = renderer.getPixelRatio();
    const pixelsWide = Math.floor(width * ratio), pixelsHigh = Math.floor(height * ratio);
    canvas.width = pixelsWide;
    canvas.height = pixelsHigh;
    const distance = 2.88 * Math.max(1, 1.24 * height / width), side = Math.cos(preview.elevation) * distance;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    camera.position.set(Math.sin(preview.azimuth)*side, Math.sin(preview.elevation)*distance - .15, Math.cos(preview.azimuth)*side);
    camera.lookAt(0,-.15,0);
    renderer.setViewport(0,0,width,height);
    renderer.setScissor(0,0,width,height);
    renderer.setScissorTest(true);
    renderer.render(preview.scene,camera);
    preview.context.drawImage(renderer.domElement, 0, renderer.domElement.height-pixelsHigh, pixelsWide,pixelsHigh,
      0,0,pixelsWide,pixelsHigh);
    renderer.setScissorTest(false);
    renderer.setViewport(0,0,this.container.clientWidth,this.container.clientHeight);
    preview.dirty = false;
    return true;
  }

  ready(configs, localPlayer, editing = true) {
    this.dirty = true;
    for (const aura of this.reflexAuras) aura.visible = false;
    for (const puffs of this.smoke) for (const puff of puffs) puff.visible = false;
    this.launchStarted = 0;
    for (const impact of this.impactRings) {
      impact.life = 0;
      impact.ring.visible = false;
    }
    this.beys.forEach((bey, i) => {
      const config = configs[i], {position,rotation,direction} = launchPose(config);
      const {x,z} = position;
      const {fraction} = launchRelease(config);
      const lead = launchSpeed(config.power,BITS[config.bit].style)*fraction*.15;
      const targetX = x+lead*direction.x, targetZ = z+lead*direction.z;
      const y = floorAt(targetX,targetZ);
      bey.holder.position.set(x,position.y,z);
      bey.holder.quaternion.set(rotation.x,rotation.y,rotation.z,rotation.w);
      bey.rotor.rotation.y = i * .18;
      if (bey.freeRing) bey.freeRing.rotation.y = 0;
      if (bey.boundPlate) bey.boundPlate.position.y = 0;
      bey.under.position.set(0, 0, 0);
      bey.setExposure(0);
      this.placeShadow(this.shadows[i], bey);
      this.trails[i].dash = this.trails[i].line.visible = false;
      this.trails[i].sparks.count = 0;
      const accent = BLADES[config.blade].accent;
      this.trails[i].line.material.color.setHex(accent);
      this.trails[i].sparks.material.color.setHex(accent);
      const launcher = this.launchers[i], aim = this.aims[i];
      launcher.group.visible = true;
      launcher.group.position.copy(bey.holder.position);
      launcher.anchor ??= new T.Vector3();
      launcher.anchor.copy(bey.holder.position);
      launcher.group.quaternion.copy(bey.holder.quaternion);
      launcher.group.rotateY(i === 0 ? Math.PI : 0);
      launcher.power = config.power;
      launcher.setPull(0);
      this.launchAreas[i].visible = editing && i === localPlayer;
      this.launchAreas[i].position.setY(.041);
      aim.visible = true;
      aim.position.set(targetX,y+.13,targetZ);
      aim.rotation.order = 'YXZ';
      aim.rotation.set(-z * .056,Math.atan2(-direction.x,-direction.z),x*.056);
      aim.scale.setScalar(i === localPlayer ? .74 : .62);
    });
  }

  setCord(player,power) {
    this.launchers[player].setPull(.35 + power * .011);
    this.dirty = true;
  }

  launchAnimation() {
    this.launchStarted = performance.now();
    for (const guide of this.launchAreas) guide.visible = false;
  }

  showFrames(frames, nextFrames, blend, span, moving, burstTime, dt) {
    this.beys.forEach((bey, i) => {
      const frame = frames[i], next = nextFrames?.[i];
      const effects = frame.w ? frame : next;
      this.aims[i].visible = false;
      bey.holder.position.fromArray(frame.p);
      bey.holder.quaternion.fromArray(frame.q);
      if (next && blend > 0) {
        bey.holder.position.lerp(this.nextPosition.fromArray(next.p), blend);
        // Network snapshots can span more than half a spin. Interpolate the
        // rotation axis independently of the fast phase between those samples.
        this.nextRotation.fromArray(next.q);
        if (span > .018 && frame.w && next.w && blend < 1) {
          this.spinAxis.copy(yAxis).applyQuaternion(bey.holder.quaternion);
          this.endAxis.copy(yAxis).applyQuaternion(this.nextRotation);
          this.swingRotation.setFromUnitVectors(this.spinAxis, this.endAxis);
          this.spinRotation.multiplyQuaternions(this.swingRotation,bey.holder.quaternion).invert();
          this.twistRotation.multiplyQuaternions(this.nextRotation,this.spinRotation);
          const { x,y,z,w } = this.twistRotation;
          const angle = 2 * Math.atan2(x*this.endAxis.x + y*this.endAxis.y + z*this.endAxis.z, w);
          const expected = span * (this.spinAxis.dot(this.nextPosition.fromArray(frame.w)) +
            this.endAxis.dot(this.nextPosition.fromArray(next.w))) * .5;
          const twist = angle + TAU * Math.round((expected-angle)/TAU);
          this.swingRotation.slerp(this.spinRotation.identity(),1-blend);
          bey.holder.quaternion.premultiply(this.swingRotation);
          this.spinAxis.applyQuaternion(this.swingRotation);
          bey.holder.quaternion.premultiply(this.twistRotation.setFromAxisAngle(this.spinAxis,twist*blend));
        } else {
          bey.holder.quaternion.slerp(this.nextRotation, blend);
        }
      }
      bey.rotor.rotation.y = 0;
      if (bey.freeRing && moving && effects.w) {
        bey.freeRing.rotation.y = (bey.freeRing.rotation.y-effects.w[1]*dt*.73)%TAU;
      }
      if (bey.boundPlate) bey.boundPlate.position.y = Math.sin((effects.bound ?? 0)*Math.PI)*.034;
      if (moving && effects.w) {
        const spin = Math.hypot(...effects.w);
        // A short exposure removes the strobing of sharp teeth at high RPM.
        bey.setExposure(spin * Math.min(dt, 1/60) * .57);
      } else {
        bey.setExposure(0);
      }
      if (effects.burst) {
        const t = Math.min(1, burstTime);
        bey.under.position.set(t * (i ? 1.5 : -1.5), t * (1 - t) * 4, t * .5);
      }
      this.placeShadow(this.shadows[i],bey);
      const trail = this.trails[i];
      const aura = this.reflexAuras[i];
      const boost = (next ?? frame).moves?.reflexBoost;
      if (boost && !aura.visible) this.spark(bey.holder.position.toArray(), .85, true);
      aura.visible = Boolean(boost);
      if (boost) {
        aura.position.copy(bey.holder.position);
        aura.position.y += .18;
        aura.scale.setScalar(1.09 + .14*Math.sin(performance.now()*.012));
        aura.material.color.setHex(0xdcff72);
        aura.material.opacity = .98;
      }
      const rushing = effects.dash || effects.impactTrail || Boolean(boost);
      trail.line.material.opacity = boost ? .98 : .65;
      trail.line.material.color.setHex(boost ? 0xdcff72 : bey.blade.accent);
      const {x,z} = bey.holder.position;
      const y = floorAt(x,z)+.073;
      if (rushing && !trail.dash) for (const p of trail.points) p.set(x,y,z);
      trail.dash = trail.line.visible = rushing;
      trail.sparks.count = rushing ? trail.sparks.instanceMatrix.count : 0;
      if (rushing && moving) {
        const point = trail.points.pop().set(x,y,z);
        trail.points.unshift(point);
        trail.line.geometry.setFromPoints(trail.points);
        for (let i=0;i<trail.sparks.count;i++) {
          const point = trail.points[i+2], fade = 1-i/trail.sparks.count;
          trail.dummy.position.set(point.x+Math.sin(i*6.1)*.13,point.y+.055*fade,point.z+Math.cos(i*3.7)*.13);
          trail.dummy.rotation.set(.25, i*2.7, -.23);
          trail.dummy.scale.setScalar(.32+.85*fade);
          trail.dummy.updateMatrix();
          trail.sparks.setMatrixAt(i,trail.dummy.matrix);
        }
        trail.sparks.instanceMatrix.needsUpdate = true;
      }
      this.smoke[i].forEach((puff,j) => {
        puff.visible = Boolean(boost) && (this.graphics !== 'low' || j < 3);
        if (!puff.visible) return;
        const age = ((performance.now()*.0017+j/6) % 1);
        const point = trail.points[Math.floor(age*(trail.points.length-1))];
        puff.position.set(point.x+.18*Math.sin(j*2.4),point.y+.38+age*.6,point.z+.18*Math.cos(j*2.4));
        puff.scale.setScalar(.25+age*.65);
        puff.material.opacity = .33*(1-age);
      });
    });
  }

  spark(at, strength, isRail = false, impactAxis) {
    const strong = impactAxis && strength >= .78;
    const count = isRail ? 12 : Math.ceil(7 + strength*(strong ? 13 : 7));
    const n = this.mobile || this.graphics === 'low' ? Math.max(0, Math.min(32 - this.sparks.length, Math.ceil(count / 2))) : count;
    if (strong) {
      const impact = this.impactRings.reduce((first,current)=>current.life < first.life ? current : first);
      impact.life = .17;
      impact.strength = strength;
      impact.ring.position.set(...at);
      impact.ring.scale.setScalar(.22);
      impact.ring.material.opacity = .8;
      impact.ring.visible = true;
    }
    for (let i = 0; i < n; i++) {
      const a = strong ? Math.atan2(impactAxis[1],impactAxis[0])+Math.PI*(i%2)+(.5-Math.random())*1.46 : Math.random()*TAU;
      const force = 2 + Math.random()*(3+strength*(strong ? 4.8 : 3));
      const node = mesh(this.scene, this.sparkGeometry, isRail ? this.railMaterial : this.sparkMaterial, ...at);
      this.sparks.push({ node, velocity: new T.Vector3(Math.cos(a)*force, 1+Math.random()*(strong ? 4 : 3), Math.sin(a)*force),
        life: .21+Math.random()*.22, length: strong ? 1.85 : 1 });
    }
  }

  draw(dt, motionRate) {
    if (!this.width || !this.height) return;
    const phase = this.stage.dataset.phase;
    const moving = phase !== 'setup';
    if (this.graphics === 'auto' && this.mobile && phase === 'fight') {
      this.slowFrames = dt > .027 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
      if (this.slowFrames >= 24 && this.renderScale > .7) {
        this.renderScale = Math.max(.7, this.renderScale - .15);
        this.slowFrames = 0;
        this.resize();
      }
    } else this.slowFrames = 0;
    if (this.launchStarted) {
      const t = clamp((performance.now()-this.launchStarted)/460,0,1);
      for (const [i,launcher] of this.launchers.entries()) {
        launcher.setPull((1.07+launcher.power*.011)*Math.max(0,1-3.7*t));
        launcher.group.position.copy(launcher.anchor);
        launcher.group.position.x += (i ? 1 : -1) * t * t * 3.2;
        launcher.group.position.y += t * (.7 + t * .85);
        launcher.group.visible = t < 1;
      }
      if (t >= 1) this.launchStarted = 0;
    }
    this.updateFraming();
    const reflex = phase === 'qte' && this.beys.length === 2;
    const locked = reflex ? null : this.lockedCamera;
    const follow = !locked && this.cameraMode === 'follow' && this.beys.length === 2 && moving;
    const focusY = this.cameraMode === 'top' ? .65 : moving ? .97 : 1.5;
    const look = reflex || follow ? this.cameraTarget.lerpVectors(this.beys[0].holder.position,this.beys[1].holder.position,.5) :
      this.cameraTarget.set(0,focusY,.44);
    if (!reflex) {
      if (follow) look.setY(.45);
      look.add(this.pan);
      if (locked) look.copy(locked.focus);
    }
    if (this.cameraDistance === undefined) this.focus.copy(look);
    else this.focus.lerp(look, 1 - Math.exp(-dt * (reflex ? 12 : 6)));
    const fitted = this.fitDistance(focusY,.44,this.azimuth,this.elevation);
    const span = reflex || follow ? this.beys[0].holder.position.distanceTo(this.beys[1].holder.position) : 0;
    const baseDistance = follow ? fitted*(.53+.40*clamp(span/11,0,1)) : fitted;
    const {visibleWidth, visibleHeight, height} = this.framing;
    let distanceTarget = locked?.distance ?? baseDistance*this.zoom;
    if (reflex) {
      const tangent = Math.tan(T.MathUtils.degToRad(this.camera.fov*.5));
      const offset = this.nextPosition.subVectors(this.beys[1].holder.position,this.beys[0].holder.position).multiplyScalar(.5);
      const across = offset.x*Math.cos(this.azimuth) - offset.z*Math.sin(this.azimuth);
      const depth = offset.x*Math.sin(this.azimuth) + offset.z*Math.cos(this.azimuth);
      const up = offset.y*Math.cos(this.elevation) - depth*Math.sin(this.elevation);
      const forward = depth*Math.cos(this.elevation) + offset.y*Math.sin(this.elevation);
      distanceTarget = Math.abs(forward) + Math.max((Math.abs(across)+1.55)*height/(tangent*visibleWidth),
        (Math.abs(up)+1.55)*height/(tangent*visibleHeight));
    }
    this.cameraDistance ??= baseDistance;
    this.cameraDistance += (distanceTarget-this.cameraDistance)*(1-Math.exp(-dt*14));
    const distance = this.cameraDistance;
    const lateral = Math.cos(this.elevation) * distance;
    this.nextPosition.set(this.focus.x + Math.sin(this.azimuth) * lateral,
      this.focus.y + Math.sin(this.elevation) * distance, this.focus.z + Math.cos(this.azimuth) * lateral);
    // Give the camera time to settle, then reuse the last frame during setup.
    const cameraChanged = this.camera.position.distanceToSquared(this.nextPosition) > .000001;
    const previewDrawn = this.drawInspection();
    if (!moving && !this.dirty && !cameraChanged && !previewDrawn) return;
    this.camera.position.copy(this.nextPosition);
    this.camera.lookAt(this.focus);
    const effectTime = dt*motionRate;
    for (const impact of this.impactRings) {
      if (impact.life <= 0) continue;
      impact.life = Math.max(0,impact.life-dt*Math.max(.55,motionRate));
      const t = 1-impact.life/.17;
      impact.ring.material.opacity = .8*(1-t)**1.7;
      impact.ring.scale.setScalar(.22+t*(.72+impact.strength*.56));
      impact.ring.visible = impact.life > 0;
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.life -= effectTime;
      p.velocity.y -= effectTime * 8;
      p.node.position.addScaledVector(p.velocity, effectTime);
      p.node.quaternion.setFromUnitVectors(this.endAxis.set(0,0,1),this.spinAxis.copy(p.velocity).normalize());
      const fade = Math.min(1,p.life*6);
      p.node.scale.set(fade,fade,fade*p.length);
      if (p.life <= 0) {
        this.scene.remove(p.node);
        this.sparks.splice(i, 1);
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
  }
}
