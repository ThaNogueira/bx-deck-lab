import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import sharp from 'sharp';
import { prisma } from './db.js';
import { json, siteUrl } from './util.js';
import { standingsOf } from './routes/tournaments.js';

const router = Router();
const templates = new Map();
const esc = (v = '') => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cut = (v, n = 180) => { const s = String(v || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const abs = (p) => new URL(p, `${siteUrl()}/`).toString();
const fee = (v) => v ? (v / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Gratuito';
const when = (v) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v));

async function meta(kind, key) {
  if (kind === 'home') return { title: 'BX Deck Lab — Beyblade X competitivo', description: 'Monte decks, acompanhe o meta e participe da comunidade brasileira de Beyblade X.', url: abs('/'), image: abs('/og/home.png'), over: 'BORA RODAR PIÃO', head: 'BX DECK LAB', line: 'DECK BUILDER • META • COMUNIDADE', cta: 'MONTAR UM DECK', color: '#8ee83f' };
  if (kind === 'deck') {
    const d = await prisma.communityDeck.findUnique({ where: { slug: key }, include: { author: true } });
    if (!d || d.status !== 'VISIBLE' || !d.isPublic) return null;
    const beys = json(d.beysJson, []);
    return { title: `${d.title} — Deck da comunidade`, description: cut(d.description || `Deck público de ${d.author?.name || 'um blader'} no BX Deck Lab.`), url: abs(`/deck/${d.slug}`), image: abs(`/og/deck/${d.slug}.png`), over: 'DECK DA COMUNIDADE', head: d.title, line: `POR ${d.author?.name || 'COMUNIDADE'} • ${beys.length} BEYS • ${d.copyCount || 0} CÓPIAS`, cta: 'ABRIR DECK', color: '#48d7ff' };
  }
  const t = await prisma.tournament.findUnique({ where: { slug: key }, include: { organizer: true, players: { include: { user: true, deck: true } }, matches: { include: { p1: { include: { user: true, deck: true } }, p2: { include: { user: true, deck: true } } } } } });
  if (!t || t.status === 'CANCELED') return null;
  const base = { url: abs(`/torneio/${t.slug}`), image: abs(`/og/tournament/${t.slug}.png`), head: t.name };
  if (t.status === 'FINISHED') { const pod = standingsOf(t).slice(0, 3).map((x, i) => `${i + 1}º ${x.player.user.name}`).join(' • '); return { ...base, title: `${t.name} — resultado final`, description: cut(`Torneio encerrado. Classificação: ${pod || 'resultado disponível no BX Deck Lab.'}`), over: 'TORNEIO ENCERRADO', line: pod || 'RESULTADO FINAL DISPONÍVEL', cta: 'VER CLASSIFICAÇÃO', color: '#f2c94c' }; }
  if (t.status === 'RUNNING') return { ...base, title: `${t.name} — em andamento`, description: `Rodada ${t.currentRound || 1} de ${t.roundsPlanned}. Acompanhe partidas e classificação.`, over: 'TORNEIO EM ANDAMENTO', line: `RODADA ${t.currentRound || 1}/${t.roundsPlanned} • ${t.players.length} JOGADORES`, cta: 'ACOMPANHAR TORNEIO', color: '#ff8b4b' };
  return { ...base, title: `${t.name} — inscrições abertas`, description: cut(`Inscrições abertas para ${when(t.startsAt)}${t.storeName ? ` em ${t.storeName}` : ''}. ${fee(t.entryFeeCents)}. Inscreva-se no BX Deck Lab.`), over: 'INSCRIÇÕES ABERTAS', line: `${when(t.startsAt).toUpperCase()} • ${fee(t.entryFeeCents).toUpperCase()} • ${t.players.length} INSCRITOS`, cta: 'INSCREVA-SE AGORA', color: '#8ee83f' };
}
function card(m) { return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="630" fill="#0a0d0a"/><circle cx="1000" cy="90" r="410" fill="${m.color}" opacity=".18"/><path d="M0 530Q320 410 650 560T1200 410V630H0Z" fill="${m.color}" opacity=".15"/><text x="70" y="95" fill="#fff" font-family="Arial" font-size="30" font-weight="800">BX DECK LAB</text><text x="70" y="205" fill="${m.color}" font-family="Arial" font-size="22" font-weight="800">${esc(m.over)}</text><text x="70" y="300" fill="#fff" font-family="Arial" font-size="60" font-weight="800">${esc(cut(m.head, 48))}</text><text x="70" y="355" fill="#d6ded4" font-family="Arial" font-size="23">${esc(cut(m.line, 95))}</text><rect x="70" y="445" width="330" height="68" rx="34" fill="${m.color}"/><text x="235" y="488" text-anchor="middle" fill="#10150d" font-family="Arial" font-size="21" font-weight="800">${esc(m.cta)}</text><text x="70" y="580" fill="#aeb7ad" font-family="Arial" font-size="17">beyxlab.com.br</text></svg>`; }
export async function sendSocial(res, file, m) { if (!m) return res.sendFile(path.resolve('public', file)); if (!templates.has(file)) templates.set(file, await fs.readFile(path.resolve('public', file), 'utf8')); const tags = `<title>${esc(m.title)}</title><meta name="description" content="${esc(m.description)}"><link rel="canonical" href="${esc(m.url)}"><meta property="og:type" content="website"><meta property="og:site_name" content="BX Deck Lab"><meta property="og:locale" content="pt_BR"><meta property="og:title" content="${esc(m.title)}"><meta property="og:description" content="${esc(m.description)}"><meta property="og:url" content="${esc(m.url)}"><meta property="og:image" content="${esc(m.image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(m.title)}"><meta name="twitter:description" content="${esc(m.description)}"><meta name="twitter:image" content="${esc(m.image)}">`; return res.type('html').send(templates.get(file).replace(/<title>[\s\S]*?<\/title>/i, '').replace('</head>', `${tags}</head>`)); }
const png = (kind) => async (req, res, next) => { try { const m = await meta(kind, req.params.slug); if (!m) return res.sendStatus(404); res.type('png').set('Cache-Control', 'public, max-age=300').send(await sharp(Buffer.from(card(m))).png().toBuffer()); } catch (e) { next(e); } };
router.get('/og/home.png', png('home')); router.get('/og/deck/:slug.png', png('deck')); router.get('/og/tournament/:slug.png', png('tournament'));
export { router as socialRouter, meta as socialMeta };
