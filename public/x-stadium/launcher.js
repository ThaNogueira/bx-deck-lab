import * as T from './vendor/three.module.min.js';
import { BLADE_TOP } from './rules.js';

const material = (color, roughness, metalness = 0) => new T.MeshStandardMaterial({color,roughness,metalness});

export function makeLauncher(color) {
  const group = new T.Group();
  const housing = material(0x202733,.38,.22);
  const side = material(0x394956,.46,.18);
  const dark = material(0x0c1016,.55);
  const accent = material(color,.36,.18);
  const ivory = material(0xd7ded7,.66);
  const box = (parent,w,h,d,mat,x,y,z) => {
    const obj = new T.Mesh(new T.BoxGeometry(w,h,d),mat);
    obj.position.set(x,y,z);
    parent.add(obj);
    return obj;
  };
  const cylinder = (r,h,mat,y) => {
    const obj = new T.Mesh(new T.CylinderGeometry(r,r,h,14),mat);
    obj.position.y = y;
    group.add(obj);
  };
  const shape = new T.Shape();
  [[-.70,-.47],[.67,-.47],[.86,-.28],[.86,.28],[.68,.47],[-.70,.47],[-.89,.28],[-.89,-.28]]
    .forEach(([x,z],i) => i === 0 ? shape.moveTo(x,z) : shape.lineTo(x,z));
  shape.closePath();
  const body = new T.Mesh(new T.ExtrudeGeometry(shape,{depth:.37,steps:1,bevelSegments:1,bevelSize:.055,bevelThickness:.055}).rotateX(-Math.PI/2),housing);
  body.position.y = BLADE_TOP+.21;
  group.add(body);
  cylinder(.425,.155,dark,BLADE_TOP+.121);
  cylinder(.345,.078,side,BLADE_TOP+.047);
  for (const z of [-.34,.34]) {
    box(group,1.32,.064,.11,side,-.05,BLADE_TOP+.617,z);
    box(group,.53,.105,.055,accent,-.20,BLADE_TOP+.52,Math.sign(z)*.49);
  }
  for (let i=0;i<3;i++) box(group,.072,.022,.30,dark,-.48+i*.14,BLADE_TOP+.647,.014);
  box(group,.235,.24,.29,side,.80,BLADE_TOP+.40,0);
  box(group,.045,.175,.15,ivory,.91,BLADE_TOP+.40,0);
  const pull = new T.Group();
  group.add(pull);
  box(pull,.28,.14,.48,dark,0,0,0);
  box(pull,.14,.106,.34,accent,.024,.081,0);
  const cord = box(group,1,.024,.024,ivory,0,BLADE_TOP+.40,0);
  const setPull = length => {
    pull.position.set(1.07+length,BLADE_TOP+.40,0);
    cord.scale.x = .14+length;
    cord.position.x = .96+length*.5;
  };
  setPull(0);
  return {group,setPull};
}
