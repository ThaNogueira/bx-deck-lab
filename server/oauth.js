import { randomBytes } from 'node:crypto';
import { siteUrl } from './util.js';

/**
 * OAuth 2.0 (authorization code) com Google, sem dependências — portado do
 * GLC Hub. Usa a MESMA aplicação OAuth do glchub (mesmo client ID/secret);
 * basta cadastrar o redirect novo lá no Google Console:
 *   {SITE_URL}/api/oauth/google/callback
 */

function config() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return null;
  return { id, secret, redirectUri: `${siteUrl()}/api/oauth/google/callback` };
}

export function isGoogleEnabled() {
  return config() !== null;
}

export function newOAuthState() {
  return randomBytes(24).toString('hex');
}

export function buildAuthUrl(state) {
  const cfg = config();
  if (!cfg) throw new Error('OAuth Google não configurado');
  const p = new URLSearchParams({
    client_id: cfg.id,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/** Troca o code por token e busca o perfil (e-mail, nome, avatar). */
export async function fetchOAuthProfile(code) {
  const cfg = config();
  if (!cfg) throw new Error('OAuth Google não configurado');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.id,
      client_secret: cfg.secret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.redirectUri,
    }),
  });
  if (!tokenRes.ok) throw new Error(`Token Google falhou (${tokenRes.status})`);
  const token = await tokenRes.json();
  if (!token.access_token) throw new Error('Token Google sem access_token');

  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!res.ok) throw new Error(`Userinfo Google falhou (${res.status})`);
  const u = await res.json();
  if (!u.email) throw new Error('Google não retornou e-mail');
  return {
    email: u.email.toLowerCase(),
    name: u.name?.trim() || u.email.split('@')[0],
    avatarUrl: u.picture ?? null,
  };
}
