// Pin both portrait model qualities and their runtime, with integrity checks.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const version='1.7.0',base=`https://staticimgly.com/@imgly/background-removal-data/${version}/dist/`;
const root=path.resolve(process.argv[2]||`public/assets/champion-model/${version}`);await fs.mkdir(root,{recursive:true});
const response=await fetch(base+'resources.json',{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Model manifest unavailable: '+response.status);
const all=await response.json(),resources=Object.fromEntries(Object.entries(all).filter(([key])=>key.startsWith('/onnxruntime-web/')||['/models/isnet_quint8','/models/isnet_fp16'].includes(key)));
const chunks=[...new Map(Object.values(resources).flatMap(r=>r.chunks).map(chunk=>[chunk.name,chunk])).values()];let position=0;
const digest=data=>createHash('sha256').update(data).digest('hex');
await Promise.all(Array.from({length:4},async()=>{while(position<chunks.length){const chunk=chunks[position++];if(!/^[a-f0-9]{64}$/.test(chunk.name))throw Error('Invalid asset name');const target=path.join(root,chunk.name);try{if(digest(await fs.readFile(target))===chunk.hash)continue;}catch{}
 const r=await fetch(base+chunk.name,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('Model chunk unavailable: '+r.status);const buffer=Buffer.from(await r.arrayBuffer());if(digest(buffer)!==chunk.hash)throw Error('Model asset integrity mismatch');await fs.writeFile(target,buffer);
}}));
await fs.writeFile(path.join(root,'resources.json'),JSON.stringify(resources));console.log(`Portrait model ${version}: ${chunks.length} verified assets ready.`);
