export async function stadiumRequest(path,method='GET',body) {
  const json = body !== undefined && !(body instanceof FormData);
  const response = await fetch(path,{method,cache:'no-store',
    headers:json ? {'Content-Type':'application/json'} : undefined,
    body:json ? JSON.stringify(body) : body});
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : {};
  if (!response.ok) throw Object.assign(new Error(data.error || 'Não foi possível concluir. Tente novamente.'),{code:data.code});
  return data;
}

export const escapeText = value => String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);

export function avatarMarkup(profile) {
  let src;
  try {
    const url = new URL(profile.avatarUrl,location.origin);
    if (profile.avatarUrl && ['https:','http:'].includes(url.protocol) && !/\.(mp4|webm)$/i.test(url.pathname)) src = url.href;
  } catch { /* The initial is used when the image is unavailable. */ }
  return '<span class="stadium-avatar" aria-hidden="true"><span>'+escapeText(profile.name.trim().charAt(0).toUpperCase() || 'B')+'</span>'+
    (src?'<img alt="" referrerpolicy="no-referrer" src="'+escapeText(src)+'">':'')+'</span>';
}

export function insideWebView() {
  const ua = navigator.userAgent;
  return Boolean(new URLSearchParams(location.search).get('webview')==='1' || window.ReactNativeWebView ||
    /\bwv\b|\bWebView\b/i.test(ua) || /Android.*Version\/4\.0.*Chrome\//i.test(ua) ||
    ((/iPhone|iPad|iPod/i.test(ua) || navigator.platform==='MacIntel' && navigator.maxTouchPoints>1) &&
      /AppleWebKit/i.test(ua) && !/Safari|CriOS|FxiOS|EdgiOS/i.test(ua)));
}
