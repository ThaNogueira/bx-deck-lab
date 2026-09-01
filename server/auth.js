import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './db.js';
import { uniqueSlug } from './util.js';

/**
 * Sessões opacas, portadas do GLC Hub: token aleatório no cookie httpOnly,
 * hash SHA-256 no banco. Sem senhas — login é só via OAuth (Google).
 */

const SESSION_COOKIE = 'bx_session';
const SESSION_DAYS = 30;

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

const ROLE_LEVEL = { USER: 0, ORGANIZER: 1, MOD: 2, ADMIN: 3 };

export function cookieOptions(expires) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production' && (process.env.SITE_URL || '').startsWith('https'),
    expires,
  };
}

export async function createSession(res, userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.authSession.create({ data: { userId, tokenHash: sha256(token), expiresAt } });
  res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function destroySession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await prisma.authSession.deleteMany({ where: { tokenHash: sha256(token) } });
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Carrega o usuário logado em req.user (null se anônimo). Aplica suspensão expirada. */
export async function sessionMiddleware(req, _res, next) {
  req.user = null;
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) {
      const session = await prisma.authSession.findUnique({
        where: { tokenHash: sha256(token) },
        include: { user: true },
      });
      if (session && session.expiresAt > new Date()) {
        let user = session.user;
        // Suspensão vencida volta sozinha para ACTIVE.
        if (user.status === 'SUSPENDED' && user.suspendedUntil && user.suspendedUntil < new Date()) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { status: 'ACTIVE', statusReason: null, suspendedUntil: null },
          });
        }
        req.user = user;
      }
    }
  } catch (e) {
    console.error('[session]', e);
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Faça login para continuar.' });
  if (req.user.status === 'BANNED') return res.status(403).json({ error: 'Conta banida.', reason: req.user.statusReason });
  if (req.user.status === 'SUSPENDED') {
    return res.status(403).json({
      error: 'Conta suspensa.',
      reason: req.user.statusReason,
      until: req.user.suspendedUntil,
    });
  }
  next();
}

/** requireRole('MOD') aceita MOD e ADMIN; requireRole('ADMIN') só ADMIN. */
export function requireRole(role) {
  return (req, res, next) => {
    requireUser(req, res, () => {
      if ((ROLE_LEVEL[req.user.role] ?? 0) < ROLE_LEVEL[role]) {
        return res.status(403).json({ error: 'Sem permissão.' });
      }
      next();
    });
  };
}

export function isStaff(user) {
  return user && (ROLE_LEVEL[user.role] ?? 0) >= ROLE_LEVEL.MOD;
}

/** Cria (ou atualiza) a conta local a partir do perfil OAuth. */
export async function upsertOAuthUser(profile) {
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  let user = await prisma.user.findUnique({ where: { email: profile.email } });
  let isNew = false;
  if (!user) {
    isNew = true;
    user = await prisma.user.create({
      data: {
        email: profile.email,
        name: profile.name.slice(0, 40),
        slug: await uniqueSlug(prisma.user, profile.name),
        avatarUrl: profile.avatarUrl,
        lastLoginAt: new Date(),
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        avatarUrl: user.avatarUrl ?? profile.avatarUrl,
      },
    });
  }
  if (adminEmails.includes(user.email) && user.role !== 'ADMIN') {
    user = await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  }
  return { user, isNew };
}

/** Formato público de usuário (nunca vaza e-mail nem campos de moderação). */
export function publicUser(u, { cosmetics = null } = {}) {
  if (!u) return null;
  return {
    id: u.id,
    slug: u.slug,
    name: u.name,
    avatarUrl: u.avatarUrl,
    bannerUrl: u.bannerUrl,
    bio: u.bio,
    verified: u.verified,
    role: u.role,
    frameId: u.frameId,
    stickers: safeJson(u.stickersJson, []),
    favoritePartId: u.favoritePartId,
    createdAt: u.createdAt,
    ...(cosmetics ? { cosmetics } : {}),
  };
}

function safeJson(v, fb) {
  try {
    return JSON.parse(v);
  } catch {
    return fb;
  }
}
