import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import sharp from 'sharp';
import { prisma } from '../db.js';
import { requireRole, publicUser } from '../auth.js';
import { uploadChampionImage, UPLOADS_DIR } from '../uploads.js';
import { loadTournament, standingsOf, validManualBey } from './tournaments.js';
import { audit } from '../audit.js';
import { siteUrl } from '../util.js';
import { buildPlayerRanking } from './home.js';

const router=Router(), ADMIN=requireRole('ADMIN');
const ah=fn=>(req,res,next)=>fn(req,res,next).catch(next);
const dto=a=>({...a,beys:JSON.parse(a.beysJson),beysJson:undefined,postUrl:a.postId?`/comunidade/p/${a.postId}`:null});
router.get('/api/admin/ranking-art/data',ADMIN,ah(async(req,res)=>{
  const month=String(req.query.month||'');let from=null,to=null;
  if(month){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return res.status(422).json({error:'Mês inválido.'});from=new Date(month+'-01T03:00:00Z');to=new Date(from);to.setUTCMonth(to.getUTCMonth()+1);}
  const data=await buildPlayerRanking({from,to});
  const rows=month?[...data.ranking].sort((a,b)=>b.points-a.points||b.gold-a.gold||b.wins-a.wins||a.user.name.localeCompare(b.user.name)):data.ranking;
  const shown=rows.slice(0,20),favorites=await prisma.user.findMany({where:{id:{in:shown.map(r=>r.user.id)}},select:{id:true,favoritePartId:true}}),favoriteByUser=new Map(favorites.map(u=>[u.id,u.favoritePartId]));
  const candidates=shown.map(r=>{const used=r.favoriteBeys?.[0],usedId=used?.ids.find(id=>['MAIN_BLADE','BLADE'].includes(data.parts[id]?.kind));return {usedId,favoriteId:favoriteByUser.get(r.user.id),uses:used?.uses};});
  const parts=await prisma.part.findMany({where:{id:{in:[...new Set(candidates.flatMap(c=>[c.usedId,c.favoriteId]).filter(Boolean))]},hidden:false},select:{id:true,name:true,displayName:true,imageUrl:true}}),byId=new Map(parts.map(p=>[p.id,p]));
  res.set('Cache-Control','no-store').json({generatedAt:new Date().toISOString(),month:month||null,totals:data.totals,players:shown.map((r,i)=>{const candidate=candidates[i],used=byId.get(candidate.usedId),part=used?.imageUrl?used:byId.get(candidate.favoriteId);return {position:i+1,user:publicUser(r.user),bey:part?.imageUrl?{id:part.id,name:part.displayName||part.name,source:part===used?'used':'favorite',uses:part===used?candidate.uses:null}:null,wins:r.wins,losses:r.losses,events:r.events,gold:r.gold,silver:r.silver,bronze:r.bronze,circuitPoints:r.points,rating:{points:r.rating.points,provisional:r.rating.provisional,tier:r.rating.tier,onFire:r.rating.onFire},winRate:r.wins+r.losses?Math.round(r.wins/(r.wins+r.losses)*100):null};})});
}));
router.get('/api/admin/ranking-art/avatar/:id',ADMIN,ah(async(req,res)=>{
  const user=await prisma.user.findUnique({where:{id:req.params.id},select:{avatarUrl:true}});if(!user)return res.sendStatus(404);
  try{const png=await sharp(await readPartImage(user.avatarUrl||'/assets/profiles/default-blader.png'),{limitInputPixels:40e6}).rotate().resize(600,600,{fit:'cover'}).png().toBuffer();res.set('Cache-Control','private, max-age=300').type('png').send(png);}catch{res.sendFile(path.resolve('public/assets/profiles/default-blader.png'));}
}));
router.get('/api/admin/champion/artworks',ADMIN,ah(async(req,res)=>res.json({artworks:(await prisma.championArtwork.findMany({orderBy:{createdAt:'desc'},take:24})).map(dto)})));
router.get('/api/admin/champion/tournaments',ADMIN,ah(async(req,res)=>res.json({tournaments:await prisma.tournament.findMany({where:{status:'FINISHED'},select:{id:true,slug:true,name:true,startsAt:true,storeName:true,visibility:true},orderBy:{startsAt:'desc'},take:200})})));
router.get('/api/admin/champion/tournaments/:slug',ADMIN,ah(async(req,res)=>{
  const t=await loadTournament(req.params.slug);if(!t||t.status!=='FINISHED')return res.status(404).json({error:'Torneio encerrado não encontrado.'});
  const players=standingsOf(t).map((s,i)=>({place:i+1,user:publicUser(s.player.user),beys:s.player.deck?.beys||[]}));
  res.json({tournament:{id:t.id,slug:t.slug,name:t.name,storeName:t.storeName,startsAt:t.startsAt},players});
}));

// Images are selected by catalog ID; there is no arbitrary URL proxy.
const privateIp=ip=>/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|::|f[cd]|fe80:)/i.test(ip);
async function readPartImage(url){
  if(url.startsWith('/')){
    const root=url.startsWith('/uploads/')?UPLOADS_DIR:path.resolve('public');
    const relative=url.startsWith('/uploads/')?url.slice(9):url.slice(1);
    const target=path.resolve(root,relative);if(!target.startsWith(root+path.sep))throw Error('Imagem inválida.');
    return fs.readFile(target);
  }
  const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error('Imagem inválida.');
  const addresses=await lookup(parsed.hostname,{all:true});if(addresses.some(a=>privateIp(a.address)))throw Error('Endereço inválido.');
  const response=await fetch(parsed,{redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok||Number(response.headers.get('content-length')||0)>10*1024*1024)throw Error('Imagem indisponível.');
  const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>10*1024*1024)throw Error('Imagem muito grande.');chunks.push(chunk);}return Buffer.concat(chunks);
}
router.get('/api/admin/champion/parts/:id/image',ADMIN,ah(async(req,res)=>{
  const part=await prisma.part.findUnique({where:{id:req.params.id}});if(!part||part.hidden||!part.imageUrl)return res.status(404).json({error:'Peça sem imagem.'});
  try{const png=await sharp(await readPartImage(part.imageUrl),{limitInputPixels:40e6}).rotate().resize(500,500,{fit:'inside',withoutEnlargement:true}).png().toBuffer();res.set('Cache-Control','private, max-age=86400').type('png').send(png);}catch{return res.status(422).json({error:'Não foi possível carregar a imagem desta peça.'});}
}));

router.post('/api/admin/champion/artworks',ADMIN,uploadChampionImage.single('image'),ah(async(req,res)=>{
  const clean=()=>req.file&&fs.unlink(req.file.path).catch(()=>{});
  let imagePath,persisted=false;
  try{
    const b=req.body||{},name=String(b.name||'').trim().slice(0,60),eventName=String(b.eventName||'').trim().slice(0,80),eventDate=String(b.eventDate||'');
    if(!name||!eventName||!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)||Number.isNaN(Date.parse(eventDate))||new Date(eventDate).toISOString().slice(0,10)!==eventDate||!req.file){await clean();return res.status(422).json({error:'Informe nome, evento, data e imagem.'});}
    let beys;try{beys=JSON.parse(b.beys);}catch{beys=null;}
    if(!Array.isArray(beys)||beys.length!==3||beys.some(ids=>!Array.isArray(ids)||ids.length<2||ids.length>6||ids.some(id=>typeof id!=='string'))){await clean();return res.status(422).json({error:'Monte as três Beys completas.'});}
    const ids=[...new Set(beys.flat())],parts=await prisma.part.findMany({where:{id:{in:ids},hidden:false}}),byId=new Map(parts.map(p=>[p.id,p]));
    if(parts.length!==ids.length||beys.some(ids=>validManualBey(ids.map(id=>byId.get(id))))){await clean();return res.status(422).json({error:'Uma Bey contém peças inválidas ou incompatíveis.'});}
    const tournamentId=String(b.tournamentId||'')||null,championUserId=String(b.championUserId||'')||null;
    if(tournamentId){const t=await prisma.tournament.findUnique({where:{id:tournamentId},include:{players:{select:{userId:true}}}});if(!t||t.status!=='FINISHED'||(championUserId&&!t.players.some(p=>p.userId===championUserId))){await clean();return res.status(422).json({error:'Selecione um torneio encerrado e um participante dele.'});}}
    else if(championUserId&&!(await prisma.user.findUnique({where:{id:championUserId}}))){await clean();return res.status(422).json({error:'Jogador não encontrado.'});}
    const metadata=await sharp(req.file.path,{limitInputPixels:20e6}).metadata();if(metadata.width!==metadata.height||metadata.width<1080){await clean();return res.status(422).json({error:'Use uma imagem quadrada de pelo menos 1080 px.'});}
    const filename=`champion-${randomUUID()}.png`;imagePath=path.join(UPLOADS_DIR,filename);
    await sharp(req.file.path,{limitInputPixels:20e6}).rotate().resize(2160,2160).png().toFile(imagePath);await clean();
    const artwork=await prisma.championArtwork.create({data:{name,eventName,eventDate,beysJson:JSON.stringify(beys),tournamentId,championUserId,createdById:req.user.id,imageUrl:`/uploads/${filename}`}});
    persisted=true;
    await audit(req.user,'champion.artwork.create','CHAMPION_ARTWORK',artwork.id,{tournamentId});res.json({artwork:dto(artwork)});
  }catch(error){await clean();if(imagePath&&!persisted)await fs.unlink(imagePath).catch(()=>{});throw error;}
}));
router.post('/api/admin/champion/artworks/:id/publish',ADMIN,ah(async(req,res)=>{
  const artwork=await prisma.championArtwork.findUnique({where:{id:req.params.id},include:{tournament:true}});if(!artwork)return res.status(404).json({error:'Arte não encontrada.'});
  if(artwork.tournament?.visibility==='PRIVATE')return res.status(422).json({error:'Escolha um torneio público para publicar a arte na comunidade.'});
  const post=await prisma.$transaction(async tx=>{
    const key=`champion-artwork:${artwork.id}`;
    const post=await tx.post.upsert({where:{systemKey:key},update:{},create:{authorId:req.user.id,kind:'USER',systemKey:key,tag:'CHAMPION',title:`${artwork.name} • ${artwork.eventName}`.slice(0,140),body:`Campeão: ${artwork.name}\n${artwork.eventName} • ${artwork.eventDate.split('-').reverse().join('/')}${artwork.tournament?`\n${siteUrl()}/torneio/${artwork.tournament.slug}`:''}`,status:'VISIBLE',mediaJson:JSON.stringify([{type:'image',url:artwork.imageUrl}]),dataJson:JSON.stringify({championArtworkId:artwork.id,championUserId:artwork.championUserId,tournamentSlug:artwork.tournament?.slug||null})}});
    await tx.championArtwork.update({where:{id:artwork.id},data:{postId:post.id}});return post;
  });
  await audit(req.user,'champion.artwork.publish','POST',post.id,{artworkId:artwork.id});res.json({postId:post.id,url:`/comunidade/p/${post.id}`});
}));
export default router;
