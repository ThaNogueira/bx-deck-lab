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
      const byParent = new Map(); // peça-pai -> recolors (peças-filhas)
      for (const p of parts) {
        byId.set(p.id, p);
        if (p.parentId) {
          if (!byParent.has(p.parentId)) byParent.set(p.parentId, []);
          byParent.get(p.parentId).push(p);
          continue; // filhas não entram na busca por nome (mesmo nome do pai)
        }
        for (const n of [p.name, p.display, p.abbrev, ...(p.aliases || [])]) {
          const k = norm(n);
          if (k && !byName.has(k)) byName.set(k, p);
        }
      }
      // nome exibido da cor: "Dran Sword · Cor 2"
      for (const kids of byParent.values()) {
        for (const k of kids) { const parent = byId.get(k.parentId); k.display = `${parent?.display || k.display} · ${k.variantLabel || 'Cor'}`; }
      }
      return { list: parts, byId, byName, byParent, variantsOf: (id) => byParent.get(id) || [] };
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
    if (img) return `<span class="ptag-thumb" style="width:${size}px;height:${size}px"><img loading="lazy" decoding="async" width="${size}" height="${size}" src="${esc(img)}" alt=""></span>`;
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

  // Service worker: cache-first de imagens de peças + SWR dos dados do catálogo. Na primeira
  // visita, depois de tudo carregar, manda a lista de fotos pro SW aquecer em segundo plano.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      const sw = reg.active || reg.waiting || reg.installing;
      if (!sw) return;
      const warm = async () => {
        if (navigator.connection?.saveData) return;
        try {
          const idx = await partTagReady();
          const urls = [...new Set(idx.list.map((p) => p.img).filter((u) => u && /^https?:/.test(u)))];
          (reg.active || sw).postMessage({ type: 'warm', urls });
        } catch {}
      };
      const start = () => ('requestIdleCallback' in window ? requestIdleCallback(() => setTimeout(warm, 1500), { timeout: 8000 }) : setTimeout(warm, 4000));
      if (document.readyState === 'complete') start(); else addEventListener('load', start, { once: true });
    }).catch(() => {});
  }

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
    const frameImg = frameObj?.imageUrl ? `<img class="frame-img" src="${esc(frameObj.imageUrl)}" alt="" loading="lazy" decoding="async" width="${size}" height="${size}">` : '';
    const inner = user?.avatarUrl
      ? `<img src="${esc(user.avatarUrl)}" alt="" loading="lazy" decoding="async" width="${size}" height="${size}">`
      : `<b>${esc((user?.name || '?').slice(0, 1).toUpperCase())}</b>`;
    const badge = user?.verified ? `<i class="verified-badge" title="Verificado">${icon('check', 9)}</i>` : '';
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
   * Preview compacto de um Bey (bolinhas agrupadas, só fotos): Blade no alto,
   * Ratchet e Bit embaixo, peças CX menores nas bordas. Usado nos cards de
   * deck (comunidade, arquivo pessoal, home, decks populares).
   */
  function resolvePartRefs(partRefs) {
    const idx = partTag._idx;
    return (partRefs || [])
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
  }

  function beyMini(partRefs, { u = 52, link = false } = {}) {
    const parts = resolvePartRefs(partRefs);
    const used = new Set();
    const take = (pred) => { const p = parts.find((x) => !used.has(x) && pred(x)); if (p) used.add(p); return p || null; };
    const blade = take((p) => p.kind === 'BLADE');
    const main = take((p) => p.kind === 'MAIN_BLADE');
    const lock = take((p) => p.kind === 'LOCK_CHIP');
    const assist = take((p) => p.kind === 'ASSIST_BLADE');
    const over = take((p) => p.kind === 'OVER_BLADE');
    const ratchet = take((p) => p.kind === 'RATCHET');
    const rib = take((p) => p.kind === 'BIT' && p.subKind === 'RIB');
    const bit = take((p) => p.kind === 'BIT');
    const center = blade || main || take(() => true);
    const piece = (p, cls) => {
      if (!p) return '';
      const inner = p.img
        ? `<img loading="lazy" decoding="async" width="${u}" height="${u}" src="${esc(p.img)}" alt="">`
        : `<b>${esc((p.abbrev || p.name.slice(0, 2)).toUpperCase())}</b>`;
      const tag = link && p.slug ? 'a' : 'span';
      const href = link && p.slug ? ` href="/peca/${esc(p.slug)}"` : '';
      return `<${tag} class="bm-part ${cls}"${href} title="${esc(p.name)}">${inner}</${tag}>`;
    };
    if (!parts.length) return `<span class="bey-mini empty" style="--u:${u}px"><span class="bm-part bm-blade"><b>?</b></span></span>`;
    return `<span class="bey-mini" style="--u:${u}px" title="${esc(parts.map((p) => p.name).join(' • '))}">
      ${piece(center, 'bm-blade')}
      ${center === blade && main ? piece(main, 'bm-lock') : piece(lock, 'bm-lock')}
      ${piece(assist, 'bm-assist')}
      ${piece(over, 'bm-over')}
      ${piece(ratchet, 'bm-ratchet')}
      ${piece(rib, 'bm-rib')}
      ${piece(bit, 'bm-bit')}
    </span>`;
  }

  /** Preview de deck: até 3 Beys em miniatura, lado a lado. */
  function deckPreview(beys, { u = 48, parts = null, link = false } = {}) {
    const list = (beys || []).slice(0, 3).map((bey) => (bey || []).map((id) => parts?.[id] || id));
    return `<div class="deck-mini" style="--u:${u}px">${list.map((refs) => beyMini(refs, { u, link })).join('')}</div>`;
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

  // -------------------------------------------------------------------------
  // Recolors: popup "escolha a cor" (usado por coleção, builder, combos, vendas)
  // -------------------------------------------------------------------------

  /**
   * Abre o popup de cores. options = [{id, img, label, qty?}]. Resolve com o id
   * escolhido, '__default' (cor padrão/não sei) ou null (cancelou).
   */
  function colorDialog({ name, options = [], allowDefault = true, defaultLabel = 'Padrão / não sei a cor', hint = 'Qual versão (recolor) dessa peça?' } = {}) {
    return new Promise((resolve) => {
      let el = document.getElementById('bxColorDialog');
      if (!el) { el = document.createElement('div'); el.id = 'bxColorDialog'; el.className = 'modal-backdrop color-dialog'; document.body.appendChild(el); }
      el.hidden = false;
      el.innerHTML = `<div class="modal color-modal" role="dialog" aria-label="Escolha a cor">
        <button class="modal-close" data-x>×</button>
        <p class="eyebrow">ESCOLHA A COR</p>
        <h2>${esc(name || 'Peça')}</h2>
        <p class="color-hint">${esc(hint)}</p>
        <div class="color-grid">
          ${options.map((o) => `<button class="color-opt" data-pick="${esc(o.id)}"><span class="color-opt-img">${o.img ? `<img src="${esc(o.img)}" alt="">` : '<b>?</b>'}</span><span class="color-opt-label">${esc(o.label || 'Cor')}</span>${o.qty ? `<i class="color-opt-qty">×${o.qty}</i>` : ''}</button>`).join('')}
          ${allowDefault ? `<button class="color-opt default" data-pick="__default"><span class="color-opt-img"><b>?</b></span><span class="color-opt-label">${esc(defaultLabel)}</span></button>` : ''}
        </div>
      </div>`;
      const onKey = (e) => { if (e.key === 'Escape') done(null); };
      const done = (v) => { el.hidden = true; el.innerHTML = ''; el.onclick = null; document.removeEventListener('keydown', onKey); resolve(v); };
      el.onclick = (e) => {
        if (e.target === el) return done(null);
        const b = e.target.closest('[data-pick]');
        if (b) return done(b.dataset.pick);
        if (e.target.closest('[data-x]')) done(null);
      };
      document.addEventListener('keydown', onKey);
    });
  }

  /**
   * Popup de edição de um item da coleção: escolher a cor (se houver recolors)
   * e a quantidade, ou remover. Resolve com {id, qty} | {remove:true} | null.
   */
  function itemDialog({ name, options = [], currentId, qty = 1, allowDefault = true, defaultId = '__default', defaultLabel = 'Sem cor definida', canRemove = true } = {}) {
    return new Promise((resolve) => {
      let el = document.getElementById('bxColorDialog');
      if (!el) { el = document.createElement('div'); el.id = 'bxColorDialog'; el.className = 'modal-backdrop color-dialog'; document.body.appendChild(el); }
      let sel = currentId; let q = Math.max(1, qty | 0);
      el.hidden = false;
      const tiles = options.map((o) => `<button class="color-opt ${o.id === sel ? 'selected' : ''}" data-sel="${esc(o.id)}"><span class="color-opt-img">${o.img ? `<img src="${esc(o.img)}" alt="">` : '<b>?</b>'}</span><span class="color-opt-label">${esc(o.label || 'Cor')}</span>${o.qty ? `<i class="color-opt-qty">×${o.qty}</i>` : ''}</button>`).join('')
        + (allowDefault ? `<button class="color-opt default ${sel === defaultId ? 'selected' : ''}" data-sel="${esc(defaultId)}"><span class="color-opt-img"><b>?</b></span><span class="color-opt-label">${esc(defaultLabel)}</span></button>` : '');
      el.innerHTML = `<div class="modal color-modal edit-modal" role="dialog" aria-label="Editar item">
        <button class="modal-close" data-x>×</button>
        <p class="eyebrow">EDITAR NA COLEÇÃO</p>
        <h2>${esc(name || 'Peça')}</h2>
        ${options.length ? `<p class="color-hint">Cor / versão</p><div class="color-grid">${tiles}</div>` : ''}
        <div class="edit-qty-row">
          <span class="color-hint" style="margin:0">Quantidade</span>
          <div class="qty-stepper"><button data-q="-1" aria-label="menos">−</button><b data-qv>${q}</b><button data-q="1" aria-label="mais">+</button></div>
        </div>
        <div class="edit-actions">
          ${canRemove ? '<button class="btn danger-outline" data-remove>Remover da coleção</button>' : ''}
          <button class="btn primary" data-save>Salvar</button>
        </div>
      </div>`;
      const onKey = (e) => { if (e.key === 'Escape') done(null); };
      const done = (v) => { el.hidden = true; el.innerHTML = ''; el.onclick = null; document.removeEventListener('keydown', onKey); resolve(v); };
      el.onclick = (e) => {
        if (e.target === el || e.target.closest('[data-x]')) return done(null);
        const t = e.target.closest('[data-sel]');
        if (t) { sel = t.dataset.sel; el.querySelectorAll('[data-sel]').forEach((x) => x.classList.toggle('selected', x === t)); return; }
        const s = e.target.closest('[data-q]');
        if (s) { q = Math.max(1, Math.min(99, q + (+s.dataset.q))); el.querySelector('[data-qv]').textContent = q; return; }
        if (e.target.closest('[data-remove]')) return done({ remove: true });
        if (e.target.closest('[data-save]')) return done({ id: sel, qty: q });
      };
      document.addEventListener('keydown', onKey);
    });
  }

  /**
   * Confirmação genérica (substitui window.confirm): título, texto, botão de perigo e
   * "não perguntar novamente" (guardado em localStorage[rememberKey]). Resolve true/false.
   */
  function confirmDialog({ title = 'Confirmar?', text = '', okLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false, rememberKey = null, rememberLabel = 'Não perguntar novamente' } = {}) {
    if (rememberKey) { try { if (localStorage.getItem(rememberKey) === '1') return Promise.resolve(true); } catch {} }
    return new Promise((resolve) => {
      let el = document.getElementById('bxConfirmDialog');
      if (!el) { el = document.createElement('div'); el.id = 'bxConfirmDialog'; el.className = 'modal-backdrop color-dialog'; document.body.appendChild(el); }
      el.hidden = false;
      el.innerHTML = `<div class="modal color-modal confirm-modal" role="alertdialog" aria-modal="true" aria-label="${esc(title)}">
        <h2 class="confirm-title">${esc(title)}</h2>
        ${text ? `<p class="color-hint confirm-text">${esc(text)}</p>` : ''}
        ${rememberKey ? `<label class="confirm-remember"><input type="checkbox" data-remember> <span>${esc(rememberLabel)}</span></label>` : ''}
        <div class="confirm-actions"><button class="btn secondary" data-cancel>${esc(cancelLabel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel)}</button></div>
      </div>`;
      const onKey = (e) => { if (e.key === 'Escape') done(false); };
      const done = (v) => {
        if (v && rememberKey && el.querySelector('[data-remember]')?.checked) { try { localStorage.setItem(rememberKey, '1'); } catch {} }
        el.hidden = true; el.innerHTML = ''; el.onclick = null; document.removeEventListener('keydown', onKey); resolve(v);
      };
      el.onclick = (e) => { if (e.target === el || e.target.closest('[data-cancel]')) return done(false); if (e.target.closest('[data-ok]')) done(true); };
      document.addEventListener('keydown', onKey);
      el.querySelector('[data-ok]')?.focus();
    });
  }

  /** Substitui window.prompt: resolve com a string digitada ou null se cancelou. */
  function promptDialog({ title = 'Informe', text = '', placeholder = '', defaultValue = '', okLabel = 'OK', cancelLabel = 'Cancelar', danger = false, multiline = false } = {}) {
    return new Promise((resolve) => {
      let el = document.getElementById('bxConfirmDialog');
      if (!el) { el = document.createElement('div'); el.id = 'bxConfirmDialog'; el.className = 'modal-backdrop color-dialog'; document.body.appendChild(el); }
      el.hidden = false;
      el.innerHTML = `<div class="modal color-modal confirm-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <h2 class="confirm-title">${esc(title)}</h2>
        ${text ? `<p class="color-hint confirm-text" style="white-space:pre-wrap">${esc(text)}</p>` : ''}
        <form data-form style="margin-top:12px">${multiline ? `<textarea data-in rows="3" placeholder="${esc(placeholder)}">${esc(defaultValue)}</textarea>` : `<input data-in value="${esc(defaultValue)}" placeholder="${esc(placeholder)}">`}</form>
        <div class="confirm-actions"><button type="button" class="btn secondary" data-cancel>${esc(cancelLabel)}</button><button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel)}</button></div>
      </div>`;
      const input = el.querySelector('[data-in]');
      const onKey = (e) => { if (e.key === 'Escape') done(null); };
      const done = (v) => { el.hidden = true; el.innerHTML = ''; el.onclick = null; document.removeEventListener('keydown', onKey); resolve(v); };
      el.onclick = (e) => { if (e.target === el || e.target.closest('[data-cancel]')) return done(null); if (e.target.closest('[data-ok]')) done(input.value); };
      el.querySelector('[data-form]').onsubmit = (e) => { e.preventDefault(); done(input.value); };
      document.addEventListener('keydown', onKey);
      input.focus(); input.select?.();
    });
  }

  /**
   * Dado id/nome/objeto de peça do catálogo do site, pergunta a cor quando a
   * peça tem recolors. Resolve com o id final (filha, ou pai se "padrão") ou
   * null se cancelou. Peça sem recolors resolve direto.
   */
  async function pickColor(ref, opts = {}) {
    const idx = await partTagReady();
    const p = ref && typeof ref === 'object' ? ref : (idx.byId.get(ref) || idx.byName.get(norm(ref)));
    if (!p) return typeof ref === 'string' ? ref : null;
    const parentId = p.parentId || p.id;
    const kids = idx.variantsOf(parentId);
    if (!kids.length) return p.id;
    const parent = idx.byId.get(parentId) || p;
    const r = await colorDialog({ name: parent.display, options: kids.map((k) => ({ id: k.id, img: k.img, label: k.variantLabel || 'Cor' })), ...opts });
    if (r === null) return null;
    return r === '__default' ? parentId : r;
  }

  const KIND_SORT = ['BLADE', 'LOCK_CHIP', 'OVER_BLADE', 'MAIN_BLADE', 'ASSIST_BLADE', 'RATCHET', 'BIT'];

  /**
   * Progresso de coleção: peças-pai diferentes que a pessoa tem sobre o catálogo
   * (recolors contam para a peça-pai). items = [{partId, qty}] do servidor.
   */
  function collectionProgress(items, idx) {
    const catalog = idx.list.filter((p) => !p.parentId);
    const owned = new Set();
    for (const i of items || []) {
      const p = idx.byId.get(i.partId);
      if (p && (i.qty ?? 1) > 0) owned.add(p.parentId || p.id);
    }
    const distinct = catalog.filter((p) => owned.has(p.id)).length;
    const pct = catalog.length ? Math.round((distinct / catalog.length) * 100) : 0;
    const byKind = KIND_SORT.map((k) => {
      const all = catalog.filter((p) => p.kind === k);
      return { kind: k, label: KIND_PT[k], total: all.length, owned: all.filter((p) => owned.has(p.id)).length };
    }).filter((k) => k.total);
    return { distinct, total: catalog.length, pct, byKind, ownedParents: owned };
  }

  /** Barrinha discreta de porcentagem da coleção. */
  function progressBarHtml(prog, { label = 'do Beyblade X', compact = false } = {}) {
    return `<div class="colbar ${compact ? 'compact' : ''}" title="${prog.distinct} de ${prog.total} peças diferentes">
      <div class="colbar-track"><i style="width:${prog.pct}%"></i></div>
      <small><b>${prog.pct}%</b> ${esc(label)} <span>• ${prog.distinct}/${prog.total} peças</span></small>
    </div>`;
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
    edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m13.5 6.5 3 3"/>',
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
    clip: '<path d="M3.5 6.5h17v11h-17Z"/><path d="m10.2 9.2 4.6 2.8-4.6 2.8Z"/>',
    unboxing: '<path d="M4 9.5 12 13.5l8-4V19l-8 3-8-3Z"/><path d="M4 9.5 8 5l8 4 4-2.5M12 13.5V22"/>',
    channel: '<path d="M12 12.5v8"/><circle cx="12" cy="10.5" r="2"/><path d="M7.5 6a6.4 6.4 0 0 0 0 9M16.5 6a6.4 6.4 0 0 1 0 9M4.7 3.5a10.3 10.3 0 0 0 0 14M19.3 3.5a10.3 10.3 0 0 1 0 14"/>',
    sale: '<path d="M5 8.5h11l-2.5-2.5M19 15.5H8l2.5 2.5M5 8.5l2.5 2.5M19 15.5l-2.5-2.5"/>',
    result: '<path d="M3.5 20.5h17M9 20.5v-7h6v7M3.5 20.5v-4H9M15 20.5v-9h5.5v9"/>',
    champion: '<path d="M7.5 4h9v5.2a4.5 4.5 0 0 1-9 0Z"/><path d="M7.5 5.2h-3v1.6a3.6 3.6 0 0 0 3.2 3.6M16.5 5.2h3v1.6a3.6 3.6 0 0 1-3.2 3.6"/><path d="M12 13.7v3M8.2 20h7.6l-.9-3.3H9.1Z"/>',
    help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.7a2.5 2.5 0 1 1 3.6 2.3c-.9.5-1.2 1-1.2 1.9M12 17.2h.01"/>',
    offtopic: '<path d="M4 5.5h16v10.5h-7.5L8 20v-4H4Z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>',
    fire: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3 2.2-5.2 3.6-7.1.4 1.4 1.1 2.2 2 2.7C11.4 8 12 5.4 12.6 3c3 2.4 5.9 6.1 5.9 11.6 0 3.7-2.6 6.4-6.5 6.4Z"/><path d="M12 21c-1.8 0-3-1.3-3-3 0-1.6 1.3-2.6 3-4.4 1.7 1.8 3 2.8 3 4.4 0 1.7-1.2 3-3 3Z"/>',
    top: '<path d="M7 11.2v9.3H3.8v-9.3Z"/><path d="M7 11.2 11.2 3.5c1.6 0 2.6 1.2 2.3 2.8L13 9.4h5.2c1.3 0 2.2 1.2 1.9 2.4l-1.6 6.6c-.3 1.2-1.2 2.1-2.4 2.1H7"/>',
    lol: '<circle cx="12" cy="12" r="8.5"/><path d="M7.5 13.5h9c-.6 2.6-2.4 4-4.5 4s-3.9-1.4-4.5-4Z"/><path d="M8.5 9.5h2M13.5 9.5h2"/>',
    wow: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="15" r="2"/><path d="M9 9h.01M15 9h.01"/>',
    live: '<circle cx="12" cy="12" r="2.2"/><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.4 5.4a9.3 9.3 0 0 0 0 13.2M18.6 5.4a9.3 9.3 0 0 1 0 13.2"/>',
    done: '<circle cx="12" cy="12" r="8.5"/><path d="m8 12.2 2.6 2.6L16.4 9"/>',
    pending: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    conflict: '<path d="M12 4 21 20H3Z"/><path d="M12 10v4.5M12 17.3h.01"/>',
    bye: '<path d="M5 6v12M9 12l10-6v12Z"/>',
    finish: '<path d="M6 21V4h12l-1.5 3.5L18 11H6"/><path d="M6 4h3v3.5H6ZM12 4h3v3.5h-3ZM9 7.5h3V11H9ZM15 7.5h3V11h-3Z"/>',
    flag: '<path d="M6 21V4h11l-1.6 3.6L17 11.2H6"/>',
    share: '<path d="M4 12v8h16v-8"/><path d="M12 15V4m-4 4 4-4 4 4"/>',
    comment: '<path d="M4 5.5h16v10.5h-7.5L8 20v-4H4Z"/>',
    reply: '<path d="M9 7 4 12l5 5"/><path d="M4 12h9a6 6 0 0 1 6 6v1"/>',
    bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    trash: '<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/><path d="M10 11v6M14 11v6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19.5 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    warn: '<path d="M12 4 21 20H3Z"/><path d="M12 10v4.5M12 17.3h.01"/>',
    lock: '<path d="M5.5 11h13v9.5h-13Z"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 3.7 5.4 3.7 8.5s-1.1 5.9-3.7 8.5c-2.6-2.6-3.7-5.4-3.7-8.5S9.4 6.1 12 3.5Z"/>',
    star: '<path d="m12 3.5 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 17l-5.4 3 1.2-6-4.5-4.2 6.1-.7Z"/>',
    save: '<path d="M4.5 4.5h12l3 3v12h-15Z"/><path d="M8 4.5v5h7v-5M8 19.5v-6h8v6"/>',
    folder: '<path d="M3.5 6.5h6l2 2h9v10h-17Z"/>',
    camera: '<path d="M3.5 8h4l1.5-2.5h6L16.5 8h4v11h-17Z"/><circle cx="12" cy="13.5" r="3.2"/>',
    image: '<path d="M3.5 5h17v14h-17Z"/><path d="m3.5 16 5-5 4 4 3-3 5 5"/><circle cx="16" cy="9" r="1.4"/>',
    video: '<path d="M3.5 7h12v10h-12Z"/><path d="m15.5 10.5 5-3v9l-5-3"/>',
    poll: '<path d="M4 20h16M7 20V10M12 20V5M17 20v-8"/>',
    link: '<path d="M10 14 14 10"/><path d="M8.5 15.5 6.7 17.3a3 3 0 0 1-4.2-4.2l3.6-3.6a3 3 0 0 1 4.2 0M15.5 8.5l1.8-1.8a3 3 0 0 1 4.2 4.2l-3.6 3.6a3 3 0 0 1-4.2 0"/>',
    external: '<path d="M14 4h6v6M20 4 11 13"/><path d="M18 14v6H4V6h6"/>',
    print: '<path d="M7 8V3.5h10V8M5 8h14v8h-3v4H8v-4H5Z"/><path d="M8 13h8"/>',
    download: '<path d="M12 3.5v11m-4.5-4 4.5 4.5 4.5-4.5M4 16.5v4h16v-4"/>',
    upload: '<path d="M12 20.5V9m-4.5 4L12 8.5l4.5 4.5M4 4h16"/>',
    whatsapp: '<path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5Z"/><path d="M8.8 8.6c0 3.4 3.2 6.6 6.6 6.6l1.1-1.6-2-1-1 .9c-1.3-.5-2.5-1.7-3-3l.9-1-1-2Z"/>',
    calendar: '<path d="M4 6h16v14H4Z"/><path d="M4 10h16M8 3.5V6M16 3.5V6"/>',
    store: '<path d="M4 9.5 5.5 4h13L20 9.5M4 9.5v11h16v-11M4 9.5h16"/><path d="M9.5 20.5v-6h5v6"/>',
    pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.3M12 18.2v2.3M3.5 12h2.3M18.2 12h2.3M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>',
    users: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.9-3.2 2.9-4.7 5.5-4.7s4.6 1.5 5.5 4.7"/><circle cx="16.5" cy="9" r="2.3"/><path d="M15.4 14.4c2.6 0 4.3 1.4 5.1 4.6"/>',
    dashboard: '<path d="M4 4h7v7H4ZM13 4h7v4h-7ZM13 10h7v10h-7ZM4 13h7v7H4Z"/>',
    shield: '<path d="M12 3.2 19 6v6.2c0 4.6-3.3 7-7 8.6-3.7-1.6-7-4-7-8.6V6Z"/>',
    wrench: '<path d="M14.5 3.7a5 5 0 0 0-5.7 6.5L3.5 15.5l3 3 5.3-5.3a5 5 0 0 0 6.5-5.7l-2.8 2.8-2.7-2.7Z"/>',
    package: '<path d="M12 3 20 7.4v9.2L12 21l-8-4.4V7.4Z"/><path d="M4 7.4 12 12l8-4.6M12 12v9"/>',
    money: '<path d="M3.5 6.5h17v11h-17Z"/><circle cx="12" cy="12" r="2.8"/><path d="M6.5 9.5h.01M17.5 14.5h.01"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.9 0-1.2-1-1.6-1-2.7 0-.9.7-1.4 1.6-1.4h1.8c2.3 0 4.1-1.7 4.1-3.9 0-4.1-3.9-7.1-8.5-7.1Z"/><path d="M8 9.5h.01M8 14.5h.01M12 7.5h.01M16 9.5h.01"/>',
    scroll: '<path d="M6 3.5h12v17H6Z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    megaphone: '<path d="M4 10.5v3h3l7 4V6.5l-7 4Z"/><path d="M17.5 9.5a3.5 3.5 0 0 1 0 5M7 13.5l1.5 6h3"/>',
    gift: '<path d="M4 9.5h16v11H4Z"/><path d="M4 13.5h16M12 9.5v11M12 9.5c-2.5 0-4.5-1.3-4.5-3S9.6 4 12 6.5c2.4-2.5 4.5-1.6 4.5 0s-2 3-4.5 3Z"/>',
    bolt: '<path d="M13 3.5 5.5 13.5H12L11 20.5l7.5-10H12Z"/>',
    party: '<path d="M5 20.5 8 9l7 7Z"/><path d="M12 6.5c1-2 3-2 4 0M14.5 11.5c2-1 4 0 4.5 1.5M9.5 4.5v2M18 5.5l1.5-1.5"/>',
    ban: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
    medal: '<circle cx="12" cy="15" r="5"/><path d="m8.5 10.5-3-7h4.2L12 8.5l2.3-5H18.5l-3 7"/>',
    trophy: '<path d="M7.5 4h9v5.2a4.5 4.5 0 0 1-9 0Z"/><path d="M7.5 5.2h-3v1.6a3.6 3.6 0 0 0 3.2 3.6M16.5 5.2h3v1.6a3.6 3.6 0 0 1-3.2 3.6"/><path d="M12 13.7v3M8.2 20h7.6l-.9-3.3H9.1Z"/>',
    eye: '<path d="M2.5 12c2.4-4.2 5.6-6.3 9.5-6.3s7.1 2.1 9.5 6.3c-2.4 4.2-5.6 6.3-9.5 6.3S4.9 16.2 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    scale: '<path d="M12 3.5v17M5 20.5h14M4 7h16"/><path d="M6.5 7l-3 7h6l-3-7ZM17.5 7l-3 7h6l-3-7Z"/>',
    screen: '<path d="M3.5 5h17v11h-17Z"/><path d="M8.5 20h7M12 16v4"/>',
    qr: '<path d="M4 4h6v6H4ZM14 4h6v6h-6ZM4 14h6v6H4Z"/><path d="M14 14h2.5v2.5H14ZM17.5 17.5H20V20h-2.5ZM17.5 14H20M14 20h2.5"/>',
    rotate: '<path d="M8 4v16m0-16L4.5 7.5M8 4l3.5 3.5M16 20V4m0 16 3.5-3.5M16 20l-3.5-3.5"/>',
    fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    back: '<path d="m14.5 6-6 6 6 6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    dice: '<path d="M4 4h16v16H4Z"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01"/>',
    sparkle: '<path d="M12 3.5 14 10l6.5 2-6.5 2-2 6.5-2-6.5L3.5 12 10 10Z"/>',
    spiral: '<path d="M12 12a1.5 1.5 0 0 1 3 0c0 1.7-1.6 3-3.4 3A4.6 4.6 0 0 1 7 10.4C7 7.4 9.6 5 13 5a7 7 0 0 1 7 7c0 4.7-3.8 8.5-8.5 8.5A8.5 8.5 0 0 1 3 12"/>',
    backpack: '<path d="M6.5 8h11v12.5h-11Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2M6.5 14h11M9.5 14v3h5v-3"/>',
    chevron: '<path d="m6 9.5 6 6 6-6"/>',
    archive: '<path d="M3.5 5h17v4h-17Z"/><path d="M5 9v11h14V9M10 13h4"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    filter: '<path d="M4 5h16l-6.5 8v6l-3 1.5V13Z"/>',
    more: '<path d="M6 12h.01M12 12h.01M18 12h.01"/>',
    play: '<path d="m8 5 10 7-10 7Z"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    grid: '<path d="M4 4h7v7H4ZM13 4h7v7h-7ZM4 13h7v7H4ZM13 13h7v7h-7Z"/>',
    login: '<path d="M10 4h10v16H10"/><path d="M3.5 12H13m-3.4-3.4L13 12l-3.4 3.4"/>',
    minus: '<path d="M5.5 12h13"/>',
    book: '<path d="M4 4.5h6.5a2 2 0 0 1 1.5.7 2 2 0 0 1 1.5-.7H20v14h-6.5a2 2 0 0 0-1.5.7 2 2 0 0 0-1.5-.7H4Z"/><path d="M12 5.2v13.3"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    crown: '<path d="m4 18 1-10 4.5 4L12 6l2.5 6L19 8l1 10Z"/><path d="M4 18h16v2H4Z"/>',
    feed: '<path d="M4 5.5h16v10.5h-7.5L8 20v-4H4Z"/><path d="M8 9.5h8M8 12.5h5"/>',
    // Editor Markdown
    'md-bold': '<path d="M7 4h6a4 4 0 0 1 0 8H7ZM7 12h7a4 4 0 0 1 0 8H7Z"/>',
    'md-italic': '<path d="M10 4h8M6 20h8M14 4l-4 16"/>',
    'md-strike': '<path d="M4 12h16"/><path d="M16.5 7.5c-.5-2-2.3-3-4.5-3-2.5 0-4.5 1.3-4.5 3.3 0 1.4.8 2.3 2.5 3M7.5 16c.5 2 2.2 3.5 4.5 3.5 2.6 0 4.5-1.4 4.5-3.5 0-.7-.2-1.3-.5-1.8"/>',
    'md-heading': '<path d="M5 4v16M17 4v16M5 12h12"/>',
    'md-quote': '<path d="M5 11h5v6H5ZM14 11h5v6h-5Z"/><path d="M10 11c0-3-1.5-4.5-4-5M19 11c0-3-1.5-4.5-4-5"/>',
    'md-ol': '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 4.5 5.5 3.5V8M4 11h3l-3 3.5h3M4 16.5h3v3.5H4"/>',
    'md-code': '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
    'md-emoji': '<circle cx="12" cy="12" r="8.5"/><path d="M9 10h.01M15 10h.01M8.5 14c1.5 2 5.5 2 7 0"/>',
    // Emojis do site (mesmo traço dos ícones)
    'e-burst': '<circle cx="12" cy="12" r="3.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M5.6 18.4l2.1-2.1"/>',
    'e-spin': '<path d="M12 4a8 8 0 1 1-8 8"/><path d="M12 8a4 4 0 1 1-4 4"/><path d="M4 12 2.5 9.5M4 12l2.5-1"/>',
    'e-xtreme': '<path d="M7 7l10 10M17 7 7 17"/><path d="M2 12h3M19 12h3M12 2v3M12 19v3"/>',
    'e-stadium': '<ellipse cx="12" cy="8.5" rx="9" ry="3.5"/><path d="M3 8.5c0 5.5 4 9 9 9s9-3.5 9-9"/><circle cx="12" cy="9" r="1.5"/>',
    'e-launcher': '<path d="M4 9h11a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4Z"/><path d="M17 12h5M7 9V5.5M11 9V5.5"/>',
    'e-heart': '<path d="M12 20s-7.5-4.6-7.5-10a4 4 0 0 1 7.5-2 4 4 0 0 1 7.5 2c0 5.4-7.5 10-7.5 10Z"/>',
    'e-skull': '<path d="M5 11a7 7 0 0 1 14 0v3a2 2 0 0 1-2 2v3H7v-3a2 2 0 0 1-2-2Z"/><circle cx="9.5" cy="11" r="1.3"/><circle cx="14.5" cy="11" r="1.3"/><path d="M11 16h2"/>',
    'e-eyes': '<circle cx="7.5" cy="12" r="4"/><circle cx="16.5" cy="12" r="4"/><path d="M8.5 12h.01M17.5 12h.01"/>',
    'e-100': '<path d="M3.5 9 5.5 7.5V16"/><ellipse cx="11" cy="11.75" rx="2.5" ry="4.25"/><ellipse cx="18" cy="11.75" rx="2.5" ry="4.25"/><path d="M4 19.5h16"/>',
    'e-think': '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 9.5h3M14 9v1.5M9 15.5c1.5-1 4-1 5.5.5"/>',
    'e-cry': '<circle cx="12" cy="12" r="8.5"/><path d="M9 10h.01M15 10h.01M9.5 16c1.5-1.5 3.5-1.5 5 0M16 11.5c0 2 1.2 3 1.2 4.3a1.2 1.2 0 0 1-2.4 0"/>',
    'e-cool': '<circle cx="12" cy="12" r="8.5"/><path d="M5.5 10h13M7 10l.6 2.2h3L11.2 10M12.8 10l.6 2.2h3L17 10M9 15.5c1.5 1.5 4.5 1.5 6 0"/>',
    'e-rage': '<circle cx="12" cy="12" r="8.5"/><path d="M7.5 8.5 10.5 10M16.5 8.5 13.5 10M9 11.5h.01M15 11.5h.01M9 16.5c1.5-1.5 4.5-1.5 6 0"/>',
    'e-laugh': '<circle cx="12" cy="12" r="8.5"/><path d="M8 10h2.5M13.5 10H16M7.5 13.5c1 3.5 8 3.5 9 0Z"/>',
    'e-dizzy': '<circle cx="12" cy="12" r="8.5"/><path d="M8 9l2 2M10 9l-2 2M14 9l2 2M16 9l-2 2M9.5 15.5h5"/>',
    'e-sleep': '<circle cx="11" cy="13.5" r="7.5"/><path d="M8 13h2M12 13h2M9 17h4M16 3h4l-4 4h4"/>',
    'e-clutch': '<path d="M3 12h4l2-5 3 10 2.5-7 1.5 2h5"/>',
    'e-gg': '<path d="M5 21V4h11l-1.5 3 1.5 3H5"/><path d="m8 7.5 1.5 1.5 3-3"/>',
    'e-salt': '<path d="M9 8h6l1 13H8Z"/><path d="M9.5 8V5a2.5 2.5 0 0 1 5 0v3"/><path d="M11 4h.01M13 4h.01M12 2h.01"/>',
    'e-hype': '<path d="M12 3c3 2 4 6 3 10l-3 3-3-3c-1-4 0-8 3-10Z"/><path d="M9 13l-3 2 1 3 3-1M15 13l3 2-1 3-3-1M12 16v5"/><circle cx="12" cy="9" r="1.2"/>',
    'e-flex': '<path d="M5 14c0-3 2-5 5-5l2-3 3 1-1 3c3 0 5 2 5 5v3H5Z"/><path d="M9 14c1 1 3 1 4 0"/>',
    'e-clap': '<path d="M8 21v-6l-3-3a1.5 1.5 0 0 1 2-2l2 2V6a1.5 1.5 0 0 1 3 0v6l4-4a1.5 1.5 0 0 1 2 2l-4 4v7"/><path d="M4 5l1.5 1.5M6.5 3.5 7 5.5M19 3l-1.5 1.5"/>',
    'e-lock-in': '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    'e-wave': '<path d="M3 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/><path d="M3 17c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/>',
    'e-ok': '<path d="M9 12.5V7a1.5 1.5 0 0 1 3 0v4M12 11V6a1.5 1.5 0 0 1 3 0v5M15 11.5V8a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.5 13a1.5 1.5 0 0 1 2.4-1.8L9 14.5"/>',
    'e-dead': '<circle cx="12" cy="12" r="8.5"/><path d="M8 9l2 2M10 9l-2 2M14 9l2 2M16 9l-2 2M8.5 16c1.5-2 5.5-2 7 0"/>',
    'e-gem': '<path d="M7 4h10l4 5-9 11-9-11Z"/><path d="M3 9h18M7 4l5 16 5-16M9.5 9 12 4l2.5 5"/>',
    'e-flag-race': '<path d="M5 21V4"/><path d="M5 4h14l-2 4 2 4H5"/><path d="M8 4v8M11 4v8M14 4v8M5 6h14M5 10h14"/>',
    'e-star-eyes': '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 8 1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L5.5 10.3l2-.3ZM15.5 8l1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.4 2-.3Z"/><path d="M9.5 16c1.5 1.2 3.5 1.2 5 0"/>',
    'e-shush': '<circle cx="12" cy="12" r="8.5"/><path d="M9 10h.01M15 10h.01M9.5 15h5M12 12.5v6"/>',
    'e-sweat': '<circle cx="12" cy="12" r="8.5"/><path d="M9 10h.01M15 10h.01M9.5 15.5h5M17.5 6c0 1.5 1 2 1 3a1 1 0 0 1-2 0c0-1 1-1.5 1-3Z"/>',
    'e-launch': '<path d="M4 19 16.5 6.5"/><path d="M14 4h6v6"/><path d="M4 12v7h7"/>',
  };
  // Emojis do site: :codigo: -> ícone. Inventados no mesmo traço dos ícones; nada de emoji Unicode.
  const EMOJIS = {
    burst: 'e-burst', spin: 'e-spin', xtreme: 'e-xtreme', stadium: 'e-stadium', launcher: 'e-launcher', launch: 'e-launch', lockin: 'e-lock-in',
    fire: 'fire', top: 'top', lol: 'lol', wow: 'wow', laugh: 'e-laugh', cool: 'e-cool', think: 'e-think', cry: 'e-cry', rage: 'e-rage', dizzy: 'e-dizzy', dead: 'e-dead', sleep: 'e-sleep', stareyes: 'e-star-eyes', shush: 'e-shush', sweat: 'e-sweat',
    heart: 'e-heart', skull: 'e-skull', eyes: 'e-eyes', '100': 'e-100', clutch: 'e-clutch', gg: 'e-gg', salt: 'e-salt', hype: 'e-hype', flex: 'e-flex', clap: 'e-clap', ok: 'e-ok', wave: 'e-wave', gem: 'e-gem', race: 'e-flag-race',
    trophy: 'trophy', medal: 'medal', crown: 'crown', bolt: 'bolt', sparkle: 'sparkle', party: 'party', target: 'target', star: 'star', shield: 'shield', spiral: 'spiral', gift: 'gift', dice: 'dice', warn: 'warn', check: 'check', x: 'x', megaphone: 'megaphone',
  };
  const ICON_GROUPS = {"Navegação":["home","builder","meta","community","feed","popular","tournaments","pecas","produtos","vendas","rules","profile","collection","missing","decks","physical","organizer","admin","logout","login","menu","back","collapse","chevron"],"Tags da comunidade":["clip","unboxing","channel","sale","result","champion","help","offtopic"],"Reações":["fire","top","lol","wow"],"Status de torneio e partida":["live","done","pending","conflict","bye","finish","trophy","medal","crown"],"Ações":["plus","minus","edit","trash","check","x","save","share","link","external","comment","reply","flag","bell","search","filter","refresh","download","upload","print","eye","more","play","fullscreen","rotate","publish","google"],"Objetos e mídia":["image","camera","video","poll","folder","archive","book","scroll","calendar","clock","store","pin","target","globe","lock","star","sparkle","spiral","dice","backpack","screen","qr","whatsapp","megaphone","gift","bolt","party","info","warn","list","grid"],"Administração":["dashboard","users","shield","wrench","package","money","palette","settings","ban","scale"],"Editor de texto":["md-bold","md-italic","md-strike","md-heading","md-quote","md-ol","md-code","md-emoji"],"Emojis do site":["e-burst","e-spin","e-xtreme","e-stadium","e-launcher","e-launch","e-lock-in","e-laugh","e-cool","e-think","e-cry","e-rage","e-dizzy","e-dead","e-sleep","e-star-eyes","e-shush","e-sweat","e-heart","e-skull","e-eyes","e-100","e-clutch","e-gg","e-salt","e-hype","e-flex","e-clap","e-ok","e-wave","e-gem","e-flag-race"]};
  const ICON_NAMES = Object.keys(ICON_PATHS);
  // Sprite único no <body>: cada ícone vira <symbol>, e icon() referencia com <use> (HTML leve, sem repetir paths)
  function ensureIconSprite() {
    if (document.getElementById('bxIconSprite')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'bxIconSprite'; svg.setAttribute('aria-hidden', 'true'); svg.style.display = 'none';
    svg.innerHTML = ICON_NAMES.map((n) => `<symbol id="i-${n}" viewBox="0 0 24 24">${ICON_PATHS[n]}</symbol>`).join('');
    (document.body || document.documentElement).prepend(svg);
  }
  if (document.body) ensureIconSprite(); else document.addEventListener('DOMContentLoaded', ensureIconSprite, { once: true });
  const icon = (name, size = 19, cls = '') =>
    `<svg class="vicon${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="bevel" stroke-linecap="square" aria-hidden="true"><use href="#i-${ICON_PATHS[name] ? name : 'pecas'}"/></svg>`;
  /** Ícone inline no meio de texto (alinhado à linha). */
  const ic = (name, size = 14) => icon(name, size, 'inline');
  /** Adesivo/cosmético: chave de estilo antiga (emoji) ou nome de ícone -> ícone do sprite; texto livre continua texto. */
  const STICKER_EMOJI = { '⚡': 'bolt', '🔥': 'fire', '🌀': 'spiral', '🏆': 'trophy', '💥': 'sparkle', '🛡': 'shield', '⭐': 'star', '★': 'star', '🎯': 'target', '👑': 'crown', '🥇': 'medal', '🎉': 'party', '💎': 'sparkle', '🎲': 'dice', '🔩': 'wrench' };
  const stickerIcon = (key, size = 16) => {
    const k = String(key || '').trim().replace(/️/g, '');
    if (!k) return icon('star', size);
    if (STICKER_EMOJI[k]) return icon(STICKER_EMOJI[k], size);
    if (ICON_PATHS[k]) return icon(k, size);
    return esc(k);
  };

  // -------------------------------------------------------------------------
  // Shell de navegação: sidebar colapsável + topbar + menu do avatar
  // -------------------------------------------------------------------------

  const NAV_MAIN = [
    ['home', '/#home', 'Início'],
    ['builder', '/#builder', 'Deck Builder'],
    ['meta', '/#meta', 'Meta completo'],
    ['community', '/decks', 'Decks da comunidade'],
    ['popular', '/#popular', 'Decks populares'],
    ['tournaments', '/torneios', 'Torneios'],
    ['feed', '/comunidade', 'Comunidade'],
  ];
  const NAV_CATALOG = [
    ['pecas', '/pecas', 'Peças'],
    ['produtos', '/produtos', 'Produtos'],
    ['vendas', '/vendas', 'Vendas'],
  ];
  const PATH_KEY = { '/comunidade': 'feed', '/decks': 'community', '/pecas': 'pecas', '/produtos': 'produtos', '/torneios': 'tournaments', '/vendas': 'vendas' };
  const IS_APP_PAGE = () => location.pathname === '/' || location.pathname === '/index.html';

  async function userChipHtml() {
    const user = await me().catch(() => null);
    if (!user) return `<a class="btn secondary chip-login" href="/entrar">Entrar</a>`;
    return `<button class="user-chip" id="userMenuBtn" title="Menu da conta">${avatarHtml(user, { size: 34 })}<span>${esc(user.name)}</span><i class="chev">▾</i></button>
      <div class="user-menu" id="userMenu" hidden>
        <a href="/perfil">${icon('profile', 16)} Meu perfil</a>
        <a href="/#collection">${icon('collection', 16)} Minha coleção</a>
        <a href="/#missing">${icon('missing', 16)} Faltam na coleção</a>
        <a href="/meus-decks">${icon('decks', 16)} Meus decks</a>
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
      <button class="nav-toggle" id="navToggle" title="Menu" aria-label="Abrir menu" aria-expanded="false" aria-controls="sideNav">${icon('menu', 22)}</button>
      <button class="nav-toggle nav-back" id="navBack" title="Voltar" aria-label="Voltar" ${history.length > 1 ? '' : 'hidden'}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
      <a class="brand mini" href="/#home" style="text-decoration:none" aria-label="Início">
        <div class="brand-mark" aria-hidden="true"><span>X</span></div>
      </a>
      <div class="header-status" id="headerStatus"></div>
      <div class="header-notif" id="headerNotif"></div>
      <div class="header-user" id="headerUser"></div>`;
    document.getElementById('headerUser').innerHTML = await userChipHtml();
    mountNotifications();
    document.getElementById('navBack')?.addEventListener('click', () => { if (history.length > 1) history.back(); else location.href = '/#home'; });

    // Comportamento: colapsar (desktop) / abrir (mobile)
    const isMobile = () => matchMedia('(max-width: 900px)').matches;
    document.getElementById('navToggle').onclick = () => {
      if (isMobile()) {
        const open = document.body.classList.toggle('nav-open');
        document.getElementById('navToggle')?.setAttribute('aria-expanded', String(open));
      } else {
        document.body.classList.toggle('nav-collapsed');
        localStorage.setItem('bx_nav_collapsed', document.body.classList.contains('nav-collapsed') ? '1' : '0');
      }
    };
    document.getElementById('navCollapseBtn').onclick = () => {
      document.body.classList.toggle('nav-collapsed');
      localStorage.setItem('bx_nav_collapsed', document.body.classList.contains('nav-collapsed') ? '1' : '0');
    };
    document.getElementById('sideBackdrop').onclick = () => { document.body.classList.remove('nav-open'); document.getElementById('navToggle')?.setAttribute('aria-expanded', 'false'); };
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

  // UX global: a página não dá zoom por pinça/duplo toque (o CSS trava com touch-action; o iOS
  // Safari ignora isso e precisa dos eventos gesture*). Zoom controlado existe só dentro do bracket.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
      document.body.classList.remove('nav-open');
      document.getElementById('navToggle')?.setAttribute('aria-expanded', 'false');
    }
  });

  function renderAnnouncements(s) {
    if (!s?.announcements?.length || document.querySelector('.announcement-bar')) return;
    const a = s.announcements[0];
    const bar = document.createElement('div');
    bar.className = 'announcement-bar';
    bar.innerHTML = `<span>${icon('megaphone', 14, 'inline')} ${esc(a.message)}</span>${a.href ? `<a href="${esc(a.href)}">Ver mais →</a>` : ''}<button title="Fechar">×</button>`;
    bar.querySelector('button').onclick = () => bar.remove();
    const topbar = document.querySelector('.topbar');
    topbar?.parentNode.insertBefore(bar, topbar.nextSibling);
  }

  // ------------------------------------------------------------------------
  // Notificações (comunidade): sino no topo, contador e painel
  // ------------------------------------------------------------------------
  async function mountNotifications() {
    const box = document.getElementById('headerNotif');
    if (!box) return;
    const user = await me().catch(() => null);
    if (!user) { box.innerHTML = ''; return; }
    box.innerHTML = `<button class="notif-btn" id="notifBtn" aria-label="Notificações" aria-expanded="false" title="Notificações">${icon('bell', 18)}<b class="notif-badge" id="notifBadge" hidden></b></button>
      <div class="notif-menu" id="notifMenu" hidden><div class="notif-head"><strong>Notificações</strong><button class="btn ghost" id="notifReadAll">Marcar tudo como lido</button></div><div class="notif-list" id="notifList"><div class="empty-state">Carregando…</div></div></div>`;
    const btn = document.getElementById('notifBtn');
    const menu = document.getElementById('notifMenu');
    const badge = document.getElementById('notifBadge');
    const setUnread = (n) => { badge.hidden = !n; badge.textContent = n > 99 ? '99+' : String(n); };
    const poll = async () => { if (document.hidden) return; try { const { unread } = await api('/api/notifications/unread-count'); setUnread(unread); } catch {} };
    poll(); setInterval(poll, 60_000);
    const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    const open = async () => {
      menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
      try {
        const { notifications, unread } = await api('/api/notifications');
        setUnread(unread);
        const list = document.getElementById('notifList');
        list.innerHTML = notifications.length ? notifications.map((n) => `<a class="notif-item ${n.readAt ? '' : 'unread'} ${NOTIF_ADMIN.has(n.type) ? 'admin' : ''}" href="${esc(n.url)}">${n.actor ? avatarHtml(n.actor, { size: 30 }) : `<span class="notif-ic">${icon(NOTIF_ICON[n.type] || 'bell', 16)}</span>`}<span><span class="notif-text">${esc(n.text || '')}</span><small>${esc(dateFmt(n.createdAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))}</small></span></a>`).join('') : '<div class="empty-state">Nada por aqui ainda. Interações nos seus posts e menções aparecem aqui.</div>';
        if (unread) { await api('/api/notifications/read', { method: 'POST', body: {} }).catch(() => {}); setUnread(0); }
      } catch (e) { document.getElementById('notifList').innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; }
    };
    btn.onclick = () => (menu.hidden ? open() : close());
    document.getElementById('notifReadAll').onclick = async () => { await api('/api/notifications/read', { method: 'POST', body: {} }).catch(() => {}); setUnread(0); menu.querySelectorAll('.notif-item.unread').forEach((el) => el.classList.remove('unread')); };
    document.addEventListener('click', (e) => { if (!menu.hidden && !box.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }
  const NOTIF_ICON = { REACTION: 'fire', COMMENT: 'comment', REPLY: 'reply', MENTION: 'users', POST_APPROVED: 'check', POST_HIDDEN: 'warn', POST_DELETED: 'trash', POST_PENDING: 'pending', REPORT_RESOLVED: 'flag', REPORT: 'flag', MOD_PENDING: 'shield' };
  const NOTIF_ADMIN = new Set(['REPORT', 'MOD_PENDING']);

  /** Compat: o montador agora usa o shell completo. */
  const mountUserWidget = () => renderShell();

  // -------------------------------------------------------------------------
  // Denúncias (2.3)
  // -------------------------------------------------------------------------

  const REPORT_CATEGORIES = [['INAPPROPRIATE', 'Conteúdo impróprio'], ['SPAM', 'Spam / propaganda'], ['SCAM', 'Golpe / venda falsa'], ['HARASSMENT', 'Assédio / ofensa'], ['OTHER', 'Outro']];
  function reportDialog(label) {
    return new Promise((resolve) => {
      let el = document.getElementById('bxConfirmDialog');
      if (!el) { el = document.createElement('div'); el.id = 'bxConfirmDialog'; el.className = 'modal-backdrop color-dialog'; document.body.appendChild(el); }
      el.hidden = false;
      el.innerHTML = `<div class="modal color-modal confirm-modal" role="dialog" aria-label="Denunciar">
        <button class="modal-close" data-x>×</button>
        <p class="eyebrow">DENUNCIAR</p>
        <h2 class="confirm-title">Qual é o problema com ${esc(label)}?</h2>
        <div class="report-cats">${REPORT_CATEGORIES.map(([k, l], i) => `<label class="report-cat"><input type="radio" name="rcat" value="${k}" ${i === 0 ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
        <textarea data-reason rows="3" placeholder="Detalhes (opcional)" style="width:100%;margin-top:10px"></textarea>
        <div class="confirm-actions"><button class="btn secondary" data-cancel>Cancelar</button><button class="btn danger" data-ok>Enviar denúncia</button></div>
      </div>`;
      const done = (v) => { el.hidden = true; el.innerHTML = ''; el.onclick = null; resolve(v); };
      el.onclick = (e) => {
        if (e.target === el || e.target.closest('[data-cancel],[data-x]')) return done(null);
        if (e.target.closest('[data-ok]')) done({ category: el.querySelector('input[name=rcat]:checked')?.value || 'OTHER', reason: el.querySelector('[data-reason]').value.trim() });
      };
    });
  }
  async function report(targetType, targetId, label = 'este conteúdo') {
    const user = await me().catch(() => null);
    if (!user) { location.href = '/entrar'; return; }
    const r = await reportDialog(label);
    if (!r) return;
    try {
      await api('/api/reports', { method: 'POST', body: { targetType, targetId, category: r.category, reason: r.reason } });
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
    api, me, site, esc, norm, toast, money, dateFmt, icon, ic, stickerIcon, ICON_NAMES, ICON_GROUPS, EMOJIS,
    partsIndex, partTagReady, partTag, comboTags, partThumb, KIND_PT, radar, beyVisual, beyMini, deckPreview, colorDialog, itemDialog, confirmDialog, promptDialog, pickColor, collectionProgress, progressBarHtml, KIND_SORT,
    avatarHtml, renderTopbar, renderShell, mountUserWidget, userChipHtml, setActiveNav,
    report, requireLogin, qs, pathPart, ytEmbed,
  };
})();
