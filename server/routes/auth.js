import { Router } from 'express';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { createSession, destroySession, upsertOAuthUser, publicUser } from '../auth.js';
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
