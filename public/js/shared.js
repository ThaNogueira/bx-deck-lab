/* BX Deck Lab — camada compartilhada: API, sessão, topbar, avisos e PartTag. */
(() => {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...opts,
      body: opts.body instanceof FormData ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* respostas sem corpo */ }
    if (res.status === 503 && data?.maintenance) { location.href = '/manutencao'; throw new Error('manutenção'); }
    if (!res.ok) { const err = new Error(data?.error || `Erro ${res.status}`); err.status = res.status; err.data = data; throw err; }
    return data;
  }

  let mePromise = null;
  const me = (force) => (mePromise && !force ? mePromise : (mePromise = api('/api/me').then((d) => d.user)));
  let sitePromise = null;
  const site = () => sitePromise || (sitePromise = api('/api/site'));

  // -------------------------------------------------------------------------
  // Índice de peças + PartTag (item 11)
  // -------------------------------------------------------------------------

  let partsPromise = null;
  function partsIndex() {
    if (partsPromise) return partsPromise;
    partsPromise = api('/api/parts-index').then(({ parts }) => {
      const byId = new Map();
      const byName = new Map();
      for (const p of parts) {
        byId.set(p.id, p);
        for (const n of [p.name, p.display, p.abbrev, ...(p.aliases || [])]) {
          const k = norm(n);
          if (k && !byName.has(k)) byName.set(k, p);
        }
      }
      return { list: parts, byId, byName };
    });
    return partsPromise;
  }

  const KIND_PT = {
    BLADE: 'Blade', LOCK_CHIP: 'Lock Chip', OVER_BLADE: 'Over Blade', MAIN_BLADE: 'Main Blade',
    ASSIST_BLADE: 'Assist Blade', RATCHET: 'Ratchet', BIT: 'Bit',
  };

  /** Cache local de imagens que o montador já resolveu online. */
  function localImg(name) {
    try {
      const cache = JSON.parse(localStorage.getItem('bx_img_cache') || '{}');
      for (const key of Object.keys(cache)) {
        if (norm(key).includes(norm(name)) && typeof cache[key] === 'string' && cache[key].startsWith('http')) return cache[key];
      }
    } catch { /* sem cache */ }
    return null;
  }

  function partThumb(p, size = 26) {
    const img = p?.img || (p ? localImg(p.display || p.name) : null);
    if (img) return `<span class="ptag-thumb" style="width:${size}px;height:${size}px"><img loading="lazy" src="${esc(img)}" alt=""></span>`;
    const initials = esc((p?.abbrev || (p?.display || '?').slice(0, 2)).toUpperCase());
    return `<span class="ptag-thumb fallback" style="width:${size}px;height:${size}px">${initials}</span>`;
  }

  /**
   * <PartTag>: miniatura + nome + link para a página da peça.
   * Aceita objeto do índice, id ou nome/alias. Se não resolver, devolve texto puro.
   */
  function partTag(ref, { size = 26, label = null, block = false } = {}) {
    const idx = partTag._idx;
    let p = null;
    if (ref && typeof ref === 'object') p = idx?.byId.get(ref.id) || ref;
    else if (idx) p = idx.byId.get(ref) || idx.byName.get(norm(ref));
    const text = esc(label || p?.display || p?.displayName || (typeof ref === 'string' ? ref : '?'));
    if (!p?.slug) return `<span class="ptag plain${block ? ' block' : ''}">${text}</span>`;
    const kind = KIND_PT[p.kind] || '';
    return `<a class="ptag${block ? ' block' : ''}" href="/peca/${esc(p.slug)}" title="${esc(kind)}${p.type ? ` • ${esc(p.type)}` : ''}">${partThumb(p, size)}<span>${text}</span></a>`;
  }
  partTag._idx = null;
  const partTagReady = () => partsIndex().then((idx) => { partTag._idx = idx; return idx; });

  /** Resolve um combo em texto ("WizardRod 1-60 Hexa") em tags clicáveis. */
  function comboTags(text, opts = {}) {
    const idx = partTag._idx;
    if (!idx) return esc(text);
    const tokens = String(text || '').trim().split(/\s+/);
    const out = [];
    let i = 0;
    while (i < tokens.length) {
      let matched = null;
      for (let len = Math.min(3, tokens.length - i); len >= 1; len--) {
        const candidate = tokens.slice(i, i + len).join(' ');
        const p = idx.byName.get(norm(candidate));
        if (p) { matched = { p, len, candidate }; break; }
      }
      if (matched) { out.push(partTag(matched.p, { size: opts.size ?? 20, label: matched.candidate })); i += matched.len; }
      else { out.push(`<span class="ptag plain">${esc(tokens[i])}</span>`); i += 1; }
    }
    return `<span class="combo-tags">${out.join('')}</span>`;
  }

  // -------------------------------------------------------------------------
  // Avatar com moldura + stickers (item 3)
  // -------------------------------------------------------------------------

  function avatarHtml(user, { size = 40, frame = null } = {}) {
    const frameObj = frame ?? user?.cosmetics?.frame ?? null;
    const cls = frameObj?.styleKey ? ` frame-${esc(frameObj.styleKey)}` : '';
    const frameImg = frameObj?.imageUrl ? `<img class="frame-img" src="${esc(frameObj.imageUrl)}" alt="">` : '';
    const inner = user?.avatarUrl
      ? `<img src="${esc(user.avatarUrl)}" alt="">`
      : `<b>${esc((user?.name || '?').slice(0, 1).toUpperCase())}</b>`;
    const badge = user?.verified ? '<i class="verified-badge" title="Verificado">✔</i>' : '';
    return `<span class="avatar${cls}" style="width:${size}px;height:${size}px">${inner}${frameImg}${badge}</span>`;
  }

  /**
   * Visual de Bey no estilo do montador: Blade grande no centro com anéis de
   * órbita, Ratchet/Bit menores embaixo e peças CX nas laterais. Cada peça é
   * clicável (item 11). Aceita objetos de peça (dto ou índice), ids ou nomes.
   */
  function beyVisual(partRefs, { size = 'md' } = {}) {
    const idx = partTag._idx;
    const parts = (partRefs || [])
      .map((ref) => {
        if (ref && typeof ref === 'object') return ref;
        return idx ? (idx.byId.get(ref) || idx.byName.get(norm(ref))) : null;
      })
      .filter(Boolean)
      .map((p) => ({
        kind: p.kind, subKind: p.subKind,
        name: p.displayName || p.display || p.name,
        img: p.imageUrl || p.img || null,
        abbrev: p.abbrev, slug: p.slug,
      }));

    const used = new Set();
    const take = (pred) => {
      const p = parts.find((x) => !used.has(x) && pred(x));
      if (p) used.add(p);
      return p || null;
    };
    const blade = take((p) => p.kind === 'BLADE');
    const main = take((p) => p.kind === 'MAIN_BLADE');
    const lock = take((p) => p.kind === 'LOCK_CHIP');
    const assist = take((p) => p.kind === 'ASSIST_BLADE');
    const over = take((p) => p.kind === 'OVER_BLADE');
    const ratchet = take((p) => p.kind === 'RATCHET');
    const rib = take((p) => p.kind === 'BIT' && p.subKind === 'RIB');
    const bit = take((p) => p.kind === 'BIT');
    const center = blade || main || take(() => true);
    const centerLabel = center === main ? 'Main Blade' : 'Blade';
    const extras = parts.filter((p) => !used.has(p));

    const art = (p, cls) => {
      const inner = p.img
        ? `<img loading="lazy" src="${esc(p.img)}" alt="${esc(p.name)}">`
        : `<span class="fallback">${esc((p.abbrev || p.name.slice(0, 2)).toUpperCase())}</span>`;
      return p.slug
        ? `<a class="part-art ${cls}" href="/peca/${esc(p.slug)}" title="${esc(p.name)}">${inner}</a>`
        : `<span class="part-art ${cls}" title="${esc(p.name)}">${inner}</span>`;
    };
    const piece = (p, pos, label) => p
      ? `<div class="visual-piece ${pos}">${art(p, 'mini')}<span>${esc(label)}</span></div>`
      : '';

    return `<div class="bey-visual standalone ${size === 'sm' ? 'compact' : ''}">
        <div class="rings"></div>
        ${center ? `<div class="main-piece">${art(center, 'big')}<span>${esc(center.name)} • ${centerLabel}</span></div>` : ''}
        ${center === blade && main ? piece(main, 'chip-pos', 'Main') : piece(lock, 'chip-pos', 'Lock Chip')}
        ${piece(assist, 'assist-pos', 'Assist')}
        ${piece(over, 'over-pos', 'Over')}
        ${piece(ratchet, 'ratchet-pos', ratchet?.name || 'Ratchet')}
        ${piece(bit, 'bit-pos', bit?.name || 'Bit')}
        ${piece(rib, 'rib-pos', rib?.name || 'RIB')}
      </div>
      ${extras.length ? `<div class="combo-tags" style="margin-top:8px">${extras.map((p) => partTag(p, { size: 20, label: p.name })).join('')}</div>` : ''}`;
  }

  /**
   * Radar de 5 eixos (ATK/DEF/STA/X-DASH/BURST) em SVG, no estilo do site.
   * stats: {atk,def,sta,dash,burst}; max é o teto da escala.
   */
  function radar(stats, { size = 220, max = null } = {}) {
    const AXES = [
      ['atk', 'ATK', 'var(--red)'],
      ['def', 'DEF', 'var(--green)'],
      ['sta', 'STA', 'var(--yellow)'],
      ['burst', 'BURST', 'var(--orange)'],
      ['dash', 'X-DASH', 'var(--cyan)'],
    ];
    const vals = AXES.map(([k]) => Math.max(0, +stats?.[k] || 0));
    const top = max || Math.max(60, ...vals);
    const c = size / 2;
    const r = size / 2 - 34;
    const pt = (i, frac) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length;
      return [c + Math.cos(ang) * r * frac, c + Math.sin(ang) * r * frac];
    };
    const ring = (frac) => AXES.map((_, i) => pt(i, frac).map((v) => v.toFixed(1)).join(',')).join(' ');
    const shape = AXES.map(([k], i) => pt(i, Math.min(1, (+stats?.[k] || 0) / top)).map((v) => v.toFixed(1)).join(',')).join(' ');
    return `<svg class="radar" viewBox="0 0 ${size} ${size}" role="img" aria-label="Radar de stats">
      ${[0.25, 0.5, 0.75, 1].map((f) => `<polygon points="${ring(f)}" fill="none" stroke="rgba(255,255,255,.07)"/>`).join('')}
      ${AXES.map((_, i) => { const [x, y] = pt(i, 1); return `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}" stroke="rgba(255,255,255,.07)"/>`; }).join('')}
      <polygon points="${shape}" fill="rgba(84,230,156,.16)" stroke="var(--green)" stroke-width="2" stroke-linejoin="round"/>
      ${AXES.map(([k, , color], i) => { const [x, y] = pt(i, Math.min(1, (+stats?.[k] || 0) / top)); return `<circle cx="${x}" cy="${y}" r="3.2" fill="${color}"/>`; }).join('')}
      ${AXES.map(([k, label], i) => {
        const [x, y] = pt(i, 1.24);
        return `<text x="${x}" y="${y - 4}" text-anchor="middle" class="radar-label">${label}</text>
                <text x="${x}" y="${y + 8}" text-anchor="middle" class="radar-value">${+stats?.[k] || 0}</text>`;
      }).join('')}
    </svg>`;
  }

  const money = (cents) => cents == null ? '' : (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dateFmt = (d, opts) => new Date(d).toLocaleString('pt-BR', opts ?? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 3200);
  }

  // -------------------------------------------------------------------------
  // Topbar compartilhada (páginas fora do montador) + widget de usuário
  // -------------------------------------------------------------------------

  const NAV = [
    ['/', 'Montador'],
    ['/decks', 'Decks da comunidade'],
    ['/pecas', 'Peças'],
    ['/produtos', 'Produtos'],
    ['/torneios', 'Torneios'],
    ['/vendas', 'Vendas'],
  ];

  async function userChipHtml() {
    const user = await me().catch(() => null);
    if (!user) return `<a class="btn secondary chip-login" href="/entrar">Entrar</a>`;
    const adminLink = ['MOD', 'ADMIN'].includes(user.role) ? `<a class="chip-admin" href="/admin" title="Painel de admin">⚙</a>` : '';
    return `${adminLink}<a class="user-chip" href="/perfil" title="Meu perfil">${avatarHtml(user, { size: 34 })}<span>${esc(user.name)}</span></a>`;
  }

  async function renderTopbar(activePath) {
    const mount = document.getElementById('topbar');
    if (!mount) return;
    const s = await site().catch(() => null);
    mount.className = 'topbar';
    mount.innerHTML = `
      <a class="brand" href="/" style="text-decoration:none">
        <div class="brand-mark" aria-hidden="true"><span>X</span></div>
        <div><strong>${esc(s?.site?.name || 'BX DECK LAB')}</strong><small>${esc(s?.site?.tagline || '3-on-3 deck builder')}</small></div>
      </a>
      <nav class="tabs" aria-label="Navegação principal">
        ${NAV.map(([href, label]) => `<a class="tab${href === activePath ? ' active' : ''}" href="${href}">${label}</a>`).join('')}
      </nav>
      <div class="header-status header-user" id="headerUser"></div>`;
    document.getElementById('headerUser').innerHTML = await userChipHtml();
    renderAnnouncements(s);
  }

  function renderAnnouncements(s) {
    if (!s?.announcements?.length || document.querySelector('.announcement-bar')) return;
    const a = s.announcements[0];
    const bar = document.createElement('div');
    bar.className = 'announcement-bar';
    bar.innerHTML = `<span>📣 ${esc(a.message)}</span>${a.href ? `<a href="${esc(a.href)}">Ver mais →</a>` : ''}<button title="Fechar">×</button>`;
    bar.querySelector('button').onclick = () => bar.remove();
    const topbar = document.querySelector('.topbar');
    topbar?.parentNode.insertBefore(bar, topbar.nextSibling);
  }

  /** No montador (index.html), injeta o widget de usuário no header existente. */
  async function mountUserWidget() {
    const holder = document.getElementById('headerStatus');
    if (!holder) return;
    const chip = document.createElement('div');
    chip.className = 'header-user inline';
    chip.innerHTML = await userChipHtml();
    holder.parentNode.insertBefore(chip, holder);
    renderAnnouncements(await site().catch(() => null));
  }

  // -------------------------------------------------------------------------
  // Denúncias (2.3)
  // -------------------------------------------------------------------------

  async function report(targetType, targetId, label = 'este conteúdo') {
    const user = await me().catch(() => null);
    if (!user) { location.href = '/entrar'; return; }
    const reason = prompt(`Por que você quer denunciar ${label}?`);
    if (!reason?.trim()) return;
    try {
      await api('/api/reports', { method: 'POST', body: { targetType, targetId, reason } });
      toast('Denúncia enviada — a moderação vai revisar. Obrigado!');
    } catch (e) { toast(e.message); }
  }

  const requireLogin = async (redirectTo) => {
    const user = await me().catch(() => null);
    if (user) return user;
    if (redirectTo) await api('/api/auth/after-login', { method: 'POST', body: { to: redirectTo } }).catch(() => {});
    location.href = '/entrar';
    return null;
  };

  const qs = (k) => new URLSearchParams(location.search).get(k);
  const pathPart = (i) => location.pathname.split('/').filter(Boolean)[i] || null;
  const ytEmbed = (url) => {
    const m = String(url || '').match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{6,})/);
    return m ? `https://www.youtube.com/embed/${m[1]}` : null;
  };

  window.BX = {
    api, me, site, esc, norm, toast, money, dateFmt,
    partsIndex, partTagReady, partTag, comboTags, partThumb, KIND_PT, radar, beyVisual,
    avatarHtml, renderTopbar, mountUserWidget, userChipHtml,
    report, requireLogin, qs, pathPart, ytEmbed,
  };
})();
