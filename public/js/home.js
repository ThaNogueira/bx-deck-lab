/* Home (item 8) + integrações do montador com a conta: widget de usuário,
   PartTags no meta e envio da coleção para o perfil. */
(() => {
  'use strict';
  const esc = BX.esc;

  // Shell de navegação (sidebar + topbar + menu do avatar)
  BX.renderShell().then(() => window.BXApp?.rerenderHeader?.());

  // Quando o índice de peças chega: PartTags no meta + catálogo completo no builder
  BX.partTagReady().then((idx) => {
    const apply = () => {
      window.BXApp?.rerenderMeta?.();
      const r = window.BXApp?.importCatalog?.(idx.list);
      if (r?.added) console.info(`[builder] +${r.added} peças do catálogo do site`);
    };
    if (window.BXApp) apply(); else document.addEventListener('bxapp-ready', apply, { once: true });
  }).catch(() => {});

  // ------------------------------------------------------------- Home / meta
  function usageStats(metaDecks) {
    const idx = BX.partTag._idx;
    const usage = new Map(); // partKey -> {part, count, recent, old}
    const half = Math.floor(metaDecks.length / 2);
    metaDecks.forEach((d, di) => {
      for (const combo of d.combos || []) {
        const tokens = String(combo).trim().split(/\s+/);
        let i = 0;
        while (i < tokens.length) {
          let matched = null;
          for (let len = Math.min(3, tokens.length - i); len >= 1; len--) {
            const p = idx?.byName.get(BX.norm(tokens.slice(i, i + len).join(' ')));
            if (p) { matched = { p, len }; break; }
          }
          if (matched) {
            const rec = usage.get(matched.p.id) || { part: matched.p, count: 0, recent: 0, old: 0 };
            rec.count++;
            if (di >= half) rec.recent++; else rec.old++;
            usage.set(matched.p.id, rec);
            i += matched.len;
          } else i++;
        }
      }
    });
    return [...usage.values()];
  }

  function trendIcon(rec) {
    const diff = rec.recent - rec.old;
    if (diff > 0) return `<span class="trend-up">▲ subindo</span>`;
    if (diff < 0) return `<span class="trend-down">▼ caindo</span>`;
    return `<span class="trend-flat">— estável</span>`;
  }

  // ------------------------------------------------- Nuvem de peças do meta
  // Quanto mais a peça aparece nos decks de torneio, maior a foto dela.
  let cloudFilter = 'all';

  /**
   * Presença no meta = índice do BBX Weekly (snapshot embutido, sempre
   * disponível) combinado com as aparições nos decks de torneio que o
   * montador baixa. Assim a nuvem já nasce cheia e fica mais precisa
   * conforme o usuário carrega mais decks na aba Decks populares.
   */
  function metaPresence() {
    const idx = BX.partTag._idx;
    if (!idx) return [];
    const byPart = new Map(); // id -> {part, score, count, recent, old, weekly}

    const weekly = window.BXApp?.getWeekly?.();
    for (const g of weekly?.groups || []) {
      for (const [name, val] of g.items) {
        const p = idx.byName.get(BX.norm(name));
        if (!p) continue;
        const rec = byPart.get(p.id) || { part: p, score: 0, count: 0, recent: 0, old: 0, weekly: 0 };
        rec.weekly = Math.max(rec.weekly, val);
        byPart.set(p.id, rec);
      }
    }

    const decks = window.BXApp?.getMetaDecks?.() || [];
    for (const s of usageStats(decks)) {
      const rec = byPart.get(s.part.id) || { part: s.part, score: 0, count: 0, recent: 0, old: 0, weekly: 0 };
      rec.count += s.count;
      rec.recent += s.recent;
      rec.old += s.old;
      byPart.set(s.part.id, rec);
    }

    const maxCount = Math.max(1, ...[...byPart.values()].map((r) => r.count));
    for (const rec of byPart.values()) {
      // índice semanal (0-100) vs. participação relativa nos decks baixados
      rec.score = Math.max(rec.weekly, Math.round((rec.count / maxCount) * 100));
    }
    return [...byPart.values()].filter((r) => r.score > 0);
  }

  // Um bloco por categoria; dentro dele as peças flutuam, as mais
  // relevantes maiores, com o nome boiando junto.
  const META_BLOCKS = [
    { key: 'BLADE', title: 'Blades', hint: 'a lâmina define o estilo do Bey', kinds: ['BLADE'] },
    { key: 'RATCHET', title: 'Ratchets', hint: 'altura e pontas de contato', kinds: ['RATCHET'] },
    { key: 'BIT', title: 'Bits', hint: 'como o Bey se move no estádio', kinds: ['BIT'] },
    { key: 'CX', title: 'Peças CX', hint: 'Lock Chip, Over, Main e Assist', kinds: ['LOCK_CHIP', 'OVER_BLADE', 'MAIN_BLADE', 'ASSIST_BLADE'] },
  ];

  function beyBubble(s, i, min, max) {
    const p = s.part;
    const t = max === min ? 1 : (s.score - min) / (max - min);
    const size = Math.round(52 + Math.pow(t, 0.62) * 74);  // 52px … 126px
    const dur = (11 + ((i * 37) % 60) / 10).toFixed(1);    // 11s … 16.9s (bem lento)
    const delay = -(((i * 53) % 70) / 10).toFixed(1);      // dessincroniza sem atrasar a entrada
    const drift = (i % 2 ? 1 : -1) * (2 + (i % 3));        // deriva lateral discreta
    const diff = s.recent - s.old;
    const trend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    const detalhe = [
      s.weekly ? `índice BBX Weekly ${s.weekly}` : '',
      s.count ? `${s.count} aparições em decks de torneio` : '',
    ].filter(Boolean).join(' • ');
    return `<a class="mbey${i === 0 ? ' top' : ''} trend-${trend}" href="/peca/${esc(p.slug)}"
        style="--s:${size}px;--dur:${dur}s;--delay:${delay}s;--dx:${drift}px;--d:${i * 55}ms"
        title="${esc(p.display)} — ${esc(detalhe || 'presente no meta')}">
      <span class="mfloat">
        <span class="morb">
          ${p.img ? `<img loading="lazy" src="${esc(p.img)}" alt="${esc(p.display)}">` : `<b>${esc((p.abbrev || p.display.slice(0, 2)).toUpperCase())}</b>`}
          <i class="mscore">${s.score}</i>
          ${i === 0 ? '<i class="mcrown">★</i>' : ''}
        </span>
        <span class="mname">${esc(p.display)}</span>
      </span>
    </a>`;
  }

  function renderMetaCloud() {
    const el = document.getElementById('metaCloud');
    if (!el) return false;
    const stats = metaPresence();
    if (!stats.length) return false;

    const blocks = META_BLOCKS
      .filter((b) => cloudFilter === 'all' || cloudFilter === b.key)
      .map((b) => {
        const items = stats.filter((s) => b.kinds.includes(s.part.kind)).sort((x, y) => y.score - x.score).slice(0, 12);
        if (!items.length) return '';
        const max = items[0].score;
        const min = items[items.length - 1].score;
        return `<section class="mblock">
          <header class="mblock-head">
            <div><h3>${b.title}</h3><small>${b.hint}</small></div>
            <span class="mblock-count">${items.length}</span>
          </header>
          <div class="mblock-field">${items.map((s, i) => beyBubble(s, i, min, max)).join('')}</div>
        </section>`;
      }).join('');

    el.innerHTML = blocks || '<div class="empty-state">Sem dados desta categoria ainda.</div>';
    return true;
  }

  function bindCloudSwitch() {
    const sw = document.getElementById('cloudSwitch');
    if (!sw || sw.dataset.ready) return;
    sw.dataset.ready = '1';
    sw.querySelectorAll('[data-cloud]').forEach((b) => b.addEventListener('click', () => {
      cloudFilter = b.dataset.cloud;
      sw.querySelectorAll('[data-cloud]').forEach((x) => x.classList.toggle('active', x === b));
      renderMetaCloud();
    }));
  }

  async function renderHome() {
    const chartsEl = document.getElementById('homeCharts');
    const featEl = document.getElementById('homeFeatured');
    if (!chartsEl) return;
    bindCloudSwitch();

    // Decks em destaque do site (comunidade)
    try {
      const { decks } = await BX.api('/api/decks-featured');
      featEl.innerHTML = decks.length ? `
        <div class="section-title-row" style="margin-bottom:12px">
          <div><p class="eyebrow">DO NOSSO SITE</p><h2>Decks em destaque da comunidade</h2></div>
          <a href="/decks" style="color:var(--cyan);font-size:11px;text-decoration:none">ver todos →</a>
        </div>
        <div class="card-grid" style="margin-bottom:22px">${decks.map((d) => `
          <a class="list-card" href="/deck/${d.slug}">
            <div style="display:flex;justify-content:space-between;gap:8px"><h3>${esc(d.title)}</h3>${d.featured ? '<span class="badge owned">★</span>' : ''}</div>
            ${BX.deckPreview(d.beys, { u: 54, parts: d.parts })}
            <div class="list-card-foot">
              <span class="author-line">${BX.avatarHtml(d.author, { size: 22 })}<span style="color:#c4cad3">${esc(d.author?.name || '?')}</span></span>
            </div>
          </a>`).join('')}</div>` : `
        <div class="source-banner" style="margin-bottom:22px">
          <strong>Decks da comunidade:</strong>
          <span>ninguém publicou ainda — <a href="/#builder" style="color:var(--cyan)">seja a primeira pessoa</a>! Decks publicados aparecem aqui na home.</span>
        </div>`;
    } catch { featEl.innerHTML = ''; }

    // Gráficos do meta a partir dos dados que o montador já carrega
    const renderCharts = () => {
      const metaDecks = window.BXApp?.getMetaDecks?.() || [];
      if (!metaDecks.length || !BX.partTag._idx) return false;
      const stats = usageStats(metaDecks);
      const byKind = (kind) => stats.filter((s) => s.part.kind === kind).sort((a, b) => b.count - a.count).slice(0, 8);
      const total = metaDecks.length;
      const colChart = (items, title, subtitle) => {
        const max = Math.max(1, ...items.map((s) => s.count));
        return `<div class="panel-card">
          <p class="eyebrow">${title}</p>
          <small style="color:var(--muted);font-size:10px">${subtitle}</small>
          <div style="margin-top:10px">${items.map((s, i) => `
            <div class="trend-row">
              <b style="color:#6f7784;font:800 10px var(--display)">#${i + 1}</b>
              <span>${BX.partTag(s.part, { size: 20 })}</span>
              <div style="height:5px;background:#252a34;border-radius:99px;overflow:hidden"><i style="display:block;height:100%;width:${(s.count / max) * 100}%;background:linear-gradient(90deg,var(--cyan),var(--red));border-radius:99px"></i></div>
              <span style="text-align:right"><b style="color:#c4cad3;font-size:11px">${s.count}</b> ${trendIcon(s)}</span>
            </div>`).join('') || '<div class="empty-state">Sem dados ainda.</div>'}</div>
        </div>`;
      };
      document.getElementById('homeCharts').innerHTML = [
        colChart(byKind('BLADE'), 'BLADES MAIS USADAS', `aparições em ${total} decks de meta (tendência: metade recente vs. antiga do cache)`),
        colChart(byKind('BIT'), 'BITS MAIS USADAS', `quantos decks de torneio usam cada ponta`),
        colChart(byKind('RATCHET'), 'RATCHETS MAIS USADAS', `frequência nos decks de meta carregados`),
        `<div class="panel-card">
          <p class="eyebrow">FONTES DO META</p>
          <p style="color:var(--muted);font-size:12px;line-height:1.7;margin:10px 0 0">
            Os números vêm dos decks de pódio e arquétipos que o site coleta de WBO, BBX DB, Beycrate, BBXHub e BeyBase
            (aba <b>Decks populares</b>). Quanto mais decks você carregar lá, mais preciso o retrato aqui.
            O índice de peças BBX Weekly fica na aba <b>Meta de peças</b>.
          </p>
        </div>`,
      ].join('');
      return true;
    };

    // A nuvem e os gráficos dependem do meta que o montador carrega em background
    if (!renderMetaCloud()) {
      let t1 = 0;
      const ct = setInterval(() => { if (renderMetaCloud() || ++t1 > 25) clearInterval(ct); }, 700);
    }
    if (!renderCharts()) {
      chartsEl.innerHTML = '<div class="empty-state" style="grid-column:1/-1">Carregando dados do meta…</div>';
      let tries = 0;
      const t = setInterval(() => {
        if (renderCharts() || ++tries > 20) clearInterval(t);
      }, 800);
    }
  }

  if (window.BXApp) renderHome();
  else document.addEventListener('bxapp-ready', renderHome, { once: true });

  // ------------------- Publicar o deck do builder na comunidade (item 4) ----
  // O builder é o único montador do site: /#builder redireciona para cá.

  function mapLocalPart(idx, appPart) {
    return idx.byName.get(BX.norm(appPart.display || appPart.name))
      || idx.byName.get(BX.norm(appPart.name))
      || (appPart.aliases || []).map((a) => idx.byName.get(BX.norm(a))).find(Boolean)
      || null;
  }

  async function openPublish() {
    const me = await BX.requireLogin('/#builder');
    if (!me) return;
    const idx = await BX.partTagReady();
    const slots = window.BXApp?.getDeck?.() || [];
    const filled = slots.filter((s) => s.parts.length);
    if (!filled.length) { BX.toast('Monte pelo menos um Bey antes de publicar.'); return; }

    const beys = [];
    const missing = [];
    for (const slot of filled) {
      const ids = [];
      for (const appPart of slot.parts) {
        const p = mapLocalPart(idx, appPart);
        if (p) ids.push(p.id);
        else missing.push(appPart.display || appPart.name);
      }
      if (ids.length) beys.push(ids);
    }
    if (!beys.length) { BX.toast('Não consegui casar as peças com o catálogo do site.'); return; }

    const modal = document.getElementById('publishModal');
    const editSlug = new URLSearchParams(location.search).get('editar');
    const visBox = document.getElementById('pubVisibility');
    if (visBox && !visBox.dataset.ready) {
      visBox.dataset.ready = '1';
      visBox.querySelectorAll('[data-public]').forEach((b) => b.addEventListener('click', () => {
        visBox.querySelectorAll('[data-public]').forEach((x) => x.classList.toggle('active', x === b));
      }));
    }
    document.getElementById('publishTitle').textContent = editSlug ? 'Atualizar deck' : 'Salvar deck';
    document.getElementById('pubSubmit').textContent = editSlug ? 'Salvar alterações' : 'Salvar deck';
    if (!document.getElementById('pubTitle').value) {
      document.getElementById('pubTitle').value = window.BXApp?.getDeckName?.() || '';
    }
    document.getElementById('pubPreview').innerHTML = `
      <div class="pub-beys">${filled.map((s, i) => `
        <div class="pub-bey"><b>Bey ${i + 1}</b><span>${esc(s.name === 'Bey incompleto' ? s.parts.map((p) => p.display).join(' ') : s.name)}</span></div>`).join('')}</div>
      ${missing.length ? `<p class="pub-warn">⚠ Fora do catálogo do site e não serão publicadas: ${missing.map(esc).join(', ')}</p>` : ''}`;
    modal.hidden = false;

    document.getElementById('publishClose').onclick = () => { modal.hidden = true; };
    document.getElementById('pubSubmit').onclick = async () => {
      const body = {
        title: document.getElementById('pubTitle').value,
        description: document.getElementById('pubDesc').value,
        launchGuide: document.getElementById('pubGuide').value,
        youtubeUrl: document.getElementById('pubVideo').value,
        folder: document.getElementById('pubFolder')?.value || '',
        isPublic: document.querySelector('#pubVisibility [data-public].active')?.dataset.public === '1',
        beys,
      };
      try {
        const saved = editSlug
          ? await BX.api(`/api/decks/${encodeURIComponent(document.getElementById('pubSubmit').dataset.deckId)}`, { method: 'PATCH', body })
          : await BX.api('/api/decks', { method: 'POST', body });
        modal.hidden = true;
        location.href = `/deck/${saved.deck.slug}`;
      } catch (e) { BX.toast(e.message); }
    };
  }

  document.getElementById('publishDeckBtn')?.addEventListener('click', openPublish);

  // Editar um deck publicado: /#builder?editar=slug carrega as peças no builder
  (async () => {
    const editSlug = new URLSearchParams(location.search).get('editar');
    if (!editSlug) return;
    try {
      const { deck } = await BX.api(`/api/decks/${encodeURIComponent(editSlug)}`);
      const beysNames = deck.beys.map((bey) => bey.map((id) => deck.parts?.[id]?.displayName || id));
      const apply = () => {
        window.BXApp.loadDeck(beysNames);
        window.BXApp.setDeckName(deck.title);
        document.getElementById('pubTitle').value = deck.title;
        document.getElementById('pubDesc').value = deck.description || '';
        document.getElementById('pubGuide').value = deck.launchGuide || '';
        document.getElementById('pubVideo').value = deck.youtubeUrl || '';
        document.getElementById('pubSubmit').dataset.deckId = deck.id;
        document.getElementById('pubFolder').value = deck.folder || '';
        document.querySelectorAll('#pubVisibility [data-public]').forEach((b) => {
          b.classList.toggle('active', b.dataset.public === (deck.isPublic ? '1' : '0'));
        });
        BX.toast(`Editando "${deck.title}" — altere e clique em Publicar para salvar.`);
      };
      if (window.BXApp) apply(); else document.addEventListener('bxapp-ready', apply, { once: true });
    } catch (e) { BX.toast(e.message); }
  })();

  // ------------------------- Arquivo pessoal resumido dentro do builder ----
  async function renderMyDecksPanel() {
    const el = document.getElementById('myDecksPanel');
    if (!el) return;
    const user = await BX.me().catch(() => null);
    if (!user) {
      el.innerHTML = '<div class="empty-state">Entre na sua conta para salvar decks — eles ficam guardados no site, públicos ou privados.</div>';
      return;
    }
    try {
      const { decks } = await BX.api('/api/decks?mine=1&sort=updated');
      el.innerHTML = decks.length
        ? decks.slice(0, 6).map((d) => `
          <div class="saved-deck">
            <div class="saved-deck-main">
              <h3><a href="/deck/${esc(d.slug)}" style="color:inherit;text-decoration:none">${esc(d.title)}</a></h3>
              <p>${d.isPublic ? '🌐 público' : '🔒 privado'}${d.folder ? ` • 📁 ${esc(d.folder)}` : ''} • ${d.beys.length} Bey(s)</p>
            </div>
            <div class="saved-deck-actions">
              <a class="icon-btn" href="/?editar=${esc(d.slug)}#builder" title="Carregar no builder">↺</a>
            </div>
          </div>`).join('')
        : '<div class="empty-state">Nenhum deck ainda — monte um e clique em <b>Salvar deck</b>.</div>';
    } catch { el.innerHTML = ''; }
  }
  if (document.getElementById('myDecksPanel')) {
    renderMyDecksPanel();
    document.addEventListener('bx-deck-saved', renderMyDecksPanel);
  }

  // ------------------- Coleção: aba "Produtos" (adiciona as peças do produto) ----
  (() => {
    const tabs = document.getElementById('colTabs');
    if (!tabs) return;
    tabs.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      tabs.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
      document.getElementById('colTabParts').hidden = b.dataset.tab !== 'parts';
      document.getElementById('colTabProducts').hidden = b.dataset.tab !== 'products';
    }));

    const input = document.getElementById('colProductSearch');
    const results = document.getElementById('colProductResults');
    const added = document.getElementById('colProductAdded');
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { results.innerHTML = '<div class="empty-state">Digite ao menos 2 letras.</div>'; return; }
      timer = setTimeout(async () => {
        try {
          const { products } = await BX.api(`/api/products?query=${encodeURIComponent(q)}`);
          results.innerHTML = products.length
            ? products.slice(0, 24).map((p) => `
              <button class="col-product" data-slug="${esc(p.slug)}" title="Adicionar as peças de ${esc(p.name)}">
                <span class="product-mini-photo">${p.imageUrl ? `<img loading="lazy" src="${esc(p.imageUrl)}" alt="">` : `<b>${esc((p.code || p.name.slice(0, 2)).toUpperCase())}</b>`}</span>
                <span class="col-product-text"><b>${esc(p.name)}</b><small>${p.code ? esc(p.code) + ' • ' : ''}${p.brand === 'HASBRO' ? 'Hasbro' : 'Takara Tomy'}${p.category ? ' • ' + p.category.toLowerCase().replace('_', ' ') : ''}</small></span>
                <span class="col-product-add">＋</span>
              </button>`).join('')
            : '<div class="empty-state">Nenhum produto com esse nome.</div>';
          results.querySelectorAll('.col-product').forEach((b) => b.addEventListener('click', async () => {
            b.disabled = true;
            try {
              const { product, partsByKind } = await BX.api(`/api/products/${b.dataset.slug}`);
              const parts = partsByKind.flatMap((g) => g.parts);
              if (!parts.length) { BX.toast('Esse produto ainda não tem as peças mapeadas no catálogo.'); return; }
              const r = window.BXApp.addProductParts(parts);
              BX.toast(`${product.name}: ${r.added} peça(s) adicionada(s) à coleção.`);
              added.innerHTML = `<div class="col-added"><b>✓ ${esc(product.name)}</b><span>${parts.map((p) => BX.partTag({ ...p, display: p.displayName, img: p.imageUrl }, { size: 22 })).join('')}</span></div>` + added.innerHTML;
            } catch (e) { BX.toast(e.message); }
            finally { b.disabled = false; }
          }));
        } catch (e) { results.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; }
      }, 300);
    });
  })();

  // --------------------------------------------- Coleção -> perfil (item 9)
  document.getElementById('sendCollectionBtn')?.addEventListener('click', async () => {
    const me = await BX.me().catch(() => null);
    if (!me) {
      BX.toast('Entre na sua conta para enviar a coleção.');
      setTimeout(() => { location.href = '/entrar'; }, 900);
      return;
    }
    const idx = await BX.partTagReady();
    const inventory = window.BXApp?.getInventory?.() || {};
    const items = [];
    let unmatched = 0;
    for (const [appId, qty] of Object.entries(inventory)) {
      if (!qty) continue;
      const appPart = window.BXApp.getPart(appId);
      if (!appPart) continue;
      const p = idx.byName.get(BX.norm(appPart.display || appPart.name)) || idx.byName.get(BX.norm(appPart.name));
      if (p) items.push({ partId: p.id, qty });
      else unmatched++;
    }
    if (!items.length) { BX.toast('Sua coleção local está vazia.'); return; }
    try {
      const r = await BX.api('/api/me/collection', { method: 'PUT', body: { items } });
      BX.toast(`Coleção enviada: ${r.count} peça(s) no seu perfil${unmatched ? ` (${unmatched} sem correspondência no catálogo do site)` : ''}. Gerencie vendas em /perfil.`);
    } catch (e) { BX.toast(e.message); }
  });
})();
