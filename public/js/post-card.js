/* Card de post da comunidade — usado no feed (/comunidade), na página do post e na home.
   Três tipos visuais: post de usuário, card do sistema (borda/ícone próprios) e deck
   compartilhado (card do deck com "Abrir no builder" / "Copiar deck"). Sem emoji: só BX.icon. */
(() => {
  'use strict';
  const { esc, icon } = BX;
  const REACT = { FIRE: ['fire', 'Fogo'], TOP: ['top', 'Top'], LOL: ['lol', 'Risada'], WOW: ['wow', 'Uau'] };
  let TAGS = {};
  let me = null;
  let metaPromise = null;
  const ready = () => metaPromise || (metaPromise = Promise.all([BX.api('/api/community/meta'), BX.me().catch(() => null)]).then(([m, u]) => { TAGS = m.tags; me = u; return m; }));

  const timeAgo = (d) => {
    const s = (Date.now() - new Date(d).getTime()) / 1000;
    if (s < 60) return 'agora';
    if (s < 3600) return `${Math.floor(s / 60)} min`;
    if (s < 86400) return `${Math.floor(s / 3600)} h`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)} d`;
    return BX.dateFmt(d, { day: '2-digit', month: 'short' });
  };
  // Título: sem Markdown, só :emoji: do site.
  const titleHtml = (t) => BX.emojify ? BX.emojify(t) : esc(t || '');
  // Corpo de post/comentário: Markdown seguro (md.js). Fallback simples se md.js não estiver carregado.
  const linkify = (text) => BX.md ? BX.md(text) : esc(text || '')
    .replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" target="_blank" rel="noopener nofollow">${u}</a>`)
    .replace(/(^|[\s(])@([a-z0-9][a-z0-9-]{1,40})/gi, (m, pre, slug) => `${pre}<a class="mention" href="/u/${slug}">@${slug}</a>`);

  const tagChip = (k, { link = true } = {}) => {
    const t = TAGS[k]; if (!t) return '';
    const inner = `${icon(t.icon, 13)}${esc(t.label)}`;
    return link ? `<a class="tag-chip sm ${k.toLowerCase()}" href="/comunidade?tag=${k}">${inner}</a>` : `<span class="tag-chip sm ${k.toLowerCase()}">${inner}</span>`;
  };

  // ---------------- mídia ----------------
  const oneMedia = (m) => m.type === 'video'
    ? `<video controls preload="metadata" playsinline src="${esc(m.url)}"></video>`
    : `<img src="${esc(m.url)}" alt="" loading="lazy" decoding="async">`;
  function mediaHtml(p) {
    const media = p.media || [];
    if (!media.length) return '';
    const visual = media.filter((m) => m.type !== 'embed');
    const embeds = media.filter((m) => m.type === 'embed');
    let html = '';
    if (visual.length === 1) html += `<div class="pc-media">${oneMedia(visual[0])}</div>`;
    else if (visual.length > 1) {
      html += `<div class="pc-media carousel" data-carousel>
        <div class="carousel-track">${visual.map(oneMedia).join('')}</div>
        <button type="button" class="carousel-nav prev" data-dir="-1" aria-label="Anterior">${icon('back', 18)}</button>
        <button type="button" class="carousel-nav next" data-dir="1" aria-label="Próxima">${icon('chevron', 18)}</button>
        <div class="carousel-dots">${visual.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>
        <span class="media-count">1/${visual.length}</span>
      </div>`;
    }
    for (const e of embeds) {
      html += `<div class="pc-media"><div class="yt-embed" data-yt="${esc(e.id)}" style="background-image:url('https://i.ytimg.com/vi/${esc(e.id)}/hqdefault.jpg')" role="button" tabindex="0" aria-label="Reproduzir vídeo"><span class="yt-play">${icon('play', 28)}</span></div></div>`;
    }
    return html;
  }

  function pollHtml(p) {
    const poll = p.poll; if (!poll) return '';
    const max = Math.max(...poll.options.map((o) => o.votes));
    const canVote = me && !poll.ended;
    const showResults = poll.ended || poll.myVote || !me;
    const left = poll.endsAt ? new Date(poll.endsAt).getTime() - Date.now() : null;
    const leftTxt = poll.ended ? 'Encerrada' : left != null ? (left > 86400e3 ? `Encerra em ${Math.ceil(left / 86400e3)} d` : `Encerra em ${Math.max(1, Math.ceil(left / 3600e3))} h`) : '';
    return `<div class="poll" data-poll="${p.id}">
      ${poll.options.map((o) => `<button type="button" class="poll-opt ${o.id === poll.myVote ? 'mine' : ''} ${poll.ended && o.votes === max && max > 0 ? 'win' : ''}" style="--pct:${showResults ? o.pct : 0}%" data-opt="${o.id}" ${canVote ? '' : 'disabled'}><span>${esc(o.text)}</span>${showResults ? `<b>${o.pct}%</b>` : ''}</button>`).join('')}
      <span class="poll-meta">${icon('poll', 12, 'inline')} ${poll.total} voto${poll.total === 1 ? '' : 's'} · ${leftTxt}${!me && !poll.ended ? ' · entre para votar' : ''}</span>
    </div>`;
  }

  function saleHtml(p) {
    const s = p.sale; if (!s) return '';
    return `<div class="sale-box">
      <div class="sale-price">${s.priceCents ? BX.money(s.priceCents) : (s.trade ? 'Troca' : 'A combinar')}<small>${s.trade && s.priceCents ? 'ou troca' : 'preço'}</small></div>
      <div class="sale-info">${s.condition ? `<b>Estado:</b> ${esc(s.condition)}<br>` : ''}${s.contact ? `<b>Contato:</b> ${esc(s.contact)}` : '<b>Contato:</b> pelo perfil'}</div>
      ${s.whatsappUrl ? `<a class="btn primary" href="${esc(s.whatsappUrl)}" target="_blank" rel="noopener" style="text-decoration:none">${icon('whatsapp', 16)}Chamar</a>` : (p.author ? `<a class="btn secondary" href="/u/${esc(p.author.slug)}" style="text-decoration:none">${icon('profile', 16)}Perfil</a>` : '')}
    </div>`;
  }

  /** Card do deck dentro do post (kind DECK ou card do sistema apontando para um deck). */
  function deckHtml(p) {
    const d = p.deck; if (!d) return '';
    const names = (d.beys || []).map((bey) => bey.map((id) => d.parts?.[id]?.displayName).filter(Boolean).join(' ')).filter(Boolean);
    return `<div class="pc-deck" data-deck="${esc(d.id)}" data-slug="${esc(d.slug)}">
      <div class="pc-deck-top">
        ${BX.deckPreview ? BX.deckPreview(d.beys, { u: 52, parts: d.parts }) : ''}
        <div class="pc-deck-info">
          <a class="pc-deck-title" href="/deck/${esc(d.slug)}">${esc(d.title)}</a>
          ${names.length ? `<ol class="pc-deck-beys">${names.map((n) => `<li>${esc(n)}</li>`).join('')}</ol>` : ''}
          <small class="pc-deck-meta">${icon('save', 12, 'inline')} <span data-copies>${d.copyCount ?? 0}</span> cópia${(d.copyCount ?? 0) === 1 ? '' : 's'}${d.author && d.author.id !== p.author?.id ? ` · por ${esc(d.author.name)}` : ''}</small>
        </div>
      </div>
      <div class="pc-deck-actions">
        <a class="btn secondary" href="/?copiar=${esc(d.slug)}#builder">${icon('builder', 15)}Abrir no deck builder</a>
        <button type="button" class="btn primary" data-copy-deck="${esc(d.id)}">${icon('save', 15)}Copiar deck</button>
      </div>
    </div>`;
  }

  /** Bloco do card do sistema: ícone grande + chamada para ação. */
  function systemHtml(p) {
    const d = p.data || {};
    if (!d.cta) return '';
    const delta = d.delta != null ? `<span class="pc-delta up">${icon('top', 12)} +${d.delta}</span>` : d.event === 'meta-new' ? `<span class="pc-delta new">${icon('sparkle', 12)} novo no top</span>` : '';
    return `<div class="pc-sys-cta">${delta}<a class="btn secondary" href="${esc(d.cta.url)}">${icon(d.icon || 'bolt', 15)}${esc(d.cta.label)}</a></div>`;
  }

  function reactionsHtml(target, kind) {
    const r = target.reactions || { counts: {}, total: 0, mine: null };
    return `<span class="react-group" data-rt="${kind}" data-rid="${target.id}">${Object.entries(REACT).map(([k, [ico, label]]) => `<button type="button" class="react-btn ${r.mine === k ? 'on' : ''}" data-kind="${k}" title="${label}" aria-label="${label}">${icon(ico, 15)}${r.counts?.[k] ? `<span>${r.counts[k]}</span>` : ''}</button>`).join('')}</span>`;
  }

  const KIND_BADGE = {
    SYSTEM: `<span class="pc-kind sys" title="Card gerado automaticamente pelo site">${icon('bolt', 12)}BX Deck Lab</span>`,
    DECK: `<span class="pc-kind deck" title="Deck compartilhado do builder">${icon('decks', 12)}Deck compartilhado</span>`,
  };
  const ANNOUNCE_BADGE = `<span class="pc-kind announce" title="Anúncio oficial da equipe">${icon('megaphone', 12)}Anúncio</span>`;

  /**
   * @param p post DTO
   * @param opts.full página do post (título sem link, corpo inteiro)
   * @param opts.home card na home (mostra selo do tipo)
   */
  function card(p, { full = false } = {}) {
    const kind = p.kind || 'USER';
    const long = (p.body || '').length > 420 || (p.body || '').split('\n').length > 6;
    const sys = kind === 'SYSTEM';
    const canDelete = p.mine || p.canModerate;
    const sysIcon = sys ? (p.data?.icon || 'bolt') : null;
    const who = sys
      ? `<span class="pc-avatar sys">${icon(sysIcon, 20)}</span><div class="pc-who"><b>BX Deck Lab</b><small>${timeAgo(p.createdAt)} · automático</small></div>`
      : `${BX.avatarHtml(p.author, { size: 36 })}<div class="pc-who"><a href="/u/${esc(p.author?.slug || '')}">${esc(p.author?.name || '?')}</a><small>${timeAgo(p.createdAt)}${p.author?.verified ? ' · verificado' : ''}</small></div>`;
    const menu = `<div class="pc-menu-wrap"><button type="button" class="pc-menu-btn" data-menu aria-haspopup="menu" aria-label="Mais opções">${icon('more', 18)}</button>
      <div class="pc-menu" hidden role="menu">
        <button type="button" role="menuitem" data-share="${esc(p.url)}">${icon('link', 14)}Copiar link</button>
        ${p.author ? `<a role="menuitem" href="/u/${esc(p.author.slug)}">${icon('profile', 14)}Ver perfil</a>` : ''}
        ${!sys ? `<button type="button" role="menuitem" data-report="${p.id}">${icon('flag', 14)}Denunciar</button>` : ''}
        ${canDelete ? `<button type="button" role="menuitem" class="danger" data-del="${p.id}">${icon('trash', 14)}${p.mine ? 'Excluir meu post' : 'Excluir (moderação)'}</button>` : ''}
      </div></div>`;
    return `<article class="pc pc-${kind.toLowerCase()} ${p.tag === 'SALE' ? 'pc-sale' : ''} ${p.tag === 'ANNOUNCE' ? 'pc-announce' : ''} ${p.status !== 'VISIBLE' ? 'pc-pending' : ''}" data-post="${p.id}" id="p-${p.id}">
      <header class="pc-head">${who}${p.tag === 'ANNOUNCE' ? ANNOUNCE_BADGE : KIND_BADGE[kind] || ''}${p.tag === 'ANNOUNCE' ? '' : tagChip(p.tag)}${menu}</header>
      ${p.status === 'SCANNING' ? `<div class="pc-note">${icon('pending', 14)} Publicando: analisando a mídia enviada. Vídeos passam por aprovação manual.</div>` : ''}
      ${p.status === 'PENDING' ? `<div class="pc-note warn">${icon('warn', 14)} Em revisão pela moderação${p.flag?.reasons?.length ? `: ${esc(p.flag.reasons.join('; '))}` : ''}. Só você vê este post por enquanto.</div>` : ''}
      <h2 class="pc-title">${full ? titleHtml(p.title) : `<a href="/comunidade/p/${p.id}">${titleHtml(p.title)}</a>`}</h2>
      ${p.body ? `<div class="pc-body ${!full && long ? 'clamp' : ''}">${linkify(p.body)}</div>${!full && long ? `<button type="button" class="pc-more" data-more>ver mais</button>` : ''}` : ''}
      ${mediaHtml(p)}
      ${deckHtml(p)}
      ${pollHtml(p)}
      ${saleHtml(p)}
      ${sys ? systemHtml(p) : ''}
      <footer class="pc-foot">
        ${reactionsHtml(p, 'POST')}
        <a class="pc-pill" href="/comunidade/p/${p.id}#comentarios">${icon('comment', 15)}<span data-cc>${p.commentCount}</span><i class="pc-pill-label">coment.</i></a>
        <button type="button" class="pc-pill" data-share="${esc(p.url)}">${icon('share', 15)}<i class="pc-pill-label">Compartilhar</i></button>
      </footer>
    </article>`;
  }

  /** Esqueleto de carregamento (evita tela em branco). */
  const skeleton = (n = 3) => Array.from({ length: n }, () => `<div class="pc pc-skel"><div class="sk sk-avatar"></div><div class="sk sk-line w60"></div><div class="sk sk-line w90"></div><div class="sk sk-box"></div></div>`).join('');

  // ---------------- interações (delegação por raiz) ----------------
  async function react(group, kind) {
    if (!me) { BX.requireLogin(location.pathname + location.search); return; }
    const rt = group.dataset.rt, id = group.dataset.rid;
    try {
      const { reactions } = await BX.api(`/api/${rt === 'POST' ? 'posts' : 'comments'}/${id}/react`, { method: 'POST', body: { kind } });
      group.querySelectorAll('.react-btn').forEach((b) => { const k = b.dataset.kind; b.classList.toggle('on', reactions.mine === k); b.innerHTML = `${icon(REACT[k][0], 15)}${reactions.counts[k] ? `<span>${reactions.counts[k]}</span>` : ''}`; });
    } catch (e) { BX.toast(e.message); }
  }
  async function share(url) {
    try { if (navigator.share) await navigator.share({ url }); else { await navigator.clipboard.writeText(url); BX.toast('Link copiado!'); } } catch {}
  }
  async function copyDeck(btn) {
    if (!me) { BX.requireLogin(location.pathname + location.search); return; }
    btn.disabled = true;
    try {
      const r = await BX.api(`/api/decks/${btn.dataset.copyDeck}/copy`, { method: 'POST' });
      const box = btn.closest('.pc-deck'); const c = box?.querySelector('[data-copies]'); if (c) c.textContent = r.copyCount;
      BX.toast(r.counted ? 'Deck copiado para Meus decks (pasta "Copiados").' : 'Você já tinha copiado este deck — nova cópia salva em Meus decks.');
      btn.innerHTML = `${icon('check', 15)}Copiado`;
    } catch (e) { BX.toast(e.message); btn.disabled = false; }
  }
  function closeMenus(except) { document.querySelectorAll('.pc-menu:not([hidden])').forEach((m) => { if (m !== except) m.hidden = true; }); }
  document.addEventListener('click', (e) => { if (!e.target.closest('.pc-menu-wrap')) closeMenus(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });

  /**
   * Liga os handlers em um contêiner (uma vez). opts.onDeleted(id), opts.getPost(id) (para re-render da enquete).
   */
  function bind(root, opts = {}) {
    if (root.dataset.pcBound) return; root.dataset.pcBound = '1';
    root.addEventListener('click', async (e) => {
      const rb = e.target.closest('.react-btn'); if (rb) return react(rb.closest('.react-group'), rb.dataset.kind);
      const mb = e.target.closest('[data-menu]'); if (mb) { const m = mb.nextElementSibling; closeMenus(m); m.hidden = !m.hidden; return; }
      const sh = e.target.closest('[data-share]'); if (sh) { closeMenus(); return share(sh.dataset.share); }
      const rp = e.target.closest('[data-report]'); if (rp) { closeMenus(); return BX.report('POST', rp.dataset.report, 'este post'); }
      const cd = e.target.closest('[data-copy-deck]'); if (cd) return copyDeck(cd);
      const more = e.target.closest('[data-more]'); if (more) { more.previousElementSibling.classList.remove('clamp'); more.remove(); return; }
      const del = e.target.closest('[data-del]');
      if (del) {
        closeMenus();
        const ok = await BX.confirmDialog({ title: 'Excluir este post?', text: 'Ele é apagado do banco na hora, com comentários, reações e mídias. Não tem volta.', okLabel: 'Excluir', danger: true });
        if (!ok) return;
        try { await BX.api(`/api/posts/${del.dataset.del}`, { method: 'DELETE' }); BX.toast('Post excluído.'); const card = del.closest('.pc'); if (opts.onDeleted) opts.onDeleted(del.dataset.del, card); else card?.remove(); } catch (er) { BX.toast(er.message); }
        return;
      }
      const nav = e.target.closest('.carousel-nav');
      if (nav) { const t = nav.closest('[data-carousel]').querySelector('.carousel-track'); t.scrollBy({ left: +nav.dataset.dir * t.clientWidth, behavior: 'smooth' }); return; }
      const yt = e.target.closest('[data-yt]');
      if (yt) { yt.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${yt.dataset.yt}?autoplay=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Vídeo"></iframe>`; return; }
      const opt = e.target.closest('.poll-opt');
      if (opt && !opt.disabled) {
        if (!me) { BX.requireLogin(location.pathname); return; }
        const pid = opt.closest('[data-poll]').dataset.poll;
        try {
          const { poll } = await BX.api(`/api/posts/${pid}/vote`, { method: 'POST', body: { optionId: opt.dataset.opt } });
          const p = opts.getPost?.(pid) || { id: pid };
          p.poll = poll;
          opt.closest('.poll').outerHTML = pollHtml(p);
        } catch (er) { BX.toast(er.message); }
      }
    });
    root.addEventListener('scroll', (e) => {
      const t = e.target.closest?.('.carousel-track'); if (!t) return;
      const i = Math.round(t.scrollLeft / t.clientWidth); const c = t.parentElement;
      c.querySelectorAll('.carousel-dots i').forEach((d, j) => d.classList.toggle('on', j === i));
      const mc = c.querySelector('.media-count'); if (mc) mc.textContent = `${i + 1}/${t.children.length}`;
    }, true);
  }

  window.BXPost = { ready, card, skeleton, bind, mediaHtml, pollHtml, saleHtml, deckHtml, reactionsHtml, tagChip, timeAgo, linkify, REACT, get TAGS() { return TAGS; }, get me() { return me; } };
})();
