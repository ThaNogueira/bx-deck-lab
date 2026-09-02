import path from 'node:path';
import express from 'express';
import compression from 'compression';
import { prisma } from './db.js';
import { sessionMiddleware, isStaff } from './auth.js';
import { logError } from './audit.js';
import { getSetting, setSetting } from './settings.js';
import { UPLOADS_DIR } from './uploads.js';
import { scheduleAutoSync } from './sync.js';

import authRoutes from './routes/auth.js';
import siteRoutes from './routes/site.js';
import catalogRoutes from './routes/catalog.js';
import profileRoutes from './routes/profile.js';
import deckRoutes from './routes/decks.js';
import tournamentRoutes from './routes/tournaments.js';
import marketRoutes from './routes/market.js';
import adminRoutes from './routes/admin.js';

const app = express();
app.use(compression({ threshold: 1024 })); // gzip/brotli de HTML/CSS/JS/JSON (o Caddy também comprime; aqui cobre dev e acesso direto)
app.disable('x-powered-by');
app.set('trust proxy', true); // atrás do Caddy

app.use(express.json({ limit: '1mb' }));

// Cookies (parser mínimo — evita dependência)
app.use((req, _res, next) => {
  req.cookies = {};
  const raw = req.headers.cookie;
  if (raw) {
    for (const pair of raw.split(';')) {
      const idx = pair.indexOf('=');
      if (idx > 0) req.cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
    }
  }
  next();
});

app.use(sessionMiddleware);

// Contador de acessos (2.1): páginas HTML, agregado por dia, flush a cada 30s
const traffic = new Map();
app.use((req, _res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.includes('.')) {
    const day = new Date().toISOString().slice(0, 10);
    traffic.set(day, (traffic.get(day) ?? 0) + 1);
  }
  next();
});
setInterval(async () => {
  if (!traffic.size) return;
  try {
    const stored = (await getSetting('traffic')) || {};
    for (const [day, count] of traffic) stored[day] = (stored[day] ?? 0) + count;
    traffic.clear();
    const days = Object.keys(stored).sort().slice(-60); // guarda 60 dias
    await setSetting('traffic', Object.fromEntries(days.map((d) => [d, stored[d]])));
  } catch (e) {
    console.error('[traffic]', e);
  }
}, 30_000).unref();

// Modo manutenção (2.9): usuários comuns veem a tela amigável; staff passa
const MAINTENANCE_ALLOW = /^\/(api\/(site|me|oauth|auth)|uploads|styles\.css|js\/|favicon)/;
app.use(async (req, res, next) => {
  try {
    const m = await getSetting('maintenance');
    if (!m?.on || isStaff(req.user)) return next();
    if (req.path === '/manutencao' || MAINTENANCE_ALLOW.test(req.path) || req.path === '/entrar') return next();
    if (req.path.startsWith('/api')) return res.status(503).json({ maintenance: true, error: m.message });
    if (req.path.includes('.')) return next(); // assets estáticos
    return res.sendFile(path.resolve('public/manutencao.html'));
  } catch (e) {
    next(e);
  }
});

app.use(authRoutes);
app.use(siteRoutes);
app.use(catalogRoutes);
app.use(profileRoutes);
app.use(deckRoutes);
app.use(tournamentRoutes);
app.use(marketRoutes);
app.use(adminRoutes);

// Uploads e estáticos
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true }));
// Estáticos do site: sempre revalidam (ETag) — evita o usuário precisar de Ctrl+Shift+R
// depois de um deploy. O conteúdo só volta pela rede quando muda de verdade (304 caso contrário).
app.use(express.static('public', {
  extensions: ['html'],
  etag: true,
  lastModified: true,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

// URLs limpas -> páginas
const PAGES = {
  '/entrar': 'entrar.html',
  '/perfil': 'perfil.html',
  '/decks': 'decks.html',
  '/meus-decks': 'meus-decks.html',
  '/pecas': 'pecas.html',
  '/produtos': 'produtos.html',
  '/torneios': 'torneios.html',
  '/vendas': 'vendas.html',
  '/admin': 'admin.html',
  '/manutencao': 'manutencao.html',
};
// O montador principal e o unico deck builder do site (o editor antigo saiu)
app.get('/deck-novo', (_req, res) => res.redirect('/#builder'));
app.get('/deck/:slug/editar', (req, res) => res.redirect('/?editar=' + encodeURIComponent(req.params.slug) + '#builder'));

for (const [route, file] of Object.entries(PAGES)) {
  app.get(route, (_req, res) => res.sendFile(path.resolve('public', file)));
}
const DYNAMIC = [
  ['/u/:slug', 'u.html'],
  ['/deck/:slug', 'deck.html'],
  ['/peca/:slug', 'peca.html'],
  ['/produto/:slug', 'produto.html'],
  ['/torneio/:slug', 'torneio.html'],
  ['/t/:slug', 'inscricao.html'],
  ['/torneio/:slug/cartaz', 'cartaz.html'],
  ['/mesa/:slug/:matchId', 'mesa.html'],
];
for (const [route, file] of DYNAMIC) {
  app.get(route, (_req, res) => res.sendFile(path.resolve('public', file)));
}

app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// Handler de erros: loga no banco (2.10) e responde sem vazar stack
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  logError(err, `${req.method} ${req.path}`);
  if (err?.message?.includes('Formato não suportado')) return res.status(422).json({ error: err.message });
  if (err?.name === 'MulterError') return res.status(422).json({ error: 'Upload inválido (máx. 10 MB).' });
  res.status(500).json({ error: 'Erro interno — já registramos e vamos investigar.' });
});

const port = parseInt(process.env.PORT, 10) || 3000;
app.listen(port, () => console.log(`BX Deck Lab ouvindo em http://localhost:${port}`));

// Catálogo de peças/produtos: sincroniza sozinho no boot (se estiver velho) e periodicamente
scheduleAutoSync();

process.on('unhandledRejection', (e) => logError(e, 'unhandledRejection'));
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
