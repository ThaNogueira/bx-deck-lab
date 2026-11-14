import RAPIER from './vendor/rapier.mjs';
import { runningSpeed } from './motion.js';
import { FREE_RING_PROFILE, bladeContact, bladeHullSectors, bladeLevels, bladeOutline } from './blade-shape.js';
import { BLADE_BASE, GEAR_HEIGHT, GEAR_HALF_HEIGHT, MOVE_USES, RATCHET_OUTLINES, bitProfile, getParts, launchPose, launchRelease, railRating, ratchetLobes, specialMove } from './rules.js';
import { POCKETS, RAIL, SHELL, TAU, coverGeometry, coverCollarGeometry, coverSideGeometry, openingRadius, sectors, edgeRadius, mouthRadius, lipHeight, pocketAt, pocketBackHeight, pocketGeometry, pocketContains,
  guardRadius, rimShelfGeometry, rimWallGeometry, trayRadius, floorGeometry, floorAt, tipSurfaceAt, railFrame, closestRail, railExitAngle, angleDelta, clamp } from './stadium.js';

export const DT = 1 / 300;
const GRAVITY = 9.81 / .03;
const MAX_TRANSLATION = 46;
const BLADE_COLLISIONS = 0x0002ffff;
const LOWER_PART_COLLISIONS = 0x0004ffff;
const BOWL_MEMBERSHIP = 0x0010;
const SLOW_BOWL_MEMBERSHIP = 0x0020;
const COVER_COLLISIONS = 0x00080002;
const STADIUM_SOLVER = 0x0001ffff;
const RAIL_FLOOR_FILTER = 0xffff & ~(0x0001 | BOWL_MEMBERSHIP | SLOW_BOWL_MEMBERSHIP);
const ENGAGED_BLADE_SOLVER = 0x00020000 | RAIL_FLOOR_FILTER;
const ENGAGED_LOWER_SOLVER = 0x00040000 | RAIL_FLOOR_FILTER;
// The collision solver advances a resolved spin rate. The extra axial inertia
// represents angular momentum at launch speeds above that resolution.
const AXIAL_MOMENTUM_SCALE = 1.43;
const WOBBLE_RATIO = .17;
const REST_SPIN = 2.8;
const SPIN_FINISH_DELAY = .60;
const REST_QUIET_TIME = .32;
const REFERENCE_MASS = 1.28;
const DASH_CARRY_TIME = .61;
const BLADE_SHELL_CLEARANCE = .018;
const POCKET_FINISH_DELAY = 1.5;
const POCKET_REVERSE_MIN_COST = .18;
const POCKET_REVERSE_EXTRA_COST = .34;
const MOVE_DURATION = {attack:.68,dash:1.62,defense:2.65,circle:3.35};
const REFLEX_BOOST_TIME = { defense: 1.5, attack: 2.5 };
const REFLEX_COOLDOWN = 4;
const REFLEX_SPIN_REWARD = .04;
const CIRCLE_SPIN_REWARD = .08;
const BOOSTED_ATTACK_RANGE = 2.45;
const BOOSTED_ATTACK_WINDUP = .29;
const upright = { x: 0, y: 0, z: 0, w: 1 };
const vertical = { x: 0, y: 1, z: 0 };
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const scale = (v, k) => ({ x: v.x * k, y: v.y * k, z: v.z * k });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const asArray = v => [v.x, v.y, v.z];
const axisOf = q => ({
  x: 2 * (q.x * q.y - q.w * q.z),
  y: 1 - 2 * (q.x * q.x + q.z * q.z),
  z: 2 * (q.y * q.z + q.w * q.x),
});
const horizontalSpeed = v => Math.hypot(v.x,v.z);
const endOfSpin = (top,spin = top.spin) => {
  const threshold = top.launchSpin*WOBBLE_RATIO;
  return clamp((threshold-spin)/(threshold-REST_SPIN),0,1);
};
const positiveAngle = a => (a + TAU) % TAU;
const rotateVector = (v,q) => {
  const axis = {x:q.x,y:q.y,z:q.z};
  return add(v,scale(cross(axis,add(cross(axis,v),scale(v,q.w))),2));
};
function turnRotation(q,axis,angle) {
  const xyz = scale(axis,Math.sin(angle/2)), w = Math.cos(angle/2);
  const old = {x:q.x,y:q.y,z:q.z};
  return {...add(add(scale(old,w),scale(xyz,q.w)),cross(xyz,old)),w:w*q.w-dot(xyz,old)};
}

function massProfile(parts) {
  const { blade, ratchet, bit, bitMass, mass, ratchetBottom, standing } = parts;
  const ratchetCenter = ((blade.base ?? BLADE_BASE) + ratchetBottom) / 2;
  const bladeCenter = .016;
  const bitCenter = GEAR_HEIGHT - standing;
  const com = (blade.mass * bladeCenter + ratchet.mass * ratchetCenter + bitMass * bitCenter) / mass;
  const rim = blade.mass * blade.radius ** 2;
  const ratchetInertia = ratchet.mass * ratchet.radius ** 2;
  return {
    com, mass,
    polar: (rim * .58 * (blade.outerMass ?? 1) + ratchetInertia * .48 + bitMass * bit.gear ** 2 * .5) * AXIAL_MOMENTUM_SCALE,
    transverse: rim * .28 + .01 + blade.mass * (bladeCenter-com) ** 2 +
      ratchetInertia * .26 + ratchet.mass * (ratchetCenter-com) ** 2 + bitMass * (bitCenter-com) ** 2,
  };
}

function ratchetShape(blade, ratchet, bottom) {
  const vertices = [];
  const lobe = RATCHET_OUTLINES[ratchet.teeth];
  const n = ratchetLobes(ratchet) * lobe.length;
  const seat = blade.base ?? BLADE_BASE;
  const radius = ratchet.radius;
  const rows = blade.integrated ? [[.32,bottom],[.43,bottom+.047],[.47,seat-.023],[.40,seat+.012]] :
    [[radius*.83,bottom],[radius*.96,bottom+.028],[radius,bottom+.069],[radius*.98,seat-.028],[radius*.92,seat+.012]];
  for (const [reach,y] of rows) {
    for (let i = 0; i < n; i++) {
      const a = 2 * Math.PI * i / n;
      const r = reach * lobe[i % lobe.length];
      vertices.push(r * Math.cos(a), y, r * Math.sin(a));
    }
  }
  return RAPIER.ColliderDesc.convexHull(Float32Array.from(vertices));
}

function tipShape(profile,standing,sides) {
  const vertices = [];
  for (const [radius,height] of profile) {
    for (let i=0;i<(radius ? sides : 1);i++) {
      const angle = i*TAU/sides;
      vertices.push(radius*Math.cos(angle),height-standing,radius*Math.sin(angle));
    }
  }
  return RAPIER.ColliderDesc.convexHull(Float32Array.from(vertices));
}

function bitSupport(top,axis,x,z,floor,flat = false) {
  const slopeX = flat ? 0 : (tipSurfaceAt(x+.025,z)-tipSurfaceAt(x-.025,z))/.05;
  const slopeZ = flat ? 0 : (tipSurfaceAt(x,z+.025)-tipSurfaceAt(x,z-.025))/.05;
  const normal = {x:-slopeX,y:1,z:-slopeZ};
  const alignment = dot(axis,normal);
  const sideways = Math.sqrt(Math.max(0,dot(normal,normal)-alignment**2));
  let support = -Infinity;
  for (const [radius,height] of top.tipProfile) {
    support = Math.max(support,(top.standing-height)*alignment+radius*sideways);
  }
  return floor+support;
}

const supportAngles = Array.from({length:12},(_,i)=>[Math.cos(i*TAU/12),Math.sin(i*TAU/12)]);
function curvedTipSupport(top,axis,x,z,rotation) {
  const side = horizontalSpeed(axis);
  const u = top.bit.facets ? rotateVector({x:1,y:0,z:0},rotation) :
    side > .001 ? {x:axis.z/side,y:0,z:-axis.x/side} : {x:1,y:0,z:0};
  const v = cross(axis,u);
  let height = -Infinity;
  for (const [radius,level] of top.supportProfile) {
    const offset = level-top.standing;
    const cx = x+axis.x*offset, cz = z+axis.z*offset;
    for (let i=0;i<(radius ? supportAngles.length : 1);i+=top.bit.facets === 6 && level <= .060 ? 2 : 1) {
      const [c,s] = supportAngles[i];
      const px = cx+radius*(u.x*c+v.x*s), pz = cz+radius*(u.z*c+v.z*s);
      height = Math.max(height,tipSurfaceAt(px,pz)-axis.y*offset-radius*(u.y*c+v.y*s));
    }
  }
  return height;
}

function bladeRimSupport(top,rotation,x,z) {
  let height = -Infinity;
  for (const point of top.rimSupport) {
    const offset = rotateVector(point,rotation);
    height = Math.max(height,tipSurfaceAt(x+offset.x,z+offset.z)-offset.y);
  }
  return height;
}

export const initPhysics = () => RAPIER.init();

export class Battle {
  constructor(configs, onEvent, { reflex = false } = {}) {
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = DT;
    this.world.lengthUnit = 1;
    this.world.numSolverIterations = 6;
    this.world.maxCcdSubsteps = 1;
    this.onEvent = onEvent;
    this.reflex = reflex;
    this.time = 0;
    this.lastHit = -1;
    this.lastQte = -Infinity;
    this.floorHandles = new Set();
    this.wallHandles = new Set();
    this.addStadium();
    this.tops = configs.map((config, i) => this.addTop(config, i));
  }

  addStadium() {
    const addMesh = ({ vertices, faces }, friction, restitution) => this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(Float32Array.from(vertices), Uint32Array.from(faces), RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
        .setFriction(friction).setRestitution(restitution).setSolverGroups(STADIUM_SOLVER)
    );
    const addFloor = (geo,friction,restitution) => this.floorHandles.add(addMesh(geo,friction,restitution).handle);
    const bowl = addMesh(floorGeometry(),.014,.018);
    bowl.setCollisionGroups(BOWL_MEMBERSHIP<<16 | 0x0006);
    bowl.setSolverGroups(BOWL_MEMBERSHIP<<16 | 0x0006);
    const slowBowl = addMesh(floorGeometry({angularStep:.105,bowlBands:18}),.014,.018);
    slowBowl.setCollisionGroups(SLOW_BOWL_MEMBERSHIP<<16 | 0x0006);
    slowBowl.setSolverGroups(SLOW_BOWL_MEMBERSHIP<<16 | 0x0006);
    this.floorHandles.add(bowl.handle);
    this.floorHandles.add(slowBowl.handle);
    for (const geometry of [coverGeometry(), ...coverCollarGeometry(), ...coverSideGeometry()]) {
      const cover = addMesh(geometry,.075,.10);
      cover.setCollisionGroups(COVER_COLLISIONS);
      this.wallHandles.add(cover.handle);
    }
    const barrier = (a, b, low, high, bounce) => {
      const [ax, az] = a, [bx, bz] = b;
      const yaw = -Math.atan2(bz - az, bx - ax);
      const wall = this.world.createCollider(RAPIER.ColliderDesc.cuboid(Math.hypot(bx - ax, bz - az) / 2 + .018, (high - low) / 2, .072)
        .setTranslation((ax + bx) / 2, (low + high) / 2, (az + bz) / 2)
        .setRotation({x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2)})
        .setFriction(.13).setRestitution(bounce).setSolverGroups(STADIUM_SOLVER));
      this.wallHandles.add(wall.handle);
    };
    const flat = (r,a) => [r * Math.cos(a), r * Math.sin(a)];
    for (const sector of sectors) {
      const {angles,pocket} = sector;
      if (pocket) {
        const {lip,drop,floor} = pocketGeometry(sector);
        addFloor(lip,.025,.055);
        addFloor(drop,.069,.10);
        addFloor(floor,.105,.16);
        const [start,end] = [angles[0],angles.at(-1)];
        barrier(flat(trayRadius(pocket,start),start),flat(trayRadius(pocket,end),end),pocket.bottom - .20,pocketBackHeight(pocket),.29);
        for (const angle of [start,end]) {
          barrier(flat(mouthRadius(angle) + .32,angle),flat(trayRadius(pocket,angle),angle),pocket.bottom - .21,.91,.36);
        }
      } else {
        addFloor(rimShelfGeometry(angles),.07,.055);
        this.wallHandles.add(addMesh(rimWallGeometry(angles),.09,.37).handle);
      }
    }
  }
  addTop(config, player) {
    const parts = getParts(config);
    const { blade, ratchet, ratchetBottom, standing, bit } = parts;
    const inertia = massProfile(parts);
    const {position, rotation:q, direction} = launchPose(config);
    const axis = axisOf(q);
    const launchSpin = 68 + config.power * 1.92;
    const spinDirection = blade.spinDirection;
    const {settle,fall,speed,airSpeed} = launchRelease(config);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setAdditionalMassProperties(inertia.mass, { x: 0, y: inertia.com, z: 0 },
          { x: inertia.transverse, y: inertia.polar, z: inertia.transverse }, upright)
        .setTranslation(position.x,position.y,position.z)
        .setRotation(q).setLinvel(direction.x * airSpeed,fall,direction.z * airSpeed)
        .setAngvel(scale(axis, launchSpin * spinDirection))
        .setLinearDamping(.018)
    );

    const bladeHulls = bladeHullSectors(blade);
    const outline = bladeOutline(blade);
    const rimVariation = Math.max(...outline)-Math.min(...outline);
    const rimSupport = bladeLevels(blade).slice(1,3).flatMap(([radius,y,contour])=>outline.flatMap((reach,i)=> {
      if (i%3) return [];
      const angle = i*TAU/outline.length, r = radius+(reach-1)*contour;
      return [{x:r*Math.cos(angle),y,z:r*Math.sin(angle)}];
    }));
    const createMetal = (vertices,groups = BLADE_COLLISIONS & ~SLOW_BOWL_MEMBERSHIP) => this.world.createCollider(
      RAPIER.ColliderDesc.convexHull(vertices).setDensity(0).setCollisionGroups(groups)
        .setFriction(.025+blade.catch*.11).setRestitution(.065+blade.catch*.29),body);
    const bladeColliders = bladeHulls.map(vertices => createMetal(vertices));
    const freeRingCollider = blade.freeRing ? this.world.createCollider(
      tipShape(FREE_RING_PROFILE,0,32).setDensity(0).setCollisionGroups(BLADE_COLLISIONS & ~SLOW_BOWL_MEMBERSHIP)
        .setFriction(.002).setRestitution(.10).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min),body) : null;
    if (freeRingCollider) bladeColliders.push(freeRingCollider);
    // Low-speed floor contact needs the outline, but not overlapping metal sectors.
    const lowSpeedHull = [];
    const levels = bladeLevels(blade);
    for (const [radius,y,contour] of [levels[0],levels[1],levels[2],levels[3],levels[5],[.379,.207,0]]) {
      const samples = contour ? blade.lobes*5 : 10;
      for (let i=0;i<samples;i++) {
        const sample = i*outline.length/samples;
        const index = Math.floor(sample);
        const reach = outline[index]+(outline[(index+1)%outline.length]-outline[index])*(sample-index);
        const r = radius+(reach-1)*contour;
        const a = TAU*i/samples;
        lowSpeedHull.push(r*Math.cos(a),y,r*Math.sin(a));
      }
    }
    const lowSpeedCollider = createMetal(Float32Array.from(lowSpeedHull),BLADE_COLLISIONS & ~BOWL_MEMBERSHIP);
    lowSpeedCollider.setEnabled(false);
    const ratchetCollider = this.world.createCollider(
      ratchetShape(blade,ratchet,ratchetBottom)
        .setDensity(0).setCollisionGroups(LOWER_PART_COLLISIONS & ~SLOW_BOWL_MEMBERSHIP).setFriction(.10).setRestitution(.20), body
    );
    const tipProfile = bitProfile(bit);
    const tip = this.world.createCollider(
      tipShape(tipProfile,standing,bit.facets ?? 10)
        .setDensity(0).setCollisionGroups(LOWER_PART_COLLISIONS & ~SLOW_BOWL_MEMBERSHIP).setFriction(.0006).setRestitution(.009)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min), body
    );
    const shoulderRadius = bit.shape === 'disk' ? .245 : bit.shape === 'pointFlat' ? bit.tip : bit.gear * .95;
    const shoulderY = bit.shape === 'disk' ? .116 : bit.shape === 'pointFlat' ? .049 : GEAR_HEIGHT;
    const bitShoulder = this.world.createCollider(
      RAPIER.ColliderDesc.roundCylinder(.013, shoulderRadius-.014, .014)
        .setTranslation(0, -standing + shoulderY, 0).setDensity(0).setCollisionGroups(LOWER_PART_COLLISIONS & ~SLOW_BOWL_MEMBERSHIP)
        .setFriction(.0008).setRestitution(.022)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min), body
    );
    body.recomputeMassPropertiesFromColliders();
    return {
      ...parts, inertia, body, bladeColliders, fullMetal:bladeColliders, lowSpeedMetal:[lowSpeedCollider],
      freeRingCollider, rimVariation, rimSupport, ratchetCollider, tip, tipProfile, bitShoulder,
      lowerColliders:[ratchetCollider,tip,bitShoulder], player, launchSpin, spinDirection,
      supportProfile:[...tipProfile,[shoulderRadius-.005,shoulderY-.021]],
      launch: { direction, speed, settle }, landedAt: -1,
      load: 0, scrape: 0, spin: launchSpin, stoppedAt: null, quietSince: null,
      canBalanceAtRest: bit.shape === 'flat' && Math.random() < .01,
      lockDamage: 0, lastRatchetHit: -1, boundAt: -Infinity,
      charges: { [specialMove(bit)]: MOVE_USES, dash: MOVE_USES }, move: null, moveReadyAt: 0, nextRunAt: 0,
      rail: null, railReadyAt: 0, railSupportUntil: 0, impactUntil: 0, pushedUntil: 0, liftUntil: 0, driveResumeAt: 0,
      dashCarry: 0, dashAt: -1, lastWall: -1, lastWallWear: -1, impactTrailUntil: 0,
      escape: null, defeat: null, landed: false, rimStrikeUntil: 0, rimLiftUntil: 0, railOverrun: null,
    };
  }

  spendSpin(top, loss, axis = axisOf(top.body.rotation())) {
    const axial = dot(axis,top.body.angvel());
    const spent = Math.min(top.spin,loss);
    if (spent <= 0) return;
    top.spin -= spent;
    const controlled = top.spin*top.spinDirection-axial;
    const free = -top.spinDirection*Math.min(spent,Math.max(0,axial*top.spinDirection));
    const release = endOfSpin(top)**2;
    const correction = controlled*(1-release)+free*release;
    top.body.applyTorqueImpulse(scale(axis,correction*top.inertia.polar),true);
  }

  recoverSpin(top, fraction, axis = axisOf(top.body.rotation())) {
    const gain = Math.max(0,Math.min(top.launchSpin-top.spin,top.launchSpin*fraction));
    if (!gain) return;
    top.spin += gain;
    if (top.spin > REST_SPIN) top.stoppedAt = null;
    const axial = dot(axis,top.body.angvel());
    top.body.applyTorqueImpulse(scale(axis,(top.spin*top.spinDirection-axial)*top.inertia.polar),true);
  }

  equalizeSpin(a,b,closing) {
    if (a.spinDirection === b.spinDirection || closing > 4 || Math.min(a.spin,b.spin) <= REST_SPIN) return;
    const [donor,receiver] = a.spin > b.spin ? [a,b] : [b,a];
    const difference = donor.spin-receiver.spin;
    const receiverAxis = axisOf(receiver.body.rotation());
    const gain = Math.min(3.2,difference*.064,receiver.launchSpin-receiver.spin);
    if (gain <= 0) return;
    const transferred = gain*receiver.inertia.polar;
    this.spendSpin(donor,transferred/donor.inertia.polar);
    receiver.spin += gain;
    const correction = receiver.spin*receiver.spinDirection-dot(receiverAxis,receiver.body.angvel());
    receiver.body.applyTorqueImpulse(scale(receiverAxis,correction*receiver.inertia.polar),true);
  }

  canMove(top, kind) {
    const boosted = this.canUseReflexBoost(top,kind);
    if (!top || !Object.hasOwn(top.charges,kind) || !top.charges[kind] || this.finished ||
      !top.landed || top.defeat || top.escape || top.rail || !boosted && (top.move?.manual || this.time < top.moveReadyAt) ||
      this.time < Math.max(top.impactUntil,top.liftUntil,top.driveResumeAt) ||
      this.time-top.landedAt < .54+top.launch.settle*.53 || top.spin < (kind === 'dash' ? 57 : 28)) return false;
    const p = top.body.translation(), v = top.body.linvel();
    return Math.hypot(p.x,p.z) < mouthRadius(Math.atan2(p.z,p.x))-.23 &&
      p.y < floorAt(p.x,p.z)+top.standing+.22 && v.y < 2.3 && axisOf(top.body.rotation()).y > .86;
  }

  canUseReflexBoost(top, kind) {
    return kind !== 'dash' && this.time < (top?.reflexBoostUntil ?? 0);
  }

  tryMove(player, kind) {
    const top = this.tops[player];
    if (!this.canMove(top,kind)) return false;
    const boosted = this.canUseReflexBoost(top,kind);
    this.startMove(top,kind,true);
    if (boosted) {
      top.reflexBoostUntil = 0;
      top.move.boosted = true;
      top.move.until = this.time + top.reflexBoostDuration;
      if (kind === 'attack') this.prepareAttackRetreat(top);
    }
    top.charges[kind]--;
    top.moveReadyAt = this.time+1.05;
    this.onEvent({type:'move',kind,player,boosted});
    return true;
  }

  prepareAttackRetreat(top) {
    const position = top.body.translation();
    const rival = this.tops[1-top.player];
    const separation = sub(position,rival.body.translation());
    const gap = horizontalSpeed(separation);
    if (gap >= BOOSTED_ATTACK_RANGE || rival.escape || rival.defeat) return;
    const away = gap > .05 ? {x:separation.x/gap,y:0,z:separation.z/gap} : {x:top.player ? 1 : -1,y:0,z:0};
    const reach = clamp(3.35-gap,1.05,1.85);
    let target = add(position,scale(away,reach));
    const radius = horizontalSpeed(target);
    if (radius > 4.65) {
      // Near the rim, step sideways if the straight retreat points out of the bowl.
      const tangent = {x:-position.z,y:0,z:position.x};
      const side = dot(tangent,away) >= 0 ? 1 : -1;
      target = add(position,scale(tangent,side*reach/Math.max(.1,horizontalSpeed(position))));
      target = scale(target,Math.min(1,4.65/horizontalSpeed(target)));
    }
    top.move.retreat = { target, until:this.time + BOOSTED_ATTACK_WINDUP };
  }

  startMove(top, kind, manual) {
    top.move = { kind, manual, until: this.time+(manual ? MOVE_DURATION[kind] : .46) };
    if (kind === 'dash') {
      const p = top.body.translation();
      top.move.entry = closestRail(p.x,p.z);
      top.railReadyAt = this.time;
    }
  }

  pickRun(top,p,v,rival) {
    if (this.finished || top.move || this.time < top.nextRunAt || this.time < top.railReadyAt || top.bit.style < .28 ||
      top.spin/top.launchSpin < .32 || !rival.landed || rival.escape || !rival.body.isEnabled()) return;
    const opponent = rival.body.translation();
    const radius = Math.hypot(p.x,p.z);
    const gap = horizontalSpeed(sub(opponent,p));
    const outerOpponent = Math.hypot(opponent.x,opponent.z) > 3.75;
    const wantsIntercept = radius > 2.75 && gap > 2.12 && gap < 6.55 &&
      (!outerOpponent || horizontalSpeed(v) > 9) && opponent.y < floorAt(opponent.x,opponent.z)+rival.standing+.20;
    if (wantsIntercept) {
      this.startMove(top,'attack',false);
    }
    if (top.move) top.nextRunAt = this.time+3.65+1.35*(1-top.bit.style)+.36*top.player;
  }

  moveForce(top,p,v,spin) {
    if (!top.move) return null;
    const { kind, manual, boosted } = top.move;
    const { bit, blade } = top;
    const reserve = clamp(spin/top.launchSpin,0,1);
    if (kind === 'defense' || kind === 'circle') {
      const r = horizontalSpeed(p);
      const radial = r > .12 ? {x:p.x/r,y:0,z:p.z/r} : {x:top.player ? 1 : -1,y:0,z:0};
      const orbit = kind === 'circle';
      const radialSpeed = orbit ? clamp(((boosted ? 2.7 : 1.84)-r)*5.5,-9,7) : -Math.min(boosted ? 18 : 11,r*(boosted ? 12 : 7));
      const tangentSpeed = orbit ? (3.65+3.6*reserve)*(boosted ? 1.55 : 1)*clamp(r/.68,.32,1)*top.spinDirection : 0;
      const pace = {x:radial.x*radialSpeed-radial.z*tangentSpeed,y:0,z:radial.z*radialSpeed+radial.x*tangentSpeed};
      const change = sub(pace,{x:v.x,y:0,z:v.z});
      return scale(change,Math.min(boosted ? 15 : 10,(boosted ? 155 : 78)/Math.max(.01,horizontalSpeed(change))));
    }
    let direction, pace, maxForce;
    if (kind === 'attack') {
      const retreat = top.move.retreat;
      if (retreat) {
        const path = sub(retreat.target,p);
        const distance = horizontalSpeed(path);
        if (this.time < retreat.until && distance > .20) {
          const speed = Math.min(10,distance*18);
          const change = sub(scale({x:path.x,y:0,z:path.z},speed/distance),{x:v.x,y:0,z:v.z});
          return scale(change,Math.min(18,180/Math.max(.01,horizontalSpeed(change))));
        }
        top.move.retreat = null;
      }
      const rival = this.tops[1-top.player];
      const target = rival.body.translation();
      const lead = scale(rival.body.linvel(),.082);
      direction = sub(add(target,lead),p);
      const radius = Math.hypot(p.x,p.z);
      const outward = radius > 4.2 ? clamp((radius-4.2)*1.8,0,1) : 0;
      direction.x -= outward*p.x*.54;
      direction.z -= outward*p.z*.54;
      const style = bit.style*.72 + bit.attack*blade.hit*.28;
      pace = (6.1+14.5*style) * (.49+.51*reserve) * (manual ? 1.17 : 1);
      maxForce = (24+56*style)*(.55+.45*reserve);
      if (boosted) { pace *= 1.36; maxForce *= 1.65; }
    } else {
      const rail = top.move.entry;
      direction = {x:rail.x-bit.gear*.72*rail.nx-p.x,z:rail.z-bit.gear*.72*rail.nz-p.z};
      pace = (12+railRating(bit)*.095)*(.58+.42*reserve);
      maxForce = 73+24*bit.style;
    }
    const distance = horizontalSpeed(direction);
    const rate = Math.min(pace / Math.max(.24,distance),kind === 'dash' ? 17 : boosted ? 16 : 12);
    const force = {x:(direction.x*rate-v.x)*10,y:0,z:(direction.z*rate-v.z)*10};
    const drive = scale(force,Math.min(1,maxForce/Math.max(.01,horizontalSpeed(force))));
    if (kind !== 'dash' || distance < .12) return drive;
    // Keep manual approach speed on the bank. The normal load still comes
    // from the floor, while the Bit supplies the uphill traction.
    const dx = direction.x/distance, dz = direction.z/distance;
    const grade = clamp((floorAt(p.x+dx*.07,p.z+dz*.07)-floorAt(p.x-dx*.07,p.z-dz*.07))/.14,0,.58);
    const climb = GRAVITY*grade/(1+grade**2)*.91;
    return {x:drive.x+dx*climb,y:0,z:drive.z+dz*climb};
  }

  setRailContact(top, engaged) {
    // While meshed, the rack supplies the floor constraint at the Bit. Keep
    // Bey-to-Bey contacts active while avoiding a second floor impulse.
    for (const blade of top.bladeColliders) blade.setSolverGroups(engaged ? ENGAGED_BLADE_SOLVER : BLADE_COLLISIONS);
    for (const part of top.lowerColliders) {
      part.setSolverGroups(engaged ? ENGAGED_LOWER_SOLVER : LOWER_PART_COLLISIONS);
    }
  }

  releaseRail(top,cooldown) {
    if (top.rail) this.setRailContact(top,false);
    top.rail = null;
    top.railReadyAt = this.time+cooldown;
  }

  prepare(top) {
    const { body, bit, blade, inertia } = top;
    if (body.isSleeping()) return;
    const q = body.rotation(), p = body.translation();
    let v = body.linvel();
    const entry = top.escape;
    if (entry?.inwardAt && this.time >= entry.inwardAt) {
      const inward = scale(p,-entry.inwardSpeed/horizontalSpeed(p));
      v = {...inward,y:v.y};
      body.setLinvel(v,true);
      entry.inwardAt = null;
    }
    const axis = axisOf(q), omega = body.angvel();
    const axial = dot(axis,omega), spin = Math.max(0,axial * top.spinDirection);
    const speed = horizontalSpeed(v);
    if (top.move && this.time >= top.move.until) {
      if (!this.finished && top.move.kind === 'circle' && top.move.boosted && !top.move.wasHit && !top.escape && !top.defeat &&
        top.spin < top.launchSpin) {
        this.recoverSpin(top,CIRCLE_SPIN_REWARD,axis);
        this.onEvent({type:'spin-reward',player:top.player,at:asArray(p)});
      }
      top.move = null;
    }
    const supported = clamp(top.load / (inertia.mass * GRAVITY * DT),0,1.4);
    const abrasion = clamp(top.scrape / (inertia.mass * GRAVITY * DT),0,2);
    const drag = (bit.type === 'stamina' ? .0041 : bit.type === 'attack' ? .0040 : .0048)*spin+.000008*spin*spin;
    const contact = clamp(Math.max(supported,top.landed && !top.rail ? .74 : 0),0,1.05);
    const bearing = contact*(.84+.0025*spin)*(bit.type === 'attack' ? .39 : 1)*bit.drain/blade.stamina*(bit.freeTip ? .91 : 1);
    const end = endOfSpin(top);
    const endDrag = top.landed ? end**2*7.5 : 0;
    const scrapeLoss = abrasion*(1.2+spin*.019+endDrag*.45);
    // Once the finish is scored, the pocket's walls quickly scrub off the
    // remaining spin. During play the same contacts still allow a Reverse.
    const pocketDrag = this.finished && top.defeat?.zone ? 42+spin*3.05+abrasion*16 : 0;
    this.spendSpin(top,((drag+bearing)*(top.ratchet.spinDrain ?? 1)+endDrag+scrapeLoss+pocketDrag)*DT,axis);
    if (pocketDrag) {
      const brake = Math.exp(-DT*3.8);
      body.setLinvel({x:v.x*brake,y:v.y,z:v.z*brake},true);
    }

    const floor = floorAt(p.x,p.z);
    const nearFloor = clamp((floor + top.standing + .25 - p.y) / .22,0,1);
    const struck = this.time < top.impactUntil;
    if (top.stoppedAt !== null && supported+abrasion > .03 && !struck && horizontalSpeed(v) > .05) {
      const brake = Math.exp(-DT*(abrasion > .08 ? 7 : 2.4));
      body.applyImpulse({x:v.x*(brake-1)*inertia.mass,y:0,z:v.z*(brake-1)*inertia.mass},true);
    }
    const stability = (1-end)**2*(.70+.30*Math.sqrt(clamp(spin/top.launchSpin,0,1)));
    const recovering = top.landed ? clamp((this.time-top.landedAt)/(.09+.46*top.launch.settle),0,1) : 0;
    const brace = top.rail ? 1 : recovering;
    const rocking = sub(omega,scale(axis,axial));
    const endRock = top.landed && !top.rail && nearFloor > .46 ? end : 0;
    const damping = (supported*.8+stability*(19+25*nearFloor)+(2.5+(!struck ? 6*abrasion : 0))*endRock)*top.balance;
    const settle = (.46*nearFloor+.54*clamp(supported+abrasion,0,1))*stability*brace;
    let steering = scale(cross(axis,vertical),settle*720*top.balance);
    if (endRock > 0) {
      const lean = Math.acos(clamp(axis.y,-1,1));
      const side = horizontalSpeed(axis);
      const fall = side > .004 ? scale(cross(vertical,axis),1/side) : {x:top.player ? -.8 : .8,y:0,z:.6};
      const narrow = clamp(1-bit.tip/.14,0,1);
      const rimHeight = Math.atan2(top.standing-.067,blade.radius*.98);
      const desired = endRock*(rimHeight+.20+narrow*.10);
      const unstable = !top.canBalanceAtRest || lean > .14 || struck;
      const tipLeverage = inertia.mass*GRAVITY*bit.tip/inertia.transverse;
      const fallTorque = unstable ? clamp((desired-lean)*2,0,1)*endRock**2 *
        (25+tipLeverage*.85) * (1-clamp(abrasion*3.8,0,1)) : 0;
      steering = add(steering,scale(fall,fallTorque));
    }
    const torque = sub(steering,scale(rocking,damping));
    if (dot(torque,torque) > .0001) body.applyTorqueImpulse(scale(torque,inertia.transverse*DT),false);
    if (top.spin <= REST_SPIN) return;
    if (top.launch.settle > .14 && recovering < .84 && top.landed && this.time >= top.impactUntil) {
      const damping = -22*DT*inertia.mass;
      body.applyImpulse({x:v.x*damping,y:0,z:v.z*damping},true);
      return;
    }
    if (this.followRail(top,p,v,axis,spin)) return;
    this.driveOnFloor(top,p,v,speed,axis,spin,nearFloor);
  }

  driveOnFloor(top,p,v,speed,axis,spin,nearFloor) {
    const {body,bit,inertia} = top;
    if (!top.landed || top.escape?.zone || nearFloor < .46 || axis.y < .58 || v.y > 4 || this.time < top.impactUntil ||
      this.time < top.liftUntil || this.time < top.driveResumeAt) return;
    if (Math.hypot(p.x,p.z) > mouthRadius(Math.atan2(p.z,p.x))-.03) return;
    const age = this.time-top.landedAt;
    let force;
    if (age < .52 + top.launch.settle*.53) {
      const { direction, speed: launchSpeed, settle } = top.launch;
      const start = .034 + settle*.34;
      const progress = clamp((age-start)/(.25+settle*.14),0,1);
      const run = progress*progress*(3-2*progress);
      const upright = 1 - settle * clamp((.97-axis.y)/.14,0,1);
      const pace = launchSpeed * (.11+.89*run) * upright;
      force = {x:clamp((direction.x*pace-v.x)*10,-85,85), y:0, z:clamp((direction.z*pace-v.z)*10,-85,85)};
    } else {
      this.pickRun(top,p,v,this.tops[1-top.player]);
      const moveForce = this.moveForce(top,p,v,spin);
      if (moveForce) {
        body.applyImpulse(scale(moveForce,inertia.mass*DT),true);
        const movementCost = top.move.kind === 'defense' ? 1.2 : top.move.kind === 'circle' ? 2.2 : 0;
        this.spendSpin(top,(horizontalSpeed(moveForce)*bit.drain*.060+movementCost)*DT,axis);
        return;
      }
      if (speed < .40 || spin < 24) return;
      const reserve = spin/top.launchSpin;
      const target = runningSpeed(reserve,bit.style) * (.83+.17*bit.style);
      const rolling = .20 + bit.friction*1.5 + (bit.roll??0) + (bit.type === 'defense' ? .39 : 0);
      const drive = clamp((target-speed)*bit.style**1.2*2.8,0,34) * clamp((reserve-.14)/.58,0,1);
      const decel = rolling*speed + Math.max(0,speed-30)*8;
      const radiusSquared = p.x*p.x+p.z*p.z;
      const orbit = bit.style**1.35 * clamp((radiusSquared-1)/13,0,1) * clamp((reserve-.2)/.67,0,1);
      const radius = Math.sqrt(radiusSquared) || 1;
      const turn = {x:-p.z/radius*top.spinDirection,z:p.x/radius*top.spinDirection};
      const lateral = orbit * clamp((target - (v.x*turn.x+v.z*turn.z))*.85,0,14);
      const outer = clamp((radius-2.15)/2.9,0,1);
      const seekRim = bit.style**1.8*outer*clamp((reserve-.21)/.60,0,1)*4;
      force = {
        x:v.x/speed*(drive-decel)+turn.x*lateral+p.x/radius*seekRim,
        y:0,
        z:v.z/speed*(drive-decel)+turn.z*lateral+p.z/radius*seekRim,
      };
      this.spendSpin(top,(drive+lateral)*bit.drain*.048*DT,axis);
    }
    body.applyImpulse(scale(force,inertia.mass*DT),true);
  }

  followRail(top,p,v,axis,spin) {
    const {body,bit,inertia,standing} = top;
    if (top.rail) {
      const run = top.rail;
      if (spin < 31 || axis.y < .63 || this.time < top.impactUntil) {
        this.releaseRail(top,.28);
        return false;
      }
      const rating = railRating(bit);
      const pitchSpeed = top.spin*(.22 + (bit.gear-.19)*.28);
      const maxSpeed = 29+rating*.115;
      const traction = clamp((Math.min(pitchSpeed,maxSpeed)-run.speed)*11,-59,195)*(.82+bit.grip*.18);
      run.speed = Math.max(4,run.speed + traction*DT);
      const railLoss = Math.max(0,traction)*inertia.mass*.20/inertia.polar*.58 + 6 + run.speed*.12;
      this.spendSpin(top,railLoss*DT,axis);
      const frame = railFrame(Math.cos(run.angle),Math.sin(run.angle));
      const step = run.speed * DT / (frame.length-bit.gear);
      run.angle += run.direction * step;
      run.remaining -= step;
      run.travel += step;
      const next = railFrame(Math.cos(run.angle),Math.sin(run.angle));
      const x = next.x-(bit.gear-.008)*next.nx, z = next.z-(bit.gear-.008)*next.nz;
      const y = curvedTipSupport(top,axis,x,z,body.rotation())+.008;
      const gain = run.speed-run.initialSpeed;
      top.dashCarry = Math.max(top.dashCarry,Math.max(0,gain)*(.35+.65*clamp(run.travel/4.5,0,1)));
      top.dashAt = this.time;
      top.railSupportUntil = this.time+.14;
      if (!run.announced && (gain > 2.6 || run.speed > 13.5)) {
        run.announced = true;
        if (!this.finished) this.onEvent({type:'dash',player:top.player,at:[next.x,next.y,next.z]});
      }
      const vertical = (y-p.y)/DT;
      body.setLinvel({x:next.tx*run.direction*run.speed,y:clamp(vertical,-12,12),z:next.tz*run.direction*run.speed},true);
      run.next = {x,y,z};
      return true;
    }
    if (!top.landed || top.escape || top.defeat || this.time < top.railReadyAt || this.time < top.impactUntil ||
      p.x*p.x+p.z*p.z < 4.3**2 || spin < 43 || axis.y < .88) return false;
    const gearCenter = sub(p,scale(axis,standing-GEAR_HEIGHT));
    const rail = railFrame(gearCenter.x,gearCenter.z);
    const radial = {x:rail.nx,y:0,z:rail.nz};
    const tangent = {x:rail.tx,y:0,z:rail.tz};
    const gearRim = sub(radial,scale(axis,dot(radial,axis)));
    const tooth = add(gearCenter,scale(gearRim,bit.gear/Math.hypot(gearRim.x,gearRim.y,gearRim.z)));
    const gap = dot(sub(tooth,{x:rail.x,y:rail.y,z:rail.z}),radial);
    const verticalMargin = GEAR_HALF_HEIGHT*axis.y+.066+bit.grip*.018;
    const gearHeight = tooth.y-rail.floor;
    const outward = dot(v,radial);
    const direction = top.spinDirection;
    const along = dot(v,tangent)*direction;
    const manual = top.move?.kind === 'dash' && top.move.manual;
    const pushed = this.time < top.pushedUntil;
    const speed = horizontalSpeed(v);
    const entrySpeed = manual ? 2.2 : pushed ? 6 : 7.5;
    if (top.load+top.scrape < .02 || gap < (manual ? -.30 : -.145) || gap > .18 || gearHeight < RAIL.bottom-verticalMargin ||
      gearHeight > RAIL.top+verticalMargin+(manual ? .035 : 0) || v.y > 3.4 || outward < -.85 ||
      speed < entrySpeed || !manual && (axis.y < .966 || outward < .4 && along < 6)) return false;
    if (!manual && Math.random() >= (pushed ? .68 : .80)) {
      const rebound = 1.18*Math.max(3.5,outward);
      body.setLinvel({x:v.x*.75-rail.nx*rebound,y:Math.min(v.y,.8),z:v.z*.75-rail.nz*rebound},true);
      this.spendSpin(top,1.6+.14*speed,axis);
      top.railReadyAt = this.time+.72;
      top.driveResumeAt = this.time+.13;
      return true;
    }

    // Viewed from above, right spin is negative yaw. The outside teeth move
    // toward increasing polar angle, so the rack sends the Bey the other way.
    const toExit = positiveAngle((railExitAngle(direction)-rail.angle)*direction);
    const remaining = Math.max(.075,toExit);
    const initialSpeed = Math.max(3.1,along);
    top.rail = { angle:rail.angle, direction, remaining, travel:0, initialSpeed, speed:initialSpeed, announced:false, pushed };
    top.move = null;
    top.nextRunAt = Math.max(top.nextRunAt,this.time+2.05);
    this.setRailContact(top,true);
    top.dashCarry = 0;
    const x = rail.x-(bit.gear-.008)*rail.nx, z = rail.z-(bit.gear-.008)*rail.nz;
    body.setTranslation({x,y:curvedTipSupport(top,axis,x,z,body.rotation())+.008,z},true);
    return this.followRail(top,body.translation(),v,axis,spin);
  }

  finishRailStep(top) {
    const run = top.rail;
    if (!run?.next) return;
    const {body,bit} = top, {x,y,z} = run.next;
    body.setTranslation(run.next,true);
    if (run.remaining > 0) return;
    const frame = railFrame(x,z);
    const length = Math.hypot(x,z);
    const bend = .52-.12*bit.style;
    let inward = {x:-x/length+frame.tx*run.direction*bend,y:0,z:-z/length+frame.tz*run.direction*bend};
    const rival = this.tops[1-top.player];
    const target = add(rival.body.translation(),scale(rival.body.linvel(),.095));
    if (bit.style > 0 && rival.landed && !rival.escape && horizontalSpeed(target) < 3.95) {
      const toward = {x:target.x-x,y:0,z:target.z-z};
      const aim = bit.style*.47;
      inward = add(scale(inward,1-aim),scale(toward,aim/horizontalSpeed(toward)));
    }
    const charge = clamp(run.travel/4.9,0,1);
    const speed = run.speed * (.90 + .15*charge);
    const pocket = this.railExitPocket(run,x,z,inward);
    top.railOverrun = null;
    if (pocket) {
      const reach = mouthRadius(pocket.angle)+.7;
      top.railOverrun = {x:Math.cos(pocket.angle)*reach,z:Math.sin(pocket.angle)*reach};
      inward = sub({...top.railOverrun,y:0},{x,y:0,z});
      top.rimStrikeUntil = this.time+.85;
    }
    const drive = scale(inward,speed/horizontalSpeed(inward));
    body.setLinvel(drive,true);
    this.spendSpin(top,1.7+(3.6+run.speed*.15)*charge);
    this.releaseRail(top,.36);
    top.driveResumeAt = this.time+(pocket ? .43 : .27);
    top.dashAt = this.time;
    top.dashCarry = Math.max(top.dashCarry,run.speed*(.19+.47*charge));
    if (!this.finished) this.onEvent({type:'rail-exit',player:top.player,at:[x,y,z]});
  }

  railExitPocket(run,x,z,exit) {
    const speed = clamp((run.speed-18)/23,0,1);
    const distance = clamp((run.travel-1.8)/8.5,0,1);
    if (Math.random() >= speed*distance*(run.pushed ? .36 : .24)) return null;
    const length = horizontalSpeed(exit);
    const weighted = POCKETS.map(zone => {
      const reach = mouthRadius(zone.angle)+.65;
      const dx = Math.cos(zone.angle)*reach-x, dz = Math.sin(zone.angle)*reach-z;
      const alignment = (dx*exit.x+dz*exit.z)/(Math.hypot(dx,dz)*length);
      const weight = Math.max(0,.42+alignment)**2*(zone.points === 3 ? .26 : 1);
      return {zone,weight};
    });
    let roll = Math.random()*weighted.reduce((sum,pocket)=>sum+pocket.weight,0);
    for (const {zone,weight} of weighted) {
      roll -= weight;
      if (roll < 0) return zone;
    }
    return null;
  }

  stadiumContact(collider) {
    let floor = 0, wall = 0, at;
    this.world.contactPairsWith(collider,other => {
      const onFloor = this.floorHandles.has(other.handle);
      if (!onFloor && !this.wallHandles.has(other.handle)) return;
      this.world.contactPair(collider,other,manifold => {
        for (let i=0;i<manifold.numContacts();i++) {
          const impulse = manifold.contactImpulse(i);
          if (onFloor) floor += impulse;
          else {
            wall += impulse;
            if (!at && impulse > .06 && manifold.numSolverContacts()) at = manifold.solverContactPoint(0);
          }
        }
      });
    });
    return {floor,wall,at};
  }

  metalStadiumContact(top) {
    // Adjacent convex sections can share a seam. Use the largest load at that
    // seam when calculating wear, so one scrape is never counted twice.
    const contact = {floor:0,wall:0,at:null};
    for (const collider of top.bladeColliders) {
      const current = this.stadiumContact(collider);
      contact.floor = Math.max(contact.floor,current.floor);
      if (current.wall > contact.wall) {
        contact.wall = current.wall;
        contact.at = current.at;
      }
    }
    return contact;
  }

  settleVertical(top) {
    if (!top.landed || top.rail) return;
    const {body} = top, p = body.translation();
    const v = body.linvel(), h = floorAt(p.x,p.z);
    const angle = Math.atan2(p.z,p.x);
    const radius = horizontalSpeed(p), mouth = mouthRadius(angle);
    const jump = top.escape;
    const jumpHeadroom = jump?.lateTakeoff ? .90 : .55;
    if (this.time < (jump?.jumpUntil ?? 0) && v.y > 0 && p.y > lipHeight(angle)+top.standing+jumpHeadroom) {
      body.setLinvel({...v,y:0},true);
      return;
    }
    const scoredPocket = this.finished && top.defeat?.zone;
    if ((scoredPocket || top.escape?.deep) && v.y > (scoredPocket ? .5 : 3)) {
      body.setLinvel({...v,y:scoredPocket ? .5 : 3},true);
      return;
    }
    if (radius >= mouth) {
      const pocket = pocketAt(angle);
      const entering = pocket && v.y < 0 && radius > mouth+.38 &&
        Math.abs(angleDelta(angle,pocket.angle)) < pocket.width-.135 &&
        (p.x*v.x+p.z*v.z)/radius > 11;
      if (entering && this.time < top.rimLiftUntil+.05) {
        // A Bey already descending behind the lip has room to drop before
        // its metal edge catches the back of the plastic cover.
        body.setLinvel({x:v.x*.86,y:v.y,z:v.z*.86},true);
        return;
      }
      if (v.y > 3 && this.time >= top.liftUntil) body.setLinvel({...v,y:3},true);
      return;
    }
    if (v.y <= .45 || this.time < top.rimLiftUntil) return;
    if (this.time < top.liftUntil) {
      if (v.y > 10.6) body.setLinvel({...v,y:10.6},true);
      return;
    }
    if (p.y-top.standing-h > .42) {
      body.setLinvel({...v,y:-.35},true);
      return;
    }
    const alongFloor = (floorAt(p.x+v.x*DT,p.z+v.z*DT)-h)/DT;
    if (v.y > alongFloor+.86) body.setLinvel({...v,y:Math.max(-.6,alongFloor+.86)},true);
  }

  steadyTip(top) {
    const {body} = top;
    const p = body.translation(), velocity = body.linvel();
    const afterRail = this.time < top.railSupportUntil;
    if (!top.landed || !afterRail && this.time-top.landedAt < .065 + top.launch.settle*.43) return;
    const overFloor = Math.hypot(p.x,p.z) < mouthRadius(Math.atan2(p.z,p.x))
      && p.y < floorAt(p.x,p.z) + top.standing + .26;
    const inContact = (top.load + top.scrape > .012 || overFloor) && velocity.y < 1.65;
    const late = endOfSpin(top);
    if (late >= .94) return;
    const rotation = body.rotation(), axis = axisOf(rotation);
    const tilt = Math.acos(clamp(axis.y,-1,1));
    const struck = this.time < top.impactUntil;
    const narrow = clamp(1-top.bit.tip/.14,0,1);
    const freeLimit = (.070+narrow*.035+late**1.4*(.73+narrow*.10)+(struck ? .027+.15*late : 0))/Math.sqrt(top.balance);
    const limit = afterRail ? Math.min(freeLimit,.088) : freeLimit+(inContact ? 0 : .022);
    const control = (1-late)**2;
    const response = (afterRail ? 250 : inContact ? 240 : 200)*control;
    const correction = Math.max(Math.max(0,tilt-limit)*(1-Math.exp(-DT*response)),(tilt-limit-.047)*control);
    if (correction <= .00001) return;

    // Retain axial speed while damping the sideways rocking from contact.
    const towardUp = cross(axis,vertical);
    const sideways = Math.hypot(towardUp.x,towardUp.z);
    const normal = sideways > .0001 ? scale(towardUp,1/sideways) : {x:1,y:0,z:0};
    body.setRotation(turnRotation(rotation,normal,correction),true);
    const omega = body.angvel(), axial = dot(omega,axis);
    const nextAxis = axisOf(body.rotation());
    body.setAngvel(add(scale(nextAxis,axial),scale(sub(omega,scale(axis,axial)),Math.exp(-DT*46*control))),true);
  }

  trackSpinFinish(top) {
    // Finishing the spin is a scoring state. The whole assembly stays dynamic.
    if (top.spin > REST_SPIN) {
      top.stoppedAt = null;
    } else if (top.landed && top.load+top.scrape > .025) {
      top.stoppedAt ??= this.time;
      top.move = null;
    }
  }

  updateSlowBody(top) {
    if (!top.landed || top.rail) return;
    const {body} = top;
    const slow = endOfSpin(top) > (top.bladeColliders === top.fullMetal ? .34 : .22);
    const metal = slow ? top.lowSpeedMetal : top.fullMetal;
    if (top.bladeColliders !== metal) {
      for (const collider of top.bladeColliders) collider.setEnabled(false);
      for (const collider of metal) collider.setEnabled(true);
      const groups = LOWER_PART_COLLISIONS & ~(slow ? BOWL_MEMBERSHIP : SLOW_BOWL_MEMBERSHIP);
      for (const collider of top.lowerColliders) collider.setCollisionGroups(groups);
      top.bladeColliders = metal;
    }
    if (body.isSleeping()) return;
    const v = body.linvel(), w = body.angvel();
    const rimTilt = Math.atan2(top.standing-.067,top.blade.radius*.98);
    const onRim = axisOf(body.rotation()).y < Math.cos(rimTilt-.04);
    const balanced = top.canBalanceAtRest || onRim;
    if (top.spin > REST_SPIN || !balanced || top.load+top.scrape < .025 || this.time < top.impactUntil ||
      dot(v,v) > .37**2 || dot(w,w) > 1.15**2) {
      top.quietSince = null;
      return;
    }
    top.quietSince ??= this.time;
    if (this.time-top.quietSince >= REST_QUIET_TIME) {
      top.quietSince = null;
      body.sleep();
    }
  }

  keepTipAboveFloor(top) {
    if (top.rail || !top.landed || endOfSpin(top) > .68) return;
    const {body,standing} = top, p = body.translation(), rotation = body.rotation();
    const axis = axisOf(rotation), radius = horizontalSpeed(p), angle = Math.atan2(p.z,p.x);
    if (axis.y < .60 || radius > mouthRadius(angle) && pocketAt(angle)) return;
    const floor = tipSurfaceAt(p.x,p.z);
    if (p.y > floor+standing+.23) return;
    const curved = radius > 3.12;
    const supportAt = (x,z) => curved ? curvedTipSupport(top,axis,x,z,rotation) :
      bitSupport(top,axis,x,z,tipSurfaceAt(x,z));
    const support = supportAt(p.x,p.z);
    const nearLip = radius > mouthRadius(angle)-top.blade.radius-.10;
    const rimSupport = nearLip ? bladeRimSupport(top,rotation,p.x,p.z) : -Infinity;
    const minimum = Math.max(support-.0025,rimSupport-.010);
    if (p.y >= minimum) return;
    let v = body.linvel();
    // Keep a fast strike free to clear the lip. The solved hull still handles
    // the first scrape, and the analytic support only corrects the buried part.
    if (minimum > support+.10 && v.y < 2 && this.time >= top.rimLiftUntil) {
      const tangent = railFrame(p.x,p.z);
      const outward = v.x*tangent.nx+v.z*tangent.nz;
      if (outward > 0) {
        const rebound = outward*1.13;
        v = {x:v.x-tangent.nx*rebound,y:v.y,z:v.z-tangent.nz*rebound};
        body.setLinvel(v,true);
        this.wallImpact(top,rebound*.31*top.inertia.mass,p);
      }
    }
    body.setTranslation({x:p.x,y:minimum,z:p.z},true);
    const rise = (supportAt(p.x+v.x*DT,p.z+v.z*DT)-support)/DT;
    if (v.y < rise) body.setLinvel({...v,y:clamp(rise,-14,16)},true);
  }

  step(presentation = false) {
    if (this.finished && !presentation) return;
    this.time += DT;
    const [a, b] = this.tops;
    for (const top of this.tops) {
      this.updateSlowBody(top);
      this.prepare(top);
    }
    const p1 = a.body.translation(), p2 = b.body.translation();
    const delta = sub(p2, p1);
    const distance = Math.hypot(delta.x, delta.z) || .001;
    const normal = { x: delta.x / distance, y: 0, z: delta.z / distance };
    const pre = [a.body.linvel(),b.body.linvel()];
    const approach = [dot(pre[0],normal),-dot(pre[1],normal)];
    const nearContact = distance < a.blade.radius + b.blade.radius + .31;
    for (const top of this.tops) {
      const p = top.body.translation();
      const descending = !top.landed && p.y < floorAt(p.x,p.z)+top.standing+.85;
      // The fixed step resolves the broad rim contact. The faster vertical
      // drop needs a sweep before the Bit touches down.
      const sweep = !top.landed && (nearContact || descending);
      if (top.body.isCcdEnabled() !== sweep) top.body.enableCcd(sweep);
    }
    if (!a.body.isSleeping() || !b.body.isSleeping()) this.world.step();
    for (const top of this.tops) {
      const { body, tip, bitShoulder, ratchetCollider } = top;
      if (body.isSleeping()) continue;
      const position = body.translation();
      const radius = horizontalSpeed(position);
      const axis = axisOf(body.rotation());
      // Near-vertical Beys in the central bowl can only touch on the Bit.
      // Keep querying all parts near the rim, in flight and while rocking.
      const tipOnly = top.landed && !top.escape && radius<3.1 && axis.y>.984 &&
        position.y-floorAt(position.x,position.z)>-top.ratchetBottom+.16;
      const tipLoad = this.stadiumContact(tip);
      const shoulder = tipOnly ? null : this.stadiumContact(bitShoulder);
      const blade = tipOnly ? null : this.metalStadiumContact(top);
      const ratchet = tipOnly ? null : this.stadiumContact(ratchetCollider);
      top.load = tipLoad.floor+(shoulder?.floor??0);
      top.scrape = (blade?.floor??0)+(ratchet?.floor??0)+.22*(shoulder?.floor??0);
      const wall = (blade?.wall??0)+(ratchet?.wall??0)+(shoulder?.wall??0)+tipLoad.wall;
      if (!top.landed && top.load+top.scrape > .05) {
        top.landed = true;
        top.landedAt = this.time;
        const v = body.linvel(), incoming = pre[top.player];
        const brake = 1-.86*top.launch.settle;
        body.setLinvel({x:incoming.x*brake,y:clamp(v.y,-1.5,1.0),z:incoming.z*brake},true);
      }
      if (!presentation && !top.landed && wall > 1.1) {
        this.replay('Lançamento inválido · contato com a tampa');
        return;
      }
      if (wall > .14) this.wallImpact(top,wall,blade?.at??ratchet?.at);
      if (!presentation && top.scrape > .42 && this.time-top.lastWall > .24) {
        const p = body.translation();
        if (top.landed && p.y < floorAt(p.x,p.z)+top.standing+.12) {
          top.lastWall = this.time;
          this.onEvent({type:'scrape',player:top.player,at:[p.x,floorAt(p.x,p.z)+.06,p.z],strength:clamp(top.scrape*.16,.12,.65)});
        }
      }
      const omega = body.angvel();
      const solvedSpin = dot(axis,omega)*top.spinDirection;
      const angleLoss = Math.max(0,top.spin-Math.max(0,solvedSpin));
      // Bearing, rail, scrape and hit losses are explicit. Limit axial
      // leakage from contact correction and preserve the solved wobble.
      const grip = 1-endOfSpin(top)**2;
      top.spin -= Math.min(angleLoss,.55*DT)*grip+angleLoss*(1-grip);
      const correction = (top.spin-solvedSpin)*grip;
      if (Math.abs(correction) > .0001) {
        body.setAngvel(add(omega,scale(axis,correction*top.spinDirection)),true);
      }
    }

    if (nearContact && !presentation) {
      this.readImpact(a,b,normal,approach,pre);
    }
    if (this.finished && !presentation) return;
    for (const top of this.tops) {
      if (top.body.isSleeping()) continue;
      this.finishRailStep(top);
      this.contain(top);
      if (endOfSpin(top) < .85 || top.escape?.zone) this.settleVertical(top);
      this.carryStrikeOverRim(top);
      this.steadyTip(top);
      this.keepTipAboveFloor(top);
      this.trackSpinFinish(top);
      if (!top.rail) {
        const v = top.body.linvel(), speed = horizontalSpeed(v);
        if (speed > MAX_TRANSLATION) {
          const ratio = MAX_TRANSLATION/speed;
          top.body.setLinvel({x:v.x*ratio,y:v.y,z:v.z*ratio},true);
        }
      }
    }
    if (!presentation && this.time !== this.lastQte) this.checkFinish(pre);
  }

  wallImpact(top, impulse, point) {
    if (impulse > .46 && this.time-top.lastWallWear > .14) {
      this.spendSpin(top,Math.min(4.5,impulse*.24*REFERENCE_MASS/top.inertia.mass));
      top.lastWallWear = this.time;
    }
    if (impulse < .85 || this.time-top.lastWall < .24) return;
    top.lastWall = this.time;
    if (point && !this.finished) this.onEvent({type:'scrape',player:top.player,at:asArray(point),strength:clamp(impulse/7,.15,.9)});
    if (top.rail && impulse > 2.6) this.releaseRail(top,.30);
  }

  contain(top) {
    const { body, blade } = top;
    const p = body.translation(), r = Math.hypot(p.x,p.z);
    if (top.rail || !top.landed || r < 4.9 || p.y < -.30 || p.y - top.standing > SHELL.height) return;
    const angle = Math.atan2(p.z,p.x);
    const zone = pocketAt(angle);
    // The transparent BX-10 cover continues above the short rim barriers.
    // Its inner surface turns a high bounce back into the bowl between pockets.
    const limit = zone ? trayRadius(zone,angle) + .06 : guardRadius(angle)-blade.radius-BLADE_SHELL_CLEARANCE;
    if (r <= limit) return;
    const {nx,nz} = zone ? {nx:Math.cos(zone.angle),nz:Math.sin(zone.angle)} : railFrame(p.x,p.z);
    const v = body.linvel();
    const outward = v.x * nx + v.z * nz;
    // Correct the full rim even if the solver has already turned the Bey inward.
    body.setTranslation({x:p.x*limit/r,y:p.y,z:p.z*limit/r},true);
    if (outward <= 0) return;
    const rebound = 1.62+.16*clamp(outward/14,0,1);
    body.applyImpulse({x:-nx*outward*rebound*top.inertia.mass,y:0,z:-nz*outward*rebound*top.inertia.mass},true);
    this.wallImpact(top,outward*.53*top.inertia.mass,p);
  }

  readImpact(a, b, normal, approach, pre) {
    let impulse = 0, strongest = 0, at, contactNormal = normal;
    const ratchetHit = [0, 0];
    const ringHit = [0, 0];
    const read = (c1, c2, exposedRatchet) => {
      this.world.contactPair(c1, c2, manifold => {
        let total = 0;
        for (let i = 0; i < manifold.numContacts(); i++) total += manifold.contactImpulse(i);
        impulse += total;
        if (c1.handle === a.freeRingCollider?.handle) ringHit[0] += total;
        if (c2.handle === b.freeRingCollider?.handle) ringHit[1] += total;
        // Only the lateral component of a direct Blade-to-Ratchet hit can turn the lock.
        if (exposedRatchet !== undefined) {
          ratchetHit[exposedRatchet] = Math.max(ratchetHit[exposedRatchet],total*Math.max(0,1-Math.abs(manifold.normal().y)*1.65));
        }
        if (total > strongest && manifold.numSolverContacts()) {
          strongest = total;
          at = manifold.solverContactPoint(0);
          const face = manifold.normal(), length = horizontalSpeed(face);
          if (length > .25) {
            const outward = dot(face,normal) < 0 ? -1 : 1;
            const direction = add(scale(normal,.38),{x:face.x*outward/length*.62,y:0,z:face.z*outward/length*.62});
            contactNormal = scale(direction,1/horizontalSpeed(direction));
          } else {
            contactNormal = normal;
          }
        }
      });
    };
    const rivalMetal = b.bladeColliders;
    for (const collider of a.bladeColliders) {
      this.world.contactPairsWith(collider,other => {
        if (rivalMetal.some(metal => metal.handle === other.handle)) read(collider,other);
        if (other.handle === b.ratchetCollider.handle) read(collider,other,1);
      });
    }
    this.world.contactPairsWith(a.ratchetCollider,other => {
      if (rivalMetal.some(metal => metal.handle === other.handle)) read(a.ratchetCollider,other,0);
    });
    if (impulse > .065 && (!a.landed || !b.landed)) {
      this.replay('Lançamento inválido · colisão no ar');
      return;
    }
    const closing = approach[0] + approach[1];
    for (const top of this.tops) {
      if (impulse > .12 && top.move?.kind === 'circle' && top.move.boosted) top.move.wasHit = true;
      if (impulse > .45 && top.move?.boosted && (top.move.kind === 'defense' || top.move.kind === 'circle')) {
        const velocity = top.body.linvel(), incoming = pre[top.player];
        const transfer = top.move.kind === 'defense' ? .23 : .56;
        top.body.setLinvel({x:incoming.x+(velocity.x-incoming.x)*transfer,
          y:velocity.y,z:incoming.z+(velocity.z-incoming.z)*transfer},true);
      }
      const contact = ratchetHit[top.player]*(top.blade.integrated ? .70 : 1);
      const opponent = this.tops[1-top.player];
      const loaded = opponent.dashCarry > 9 && this.time-opponent.dashAt < DASH_CARRY_TIME;
      const direct = Math.min(contact,closing*.57);
      const threshold = loaded ? 3.4 : 6.0;
      if (direct > threshold && this.time-top.lastRatchetHit > .44) {
        top.lastRatchetHit = this.time;
        const exposed = (top.ratchet.mm/6)**1.15;
        top.lockDamage += Math.min(loaded ? .91 : .55,(direct-threshold)*.094*exposed)/top.burstLock;
      }
      if (impulse > 1.2) {
        this.releaseRail(top,.22);
        top.railOverrun = null;
        top.railSupportUntil = 0;
        top.impactUntil = this.time + .095;
        if (closing > 5 && approach[1-top.player] > 3) top.pushedUntil = this.time+.75;
      }
    }
    const gentlePair = a.bit.style < .18 && b.bit.style < .18;
    if (gentlePair && impulse > .06 && closing < 4.5) this.cushionGlancingHit(a,b,normal,closing);
    const power = Math.max(a.blade.hit*a.bit.attack,b.blade.hit*b.bit.attack);
    if (closing > 8 && impulse > 3 && power > 1.05) {
      for (const top of this.tops) {
        const velocity = top.body.linvel();
        if (velocity.y > 1.5) {
          top.liftUntil = this.time+.12;
          if (velocity.y > 10.6) top.body.setLinvel({...velocity,y:10.6},true);
        }
      }
    }
    if (!at || impulse < .047 || this.time - this.lastHit < (closing > 4.5 ? .065 : .14)) return;

    this.lastHit = this.time;
    // Rapier can report large accumulated normal impulses in long-lived
    // contacts. The approaching speed bounds how much energy this hit costs.
    const closingSpeed = Math.max(0,closing);
    const hardContact = Math.min(impulse,Math.max(0,closingSpeed-.32)*.70);
    for (const top of this.tops) {
      const contactLoss = Math.min(6.2,hardContact*(.24+.08*top.bit.drain))+
        top.spin*Math.min(.019,hardContact*.00185);
      const ringRetention = 1-(top.blade.freeRing ?? 0)*clamp(ringHit[top.player]/impulse,0,1);
      this.spendSpin(top,contactLoss*(gentlePair ? .15 : 1)*ringRetention*REFERENCE_MASS/top.inertia.mass);
    }
    if (impulse > .11) this.equalizeSpin(a,b,closingSpeed);
    const { strike, dash, attack } = closing > 1.8 && strongest > .23 ?
      this.followThrough(contactNormal,approach,Math.min(impulse,closingSpeed*1.15),at) : { strike: 0, dash: 0, attack: false };
    if (closing > 2 && impulse > .45) {
      for (const top of this.tops) {
        if (top.move?.kind === 'attack' && !top.move.boosted) top.move = null;
      }
    }
    const severity = Math.min(impulse, .26 + Math.max(0, closing) * .72) + strike;
    const threat = this.reflex && closingSpeed >= 3 && severity >= 2 &&
      !a.escape?.zone && !b.escape?.zone && this.time-this.lastQte >= REFLEX_COOLDOWN ?
      this.criticalThreat(pre, contactNormal, severity) : null;
    const qte = threat !== null;
    if (severity > 4.8) for (const top of this.tops) {
      if (horizontalSpeed(top.body.linvel()) > 8) top.impactTrailUntil = this.time+.29;
    }
    if (qte) this.lastQte = this.time;
    this.onEvent({ type: 'hit', at: asArray(at), strength: clamp(severity / 5.7, .035, 2.5), dashHit: dash > .65, attackHit: attack, qte,
      sparkAxis: [contactNormal.x,contactNormal.z], threat: threat?.kind, defender: threat?.player ?? null });
  }

  cushionGlancingHit(a,b,normal,closing) {
    if (closing <= 0) return;
    const separation = dot(sub(b.body.linvel(),a.body.linvel()),normal);
    const maximum = .44 + closing*.29;
    if (separation <= maximum) return;
    const mass = a.inertia.mass*b.inertia.mass/(a.inertia.mass+b.inertia.mass);
    const soft = scale(normal,(separation-maximum)*mass);
    a.body.applyImpulse(soft,true);
    b.body.applyImpulse(scale(soft,-1),true);
  }

  followThrough(normal, approach, contactImpulse, point) {
    const drive = this.tops.map((top, i) => {
      const decay = clamp(1 - (this.time - top.dashAt) / DASH_CARRY_TIME,0,1);
      const entering = Math.max(0,approach[i]);
      const attack = top.blade.hit * top.bit.attack;
      const reserve = clamp(top.spin/top.launchSpin,0,1);
      const power = .14+.86*reserve**.78;
      const advancing = top.move?.kind === 'attack' && !top.move.retreat;
      const q = top.body.rotation(), offset = sub(point,top.body.translation());
      const localOffset = rotateVector(offset,{x:-q.x,y:-q.y,z:-q.z,w:q.w});
      const { reach,slope,prominence } = bladeContact(top.blade,Math.atan2(localOffset.z,localOffset.x));
      const facing = scale(normal,i ? -1 : 1);
      const sweep = dot(cross(top.body.angvel(),offset),facing);
      const tooth = clamp(prominence*11,0,1)*clamp((reach-.86)*7.5,0,1);
      const hook = top.blade.catch*(.22+tooth*1.16+.28*clamp(sweep/35,0,1));
      const glancing = clamp((1-tooth)*.67+Math.abs(slope)*.23,0,1);
      const momentum = top.inertia.mass/REFERENCE_MASS;
      const wing = (top.blade.smash ?? 0)*clamp((reach-.91)*9,0,1)*clamp((entering-5)/9,0,1);
      const lobe = entering*momentum*Math.max(0,attack-.66)*(.15+hook*.94+wing)*power;
      const boosted = advancing && top.move.boosted;
      const lunge = advancing ? entering*(.07+.20*top.bit.style)*power*(boosted ? 2 : 1) : 0;
      const dash = decay*Math.min(top.dashCarry,entering)*momentum*Math.max(.13,attack-.43) *
        power * (.62+railRating(top.bit)*.008);
      return { lobe:lobe+lunge,dash,attack,advancing,boosted,glancing,power };
    });
    const player = drive[0].lobe + drive[0].dash >= drive[1].lobe + drive[1].dash ? 0 : 1;
    const { lobe,dash,attack,advancing,boosted,power } = drive[player];
    const attacker = this.tops[player], target = this.tops[1-player];
    const heightDifference = target.body.translation().y-attacker.body.translation().y;
    const upper = (attacker.blade.upper ?? 0)*clamp((heightDifference-.017)/.12,0,1)*
      clamp((approach[player]-4.5)/7,0,1)*power;
    const guard = (target.blade.verticalGuard ?? 0)*clamp((Math.abs(heightDifference)-.024)/.14,0,1);
    const boundReady = top => top.blade.bound && top.spin > 28 && this.time-top.boundAt > .44;
    const boundStrike = boundReady(attacker) ? attacker.blade.bound*clamp((contactImpulse-1.8)/5,0,1)*power : 0;
    const boundCounter = boundReady(target) ? target.blade.bound*clamp((contactImpulse-2.5)/6,0,1) : 0;
    if (boundStrike > .10) attacker.boundAt = this.time;
    if (boundCounter > .10) target.boundAt = this.time;
    const defense = target.blade.deflect*(.58+.42*drive[1-player].glancing) +
      (target.bit.type === 'defense' ? .12 : 0) + (target.move?.kind === 'defense' ? .11 : 0) +
      (target.blade.rigid ?? 0)*.60+guard*.52+boundCounter*.25;
    const boostedGuard = target.move?.boosted && (target.move.kind === 'defense' || target.move.kind === 'circle');
    const baseBrace = clamp(target.spin/target.launchSpin,0,1) * defense;
    const brace = boostedGuard ? Math.min(.9, baseBrace + (target.move.kind === 'defense' ? .46 : .26)) : baseBrace;
    const cleanDash = dash > 2.0 && approach[player] > 12 && contactImpulse > 2.7;
    const surge = cleanDash ? 1.92 : 1.23;
    const impact = Math.min(22,contactImpulse*1.70,(lobe+dash)*surge+contactImpulse*(upper*.21+boundStrike*.48));
    const reserve = target.spin/target.launchSpin;
    const unsupported = clamp((.24-reserve)/.22,0,1);
    const weakness = unsupported*clamp((power-.24)/.65,0,1);
    const wideRim = clamp((target.blade.radius-.78)/.065,0,1);
    const knockback = impact*(1-brace*.79)*(boosted ? 1.65 : 1)*(1+(.62+.19*wideRim)*weakness);
    const reboundStrength = Math.min(5.0,contactImpulse*(brace*.37+boundCounter*.56));
    if (knockback < .23 && reboundStrength < .23) return { strike: 0, dash: 0, attack: false };
    const direction = player === 0 ? 1 : -1;
    // A hard contact immediately after the rail spends part of the spin to
    // extend the impulse. Apply the horizontal recoil through the COMs.
    const kick = scale(normal,direction * knockback);
    const rebound = scale(normal,direction*reboundStrength);
    const targetVelocity = target.body.linvel();
    if (guard > .05 && targetVelocity.y > 0) {
      target.body.setLinvel({...targetVelocity,y:targetVelocity.y*(1-guard*.82)},true);
    }
    const lift = (attack > 1.03 && knockback > 2.4 || upper > .06) ?
      Math.max(0,Math.min(9,knockback*.77+upper*5.2)*(1-guard)-Math.max(0,target.body.linvel().y)) : 0;
    if (lift) target.liftUntil = this.time+.14;
    if (attack > 1 && (cleanDash || knockback > 5.0 || upper > .30)) target.rimStrikeUntil = this.time+.44;
    const strike = {x:kick.x,y:lift*target.inertia.mass,z:kick.z};
    if (weakness > 0) {
      const atContact = scale(strike,(.40+.24*wideRim)*weakness);
      target.body.applyImpulseAtPoint(atContact,point,true);
      target.body.applyImpulse(sub(strike,atContact),true);
    } else target.body.applyImpulse(strike,true);
    if (boosted && knockback > 2.4) {
      target.impactTrailUntil = this.time+.48;
      target.pushedUntil = this.time+.75;
    }
    attacker.body.applyImpulse({x:-kick.x*.82-rebound.x,y:0,z:-kick.z*.82-rebound.z},true);
    const closing = Math.max(0,approach[0]+approach[1]);
    const shove = (top,sign) => {
      const v = top.body.linvel(), side = scale(normal,sign);
      const toward = dot(v,side);
      const minimum = Math.min(6,closing*.19+impact*.24)*
        clamp((closing-1.4)/3.5,0,1)*(.23+.77*power);
      if (toward < minimum) top.body.applyImpulse(scale(side,(minimum-toward)*top.inertia.mass),true);
    };
    if (closing > 2.5 && impact+reboundStrength > .75) {
      shove(attacker,-direction);
      if (!boostedGuard) shove(target,direction);
    }
    if (cleanDash && attack > 1.02) {
      // On a square hit the sustained drive has more weight than the side
      // component from an individual lobe. Oblique hits retain their ricochet.
      const forward = scale(normal,direction);
      const v = target.body.linvel();
      const along = dot(v,forward), sideways = sub({x:v.x,y:0,z:v.z},scale(forward,along));
      const push = Math.max(along,Math.min(29,approach[player]*.89*attacker.inertia.mass/target.inertia.mass));
      const adjusted = add(scale(forward,push),scale(sideways,.78));
      target.body.setLinvel({...adjusted,y:v.y},true);
      target.rimStrikeUntil = this.time+.44;
    }
    this.spendSpin(attacker,knockback*Math.sqrt(attacker.bit.drain)*(dash>.65 ? .45+railRating(attacker.bit)*.0035 : .32));
    this.spendSpin(target,knockback*.26*(1-brace)*REFERENCE_MASS/target.inertia.mass);
    attacker.dashCarry = 0;
    target.dashCarry = 0;
    return { strike: knockback, dash: Math.min(dash,knockback), attack: advancing && knockback > .60 };
  }

  criticalThreat(beforeContact, normal, severity) {
    let strongest = null;
    const launchStillSettling = this.tops.some(top => this.time-top.landedAt < .85);
    for (const top of this.tops) {
      if (top.defeat || top.lockDamage >= 1 || top.spin <= REST_SPIN) continue;
      const velocity = top.body.linvel();
      const recoil = sub(velocity, beforeContact[top.player]);
      if (dot(recoil, normal) * (top.player === 0 ? -1 : 1) < 2.5) continue;
      const projected = this.projectImpact(top, velocity, severity);
      // A heavy recoil can destabilize a Bey even in the middle of the stadium.
      const recoilSpeed = horizontalSpeed(recoil);
      const shock = severity >= 12 && recoilSpeed >= 21 && horizontalSpeed(velocity) >= 16;
      const threat = projected ?? (shock ? { kind:'knockback', score:recoilSpeed*.48 } : null);
      if (!threat || (launchStillSettling && threat.kind !== 'pocket')) continue;
      const incoming = this.projectImpact(top, beforeContact[top.player], severity);
      const risk = threat.score - (incoming?.score ?? 0) * .75;
      if (risk < 2.5 || (strongest && risk <= strongest.risk)) continue;
      strongest = { kind: threat.kind, player: top.player, risk };
    }
    return strongest;
  }

  projectImpact(top, velocity, severity) {
    if (horizontalSpeed(velocity) < 6) return null;
    const position = top.body.translation();
    // Sample the path until the first wall or pocket mouth. A short horizon
    // and some deceleration account for the uphill bank without advancing Rapier.
    for (let t = .016; t <= .256; t += .016) {
      const projected = add(position, scale(velocity, t*(1-t)));
      const radius = horizontalSpeed(projected);
      const angle = Math.atan2(projected.z, projected.x);
      const pocket = pocketAt(angle);
      const boundary = pocket ? mouthRadius(angle)+.08 : guardRadius(angle)-top.blade.radius-BLADE_SHELL_CLEARANCE;
      if (radius < boundary) continue;
      const outward = (projected.x*velocity.x + projected.z*velocity.z)/radius*(1-2*t);
      if (pocket && outward >= 6 && Math.abs(angleDelta(angle,pocket.angle)) < pocket.width-.045) {
        return { kind:'pocket', score:8+outward*.5 };
      }
      if (!pocket && outward >= 13 && severity >= 8) return { kind:'wall', score:outward*.6 };
      return null;
    }
    return null;
  }

  counter(player, hit, margin = 1) {
    const winner = this.tops[player];
    const defended = player === hit.defender;
    let heavy = false;
    if (defended) {
      const position = winner.body.translation();
      const velocity = winner.body.linvel();
      const radius = Math.max(.1, horizontalSpeed(position));
      const inward = scale(position,-(3.6+2*margin)/radius);
      winner.body.setLinvel({x:velocity.x*.12+inward.x,y:clamp(velocity.y,-1,.6),z:velocity.z*.12+inward.z},true);
      this.releaseRail(winner,.30);
      winner.railOverrun = null;
      winner.rimStrikeUntil = 0;
      winner.liftUntil = 0;
      winner.rimLiftUntil = 0;
    } else {
      const target = this.tops[hit.defender];
      const velocity = target.body.linvel();
      const speed = horizontalSpeed(velocity);
      // Reinforce the existing trajectory occasionally. The stadium still
      // resolves the bounce or pocket finish, including the chance to escape.
      heavy = hit.threat === 'pocket' && Math.random() < .22+.20*margin;
      const extra = heavy ? 2.5+margin : hit.threat !== 'pocket' ? 1+margin : 0;
      if (speed > .1 && extra) {
        const factor = 1+extra/speed;
        target.body.setLinvel({x:velocity.x*factor,y:velocity.y,z:velocity.z*factor},true);
        if (heavy) target.rimStrikeUntil = Math.max(target.rimStrikeUntil,this.time+.25);
      }
    }
    const boostDuration = REFLEX_BOOST_TIME[defended ? 'defense' : 'attack'];
    winner.reflexBoostDuration = boostDuration;
    winner.reflexBoostUntil = this.time + boostDuration;
    if (!winner.defeat) {
      this.recoverSpin(winner,REFLEX_SPIN_REWARD);
      const velocity = winner.body.linvel();
      const speed = horizontalSpeed(velocity);
      const position = winner.body.translation();
      const radius = horizontalSpeed(position);
      const direction = speed > .15 ? scale(velocity,1/speed) :
        radius > .15 ? scale(position,-1/radius) : winner.launch.direction;
      const extra = Math.min(1,Math.max(.55,speed*.08),Math.max(0,MAX_TRANSLATION-speed));
      winner.body.setLinvel({x:velocity.x+direction.x*extra,y:velocity.y,z:velocity.z+direction.z*extra},true);
    }
    return {defended,heavy,boostDuration};
  }

  carryStrikeOverRim(top) {
    if (this.time >= top.rimStrikeUntil || top.rail) {
      top.railOverrun = null;
      return;
    }
    const { body } = top, p = body.translation();
    const r = Math.hypot(p.x,p.z);
    let v = body.linvel();
    const speed = horizontalSpeed(v);
    if (top.railOverrun && speed > 16 && !top.escape) {
      const {x,z} = top.railOverrun;
      const dx = x-p.x, dz = z-p.z, distance = Math.hypot(dx,dz);
      if (distance > .55 && r < mouthRadius(Math.atan2(p.z,p.x)) && v.x*dx+v.z*dz > 0) {
        const side = clamp((dx*v.z-dz*v.x)/distance*.15,-1,1);
        v = {x:v.x+v.z/speed*side,y:v.y,z:v.z-v.x/speed*side};
        body.setLinvel(v,true);
      }
    }
    if (r < 4 || speed < 7 || p.y-top.standing > floorAt(p.x,p.z)+.52) return;
    const ahead = {x:p.x+v.x*.076,z:p.z+v.z*.076};
    const angle = Math.atan2(ahead.z,ahead.x);
    const mouth = mouthRadius(angle);
    const outward = (p.x*v.x+p.z*v.z)/r;
    const zone = pocketAt(angle);
    const arrival = (mouth-r)/Math.max(1,outward);
    const delta = zone ? Math.abs(angleDelta(angle,zone.angle)) : Infinity;
    if (!zone || r >= mouth || outward < 6 || arrival < .021 || arrival > .088 ||
      delta > zone.width-(zone.points === 3 ? .132 : .047)) return;
    const pace = Math.min(1,23.8/speed);
    const clearanceTime = (mouth+top.blade.radius*.78-r)/(outward*pace);
    const height = lipHeight(angle)+top.standing+.11-p.y;
    const launch = Math.min(24,Math.max(v.y,(height+.5*GRAVITY*clearanceTime**2)/clearanceTime));
    body.setLinvel({x:v.x*pace,y:launch,z:v.z*pace},true);
    top.liftUntil = this.time+clearanceTime+.015;
    top.rimLiftUntil = top.liftUntil;
    top.rimStrikeUntil = 0;
    top.railOverrun = null;
  }

  tryPocketJump(top,p,v,inPocket) {
    const entry = top.escape;
    const {zone,speed} = entry;
    const r = horizontalSpeed(p), a = Math.atan2(p.z,p.x);
    const lip = lipHeight(a), depth = r-mouthRadius(a);
    const xtreme = zone.points === 3;
    const spring = top.blade.bound ?? 0;
    const springSupport = xtreme ? 0 : spring;
    const late = entry.lateJump;
    if (late) {
      if (!inPocket || this.time-entry.stayedSince < POCKET_FINISH_DELAY-.02 || v.y > 2.5 || top.spin <= 5) return;
      entry.lateJump = false;
    } else {
      const ratio = clamp(top.spin/top.launchSpin,0,1);
      if (entry.triedJump || entry.deep || ratio < .34-springSupport*.13 || speed < 9-springSupport*3 ||
        pocketAt(a) !== zone || depth < -.08 || depth > (xtreme ? .48 : 1.45)) return;
      const age = this.time-entry.at;
      const ready = xtreme ? age >= .025 && p.y > lip-.18 && p.y < lip+top.standing+.12 && v.y > -6 :
        age >= entry.jumpAfter && p.y <= lip+top.standing && v.y <= 2.5;
      if (!ready) return;
      entry.triedJump = true;
      const momentum = clamp((speed-8)/17,0,1)*clamp((ratio-.28)/.58,0,1);
      const shape = .80+top.rimVariation*.86+top.bit.style*.15;
      const rated = top.ratchet.pocketJump ?? .37;
      const chance = (xtreme ? .20 : 1)*rated*clamp(momentum*shape+springSupport*.75,0,1.16);
      if (Math.random() >= chance) return;
      // One roll per entry. Some successful rolls take off just before the finish.
      if (inPocket && Math.random() < .22) {
        entry.lateJump = true;
        return;
      }
    }
    const height = Math.max(.20,lip+top.standing+.20-p.y);
    const inwardSpeed = late ? clamp(16+Math.max(0,depth)*5,16,24) : clamp(7.8+Math.max(0,depth)*4.4,7.8,13.4);
    const launch = Math.sqrt(2*GRAVITY*height)+4;
    // Clear the lip vertically before crossing it from a deep position.
    const clearLip = xtreme || late;
    const initialSpeed = clearLip ? .7 : inwardSpeed;
    top.body.setLinvel({x:-p.x/r*initialSpeed,y:launch,z:-p.z/r*initialSpeed},true);
    if (clearLip) {
      const riseTime = late ? (launch-Math.sqrt(launch**2-2*GRAVITY*height))/GRAVITY : .032;
      entry.inwardAt = this.time+clamp(riseTime,.032,.10);
      entry.inwardSpeed = inwardSpeed;
    }
    entry.deep = false;
    entry.lateTakeoff = late;
    entry.jumpUntil = this.time+.42;
    top.liftUntil = entry.jumpUntil;
    top.rimLiftUntil = entry.jumpUntil;
    if (spring) top.boundAt = this.time;
  }

  checkFinish(beforeContact) {
    if (this.finished) return;
    for (const top of this.tops) {
      if (top.defeat) continue;
      const p = top.body.translation(), r = Math.hypot(p.x,p.z), a = Math.atan2(p.z,p.x);
      const v = top.body.linvel();
      const pocket = pocketAt(a);
      const mouth = mouthRadius(a), lip = lipHeight(a);
      const inBowl = r + top.blade.radius < mouth;
      if (inBowl && p.y > -.15 && top.escape) {
        if (top.spin > 5) {
          let spinLoss = 0;
          if (top.escape.zone) {
            const timeInPocket = clamp(top.escape.pocketTime/POCKET_FINISH_DELAY,0,1);
            const cost = (POCKET_REVERSE_MIN_COST+timeInPocket*POCKET_REVERSE_EXTRA_COST)*(top.blade.pocketSpinCost ?? 1);
            this.spendSpin(top,top.spin*cost);
            spinLoss = Math.round(cost*100);
          }
          this.onEvent({type:'reverse',player:top.player,spinLoss});
          top.escape = null;
        } else if (top.stoppedAt !== null) {
          if (top.escape.zone) top.escape = null;
          else {
            top.defeat = {points:0,title:'Saída fora dos bolsos',at:top.escape.at};
            continue;
          }
        }
      }
      const nearMouth = pocket && r >= mouth-.12 && p.y < lip+top.standing+.25;
      if (nearMouth && top.escape?.zone !== pocket &&
        (top.escape?.stayedSince == null || p.y > lip+.40)) {
        const speed = Math.max(horizontalSpeed(v),horizontalSpeed(beforeContact?.[top.player]??v));
        const jumpAfter = top.blade.bound ? .15+Math.random()*.24 : .37+Math.random()*.36;
        top.escape = {zone:pocket,at:this.time,speed,jumpAfter,stayedSince:null,pocketTime:0};
      } else if (r - top.blade.radius > edgeRadius(a)+.23 && !top.escape) {
        top.escape = {zone:null,at:this.time};
      }
      if (top.escape?.zone) {
        const entry = top.escape;
        const {zone} = entry;
        const belowOpening = p.y <= lip+.40;
        const centerInside = pocketContains(zone,p.x,p.z) && r >= mouth+.24 && p.y <= lip+.18;
        // Wall contacts can move the center across the edge of the pocket
        // sector without getting it back over the lip.
        const stillInside = entry.stayedSince !== null && r >= mouth+.08 &&
          Math.abs(angleDelta(a,zone.angle)) <= zone.width+.085 && belowOpening;
        const inPocket = centerInside || stillInside;
        if (this.time < (entry.jumpUntil ?? 0)) continue;
        if (inPocket) {
          entry.stayedSince ??= this.time;
          entry.pocketTime += DT;
        } else entry.stayedSince = null;
        if (zone.points === 3 && inPocket && r > mouth+.54 && p.y < lip-.24) entry.deep = true;
        this.tryPocketJump(top,p,v,inPocket);
        if (this.time < (entry.jumpUntil ?? 0)) continue;
        if (inPocket && v.y < 0 && p.y < lip+top.standing-.11 &&
          pocketContains(zone,p.x,p.z,top.blade.radius*.955)) {
          // The recessed pocket absorbs the landing after the entire Blade
          // clears the lip. It can still jump out with the remaining spin.
          top.body.applyImpulse({x:-v.x*top.inertia.mass*.14,y:0,z:-v.z*top.inertia.mass*.14},true);
        }
        if (entry.stayedSince !== null && this.time-entry.stayedSince >= POCKET_FINISH_DELAY) {
          top.defeat = {points:zone.points,title:zone.title,at:entry.stayedSince,zone};
          continue;
        }
      }
      const stoppedFor = top.stoppedAt === null ? 0 : this.time-top.stoppedAt;
      if (p.y < -1.75 || r > 9.25 || top.escape && !top.escape.zone && this.time-top.escape.at > .85 && stoppedFor > .13) {
        top.defeat = {points:0,title:'Saída fora dos bolsos',at:top.escape?.at ?? this.time};
      } else if (!top.escape?.zone && top.lockDamage >= 1) {
        top.defeat = {points:2,title:'Burst Finish',at:this.time};
      } else if (stoppedFor >= SPIN_FINISH_DELAY && (!top.escape || top.escape.zone && top.escape.stayedSince === null)) {
        top.defeat = {points:1,title:'Spin Finish',at:top.stoppedAt};
      }
    }
    const [a, b] = this.tops;
    if (!a.defeat && !b.defeat) return;
    const ordered = this.tops.filter(t => t.defeat).sort((x,y)=>x.defeat.at-y.defeat.at);
    const first = ordered[0], other = this.tops[1-first.player];
    const otherPending = other.escape?.zone ? other.escape.stayedSince : other.escape?.at ?? other.stoppedAt;
    if (!other.defeat && otherPending !== null && otherPending <= first.defeat.at + .035) return;
    if (!other.defeat && this.time < first.defeat.at + .045) return;
    if (other.defeat && Math.abs(other.defeat.at-first.defeat.at)<=.035) return this.replay('Empate');
    if (!first.defeat.points) return this.replay(first.defeat.title);
    this.finished = true;
    for (const top of this.tops) top.move = null;
    this.onEvent({type:'finish',winner:other.player,points:first.defeat.points,title:first.defeat.title});
  }

  replay(title) {
    this.finished = true;
    this.onEvent({type:'finish',winner:null,points:0,title});
  }

  poses() {
    return this.tops.map(top => {
      const p = top.body.translation(), q = top.body.rotation();
      return { p: asArray(p), q: [q.x, q.y, q.z, q.w] };
    });
  }

  frames() {
    return this.poses().map((pose, i) => {
      const top = this.tops[i];
      return {
        ...pose, spin: clamp(top.spin / top.launchSpin, 0, 1),
        v: asArray(top.body.linvel()), w: asArray(top.body.angvel()),
        dash: !!top.rail?.announced || top.dashCarry > 0 && this.time - top.dashAt < .18,
        attack: top.move?.kind === 'attack',
        impactTrail: this.time < top.impactTrailUntil,
        bound: Math.max(0,1-(this.time-top.boundAt)/.18),
        moves: { ...top.charges, ready: Object.keys(top.charges).filter(kind => this.canMove(top,kind)),
          reflexBoost: !this.finished && (top.move?.boosted ? 'active' : this.time < (top.reflexBoostUntil ?? 0) ? 'ready' : null) },
        burst: top.defeat?.title === 'Burst Finish',
      };
    });
  }

  dispose() {
    this.world.free();
  }
}
