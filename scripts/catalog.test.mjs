import test from 'node:test';
import assert from 'node:assert/strict';
import { extractEmbeddedCatalog, mapKind } from '../server/catalog-data.js';

test('catalog remains readable by the backend without DOM', () => {
  const {PARTS,STOCK,BIT_PROFILE,BLADE_PROFILE} = extractEmbeddedCatalog();
  assert(Object.keys(PARTS).length >= 100);
  assert(STOCK.length >= 20);
  assert(Object.keys(BIT_PROFILE).length > 10);
  assert(Object.keys(BLADE_PROFILE).length > 10);
  for (const [id, part] of Object.entries(PARTS)) {
    assert.equal(id,part.id);
    assert(part.kind && part.name);
  }
});
test('standard, CX, integrated and RIB categories remain distinct', () => {
  const {PARTS} = extractEmbeddedCatalog();
  for (const kind of ['blade','ratchet','bit','lock','main','assist','over','integrated','rib']) {
    assert(Object.values(PARTS).some(p=>p.kind===kind),kind);
  }
  assert.deepEqual(mapKind('integrated'),{kind:'BLADE',subKind:'INTEGRATED'});
  assert.deepEqual(mapKind('rib'),{kind:'BIT',subKind:'RIB'});
  assert.deepEqual(mapKind('main'),{kind:'MAIN_BLADE',subKind:null});
});
test('catalog extractions do not leak mutable state', () => {
  const first=extractEmbeddedCatalog(),second=extractEmbeddedCatalog();
  const id=Object.keys(first.PARTS)[0];
  first.PARTS[id].name='TEST';
  assert.notEqual(second.PARTS[id].name,'TEST');
});
