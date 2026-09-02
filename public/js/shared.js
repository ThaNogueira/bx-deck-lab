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

    return `<div class="bey-visual standalone ${size === 'sm' ? 'compact' : size === 'lg' ? 'lg' : ''}">
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
  // Ícones vetoriais próprios — traço poligonal, estilo Beyblade X (sem emoji)
  // -------------------------------------------------------------------------

  const ICON_PATHS = {
    home: '<path d="M4 11.5 12 4l8 7.5V20h-5.5v-5h-5v5H4Z"/>',
    builder: '<path d="M12 2.5 18.5 6.2l.9 6L12 21.5l-7.4-9.3.9-6Z"/><path d="M12 7.2l3.4 1.9-.8 3.1-2.6 3.2-2.6-3.2-.8-3.1Z"/>',
    meta: '<path d="M4 4v16h16"/><path d="m7 15 4-5.5 3 3L19 6"/><path d="M15.5 6H19v3.5"/>',
    community: '<circle cx="12" cy="12" r="3.4"/><path d="M2.8 12c0-2.4 4.1-4.4 9.2-4.4s9.2 2 9.2 4.4-4.1 4.4-9.2 4.4S2.8 14.4 2.8 12Z"/>',
    popular: '<path d="M7.5 4h9v5.2a4.5 4.5 0 0 1-9 0Z"/><path d="M7.5 5.2h-3v1.6a3.6 3.6 0 0 0 3.2 3.6M16.5 5.2h3v1.6a3.6 3.6 0 0 1-3.2 3.6"/><path d="M12 13.7v3M8.2 20h7.6l-.9-3.3H9.1Z"/>',
    tournaments: '<path d="m5 3.5 12.8 12.8M18.6 3.5 5.8 16.3"/><path d="m4 16.5 3.5 3.5M16.5 20l3.5-3.5M4.5 3.5H8M4.5 3.5V7M19.1 3.5h-3.5M19.1 3.5V7"/>',
    pecas: '<path d="M12 3.2 19 7.1v9.8l-7 3.9-7-3.9V7.1Z"/><circle cx="12" cy="12" r="3"/>',
    produtos: '<path d="M12 3 20 7.4v9.2L12 21l-8-4.4V7.4Z"/><path d="M4 7.4 12 12l8-4.6M12 12v9"/>',
    vendas: '<path d="M12.8 3.5H20v7.2L10.4 20.3 3.5 13.4Z"/><circle cx="16.2" cy="7.4" r="1.5"/>',
    rules: '<path d="M12 3.2 19 6v6.2c0 4.6-3.3 7-7 8.6-3.7-1.6-7-4-7-8.6V6Z"/><path d="m9 12.2 2.1 2.1 3.9-4.5"/>',
    collapse: '<path d="M11.5 6 5.5 12l6 6M18.5 6l-6 6 6 6"/>',
    profile: '<circle cx="12" cy="8" r="3.4"/><path d="M4.8 20c1.4-3.8 3.9-5.4 7.2-5.4s5.8 1.6 7.2 5.4"/>',
    collection: '<path d="M4 8.2h16V20H4Z"/><path d="M9 8.2V5h6v3.2M4 13.4h16"/>',
    missing: '<path d="M12 3.2 19 7.1v9.8l-7 3.9-7-3.9V7.1Z" stroke-dasharray="3.2 3"/><path d="M12 8.4v7.2M8.4 12h7.2"/>',
    decks: '<path d="M4.5 7.5h11v13h-11Z"/><path d="M8.5 4h11v13"/>',
    physical: '<path d="m12 3 8 4.5-8 4.5-8-4.5Z"/><path d="m4 12.5 8 4.5 8-4.5M4 16.5 12 21l8-4.5"/>',
    organizer: '<path d="M5.5 4.5h13V21h-13Z"/><path d="M9 4.5V3h6v3H9ZM8.7 11h6.6M8.7 15h4.4"/>',
    admin: '<path d="M12 3.2 19 6v6.2c0 4.6-3.3 7-7 8.6-3.7-1.6-7-4-7-8.6V6Z"/><path d="M12 7.5v5M9.5 10h5"/>',
    logout: '<path d="M14 4H6v16h8"/><path d="M10.5 12H20m-3.4-3.4L20 12l-3.4 3.4"/>',
    publish: '<path d="M3.5 11.6 20.5 4l-4.7 16-4.3-6.1Z"/><path d="M11.5 13.9 20.5 4"/>',
    plus: '<path d="M12 5.5v13M5.5 12h13"/>',
    google: '<circle cx="11.5" cy="11.5" r="6.5"/><path d="m16.5 16.5 4 4M11.5 8.5v6M8.5 11.5h6"/>',
  };
  const icon = (name, size = 19) =>
    `<svg class="vicon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="bevel" stroke-linecap="square" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.pecas}</svg>`;

  // -------------------------------------------------------------------------
  // Shell de navegação: sidebar colapsável + topbar + menu do avatar
  // -------------------------------------------------------------------------

  const NAV_MAIN = [
    ['home', '/#home', 'Início'],
    ['builder', '/#builder', 'Deck Builder'],
    ['meta', '/#meta', 'Meta check'],
    ['community', '/decks', 'Decks da comunidade'],
    ['popular', '/#popular', 'Decks populares'],
    ['tournaments', '/torneios', 'Torneios'],
  ];
  const NAV_CATALOG = [
    ['pecas', '/pecas', 'Peças'],
    ['produtos', '/produtos', 'Produtos'],
    ['vendas', '/vendas', 'Vendas'],
  ];
  const PATH_KEY = { '/decks': 'community', '/pecas': 'pecas', '/produtos': 'produtos', '/torneios': 'tournaments', '/vendas': 'vendas' };
  const IS_APP_PAGE = () => location.pathname === '/' || location.pathname === '/index.html';

  async function userChipHtml() {
    const user = await me().catch(() => null);
    if (!user) return `<a class="btn secondary chip-login" href="/entrar">Entrar</a>`;
    return `<button class="user-chip" id="userMenuBtn" title="Menu da conta">${avatarHtml(user, { size: 34 })}<span>${esc(user.name)}</span><i class="chev">▾</i></button>
      <div class="user-menu" id="userMenu" hidden>
        <a href="/perfil">${icon('profile', 16)} Meu perfil</a>
        <a href="/#collection">${icon('collection', 16)} Minha coleção</a>
        <a href="/#missing">${icon('missing', 16)} Faltam na coleção</a>
        <a href="/decks?author=${esc(user.slug)}">${icon('decks', 16)} Meus decks</a>
        <a href="/#session">${icon('physical', 16)} Decks físicos</a>
        <a href="/#tournament">${icon('organizer', 16)} Organizador local</a>
        ${['MOD', 'ADMIN'].includes(user.role) ? `<a href="/admin">${icon('admin', 16)} Painel de admin</a>` : ''}
        <button id="logoutMenuBtn">${icon('logout', 16)} Sair</button>
      </div>`;
  }

  function setActiveNav(key) {
    document.querySelectorAll('.side-item[data-key]').forEach((el) => el.classList.toggle('active', el.dataset.key === key));
  }

  async function renderShell(active) {
    const mount = document.getElementById('topbar');
    if (!mount) return;
    const key = PATH_KEY[active] ?? active ?? (IS_APP_PAGE() ? (location.hash.slice(1) || 'home') : null);
    const s = await site().catch(() => null);

    if (localStorage.getItem('bx_nav_collapsed') === '1') document.body.classList.add('nav-collapsed');

    // Sidebar
    let side = document.getElementById('sideNav');
    if (!side) {
      side = document.createElement('aside');
      side.id = 'sideNav';
      side.className = 'side-nav';
      document.body.appendChild(side);
    }
    const item = ([k, href, label]) => `<a class="side-item${k === key ? ' active' : ''}" data-key="${k}" href="${href}"><i>${icon(k)}</i><span>${label}</span></a>`;
    side.innerHTML = `
      <a class="side-brand" href="/#home">
        <div class="brand-mark" aria-hidden="true"><span>X</span></div>
        <div class="side-brand-text"><strong>${esc(s?.site?.name || 'BX DECK LAB')}</strong><small>${esc(s?.site?.tagline || '3-on-3 deck builder')}</small></div>
      </a>
      <nav class="side-items">
        ${NAV_MAIN.map(item).join('')}
        <div class="side-group-title">Catálogo</div>
        ${NAV_CATALOG.map(item).join('')}
      </nav>
      <div class="side-foot">
        <a class="side-item" data-key="rules" href="/#rules"><i>${icon('rules')}</i><span>Regras WBO</span></a>
        <button class="side-item side-collapse" id="navCollapseBtn" title="Recolher menu"><i>${icon('collapse')}</i><span>Recolher</span></button>
      </div>
      <div class="side-backdrop" id="sideBackdrop"></div>`;

    // Topbar
    mount.className = 'topbar shell';
    mount.innerHTML = `
      <button class="nav-toggle" id="navToggle" title="Menu" aria-label="Abrir menu">☰</button>
      <a class="brand mini" href="/#home" style="text-decoration:none">
        <div class="brand-mark" aria-hidden="true"><span>X</span></div>
      </a>
      <div class="header-status" id="headerStatus"></div>
      <div class="header-user" id="headerUser"></div>`;
    document.getElementById('headerUser').innerHTML = await userChipHtml();

    // Comportamento: colapsar (desktop) / abrir (mobile)
    const isMobile = () => matchMedia('(max-width: 900px)').matches;
    document.getElementById('navToggle').onclick = () => {
      if (isMobile()) document.body.classList.toggle('nav-open');
      else {
        document.body.classList.toggle('nav-collapsed');
        localStorage.setItem('bx_nav_collapsed', document.body.classList.contains('nav-collapsed') ? '1' : '0');
      }
    };
    document.getElementById('navCollapseBtn').onclick = () => {
      document.body.classList.toggle('nav-collapsed');
      localStorage.setItem('bx_nav_collapsed', document.body.classList.contains('nav-collapsed') ? '1' : '0');
    };
    document.getElementById('sideBackdrop').onclick = () => document.body.classList.remove('nav-open');
    side.querySelectorAll('a.side-item').forEach((a) => a.addEventListener('click', () => document.body.classList.remove('nav-open')));

    // Menu do avatar
    const menuBtn = document.getElementById('userMenuBtn');
    const menu = document.getElementById('userMenu');
    if (menuBtn && menu) {
      menuBtn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
      document.addEventListener('click', (e) => { if (!menu.contains(e.target)) menu.hidden = true; });
      document.getElementById('logoutMenuBtn')?.addEventListener('click', async () => {
        await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
        location.href = '/';
      });
    }

    // No montador, o hash controla a view — mantém o item ativo em dia
    if (IS_APP_PAGE()) {
      const sync = () => setActiveNav(location.hash.slice(1) || 'home');
      window.addEventListener('hashchange', sync);
      sync();
    }
    renderAnnouncements(s);
  }

  const renderTopbar = renderShell; // compat: páginas antigas chamam renderTopbar('/pecas')

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

  /** Compat: o montador agora usa o shell completo. */
  const mountUserWidget = () => renderShell();

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
    api, me, site, esc, norm, toast, money, dateFmt, icon,
    partsIndex, partTagReady, partTag, comboTags, partThumb, KIND_PT, radar, beyVisual,
    avatarHtml, renderTopbar, renderShell, mountUserWidget, userChipHtml, setActiveNav,
    report, requireLogin, qs, pathPart, ytEmbed,
  };
})();
