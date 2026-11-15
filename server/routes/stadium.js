import { randomInt, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { requireUser } from '../auth.js';
import { prisma } from '../db.js';
import { moderateFields } from '../settings.js';
import { uploadTournamentImages, uploadedUrl } from '../uploads.js';
import { isGoogleEnabled } from '../oauth.js';
import { lineupKeys, validateLineup } from '../../public/x-stadium/deck.js';

const router = Router();
const players = new Map();
const rooms = new Map();
const formats = new Set(['single','trio']);
const hostMessages = new Set(['parity','arena-side','lineup','setup','countdown','start','frames','effect','reaction-ack','resume','finish','reset','rematch']);
const guestMessages = new Set(['parity','arena-side','lineup','setup','move','reaction','rematch']);
const matchLife = 20 * 60_000;
const waitLife = 20_000;
const snapshotBacklog = 24_000;
const ah = fn => (req,res,next)=>fn(req,res).catch(next);

const profileOf = user => ({name:user.stadiumName ?? user.name,avatarUrl:user.stadiumAvatarUrl ?? user.avatarUrl});
const deckOf = ({id,name,beysJson}) => ({id,name,beys:JSON.parse(beysJson)});

function emit(player, channel, payload) {
  const stream = player.stream;
  if (!stream || stream.backlog() > snapshotBacklog && channel==='play' && payload.type==='frames') return;
  stream.send(channel,payload);
}

function waiting(format) {
  return [...players.values()].filter(player => player.format === format && !player.room && !player.peer && player.stream);
}

function announce(format) {
  const queue = waiting(format);
  for (const player of queue) emit(player,'queue',{count:queue.length-1});
}

function pair(format) {
  const queue = waiting(format);
  for (let i=0;i+1<queue.length;i+=2) {
    const [host,guest] = queue.slice(i,i+2);
    startMatch(host,guest);
  }
  announce(format);
}

function createMatch(number=1) {
  return {
    number,chooser:randomInt(0,2),round:1,
    submissions:[null,null],ready:[false,false],previous:null,
    finished:false,rematch:[false,false],
  };
}

function startMatch(host,guest) {
  host.peer = guest;
  guest.peer = host;
  host.side = 0;
  guest.side = 1;
  host.match = guest.match = createMatch();
  if (host.room) rooms.delete(host.room);
  host.expires = guest.expires = Date.now()+matchLife;
  const profiles = [host.profile,guest.profile];
  const chooser = host.match.chooser;
  emit(host,'match',{side:0,profiles,chooser});
  emit(guest,'match',{side:1,profiles,chooser});
}

function revealToBoth(player,payload) {
  emit(player,'play',payload);
  emit(player.peer,'play',payload);
}

function requestRematch(player,number) {
  const {match,side} = player;
  if (number!==match.number || !match.finished || match.rematch[side]) return;
  match.rematch[side] = true;
  emit(player.peer,'play',{type:'rematch-request',match:number});
  if (match.rematch.every(Boolean)) {
    const next = player.match = player.peer.match = createMatch(number+1);
    revealToBoth(player,{type:'rematch-start',match:next.number,chooser:next.chooser});
  }
}

function chooseParity(player,parity) {
  const {match} = player;
  if (match.chooser!==player.side || !['even','odd'].includes(parity)) return false;
  if (match.roll) return true;
  const value = randomInt(1,7);
  const winner = (value%2===0)===(parity==='even') ? player.side : 1-player.side;
  match.roll = {type:'dice-roll',value,parity,winner};
  revealToBoth(player,match.roll);
  return true;
}

function chooseArenaSide(player,arenaSide) {
  const {match} = player;
  if (match.roll?.winner!==player.side || !['B','X'].includes(arenaSide)) return false;
  if (match.placement) return true;
  const left = arenaSide==='B' ? player.side : 1-player.side;
  match.placement = [left,1-left];
  revealToBoth(player,{type:'arena-side',placement:match.placement});
  return true;
}

function submitLineup(player,message) {
  const {match,side} = player;
  if (!match.placement || player.format!=='trio' || message.round!==match.round || (message.round-1)%3!==0) return false;
  if (match.submissions[side]) return true;
  const beys = validateLineup(message.beys);
  if (!beys) return false;
  const current = lineupKeys(beys), previous = match.previous?.[side];
  if (previous && (current.every((key,i)=>key===previous[i]) || !current.every(key=>previous.includes(key)))) return false;
  match.submissions[side] = beys;
  emit(player.peer,'play',{type:'lineup-ready',round:match.round});
  if (match.submissions.every(Boolean)) {
    match.previous = match.submissions.map(lineupKeys);
    revealToBoth(player,{type:'lineup',round:match.round,lineups:match.placement.map(index=>match.submissions[index])});
  }
  return true;
}

function remove(player) {
  if (!players.delete(player.token)) return;
  if (player.host?.guest === player.token) player.host.guest = null;
  if (player.room && rooms.get(player.room) === player) rooms.delete(player.room);
  const other = player.peer ?? players.get(player.guest);
  if (other && players.delete(other.token)) {
    emit(other,'left',{});
    other.stream?.end();
  }
  player.stream?.end();
  announce(player.format);
}

setInterval(() => {
  for (const player of players.values()) {
    if (player.expires <= Date.now()) remove(player);
    else player.stream?.ping();
  }
}, 8000).unref();

router.use('/api/x-stadium', (_req,res,next) => {
  res.set('Cache-Control','no-store');
  next();
});

router.get('/api/x-stadium/profile', ah(async (req,res)=>{
  const google = isGoogleEnabled();
  if (!req.user) return res.json({profile:null,decks:[],google});
  const decks = await prisma.stadiumDeck.findMany({where:{userId:req.user.id},orderBy:{updatedAt:'desc'}});
  res.json({profile:profileOf(req.user),decks:decks.map(deckOf),google});
}));

router.patch('/api/x-stadium/profile', requireUser, uploadTournamentImages.single('file'), moderateFields('name'), ah(async (req,res)=>{
  const name = typeof req.body?.name==='string' ? req.body.name.trim() : '';
  if (!name || name.length>40) return res.status(422).json({error:'Use um nome de 1 a 40 caracteres.'});
  const avatar = req.file ? uploadedUrl(req.file) : req.body.useAccountPhoto==='1' ? null : undefined;
  const user = await prisma.user.update({where:{id:req.user.id},data:{stadiumName:name,stadiumAvatarUrl:avatar}});
  res.json({profile:profileOf(user)});
}));

router.put('/api/x-stadium/decks/:id', requireUser, moderateFields('name'), ah(async (req,res)=>{
  const {id} = req.params;
  const name = typeof req.body?.name==='string' ? req.body.name.trim() : '';
  const beys = validateLineup(req.body?.beys);
  if (!/^[\w-]{1,80}$/.test(id) || !name || name.length>42 || !beys) {
    return res.status(422).json({error:'Dê um nome ao deck e use três Beys com peças diferentes.'});
  }
  const userId = req.user.id;
  const data = {name,beysJson:JSON.stringify(beys)};
  const deck = await prisma.stadiumDeck.upsert({where:{userId_id:{userId,id}},create:{id,userId,...data},update:data});
  res.json({deck:deckOf(deck)});
}));

router.delete('/api/x-stadium/decks/:id', requireUser, ah(async (req,res)=>{
  await prisma.stadiumDeck.deleteMany({where:{userId:req.user.id,id:req.params.id}});
  res.sendStatus(204);
}));

router.post('/api/x-stadium/queue', (req,res) => {
  const {format,privateRoom,code,guestNumber} = req.body ?? {};
  if (!formats.has(format)) return res.status(400).json({error:'Formato inválido.'});
  if (players.size >= 1000) return res.status(503).json({error:'Fila cheia. Tente novamente.'});
  if (req.user && req.user.status !== 'ACTIVE') return res.status(403).json({error:'Conta indisponível.'});
  const token = randomUUID();
  let room, host;
  if (code) {
    host = rooms.get(String(code).toUpperCase());
    if (!host || host.format !== format || host.guest) return res.status(404).json({error:'Sala indisponível nesse formato.'});
    host.guest = token;
    room = host.room;
  } else if (privateRoom === true) {
    do { room = randomUUID().slice(0,6).toUpperCase(); } while (rooms.has(room));
  }
  const number = Number.isInteger(guestNumber) && guestNumber>=1000 && guestNumber<=9999 ? guestNumber : randomInt(1000,10000);
  const profile = req.user ? profileOf(req.user) : {name:'Blader '+number,avatarUrl:null};
  const player = {token,format,room,host,profile,expires:Date.now()+waitLife};
  if (room && !host) rooms.set(room,player);
  players.set(token,player);
  res.json({token,room});
});

router.get('/api/x-stadium/queue/:token', (req,res) => {
  const player = players.get(req.params.token);
  if (!player || player.stream) return res.sendStatus(404);
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});
  res.flushHeaders();
  res.on('close',()=>remove(player));
  connect(player,{
    send:(event,payload)=>res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`),
    backlog:()=>res.writableLength,
    ping:()=>res.write(': ping\n\n'),
    end:()=>res.end(),
  });
});

function connect(player,stream) {
  player.stream = stream;
  player.expires = Infinity;
  if (player.host) {
    if (!players.has(player.host.token)) remove(player);
    else if (player.host.stream) startMatch(player.host,player);
  } else if (!player.room) pair(player.format);
  else {
    const guest = players.get(player.guest);
    if (guest?.stream) startMatch(player,guest);
  }
}

function relay(player,messages) {
  if (!player?.peer || !players.has(player.peer.token)) return 410;
  const allowed = player.side === 0 ? hostMessages : guestMessages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 24 ||
    messages.some(message=>!allowed.has(message?.type)) || JSON.stringify(messages).length > 48_000) return 400;
  player.expires = player.peer.expires = Date.now()+matchLife;
  for (const message of messages) {
    const {match} = player;
    if (message.type==='rematch') {
      requestRematch(player,message.match);
      continue;
    }
    // Snapshots can arrive through a separate HTTP request after the rematch has started.
    if (message.type==='frames' && ((message.match??1)!==match.number || !match.placement)) continue;
    if (message.type==='parity' || message.type==='arena-side') {
      const accepted = message.type==='parity' ? chooseParity(player,message.parity) : chooseArenaSide(player,message.side);
      if (!accepted) return 400;
      continue;
    }
    if (message.type==='lineup') {
      if (!submitLineup(player,message)) return 400;
      continue;
    }
    if (!match.placement) return 400;
    if (message.type==='setup') {
      if (message.round!==match.round || player.format==='trio' && (match.round-1)%3===0 && !match.submissions.every(Boolean)) return 400;
      match.ready[player.side] = message.ready===true;
    }
    if (message.type==='countdown' && !match.ready.every(Boolean)) return 400;
    if (message.type==='finish') {
      if ((message.match??1)!==match.number || match.finished) continue;
      const {scores} = message;
      if (!Array.isArray(scores) || scores.length!==2 || !scores.every(score=>Number.isInteger(score) && score>=0)) return 400;
      match.finished = scores.some(score=>score>=4);
    }
    if (message.type==='reset') {
      if (match.finished) continue;
      if (message.round!==match.round && message.round!==match.round+1) return 400;
      if (message.round!==match.round) match.submissions = [null,null];
      match.round = message.round;
      match.ready = [false,false];
    }
    emit(player.peer,'play',message);
  }
  return 204;
}

router.post('/api/x-stadium/queue/:token/play', (req,res) => {
  res.sendStatus(relay(players.get(req.params.token),req.body?.messages));
});

router.delete('/api/x-stadium/queue/:token', (req,res) => {
  const player = players.get(req.params.token);
  if (player) remove(player);
  res.sendStatus(204);
});

export default router;

export function attachStadiumSocket(server) {
  const sockets = new WebSocketServer({noServer:true,maxPayload:50_000,perMessageDeflate:false});
  server.on('upgrade',(req,connection,head)=>{
    const token = /^\/api\/x-stadium\/queue\/([\da-f-]{36})\/socket$/.exec(req.url)?.[1];
    const player = players.get(token);
    const origin = req.headers.origin;
    const sameOrigin = !origin || URL.canParse(origin) && new URL(origin).host===req.headers.host;
    if (!player || player.stream || !sameOrigin) {
      connection.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(req,connection,head,socket=>{
      let alive = true;
      socket.on('pong',()=>{ alive = true; });
      socket.on('close',()=>remove(player));
      socket.on('error',()=>socket.terminate());
      socket.on('message',(raw,binary)=>{
        let status = 400;
        if (!binary) {
          try { status = relay(player,JSON.parse(raw.toString())?.messages); }
          catch { /* Close an invalid or oversized message. */ }
        }
        if (status!==204) socket.close(1008);
      });
      connect(player,{
        send:(event,payload)=>{
          if (socket.readyState===WebSocket.OPEN) socket.send(JSON.stringify({event,payload}));
        },
        backlog:()=>socket.bufferedAmount,
        ping:()=>{
          if (!alive) socket.terminate();
          else if (socket.readyState===WebSocket.OPEN) { alive = false; socket.ping(); }
        },
        end:()=>socket.close(1000),
      });
    });
  });
}
