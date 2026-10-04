import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('public/js/shared.js','utf8');
const fn=source.slice(source.indexOf('  function avatarHtml('), source.indexOf('\n  /**',source.indexOf('  function avatarHtml(')));
const avatar=vm.runInNewContext(`(${fn.trim()})`,{esc:s=>String(s).replaceAll('"','&quot;'),icon:()=>'<svg></svg>'});
const rating={provisional:false,tier:{id:'ouro',name:'Ouro de Impacto'}};
test('default frame from Elo; no frame for placements; verified remains outside',()=>{
 const html=avatar({rating,verified:true}); assert.match(html,/elo-frame-ouro/);assert.match(html,/verified-badge/);
 assert.doesNotMatch(avatar({rating:{...rating,provisional:true}}),/elo-avatar-frame/);
 assert.doesNotMatch(avatar({}),/elo-avatar-frame/);
});
test('custom saved frame always wins; explicit automatic preview overrides it',()=>{
 const user={rating,frameId:'custom',cosmetics:{frame:{styleKey:'gold',imageUrl:'/custom.png'}}};
 assert.doesNotMatch(avatar(user),/elo-avatar-frame/);assert.match(avatar(user),/custom.png/);
 assert.match(avatar(user,{frame:null}),/elo-frame-ouro/);
 assert.doesNotMatch(avatar({rating},{frame:{styleKey:'neon'}}),/elo-avatar-frame/);
 assert.doesNotMatch(avatar({rating,frameId:'unloaded'}),/elo-avatar-frame/);
});
test('invalid tiers rejected and reduced motion respected',()=>{
 assert.doesNotMatch(avatar({rating:{...rating,tier:{id:'invalid'}}}),/elo-avatar-frame/);
 assert.match(readFileSync('public/ui/elo-frames.css','utf8'),/prefers-reduced-motion:reduce/);
});
