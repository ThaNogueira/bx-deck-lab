import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

test('sharing defaults apply to existing and new accounts without losing sessions or launches',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    const migrations=new URL('../prisma/migrations/',import.meta.url);
    const target='20261120030000_battle_pass_public_default';
    for(const dir of readdirSync(migrations,{withFileTypes:true}).filter(d=>d.isDirectory() && d.name<target).sort((a,b)=>a.name.localeCompare(b.name))) {
      db.exec(readFileSync(new URL(dir.name+'/migration.sql',migrations),'utf8'));
    }
    db.exec(`INSERT INTO "User" (id,email,name,slug,battlePassPublic,passwordHash) VALUES
      ('old-hidden','hidden@example.invalid','Hidden','old-hidden',false,'unchanged-password'),
      ('old-public','public@example.invalid','Public','old-public',true,NULL);
      INSERT INTO "AuthSession" (id,tokenHash,userId,expiresAt) VALUES ('auth-keep','unchanged-token','old-hidden','2027-01-01');
      INSERT INTO "BattlePassDevice" (id,userId,key,name) VALUES ('device-keep','old-hidden','device-key','BEYBLADE_TOOL01');
      INSERT INTO "BattlePassTraining" (id,userId,deviceId,startedAt) VALUES ('training-keep','old-hidden','device-keep','2026-11-20');
      INSERT INTO "BattlePassLaunch" (id,userId,deviceId,sessionId,sp,counter,epoch,source) VALUES
        ('launch-keep','old-hidden','device-keep','training-keep',12000,1,0,'history');`);
    const before=db.prepare('SELECT * FROM "User" WHERE id=?').get('old-hidden');
    const auth=db.prepare('SELECT * FROM "AuthSession"').get();
    const launch=db.prepare('SELECT * FROM "BattlePassLaunch"').get();
    db.exec(readFileSync(new URL(target+'/migration.sql',migrations),'utf8'));
    assert.deepEqual({...db.prepare('SELECT * FROM "User" WHERE id=?').get('old-hidden')},{...before,battlePassPublic:1});
    assert.equal(db.prepare('SELECT battlePassPublic FROM "User" WHERE id=?').get('old-public').battlePassPublic,1);
    assert.deepEqual(db.prepare('SELECT * FROM "AuthSession"').get(),auth);
    assert.deepEqual(db.prepare('SELECT * FROM "BattlePassLaunch"').get(),launch);
    db.exec(`INSERT INTO "User" (id,email,name,slug) VALUES ('new-user','new@example.invalid','New','new-user')`);
    assert.equal(db.prepare('SELECT battlePassPublic FROM "User" WHERE id=?').get('new-user').battlePassPublic,1);
    db.exec(`UPDATE "User" SET battlePassPublic=false WHERE id='old-hidden'`);
    assert.equal(db.prepare('SELECT battlePassPublic FROM "User" WHERE id=?').get('old-hidden').battlePassPublic,0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally {db.close();}
});
