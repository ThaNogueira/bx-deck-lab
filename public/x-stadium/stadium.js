// One simulation unit is 3 cm. The BX-10 dimensions describe the outer shell,
// the battle-zone width and the inner ridge, rather than the packaging.
export const TAU = 2 * Math.PI;
export const RIDGE = 3.5;
export const SHELL = { halfWidth: 7.33, back: -6.83, front: 7.82, height: 4.62, shoulder: 1.82, table: -1.10 };
export const RAIL = { bottom: .061, top: .157, toothDepth: .070, width: .168, floorOffset: .15 };
export const SHOOT_HEIGHT = SHELL.height + .36;
export const POCKETS = [
  { id: 'over-right', angle: .78, width: .268, outer: 7.65, bottom: -.54, points: 2, title: 'Over Finish' },
  { id: 'xtreme', angle: Math.PI / 2, width: .281, outer: 7.88, bottom: -.96, points: 3, title: 'Xtreme Finish' },
  { id: 'over-left', angle: Math.PI - .78, width: .268, outer: 7.65, bottom: -.54, points: 2, title: 'Over Finish' },
];

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const smooth = (lo, hi, value) => {
  const t = clamp((value - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
};
export function edgeRadius(angle) {
  const rear = Math.abs(angleDelta(angle, -Math.PI / 2));
  const notch = 1 - smooth(.14, .34, rear);
  // Two rounded shoulders lead into the recessed center of the rear rail.
  const shoulder = Math.exp(-((rear - .49) ** 2) / .105);
  return 1 / Math.hypot(Math.cos(angle) / 6.083, Math.sin(angle) / 5.99) + .25 * shoulder - 1.02 * notch;
}

export const pocketAt = angle => POCKETS.find(p => Math.abs(angleDelta(angle, p.angle)) <= p.width + 1e-6);
export const mouthRadius = angle => edgeRadius(angle) + .22;
export const railRadius = angle => edgeRadius(angle) - .135;
export const rimStart = angle => railRadius(angle) + .186;
export const lipHeight = angle => {
  const pocket = pocketAt(angle);
  const ramp = pocket ? smooth(0,.12,pocket.width-Math.abs(angleDelta(angle,pocket.angle))) : 0;
  return height(mouthRadius(angle),angle) + .39 - (pocket?.points === 2 ? .20 : .085)*ramp;
};
export const trayRadius = (pocket, angle) => pocket.outer * Math.cos(pocket.width) / Math.cos(angleDelta(angle, pocket.angle));
export const underPocket = (pocket, angle, r) => r >= mouthRadius(angle) && r < trayRadius(pocket, angle);
export const pocketBackHeight = pocket => pocket.bottom + .39;

export function height(r, angle = 0) {
  const rise = r - RIDGE;
  const bowl = .034 * r ** 2;
  const bank = .034 * RIDGE ** 2 + .153 * rise + .085 * (1 - Math.exp(-rise));
  const transition = smooth(-.15,.15,rise);
  return bowl+(bank-bowl)*transition - .065 * Math.exp(-((rise - .35) ** 2) / .16) * smooth(-.25,.22,rise)
    - .10 * Math.max(0, Math.sin(angle)) * smooth(4.25, 6.1, r);
}

function lipRamp(r,a,start,mouth) {
  const span = mouth-start;
  const t = clamp((r-start)/span,0,1), base = height(start,a);
  const rise = lipHeight(a)-base;
  const tangent = Math.max(0,(height(start+.01,a)-height(start-.01,a))*50)*span;
  return base+t*(t*(3-2*t)*rise+(1-t)**2*tangent);
}

export function floorAt(x, z) {
  const r = Math.hypot(x,z);
  if (r < 4.25) return height(r);
  const a = Math.atan2(z,x);
  const start = rimStart(a), mouth = mouthRadius(a);
  if (r <= start || r > mouth) return height(r,a);
  return lipRamp(r,a,start,mouth);
}

// Support surfaces beyond the battle floor. The pocket drops behind its lip.
export function tipSurfaceAt(x,z) {
  const r = Math.hypot(x,z);
  if (r < 4.25) return height(r);
  const a = Math.atan2(z,x), mouth = mouthRadius(a);
  if (r <= mouth) {
    const start = rimStart(a);
    return r <= start ? height(r,a) : lipRamp(r,a,start,mouth);
  }
  const pocket = pocketAt(a), lip = lipHeight(a), depth = r-mouth;
  if (!pocket) return lip+.045*clamp(depth/Math.max(.06,guardRadius(a)-mouth),0,1);
  if (depth <= .085) return lip-depth;
  return lip-.085+(pocket.bottom-lip+.085)*clamp((depth-.085)/.185,0,1);
}

export function polarPoint(radius, angle, y = height(radius, angle)) {
  return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
}

// Exact mouth edges are shared by the floor, walls, teeth and pocket meshes.
const cuts = [0, ...POCKETS.flatMap(p => [p.angle - p.width, p.angle + p.width]), TAU];
export const sectors = cuts.slice(1).map((end, i) => {
  const start = cuts[i], pocket = pocketAt((start + end) / 2);
  const count = Math.ceil((end - start) / .032);
  return { pocket, angles: Array.from({ length: count + 1 }, (_, j) => start + (end - start) * j / count) };
});

export function stripGeometry(angles, inner, outer) {
  const vertices = [], faces = [];
  for (let i = 0; i < angles.length; i++) {
    const angle = angles[i];
    vertices.push(...inner(angle), ...outer(angle));
    const j = i * 2;
    if (i + 1 < angles.length) faces.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
  }
  return { vertices, faces };
}

export const coverAngles = Array.from({ length: 145 }, (_, i) => TAU * i / 144);
export const openingRadius = a => 5.22 + .16 * Math.cos(2 * a) + .14 * Math.sin(2 * a)**2;
export function shellRadius(a) {
  const x = Math.abs(Math.cos(a)), z = Math.sin(a);
  const length = z < 0 ? -SHELL.back : SHELL.front;
  return Math.min(SHELL.halfWidth / x, length / Math.abs(z),
    (SHELL.halfWidth + length - 1.54) / (x + Math.abs(z)));
}
// The molded guard sits behind the rack and leaves room for the metal rim.
export const guardRadius = a => Math.min(shellRadius(a)-.15, Math.max(5.89, edgeRadius(a)+.82));

export function coverPoint(a, fraction, offset = 0) {
  const inner = openingRadius(a) + .24;
  const outer = shellRadius(a) - .15;
  return polarPoint(inner + (outer-inner)*fraction, a,
    SHELL.height + (SHELL.shoulder-SHELL.height)*fraction + offset);
}

export function coverGeometry() {
  return stripGeometry(coverAngles, a => coverPoint(a,0), a => coverPoint(a,1));
}

export function coverCollarGeometry() {
  const top = a => polarPoint(openingRadius(a)-.025,a,SHELL.height-.012);
  const opening = stripGeometry(coverAngles,
    a => polarPoint(openingRadius(a)-.008,a,SHELL.height-.34),top);
  return [opening,stripGeometry(coverAngles,top,a => coverPoint(a,0,.026))];
}

export function coverSideGeometry() {
  const middle = a => polarPoint(shellRadius(a)+.055,a,.91);
  return [
    stripGeometry(coverAngles,a => polarPoint(shellRadius(a),a,-.29),middle),
    stripGeometry(coverAngles,middle,a => coverPoint(a,1)),
  ];
}

export function floorGeometry({angularStep = .032, bowlBands = 54} = {}) {
  const vertices = [0, 0, 0], faces = [];
  const angles = sectors.flatMap(({angles: sector}) => {
    const start = sector[0], end = sector.at(-1);
    const segments = Math.ceil((end-start)/angularStep);
    return Array.from({length:segments},(_,i)=>start+(end-start)*i/segments);
  });
  const sides = angles.length;
  const lipBands = 6;
  for (let row=1;row<=bowlBands;row++) {
    for (const angle of angles) vertices.push(...polarPoint(rimStart(angle)*row/bowlBands,angle));
  }
  for (let row=1;row<=lipBands;row++) {
    for (const angle of angles) {
      const start = rimStart(angle), mouth = mouthRadius(angle);
      const radius = start+(mouth-start)*row/lipBands;
      vertices.push(...polarPoint(radius,angle,lipRamp(radius,angle,start,mouth)));
    }
  }
  for (let j = 0; j < sides; j++) {
    const next = (j + 1) % sides;
    faces.push(0, 1 + next, 1 + j);
    for (let i = 1; i < bowlBands+lipBands; i++) {
      const a = 1 + (i - 1) * sides + j, b = 1 + (i - 1) * sides + next;
      const c = a + sides, d = b + sides;
      faces.push(a, b, c, b, d, c);
    }
  }
  return { vertices, faces };
}

export function pocketGeometry({ angles, pocket }) {
  const inner = mouthRadius;
  const crest = a => inner(a) + .085;
  const bottom = a => inner(a) + .27;
  const lip = stripGeometry(angles, a => polarPoint(inner(a), a, lipHeight(a)),
    a => polarPoint(crest(a), a, lipHeight(a) - .085));
  const drop = stripGeometry(angles, a => polarPoint(crest(a), a, lipHeight(a) - .085),
    a => polarPoint(bottom(a), a, pocket.bottom));
  const floor = stripGeometry(angles, a => polarPoint(bottom(a), a, pocket.bottom),
    a => polarPoint(trayRadius(pocket, a), a, pocket.bottom));
  return { lip, drop, floor };
}

export function pocketWalls({angles,pocket}) {
  const back = stripGeometry(angles,
    a => polarPoint(trayRadius(pocket,a),a,pocket.bottom),
    a => polarPoint(trayRadius(pocket,a)+.045,a,pocketBackHeight(pocket)));
  const sides = [angles[0],angles.at(-1)].map(a => {
    const from = mouthRadius(a)+.29, to = trayRadius(pocket,a);
    return stripGeometry([from,from+.14,to],
      r => polarPoint(r,a,pocket.bottom),
      r => polarPoint(r,a,r < to ? .67 : .85));
  });
  return {back,sides};
}

export function rimShelfGeometry(angles) {
  return stripGeometry(angles, a => polarPoint(mouthRadius(a),a,lipHeight(a)),
    a => polarPoint(guardRadius(a),a,lipHeight(a)+.045));
}

export function rimWallGeometry(angles) {
  return stripGeometry(angles, a => polarPoint(guardRadius(a),a,lipHeight(a)-.37),
    a => polarPoint(guardRadius(a),a,Math.max(lipHeight(a)+1.05,SHELL.shoulder+.10)));
}

export function railFrame(x, z) {
  const angle = Math.atan2(z, x);
  const r = railRadius(angle);
  const derivative = (edgeRadius(angle + .003) - edgeRadius(angle - .003)) / .006;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const norm = Math.hypot(derivative, r);
  const tx = (derivative * cos - r * sin) / norm, tz = (derivative * sin + r * cos) / norm;
  const floor = height(r-RAIL.floorOffset,angle);
  return {
    angle, x: r * cos, z: r * sin, floor, y: floor + (RAIL.bottom+RAIL.top)*.5, length: norm,
    tx, tz, nx: tz, nz: -tx,
  };
}

export function closestRail(x,z) {
  const resolution = TAU/48;
  let best = Math.atan2(z,x);
  let distance = Infinity;
  const check = angle => {
    const r = railRadius(angle);
    const delta = (r*Math.cos(angle)-x)**2+(r*Math.sin(angle)-z)**2;
    if (delta < distance) { distance = delta; best = angle; }
  };
  for (let i=0;i<48;i++) check(i*resolution);
  for (let step=resolution/2;step>.002;step/=2) {
    const middle = best;
    check(middle-step);
    check(middle+step);
  }
  return railFrame(Math.cos(best),Math.sin(best));
}

export const railExitAngle = direction => -Math.PI / 2 - .30 * direction;

export function pocketContains(pocket, x, z, radius = 0) {
  const angle = Math.atan2(z, x), r = Math.hypot(x, z);
  const delta = Math.abs(angleDelta(angle, pocket.angle));
  if (delta >= pocket.width || r * Math.sin(pocket.width - delta) < radius) return false;
  return underPocket(pocket, angle, r - radius) && r < trayRadius(pocket, angle) + .24;
}
