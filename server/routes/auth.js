import { Router } from 'express';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { createSession, destroySession, upsertOAuthUser, publicUser, hashPassword, verifyPassword } from '../auth.js';
import { uniqueSlug } from '../util.js';
import { moderateFields } from '../settings.js';
import { buildAuthUrl, fetchOAuthProfile, isGoogleEnabled, newOAuthState } from '../oauth.js';
import { getSetting } from '../settings.js';
import { cookieOptions } from '../auth.js';

const router = Router();
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const STATE_COOKIE = 'bx_oauth_state';

router.get('/api/oauth/google', (req, res) => {
  if (!isGoogleEnabled()) return res.redirect('/entrar?erro=' + encodeURIComponent('Login Google não configurado.'));
  const state = newOAuthState();
  res.cookie(STATE_COOKIE, state, cookieOptions(new Date(Date.now() + 10 * 60_000)));
  res.redirect(buildAuthUrl(state));
});

router.get('/api/oauth/google/callback', ah(async (req, res) => {
  const fail = (msg) => res.redirect('/entrar?erro=' + encodeURIComponent(msg));
  const { code, state } = req.query;
  const cookieState = req.cookies?.[STATE_COOKIE];
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail('Sessão de login expirou — tente de novo.');
  }
  try {
    const profile = await fetchOAuthProfile(String(code));
    const existing = await prisma.user.findUnique({ where: { email: profile.email } });
    const flags = await getSetting('flags');
    if (!existing && flags.signup === false) return fail('Cadastro de novas contas está temporariamente desativado.');
    const { user, isNew } = await upsertOAuthUser(profile);
    if (user.status === 'BANNED') return fail('Esta conta foi banida.' + (user.statusReason ? ` Motivo: ${user.statusReason}` : ''));
    await createSession(res, user.id);
    res.clearCookie(STATE_COOKIE, { path: '/' });
    if (isNew) await audit(user, 'user.signup', 'USER', user.id);
    res.redirect(isNew ? '/perfil?bemvindo=1' : (req.cookies?.bx_after_login || '/'));
  } catch (e) {
    console.error('[oauth google]', e);
    return fail('Falha no login com Google — tente novamente.');
  }
}));

/** Guarda para onde voltar após o login (ex.: tela de inscrição de torneio). */
router.post('/api/auth/after-login', (req, res) => {
  const to = String(req.body?.to || '/');
  if (to.startsWith('/') && !to.startsWith('//')) {
    res.cookie('bx_after_login', to, cookieOptions(new Date(Date.now() + 15 * 60_000)));
  }
  res.json({ ok: true });
});

router.post('/api/auth/logout', ah(async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// E-mail + senha (registro normal)
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const adminEmails = () =>
  (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

// Limite simples de tentativas: 10 por IP a cada 10 minutos
const attempts = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, since: now };
  if (now - rec.since > 10 * 60_000) { rec.count = 0; rec.since = now; }
  rec.count++;
  attempts.set(ip, rec);
  if (attempts.size > 5000) attempts.clear();
  return rec.count > 10;
}

router.post('/api/auth/register', moderateFields('name'), ah(async (req, res) => {
  if (rateLimited(req.ip)) return res.status(429).json({ error: 'Muitas tentativas — aguarde alguns minutos.' });
  const flags = await getSetting('flags');
  if (flags.signup === false) return res.status(403).json({ error: 'Cadastro de novas contas está temporariamente desativado.' });

  const email = String(req.body?.email || '').toLowerCase().trim();
  const name = String(req.body?.name || '').trim().slice(0, 40);
  const password = String(req.body?.password || '');
  if (!EMAIL_RE.test(email)) return res.status(422).json({ error: 'E-mail inválido.' });
  if (!name) return res.status(422).json({ error: 'Diga como quer ser chamado.' });
  if (password.length < 8) return res.status(422).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(422).json({
      error: existing.passwordHash
        ? 'Já existe uma conta com este e-mail — use "Entrar".'
        : 'Este e-mail já tem conta via Google — entre com o botão do Google.',
    });
  }
  const user = await prisma.user.create({
    data: {
      email,
      name,
      slug: await uniqueSlug(prisma.user, name),
      passwordHash: await hashPassword(password),
      role: adminEmails().includes(email) ? 'ADMIN' : 'USER',
      lastLoginAt: new Date(),
    },
  });
  await createSession(res, user.id);
  await audit(user, 'user.signup', 'USER', user.id, { method: 'password' });
  res.json({ ok: true, user: publicUser(user) });
}));

router.post('/api/auth/login', ah(async (req, res) => {
  if (rateLimited(req.ip)) return res.status(429).json({ error: 'Muitas tentativas — aguarde alguns minutos.' });
  const email = String(req.body?.email || '').toLowerCase().trim();
  const password = String(req.body?.password || '');
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return res.status(401).json({
      error: user ? 'Esta conta entra com o botão do Google.' : 'E-mail ou senha incorretos.',
    });
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }
  if (user.status === 'BANNED') {
    return res.status(403).json({ error: 'Esta conta foi banida.' + (user.statusReason ? ` Motivo: ${user.statusReason}` : '') });
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      ...(adminEmails().includes(email) && user.role !== 'ADMIN' ? { role: 'ADMIN' } : {}),
    },
  });
  await createSession(res, updated.id);
  res.json({ ok: true, user: publicUser(updated) });
}));

/**
 * Login de desenvolvimento — só com DEV_LOGIN=1 e fora de produção.
 * Permite testar o site inteiro sem as credenciais do Google.
 */
router.post('/api/auth/dev-login', ah(async (req, res) => {
  if (process.env.DEV_LOGIN !== '1' || process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Não encontrado.' });
  }
  const email = String(req.body?.email || '').toLowerCase().trim();
  const name = String(req.body?.name || email.split('@')[0] || 'Blader').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(422).json({ error: 'E-mail inválido.' });
  const { user } = await upsertOAuthUser({ email, name, avatarUrl: null });
  await createSession(res, user.id);
  res.json({ ok: true, user: publicUser(user) });
}));

router.get('/api/me', ah(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  const grants = await prisma.cosmeticGrant.findMany({
    where: { userId: req.user.id },
    include: { cosmetic: true },
  });
  res.json({
    user: {
      ...publicUser(req.user),
      email: req.user.email,
      whatsapp: req.user.whatsapp,
      status: req.user.status,
      statusReason: req.user.statusReason,
      suspendedUntil: req.user.suspendedUntil,
      canSell: req.user.canSell,
      grantedCosmetics: grants.map((g) => g.cosmetic),
    },
  });
}));

export default router;
