import { randomUUID } from 'node:crypto';
import { Router } from 'express';

const router = Router();
const players = new Map();
const rooms = new Map();
const formats = new Set(['single','trio']);
const hostMessages = new Set(['setup','countdown','start','frames','effect','reaction-ack','resume','finish','reset']);
const guestMessages = new Set(['setup','move','reaction']);
const matchLife = 20 * 60_000;
const waitLife = 20_000;

function emit(player, channel, payload) {
  if (!player.stream) return;
  if (player.stream.writableLength > 128_000 && channel === 'play' && payload.type === 'frames') return;
  player.stream.write(`event: ${channel}\ndata: ${JSON.stringify(payload)}\n\n`);
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

function startMatch(host,guest) {
  host.peer = guest;
  guest.peer = host;
  host.side = 0;
  guest.side = 1;
  if (host.room) rooms.delete(host.room);
  host.expires = guest.expires = Date.now()+matchLife;
  emit(host,'match',{side:0});
  emit(guest,'match',{side:1});
}

function remove(player) {
  if (!players.delete(player.token)) return;
  if (player.host?.guest === player.token) player.host.guest = null;
  if (player.room && rooms.get(player.room) === player) rooms.delete(player.room);
  if (player.peer && players.delete(player.peer.token)) {
    emit(player.peer,'left',{});
    player.peer.stream?.end();
  }
  player.stream?.end();
  announce(player.format);
}

setInterval(() => {
  for (const player of players.values()) {
    if (player.expires <= Date.now()) remove(player);
    else player.stream?.write(': ping\n\n');
  }
}, 8000).unref();

router.use('/api/x-stadium', (_req,res,next) => {
  res.set('Cache-Control','no-store');
  next();
});

router.post('/api/x-stadium/queue', (req,res) => {
  const {format,privateRoom,code} = req.body ?? {};
  if (!formats.has(format)) return res.status(400).json({error:'Formato inválido.'});
  if (players.size >= 1000) return res.status(503).json({error:'Fila cheia. Tente novamente.'});
  const token = randomUUID();
  let room, host;
  if (code) {
    host = rooms.get(String(code).toUpperCase());
    if (!host?.stream || host.format !== format || host.guest) return res.status(404).json({error:'Sala indisponível nesse formato.'});
    host.guest = token;
    room = host.room;
  } else if (privateRoom === true) {
    do { room = randomUUID().slice(0,6).toUpperCase(); } while (rooms.has(room));
  }
  const player = {token,format,room,host,expires:Date.now()+waitLife};
  if (room && !host) rooms.set(room,player);
  players.set(token,player);
  res.json({token,room});
});

router.get('/api/x-stadium/queue/:token', (req,res) => {
  const player = players.get(req.params.token);
  if (!player || player.stream) return res.sendStatus(404);
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});
  res.flushHeaders();
  player.stream = res;
  player.expires = Infinity;
  res.on('close',()=>remove(player));
  if (player.host) {
    if (players.has(player.host.token) && player.host.stream) startMatch(player.host,player);
    else remove(player);
  } else if (!player.room) pair(player.format);
});

router.post('/api/x-stadium/queue/:token/play', (req,res) => {
  const player = players.get(req.params.token);
  if (!player?.peer || !players.has(player.peer.token)) return res.sendStatus(410);
  const messages = req.body?.messages;
  const allowed = player.side === 0 ? hostMessages : guestMessages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 24 ||
    messages.some(message=>!allowed.has(message?.type)) || JSON.stringify(messages).length > 48_000) return res.sendStatus(400);
  player.expires = player.peer.expires = Date.now()+matchLife;
  for (const message of messages) emit(player.peer,'play',message);
  res.sendStatus(204);
});

router.delete('/api/x-stadium/queue/:token', (req,res) => {
  const player = players.get(req.params.token);
  if (player) remove(player);
  res.sendStatus(204);
});

export default router;
