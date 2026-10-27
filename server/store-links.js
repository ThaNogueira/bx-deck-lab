export function normalizeTicketUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.length > 2000) throw new Error('A página do ingresso deve ter até 2000 caracteres.');
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.href;
  } catch { throw new Error('Informe uma página de ingresso válida (http ou https).'); }
}
