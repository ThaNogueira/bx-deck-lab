/* Home (item 8) + integrações do montador com a conta: widget de usuário,
   PartTags no meta e envio da coleção para o perfil. */
(() => {
  'use strict';
  const esc = BX.esc;

  // Shell de navegação (sidebar + topbar + menu do avatar)
  BX.renderShell().then(() => window.BXApp?.rerenderHeader?.());

  // Quando o índice de peças chega, os nomes do meta viram PartTags clicáveis
  BX.partTagReady().then(() => window.BXApp?.rerenderMeta?.()).catch(() => {});

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

  async function renderHome() {
    const chartsEl = document.getElementById('homeCharts');
    const featEl = document.getElementById('homeFeatured');
    if (!chartsEl) return;

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
            <div class="combo-tags">${d.beys.flat().slice(0, 6).map((id) => {
              const p = d.parts?.[id];
              return p ? BX.partTag({ ...p, display: p.displayName, img: p.imageUrl }, { size: 20 }) : '';
            }).join('')}${d.beys.flat().length > 6 ? `<span class="ptag plain">+${d.beys.flat().length - 6}</span>` : ''}</div>
            <div class="list-card-foot">
              <span class="author-line">${BX.avatarHtml(d.author, { size: 22 })}<span style="color:#c4cad3">${esc(d.author?.name || '?')}</span></span>
            </div>
          </a>`).join('')}</div>` : `
        <div class="source-banner" style="margin-bottom:22px">
          <strong>Decks da comunidade:</strong>
          <span>ninguém publicou ainda — <a href="/deck-novo" style="color:var(--cyan)">seja a primeira pessoa</a>! Decks publicados aparecem aqui na home.</span>
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
