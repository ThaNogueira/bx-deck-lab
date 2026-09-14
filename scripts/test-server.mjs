import { spawnSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
// Explicit isolated paths; no .env file or production credentials are loaded.
mkdirSync('data/qa', { recursive:true });
new DatabaseSync(path.resolve('data/qa/revamp.db')).close();
const env = { ...process.env, NODE_ENV:'test', BX_ISOLATED_TEST:'1',
  DATABASE_URL:'file:../data/qa/revamp.db',
  PORT:'4174', SITE_URL:'http://127.0.0.1:4174', DEV_LOGIN:'0',
  GOOGLE_CLIENT_ID:'', GOOGLE_CLIENT_SECRET:'', ADMIN_EMAILS:'admin@revamp.invalid',
  SIGHTENGINE_USER:'', SIGHTENGINE_SECRET:'' };
for (const args of [['node_modules/typescript/bin/tsc','--noEmit'], ['node_modules/vite/bin/vite.js','build'], ['node_modules/prisma/build/index.js','generate'], ['node_modules/prisma/build/index.js','migrate','deploy'], ['server/seed.js']]) {
  const result = spawnSync(process.execPath, args, {env:args[0].includes('/vite/')?{...env,NODE_ENV:'production'}:env,stdio:'inherit'});
  if (result.status !== 0) process.exit(result.status || 1);
}
const child = spawn(process.execPath, ['server/index.js'], {env,stdio:'inherit'});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => child.kill());
child.on('exit', code => process.exit(code || 0));
