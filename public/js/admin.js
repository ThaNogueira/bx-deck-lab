/* Painel de admin (item 2) — SPA leve com uma seção por área. */
(async () => {
  'use strict';
  BX.renderTopbar(null);
  const me = await BX.requireLogin('/admin');
  if (!me) return;
  const app = document.getElementById('app');
  if (!['MOD', 'ADMIN'].includes(me.role)) {
    app.innerHTML = '<div class="empty-state">Este painel é só para a equipe de moderação/administração.</div>';
    return;
  }
  const isAdmin = me.role === 'ADMIN';
  await BX.partTagReady();
  const esc = BX.esc;
  const cents = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 100) : null; };

  const SECTIONS = [
    ['dash', '📊 Dashboard', true],
    ['users', '👥 Usuários', isAdmin],
    ['moderation', '🛡 Moderação', true],
    ['reports', '⚑ Denúncias', true],
    ['parts', '🔩 Peças', isAdmin],
    ['products', '📦 Produtos', isAdmin],
    ['tournaments', '🏆 Torneios', true],
    ['market', '💰 Vendas', true],
    ['cosmetics', '🎨 Cosméticos', isAdmin],
    ['home', '🏠 Home & meta', isAdmin],
    ['settings', '⚙ Configurações', isAdmin],
    ['logs', '📜 Logs', true],
  ];
  let section = location.hash.slice(1) || 'dash';

  app.innerHTML = `
    <div class="hero compact" style="margin-bottom:18px">
      <div><p class="eyebrow">ACESSO RESTRITO • ${esc(me.role)}</p><h1>Painel de <em>admin</em></h1></div>
    </div>
    <div class="admin-layout">
      <nav class="admin-nav" id="adminNav">
        ${SECTIONS.filter(([, , show]) => show).map(([k, label]) => `<button data-sec="${k}" class="${k === section ? 'active' : ''}">${label}</button>`).join('')}
      </nav>
      <div id="secBox"></div>
    </div>`;
  const box = document.getElementById('secBox');
  document.querySelectorAll('[data-sec]').forEach((b) => b.addEventListener('click', () => {
    section = b.dataset.sec;
    location.hash = section;
    document.querySelectorAll('[data-sec]').forEach((x) => x.classList.toggle('active', x === b));
    render();
  }));

  const on = (sel, ev, fn) => box.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, () => fn(el)));
  const act = (fn) => async (el) => { try { await fn(el); render(); } catch (e) { BX.toast(e.message); } };
  const chart = (series, cls = '') => {
    const max = Math.max(1, ...series.map((s) => s.count));
    return `<div class="chart ${cls}">${series.map((s) => `<i style="height:${Math.max(2, (s.count / max) * 100)}%" data-tip="${s.day.slice(5)}: ${s.count}"></i>`).join('')}</div>`;
  };

  async function render() {
    box.innerHTML = '<div class="empty-state">Carregando…</div>';
    try { await RENDER[section](); } catch (e) { box.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; }
  }

  const RENDER = {
    // ----------------------------------------------------------- 2.1 Dashboard
    async dash() {
      const s = await BX.api('/api/admin/stats');
      box.innerHTML = `
        <div class="stat-tiles">
          <div class="stat-tile"><b>${s.totals.users}</b><small>usuários</small></div>
          <div class="stat-tile"><b>${s.totals.newUsers30d}</b><small>novos (30d)</small></div>
          <div class="stat-tile"><b>${s.totals.decks}</b><small>decks publicados</small></div>
          <div class="stat-tile"><b>${s.totals.tournamentsActive}</b><small>torneios ativos</small></div>
          <div class="stat-tile"><b>${s.totals.listings}</b><small>anúncios à venda</small></div>
          <div class="stat-tile"><b style="color:${s.totals.reportsOpen ? 'var(--red)' : 'inherit'}">${s.totals.reportsOpen}</b><small>denúncias abertas</small></div>
        </div>
        <div class="home-grid">
          <div class="panel-card"><p class="eyebrow">ACESSOS POR DIA (30D)</p>${chart(s.trafficSeries)}</div>
          <div class="panel-card"><p class="eyebrow">NOVOS CADASTROS (30D)</p>${chart(s.signupsSeries, 'green')}</div>
          <div class="panel-card"><p class="eyebrow">DECKS PUBLICADOS (30D)</p>${chart(s.decksSeries, 'red')}</div>
        </div>`;
    },

    // ----------------------------------------------------------- 2.2 Usuários
    async users() {
      const q = box.dataset.q || '';
      const { users } = await BX.api(`/api/admin/users?query=${encodeURIComponent(q)}&role=${box.dataset.role || ''}&status=${box.dataset.status || ''}`);
      box.innerHTML = `
        <div class="page-toolbar">
          <input id="uq" placeholder="Buscar nome, e-mail ou @…" value="${esc(q)}" />
          <select id="urole"><option value="">Todos os cargos</option>${['USER', 'ORGANIZER', 'MOD', 'ADMIN'].map((r) => `<option ${box.dataset.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
          <select id="ustatus"><option value="">Todos os status</option>${['ACTIVE', 'SUSPENDED', 'BANNED'].map((r) => `<option ${box.dataset.status === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
        </div>
        <div class="table-wrap"><table class="data-table"><thead>
          <tr><th>Usuário</th><th>E-mail</th><th>Cargo</th><th>Status</th><th>Cadastro</th><th>Ações</th></tr></thead><tbody>
          ${users.map((u) => `<tr>
            <td><span class="standing-player">${BX.avatarHtml(u, { size: 26 })}<a href="/u/${u.slug}" target="_blank" style="color:white">${esc(u.name)}</a>${u.verified ? ' <span class="badge ok">✔</span>' : ''}</span></td>
            <td class="mono">${esc(u.email)}</td>
            <td><select data-role-of="${u.id}" style="height:28px;width:110px">${['USER', 'ORGANIZER', 'MOD', 'ADMIN'].map((r) => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
            <td><span class="status-chip ${u.status}">${u.status}</span>${u.suspendedUntil ? `<small style="display:block;color:var(--muted)">até ${BX.dateFmt(u.suspendedUntil, { day: '2-digit', month: 'short' })}</small>` : ''}</td>
            <td>${BX.dateFmt(u.createdAt, { day: '2-digit', month: 'short', year: '2-digit' })}</td>
            <td><div class="row-actions">
              <button class="btn secondary" data-edit="${u.id}">Editar</button>
              <button class="btn secondary" data-verify="${u.id}:${!u.verified}">${u.verified ? 'Tirar selo' : '✔ Verificar'}</button>
              ${u.status === 'ACTIVE'
                ? `<button class="btn secondary" data-suspend="${u.id}">Suspender</button><button class="btn danger-outline" data-ban="${u.id}">Banir</button>`
                : `<button class="btn secondary" data-activate="${u.id}">Reativar</button>`}
              <button class="btn secondary" data-resetmedia="${u.id}">Resetar mídia</button>
              <button class="btn danger-outline" data-del="${u.id}:${esc(u.email)}">Excluir</button>
            </div></td>
          </tr>`).join('')}
        </tbody></table></div>
        <div class="modal-backdrop" id="editModal" hidden><div class="modal">
          <button class="modal-close" id="editClose">×</button><h2>Editar usuário</h2>
          <div class="form-grid" id="editForm"></div>
        </div></div>`;

      let t;
      on('#uq', 'input', (el) => { clearTimeout(t); t = setTimeout(() => { box.dataset.q = el.value; render(); }, 350); });
      on('#urole', 'change', (el) => { box.dataset.role = el.value; render(); });
      on('#ustatus', 'change', (el) => { box.dataset.status = el.value; render(); });
      on('[data-role-of]', 'change', act((el) => BX.api(`/api/admin/users/${el.dataset.roleOf}`, { method: 'PATCH', body: { role: el.value } })));
      on('[data-verify]', 'click', act((el) => { const [id, v] = el.dataset.verify.split(':'); return BX.api(`/api/admin/users/${id}`, { method: 'PATCH', body: { verified: v === 'true' } }); }));
      on('[data-suspend]', 'click', act((el) => {
        const reason = prompt('Motivo da suspensão:'); if (reason == null) return Promise.resolve();
        const days = prompt('Duração em dias (ex.: 7):', '7');
        return BX.api(`/api/admin/users/${el.dataset.suspend}/status`, { method: 'POST', body: { status: 'SUSPENDED', reason, days } });
      }));
      on('[data-ban]', 'click', act((el) => {
        const reason = prompt('Motivo do ban PERMANENTE:'); if (reason == null) return Promise.resolve();
        return BX.api(`/api/admin/users/${el.dataset.ban}/status`, { method: 'POST', body: { status: 'BANNED', reason } });
      }));
      on('[data-activate]', 'click', act((el) => BX.api(`/api/admin/users/${el.dataset.activate}/status`, { method: 'POST', body: { status: 'ACTIVE' } })));
      on('[data-resetmedia]', 'click', act((el) => {
        const what = prompt('Resetar o quê? (avatar, banner, nome — separe por vírgula)', 'avatar');
        if (!what) return Promise.resolve();
        return BX.api(`/api/admin/users/${el.dataset.resetmedia}/reset-media`, { method: 'POST', body: { avatar: /avatar/.test(what), banner: /banner/.test(what), name: /nome/.test(what) } });
      }));
      on('[data-del]', 'click', act((el) => {
        const [id, email] = el.dataset.del.split(':');
        const typed = prompt(`⚠ EXCLUSÃO DEFINITIVA da conta e de todo o conteúdo.\nPara confirmar, digite o e-mail exato:\n${email}`);
        if (typed == null) return Promise.resolve();
        return BX.api(`/api/admin/users/${id}`, { method: 'DELETE', body: { confirmEmail: typed } });
      }));
      on('[data-edit]', 'click', async (el) => {
        const { user } = await BX.api(`/api/admin/users/${el.dataset.edit}`);
        const modal = box.querySelector('#editModal');
        box.querySelector('#editForm').innerHTML = `
          <div><label>Nome</label><input id="mName" value="${esc(user.name)}" /></div>
          <div><label>Bio</label><textarea id="mBio">${esc(user.bio || '')}</textarea></div>
          <div><label>WhatsApp</label><input id="mWhats" value="${esc(user.whatsapp || '')}" /></div>
          <div class="config-check"><input type="checkbox" id="mCanSell" ${user.canSell ? 'checked' : ''} /> <span>Pode vender no marketplace</span></div>
          <div class="inline-actions"><button class="btn primary" id="mSave">Salvar</button></div>`;
        modal.hidden = false;
        box.querySelector('#editClose').onclick = () => { modal.hidden = true; };
        box.querySelector('#mSave').onclick = act(() => BX.api(`/api/admin/users/${user.id}`, {
          method: 'PATCH',
          body: {
            name: box.querySelector('#mName').value,
            bio: box.querySelector('#mBio').value,
            whatsapp: box.querySelector('#mWhats').value,
            canSell: box.querySelector('#mCanSell').checked,
          },
        }));
      });
    },

    // ----------------------------------------------------- 2.3 Moderação (fila)
    async moderation() {
      const q = await BX.api('/api/admin/moderation/queue');
      const row = (type, id, label, meta, hidden) => `
        <div class="org-match-row ${hidden ? 'done' : ''}">
          <b style="font:800 10px var(--display);color:var(--cyan)">${type.toUpperCase()}</b>
          <div style="font-size:12px"><b>${label}</b><small style="display:block;color:var(--muted)">${meta}</small></div>
          <div class="row-actions">
            <button class="btn secondary" data-vis="${type}:${id}:${!hidden}">${hidden ? 'Mostrar' : 'Ocultar'}</button>
            <button class="btn danger-outline" data-delc="${type}:${id}">Excluir</button>
          </div>
        </div>`;
      box.innerHTML = `
        <div class="panel-card" style="margin-bottom:14px"><p class="eyebrow">FILA DE MODERAÇÃO — CONTEÚDO RECENTE</p>
          <div style="margin-top:10px">
            ${q.decks.map((d) => row('deck', d.id, `<a href="/deck/${d.slug}" target="_blank" style="color:white">${esc(d.title)}</a>`, `por ${esc(d.author?.name)} • ${BX.dateFmt(d.createdAt)}`, d.status === 'HIDDEN')).join('')}
            ${q.combos.map((c) => row('combo', c.id, esc(c.title), `por ${esc(c.author?.name)}${c.forSale ? ' • à venda' : ''}`, c.status === 'HIDDEN')).join('')}
            ${q.listings.map((l) => row('listing', l.id, `${esc(l.part)} ${l.priceCents != null ? `— ${BX.money(l.priceCents)}` : ''}`, `vendedor: ${esc(l.seller?.name)}`, l.hidden)).join('')}
            ${!q.decks.length && !q.combos.length && !q.listings.length ? '<div class="empty-state">Nada na fila. 🎉</div>' : ''}
          </div>
        </div>
        <div class="panel-card"><p class="eyebrow">PERFIS NOVOS</p>
          <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
            ${q.newUsers.map((u) => `<a class="user-chip" href="/u/${u.slug}" target="_blank">${BX.avatarHtml(u, { size: 28 })}<span>${esc(u.name)}</span></a>`).join('')}
          </div>
        </div>`;
      on('[data-vis]', 'click', act((el) => { const [type, id, hidden] = el.dataset.vis.split(':'); return BX.api(`/api/admin/content/${type}/${id}/visibility`, { method: 'POST', body: { hidden: hidden === 'true' } }); }));
      on('[data-delc]', 'click', act((el) => { const [type, id] = el.dataset.delc.split(':'); return confirm('Excluir definitivamente?') ? BX.api(`/api/admin/content/${type}/${id}`, { method: 'DELETE' }) : Promise.resolve(); }));
    },

    // ------------------------------------------------------- 2.3 Denúncias
    async reports() {
      const status = box.dataset.rstatus || 'OPEN';
      const { reports } = await BX.api(`/api/admin/reports?status=${status}`);
      box.innerHTML = `
        <div class="pill-toggle" style="margin-bottom:14px">${['OPEN', 'RESOLVED', 'IGNORED', 'ALL'].map((s) => `<button data-rs="${s}" class="${status === s ? 'active' : ''}">${{ OPEN: 'Abertas', RESOLVED: 'Resolvidas', IGNORED: 'Ignoradas', ALL: 'Todas' }[s]}</button>`).join('')}</div>
        ${reports.map((r) => `
          <div class="org-match-row ${r.status !== 'OPEN' ? 'done' : ''}">
            <b style="font:800 10px var(--display);color:var(--orange)">${r.targetType}</b>
            <div style="font-size:12px">
              <b>${esc(r.reason)}</b>
              <small style="display:block;color:var(--muted)">alvo: <span class="mono">${esc(r.targetId)}</span> • por ${esc(r.reporter?.name || 'anônimo')} • ${BX.dateFmt(r.createdAt)}${r.resolution ? ` • resolução: ${esc(r.resolution)}` : ''}</small>
            </div>
            ${r.status === 'OPEN' ? `<div class="row-actions">
              <button class="btn secondary" data-resolve="${r.id}:RESOLVED">Resolver</button>
              <button class="btn secondary" data-resolve="${r.id}:IGNORED">Ignorar</button>
            </div>` : `<span class="status-chip">${r.status}</span>`}
          </div>`).join('') || '<div class="empty-state">Nenhuma denúncia aqui. 🎉</div>'}`;
      on('[data-rs]', 'click', (el) => { box.dataset.rstatus = el.dataset.rs; render(); });
      on('[data-resolve]', 'click', act((el) => {
        const [id, status2] = el.dataset.resolve.split(':');
        const resolution = status2 === 'RESOLVED' ? prompt('O que foi feito? (opcional)') || '' : '';
        return BX.api(`/api/admin/reports/${id}/resolve`, { method: 'POST', body: { status: status2, resolution } });
      }));
    },

    // ---------------------------------------------------------- 2.4 Peças
    async parts() {
      const q = box.dataset.pq || '';
      const { parts } = await BX.api(`/api/parts?query=${encodeURIComponent(q)}&kind=${box.dataset.pkind || ''}`);
      const KINDS = ['BLADE', 'LOCK_CHIP', 'OVER_BLADE', 'MAIN_BLADE', 'ASSIST_BLADE', 'RATCHET', 'BIT'];
      box.innerHTML = `
        <div class="page-toolbar">
          <input id="pq" placeholder="Buscar peça…" value="${esc(q)}" />
          <select id="pkind"><option value="">Todas</option>${KINDS.map((k) => `<option ${box.dataset.pkind === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
          <button class="btn primary" id="newPart">+ Nova peça</button>
          <button class="btn secondary" id="mergeParts">⇄ Mesclar duplicadas</button>
        </div>
        <div class="table-wrap"><table class="data-table"><thead>
          <tr><th>Peça</th><th>Categoria</th><th>Tipo</th><th>Flags</th><th>Ações</th></tr></thead><tbody>
          ${parts.map((p) => `<tr>
            <td><span class="standing-player">${BX.partThumb({ ...p, img: p.imageUrl }, 26)}<b>${esc(p.displayName)}</b><small class="mono" style="color:var(--muted)">${esc(p.name)}</small></span></td>
            <td>${p.kind}${p.subKind ? ` <small>(${p.subKind})</small>` : ''}</td>
            <td>${p.type || '—'}</td>
            <td>${p.banned ? '<span class="badge banned">banida</span>' : ''}${p.hidden ? '<span class="badge">oculta</span>' : ''}</td>
            <td><div class="row-actions">
              <button class="btn secondary" data-editpart='${esc(JSON.stringify({ id: p.id }))}'>Editar</button>
              <label class="btn secondary" style="cursor:pointer">Imagem<input type="file" hidden accept="image/*" data-img="${p.id}"></label>
              <button class="btn danger-outline" data-delpart="${p.id}">Excluir</button>
            </div></td>
          </tr>`).join('')}
        </tbody></table></div>
        <div class="modal-backdrop" id="partModal" hidden><div class="modal">
          <button class="modal-close" id="pmClose">×</button><h2 id="pmTitle">Peça</h2>
          <div class="form-grid">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div><label>Nome canônico (TT)</label><input id="pmName" /></div>
              <div><label>Nome exibido</label><input id="pmDisplay" /></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
              <div><label>Categoria</label><select id="pmKind">${KINDS.map((k) => `<option>${k}</option>`).join('')}</select></div>
              <div><label>Tipo</label><select id="pmType"><option value="">—</option><option>Attack</option><option>Defense</option><option>Stamina</option><option>Balance</option></select></div>
              <div><label>Sigla</label><input id="pmAbbrev" /></div>
            </div>
            <div><label>Apelidos (separados por vírgula — ex.: nome Hasbro)</label><input id="pmAliases" /></div>
            <div><label>Comportamento / descrição</label><textarea id="pmBehavior"></textarea></div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
              ${['atk', 'def', 'sta', 'dash'].map((k) => `<div><label>${k.toUpperCase()}</label><input id="pm_${k}" type="number" min="0" max="100" /></div>`).join('')}
            </div>
            <div class="config-check"><input type="checkbox" id="pmBanned" /> <span>Banida por padrão (WBO)</span></div>
            <div class="config-check"><input type="checkbox" id="pmHidden" /> <span>Oculta do site</span></div>
            <div class="inline-actions"><button class="btn primary" id="pmSave">Salvar</button></div>
          </div>
        </div></div>`;

      let t;
      on('#pq', 'input', (el) => { clearTimeout(t); t = setTimeout(() => { box.dataset.pq = el.value; render(); }, 350); });
      on('#pkind', 'change', (el) => { box.dataset.pkind = el.value; render(); });
      on('[data-img]', 'change', act(async (el) => {
        const fd = new FormData();
        fd.append('file', el.files[0]);
        return BX.api(`/api/admin/parts/${el.dataset.img}/image`, { method: 'POST', body: fd });
      }));
      on('[data-delpart]', 'click', act((el) => confirm('Excluir esta peça? Ela some das coleções e relações.') ? BX.api(`/api/admin/parts/${el.dataset.delpart}`, { method: 'DELETE' }) : Promise.resolve()));
      on('#mergeParts', 'click', act(() => {
        const from = prompt('Nome/slug da peça DUPLICADA (que será apagada):');
        const to = from != null ? prompt('Nome/slug da peça CANÔNICA (que fica):') : null;
        if (!from || !to) return Promise.resolve();
        const idx = BX.partTag._idx;
        const f = idx.byName.get(BX.norm(from)); const g = idx.byName.get(BX.norm(to));
        if (!f || !g) { BX.toast('Peça não encontrada pelo nome.'); return Promise.resolve(); }
        return BX.api('/api/admin/parts/merge', { method: 'POST', body: { fromId: f.id, toId: g.id } }).then(() => { BX.partTag._idx = null; return BX.partTagReady(); });
      }));

      const modal = box.querySelector('#partModal');
      let editing = null;
      function openModal(p) {
        editing = p;
        box.querySelector('#pmTitle').textContent = p ? `Editar: ${p.displayName}` : 'Nova peça';
        box.querySelector('#pmName').value = p?.name || '';
        box.querySelector('#pmDisplay').value = p?.displayName || '';
        box.querySelector('#pmKind').value = p?.kind || 'BLADE';
        box.querySelector('#pmType').value = p?.type || '';
        box.querySelector('#pmAbbrev').value = p?.abbrev || '';
        box.querySelector('#pmAliases').value = (p?.aliases || []).join(', ');
        box.querySelector('#pmBehavior').value = p?.behavior || p?.note || '';
        for (const k of ['atk', 'def', 'sta', 'dash']) box.querySelector(`#pm_${k}`).value = p?.stats?.[k] ?? '';
        box.querySelector('#pmBanned').checked = !!p?.banned;
        box.querySelector('#pmHidden').checked = !!p?.hidden;
        modal.hidden = false;
      }
      box.querySelector('#pmClose').onclick = () => { modal.hidden = true; };
      box.querySelector('#newPart').onclick = () => openModal(null);
      on('[data-editpart]', 'click', (el) => {
        const { id } = JSON.parse(el.dataset.editpart);
        openModal(parts.find((p) => p.id === id));
      });
      box.querySelector('#pmSave').onclick = act(() => {
        const stats = {};
        let hasStats = false;
        for (const k of ['atk', 'def', 'sta', 'dash']) {
          const v = parseFloat(box.querySelector(`#pm_${k}`).value);
          if (Number.isFinite(v)) { stats[k] = v; hasStats = true; }
        }
        const body = {
          name: box.querySelector('#pmName').value,
          displayName: box.querySelector('#pmDisplay').value,
          kind: box.querySelector('#pmKind').value,
          type: box.querySelector('#pmType').value || null,
          abbrev: box.querySelector('#pmAbbrev').value,
          aliases: box.querySelector('#pmAliases').value.split(',').map((s) => s.trim()).filter(Boolean),
          behavior: box.querySelector('#pmBehavior').value,
          stats: hasStats ? stats : null,
          banned: box.querySelector('#pmBanned').checked,
          hidden: box.querySelector('#pmHidden').checked,
        };
        return (editing
          ? BX.api(`/api/admin/parts/${editing.id}`, { method: 'PATCH', body })
          : BX.api('/api/admin/parts', { method: 'POST', body })
        ).then(() => { BX.partTag._idx = null; return BX.partTagReady(); });
      });
    },

    // -------------------------------------------------------- 2.4 Produtos
    async products() {
      const q = box.dataset.prq || '';
      const { products } = await BX.api(`/api/products?query=${encodeURIComponent(q)}&line=${box.dataset.prline || ''}`);
      box.innerHTML = `
        <div class="page-toolbar">
          <input id="prq" placeholder="Buscar produto…" value="${esc(q)}" />
          <select id="prline"><option value="">Todas as linhas</option>${['BX', 'UX', 'CX', 'HASBRO', 'OTHER'].map((l) => `<option ${box.dataset.prline === l ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <button class="btn primary" id="newProd">+ Novo produto</button>
        </div>
        <div class="table-wrap"><table class="data-table"><thead>
          <tr><th>Código</th><th>Produto</th><th>Marca</th><th>Categoria</th><th>Ações</th></tr></thead><tbody>
          ${products.map((p) => `<tr>
            <td class="mono">${esc(p.code || '—')}</td>
            <td><a href="/produto/${p.slug}" target="_blank" style="color:white;font-weight:700">${esc(p.name)}</a>${p.hidden ? ' <span class="badge">oculto</span>' : ''}</td>
            <td>${p.brand === 'TAKARA_TOMY' ? 'Takara Tomy' : p.brand === 'HASBRO' ? 'Hasbro' : '—'}</td>
            <td>${(p.category || '—').toLowerCase().replace('_', ' ')}</td>
            <td><div class="row-actions">
              <button class="btn secondary" data-editprod="${p.id}">Editar</button>
              <button class="btn secondary" data-relation="${p.id}">🔩 Peças</button>
              <label class="btn secondary" style="cursor:pointer">Imagem<input type="file" hidden accept="image/*" data-pimg="${p.id}"></label>
              <button class="btn danger-outline" data-delprod="${p.id}">Excluir</button>
            </div></td>
          </tr>`).join('')}
        </tbody></table></div>
        <div class="modal-backdrop" id="prodModal" hidden><div class="modal">
          <button class="modal-close" id="prClose">×</button><h2 id="prTitle">Produto</h2>
          <div class="form-grid">
            <div><label>Nome</label><input id="prName" /></div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
              <div><label>Código (BX-01…)</label><input id="prCode" /></div>
              <div><label>Linha</label><select id="prLine"><option value="">—</option>${['BX', 'UX', 'CX', 'HASBRO', 'OTHER'].map((l) => `<option>${l}</option>`).join('')}</select></div>
              <div><label>Marca</label><select id="prBrand"><option value="TAKARA_TOMY">Takara Tomy</option><option value="HASBRO">Hasbro</option><option value="OTHER">Outra</option></select></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div><label>Categoria</label><select id="prCat"><option value="">—</option>${['STARTER', 'BOOSTER', 'RANDOM_BOOSTER', 'SET', 'ACCESSORY'].map((c) => `<option>${c}</option>`).join('')}</select></div>
              <div><label>Lançamento</label><input id="prDate" type="date" /></div>
            </div>
            <div><label>Notas</label><input id="prNotes" /></div>
            <div class="config-check"><input type="checkbox" id="prHidden" /> <span>Oculto do site</span></div>
            <div class="inline-actions"><button class="btn primary" id="prSave">Salvar</button></div>
          </div>
        </div></div>
        <div class="modal-backdrop" id="relModal" hidden><div class="modal">
          <button class="modal-close" id="relClose">×</button><h2 id="relTitle">Peças do produto</h2>
          <p style="color:var(--muted);font-size:11px;margin:0 0 10px">Essa relação alimenta o “onde encontrar” das páginas de peça (item 5).</p>
          <input id="relSearch" placeholder="Buscar peça para adicionar…" />
          <div id="relResults" style="display:flex;flex-direction:column;gap:4px;margin-top:6px;max-height:170px;overflow:auto"></div>
          <div id="relParts" class="combo-tags" style="margin-top:12px"></div>
          <div class="inline-actions" style="margin-top:14px"><button class="btn primary" id="relSave">Salvar relação</button></div>
        </div></div>`;

      let t;
      on('#prq', 'input', (el) => { clearTimeout(t); t = setTimeout(() => { box.dataset.prq = el.value; render(); }, 350); });
      on('#prline', 'change', (el) => { box.dataset.prline = el.value; render(); });
      on('[data-pimg]', 'change', act((el) => { const fd = new FormData(); fd.append('file', el.files[0]); return BX.api(`/api/admin/products/${el.dataset.pimg}/image`, { method: 'POST', body: fd }); }));
      on('[data-delprod]', 'click', act((el) => confirm('Excluir este produto?') ? BX.api(`/api/admin/products/${el.dataset.delprod}`, { method: 'DELETE' }) : Promise.resolve()));

      const modal = box.querySelector('#prodModal');
      let editing = null;
      function openProd(p) {
        editing = p;
        box.querySelector('#prTitle').textContent = p ? `Editar: ${p.name}` : 'Novo produto';
        box.querySelector('#prName').value = p?.name || '';
        box.querySelector('#prCode').value = p?.code || '';
        box.querySelector('#prLine').value = p?.line || '';
        box.querySelector('#prBrand').value = p?.brand || 'TAKARA_TOMY';
        box.querySelector('#prCat').value = p?.category || '';
        box.querySelector('#prDate').value = p?.releaseDate ? p.releaseDate.slice(0, 10) : '';
        box.querySelector('#prNotes').value = p?.notes || '';
        box.querySelector('#prHidden').checked = !!p?.hidden;
        modal.hidden = false;
      }
      box.querySelector('#prClose').onclick = () => { modal.hidden = true; };
      box.querySelector('#newProd').onclick = () => openProd(null);
      on('[data-editprod]', 'click', (el) => openProd(products.find((p) => p.id === el.dataset.editprod)));
      box.querySelector('#prSave').onclick = act(() => {
        const body = {
          name: box.querySelector('#prName').value,
          code: box.querySelector('#prCode').value,
          line: box.querySelector('#prLine').value || null,
          brand: box.querySelector('#prBrand').value,
          category: box.querySelector('#prCat').value || null,
          releaseDate: box.querySelector('#prDate').value || null,
          notes: box.querySelector('#prNotes').value,
          hidden: box.querySelector('#prHidden').checked,
        };
        return editing
          ? BX.api(`/api/admin/products/${editing.id}`, { method: 'PATCH', body })
          : BX.api('/api/admin/products', { method: 'POST', body });
      });

      // Relação peça <-> produto
      const relModal = box.querySelector('#relModal');
      let relProduct = null;
      let relIds = [];
      function renderRelParts() {
        box.querySelector('#relParts').innerHTML = relIds.map((id, i) =>
          `<span style="display:inline-flex;align-items:center;gap:4px">${BX.partTag(id, { size: 22 })}<button class="icon-btn" data-rrem="${i}" style="width:22px;height:22px">×</button></span>`).join('') || '<small style="color:var(--muted)">nenhuma peça vinculada</small>';
        box.querySelectorAll('[data-rrem]').forEach((b) => b.addEventListener('click', () => { relIds.splice(parseInt(b.dataset.rrem, 10), 1); renderRelParts(); }));
      }
      on('[data-relation]', 'click', async (el) => {
        relProduct = products.find((p) => p.id === el.dataset.relation);
        const detail = await BX.api(`/api/products/${relProduct.slug}`);
        relIds = detail.partsByKind.flatMap((g) => g.parts.map((p) => p.id));
        box.querySelector('#relTitle').textContent = `Peças: ${relProduct.name}`;
        renderRelParts();
        relModal.hidden = false;
      });
      box.querySelector('#relClose').onclick = () => { relModal.hidden = true; };
      box.querySelector('#relSearch').addEventListener('input', (e) => {
        const idx = BX.partTag._idx;
        const qn = BX.norm(e.target.value);
        const resBox = box.querySelector('#relResults');
        if (qn.length < 2) { resBox.innerHTML = ''; return; }
        const found = idx.list.filter((p) => [p.name, p.display, ...(p.aliases || [])].some((v) => BX.norm(v).includes(qn))).slice(0, 10);
        resBox.innerHTML = found.map((p) => `<button class="slot-choice" data-radd="${p.id}" style="min-height:0;display:flex;gap:8px;align-items:center">${BX.partThumb(p, 24)}<span style="color:white;font-size:11px">${esc(p.display)}</span><small style="margin-left:auto;color:var(--muted)">${BX.KIND_PT[p.kind]}</small></button>`).join('');
        resBox.querySelectorAll('[data-radd]').forEach((b) => b.addEventListener('click', () => { if (!relIds.includes(b.dataset.radd)) relIds.push(b.dataset.radd); renderRelParts(); }));
      });
      box.querySelector('#relSave').onclick = act(() => BX.api(`/api/admin/products/${relProduct.id}/parts`, { method: 'PUT', body: { partIds: relIds } }));
    },

    // -------------------------------------------------------- 2.5 Torneios
    async tournaments() {
      const { tournaments } = await BX.api('/api/admin/tournaments');
      box.innerHTML = `
        <div class="table-wrap"><table class="data-table"><thead>
          <tr><th>Torneio</th><th>Status</th><th>Data</th><th>Organizador</th><th>Jogadores</th><th>Ações</th></tr></thead><tbody>
          ${tournaments.map((t) => `<tr>
            <td><a href="/torneio/${t.slug}" target="_blank" style="color:white;font-weight:700">${esc(t.name)}</a>${t.storeName ? `<small style="display:block;color:var(--muted)">${esc(t.storeName)}</small>` : ''}</td>
            <td><span class="status-chip ${t.status}">${t.status}</span>${t.status === 'RUNNING' ? `<small style="display:block;color:var(--muted)">rodada ${t.currentRound}/${t.roundsPlanned}</small>` : ''}</td>
            <td>${BX.dateFmt(t.startsAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
            <td>${esc(t.organizer?.name || '?')}</td>
            <td>${t.playersCount}</td>
            <td><div class="row-actions">
              <a class="btn secondary" style="text-decoration:none" href="/torneio/${t.slug}" target="_blank">Abrir como super organizador</a>
              <button class="btn secondary" data-transfer="${t.slug}">Transferir</button>
              ${!['CANCELED', 'FINISHED'].includes(t.status) ? `<button class="btn danger-outline" data-cancelt="${t.slug}">Cancelar</button>` : ''}
            </div></td>
          </tr>`).join('')}
        </tbody></table></div>
        <small style="display:block;color:var(--muted);margin-top:8px;font-size:10px">Como admin, você tem os poderes do organizador em qualquer torneio: resolver conflitos, remover jogadores, reabrir partidas e corrigir placares direto na aba Gestão do torneio.</small>`;
      on('[data-transfer]', 'click', act((el) => {
        const user = prompt('Transferir organização para (@ do perfil ou e-mail):');
        return user ? BX.api(`/api/tournaments/${el.dataset.transfer}/transfer`, { method: 'POST', body: { user } }) : Promise.resolve();
      }));
      on('[data-cancelt]', 'click', act((el) => confirm('Cancelar este torneio?') ? BX.api(`/api/tournaments/${el.dataset.cancelt}/cancel`, { method: 'POST' }) : Promise.resolve()));
    },

    // ---------------------------------------------------------- 2.6 Vendas
    async market() {
      const m = await BX.api('/api/admin/market');
      box.innerHTML = `
        <div class="panel-card" style="margin-bottom:14px"><p class="eyebrow">PEÇAS À VENDA (${m.items.length})</p>
          <div style="margin-top:10px">${m.items.map((i) => `
            <div class="org-match-row ${i.hidden ? 'done' : ''}">
              <b style="font:800 10px var(--display);color:var(--green)">${BX.money(i.priceCents) || '—'}</b>
              <div style="font-size:12px"><b>${esc(i.part)}</b><small style="display:block;color:var(--muted)">${esc(i.seller?.name)}${!i.seller?.canSell ? ' • 🚫 vendas bloqueadas' : ''}${i.hidden ? ' • oculto' : ''}</small></div>
              <div class="row-actions">
                <button class="btn secondary" data-hideitem="${i.id}:${!i.hidden}">${i.hidden ? 'Mostrar' : 'Ocultar'}</button>
                <button class="btn danger-outline" data-blocksell='${esc(JSON.stringify({ id: i.seller.id, canSell: !i.seller.canSell }))}'>${i.seller?.canSell ? 'Bloquear vendas do usuário' : 'Desbloquear vendas'}</button>
              </div>
            </div>`).join('') || '<div class="empty-state">Nenhuma peça à venda.</div>'}</div>
        </div>
        <div class="panel-card"><p class="eyebrow">COMBOS À VENDA (${m.combos.length})</p>
          <div style="margin-top:10px">${m.combos.map((c) => `
            <div class="org-match-row ${c.status === 'HIDDEN' ? 'done' : ''}">
              <b style="font:800 10px var(--display);color:var(--green)">${BX.money(c.priceCents) || '—'}</b>
              <div style="font-size:12px"><b>${esc(c.title)}</b><small style="display:block;color:var(--muted)">${esc(c.seller?.name)}</small></div>
              <div class="row-actions">
                <button class="btn secondary" data-hidecombo="${c.id}:${c.status !== 'HIDDEN'}">${c.status === 'HIDDEN' ? 'Mostrar' : 'Ocultar'}</button>
              </div>
            </div>`).join('') || '<div class="empty-state">Nenhum combo à venda.</div>'}</div>
        </div>`;
      on('[data-hideitem]', 'click', act((el) => { const [id, hidden] = el.dataset.hideitem.split(':'); return BX.api(`/api/admin/content/listing/${id}/visibility`, { method: 'POST', body: { hidden: hidden === 'true' } }); }));
      on('[data-hidecombo]', 'click', act((el) => { const [id, hidden] = el.dataset.hidecombo.split(':'); return BX.api(`/api/admin/content/combo/${id}/visibility`, { method: 'POST', body: { hidden: hidden === 'true' } }); }));
      on('[data-blocksell]', 'click', act((el) => { const { id, canSell } = JSON.parse(el.dataset.blocksell); return BX.api(`/api/admin/users/${id}`, { method: 'PATCH', body: { canSell } }); }));
    },

    // ------------------------------------------------------ 2.7 Cosméticos
    async cosmetics() {
      const { cosmetics } = await BX.api('/api/admin/cosmetics');
      const group = (kind, title) => `
        <div class="panel-card" style="margin-bottom:14px"><p class="eyebrow">${title}</p>
          <div style="margin-top:10px">${cosmetics.filter((c) => c.kind === kind).map((c) => `
            <div class="org-match-row ${c.active ? '' : 'done'}">
              ${kind === 'FRAME'
                ? BX.avatarHtml({ name: 'X' }, { size: 34, frame: c })
                : `<span class="sticker">${c.imageUrl ? `<img src="${esc(c.imageUrl)}">` : esc(c.styleKey || '★')}</span>`}
              <div style="font-size:12px"><b>${esc(c.name)}</b><small style="display:block;color:var(--muted)">${c.isDefault ? 'padrão (todos têm)' : 'exclusivo (por concessão)'}${c.active ? '' : ' • desativado'}</small></div>
              <div class="row-actions">
                <button class="btn secondary" data-cact="${c.id}:${!c.active}">${c.active ? 'Desativar' : 'Ativar'}</button>
                <button class="btn secondary" data-cdef="${c.id}:${!c.isDefault}">${c.isDefault ? 'Tornar exclusivo' : 'Tornar padrão'}</button>
                ${!c.isDefault ? `<button class="btn secondary" data-cgrant="${c.id}">🎁 Conceder</button>` : ''}
                <button class="btn danger-outline" data-cdel="${c.id}">Excluir</button>
              </div>
            </div>`).join('') || '<div class="empty-state">Nenhum.</div>'}</div>
        </div>`;
      box.innerHTML = `
        ${group('FRAME', 'MOLDURAS DE AVATAR')}
        ${group('STICKER', 'STICKERS')}
        <div class="panel-card form-grid"><p class="eyebrow" style="margin:0">NOVO COSMÉTICO</p>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
            <div><label>Nome</label><input id="cName" /></div>
            <div><label>Tipo</label><select id="cKind"><option value="FRAME">Moldura</option><option value="STICKER">Sticker</option></select></div>
            <div><label>Emoji/chave de estilo (opcional)</label><input id="cStyle" placeholder="⚡ ou xtreme" /></div>
          </div>
          <div><label>Imagem (opcional — PNG com transparência fica ótimo)</label><input type="file" id="cFile" accept="image/*" style="height:auto;padding:8px" /></div>
          <div class="config-check"><input type="checkbox" id="cDefault" /> <span>Disponível para todos (padrão)</span></div>
          <div class="inline-actions"><button class="btn primary" id="cCreate">Criar</button></div>
        </div>`;
      on('[data-cact]', 'click', act((el) => { const [id, active] = el.dataset.cact.split(':'); return BX.api(`/api/admin/cosmetics/${id}`, { method: 'PATCH', body: { active: active === 'true' } }); }));
      on('[data-cdef]', 'click', act((el) => { const [id, isDefault] = el.dataset.cdef.split(':'); return BX.api(`/api/admin/cosmetics/${id}`, { method: 'PATCH', body: { isDefault: isDefault === 'true' } }); }));
      on('[data-cdel]', 'click', act((el) => confirm('Excluir cosmético?') ? BX.api(`/api/admin/cosmetics/${el.dataset.cdel}`, { method: 'DELETE' }) : Promise.resolve()));
      on('[data-cgrant]', 'click', act((el) => {
        const user = prompt('Conceder para (@ do perfil ou e-mail):');
        return user ? BX.api(`/api/admin/cosmetics/${el.dataset.cgrant}/grant`, { method: 'POST', body: { user } }) : Promise.resolve();
      }));
      box.querySelector('#cCreate').onclick = act(() => {
        const fd = new FormData();
        fd.append('name', box.querySelector('#cName').value);
        fd.append('kind', box.querySelector('#cKind').value);
        fd.append('styleKey', box.querySelector('#cStyle').value);
        fd.append('isDefault', box.querySelector('#cDefault').checked);
        const f = box.querySelector('#cFile').files[0];
        if (f) fd.append('file', f);
        return BX.api('/api/admin/cosmetics', { method: 'POST', body: fd });
      });
    },

    // ----------------------------------------------------- 2.8 Home & meta
    async home() {
      const [{ decks }, { logs }, { announcements }] = await Promise.all([
        BX.api('/api/decks?all=1'),
        BX.api('/api/admin/sync/logs'),
        BX.api('/api/admin/announcements'),
      ]);
      box.innerHTML = `
        <div class="panel-card" style="margin-bottom:14px">
          <div class="section-title-row"><div><p class="eyebrow">DESTAQUES DA HOME</p><h2 style="font-size:20px">Decks fixados</h2></div></div>
          <div style="margin-top:10px">${decks.map((d) => `
            <div class="org-match-row">
              <b style="font:800 12px var(--display);color:${d.featured ? 'var(--yellow)' : '#5a6270'}">${d.featured ? '★' : '—'}</b>
              <div style="font-size:12px"><b>${esc(d.title)}</b><small style="display:block;color:var(--muted)">por ${esc(d.author?.name)}</small></div>
              <div class="row-actions">
                ${d.featured
                  ? `<button class="btn secondary" data-unfeat="${d.id}">Tirar da home</button>`
                  : `<button class="btn secondary" data-feat="${d.id}">★ Fixar na home</button>`}
              </div>
            </div>`).join('') || '<div class="empty-state">Nenhum deck publicado ainda.</div>'}</div>
        </div>
        <div class="panel-card" style="margin-bottom:14px">
          <div class="section-title-row">
            <div><p class="eyebrow">SINCRONIZAÇÃO DE PRODUTOS</p><h2 style="font-size:20px">BeyCommunity (TT + Hasbro)</h2></div>
            <button class="btn primary" id="syncNow">↻ Sincronizar agora</button>
          </div>
          <div style="margin-top:10px">${logs.map((l) => `
            <div class="org-match-row ${l.ok ? '' : 'conflict'}">
              <b style="font:800 10px var(--display);color:${l.ok ? 'var(--green)' : 'var(--red)'}">${l.ok ? 'OK' : 'ERRO'}</b>
              <div style="font-size:11px"><b class="mono">${esc(l.source.replace('https://', ''))}</b><small style="display:block;color:var(--muted)">${esc(l.message || '')} • ${BX.dateFmt(l.createdAt)}</small></div>
            </div>`).join('') || '<div class="empty-state">Nenhuma sincronização ainda — rode a primeira!</div>'}</div>
          <small style="display:block;color:var(--muted);margin-top:8px;font-size:10px">O meta da home usa os dados que o montador já puxa dos sites de meta; produtos novos entram por aqui.</small>
        </div>
        <div class="panel-card">
          <div class="section-title-row"><div><p class="eyebrow">AVISOS DO SITE</p><h2 style="font-size:20px">Banner da home</h2></div></div>
          <div class="form-grid" style="margin-top:10px">
            <div><label>Mensagem</label><input id="aMsg" placeholder='Ex.: "Torneio X neste sábado!"' /></div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
              <div><label>Link (opcional)</label><input id="aHref" placeholder="/torneio/…" /></div>
              <div><label>Início (opcional)</label><input id="aStart" type="datetime-local" /></div>
              <div><label>Fim (opcional)</label><input id="aEnd" type="datetime-local" /></div>
            </div>
            <div class="inline-actions"><button class="btn primary" id="aCreate">Publicar aviso</button></div>
          </div>
          <div style="margin-top:12px">${announcements.map((a) => `
            <div class="org-match-row ${a.active ? '' : 'done'}">
              <b>📣</b>
              <div style="font-size:12px"><b>${esc(a.message)}</b><small style="display:block;color:var(--muted)">${a.startsAt ? `de ${BX.dateFmt(a.startsAt)} ` : ''}${a.endsAt ? `até ${BX.dateFmt(a.endsAt)}` : ''}${a.active ? '' : ' • desativado'}</small></div>
              <div class="row-actions">
                <button class="btn secondary" data-atoggle="${a.id}:${!a.active}">${a.active ? 'Desativar' : 'Ativar'}</button>
                <button class="btn danger-outline" data-adel="${a.id}">Excluir</button>
              </div>
            </div>`).join('')}</div>
        </div>`;
      on('[data-feat]', 'click', act((el) => BX.api(`/api/admin/decks/${el.dataset.feat}/feature`, { method: 'POST', body: { order: Date.now() % 100000 } })));
      on('[data-unfeat]', 'click', act((el) => BX.api(`/api/admin/decks/${el.dataset.unfeat}/feature`, { method: 'POST', body: { order: null } })));
      box.querySelector('#syncNow').onclick = act(async () => {
        BX.toast('Sincronizando — pode levar alguns segundos…');
        const r = await BX.api('/api/admin/sync/products', { method: 'POST' });
        BX.toast(`Sync: ${r.created} produtos criados, ${r.updated} atualizados.`);
      });
      box.querySelector('#aCreate').onclick = act(() => BX.api('/api/admin/announcements', {
        method: 'POST',
        body: {
          message: box.querySelector('#aMsg').value,
          href: box.querySelector('#aHref').value,
          startsAt: box.querySelector('#aStart').value || null,
          endsAt: box.querySelector('#aEnd').value || null,
        },
      }));
      on('[data-atoggle]', 'click', act((el) => { const [id, active] = el.dataset.atoggle.split(':'); return BX.api(`/api/admin/announcements/${id}`, { method: 'PATCH', body: { active: active === 'true' } }); }));
      on('[data-adel]', 'click', act((el) => BX.api(`/api/admin/announcements/${el.dataset.adel}`, { method: 'DELETE' })));
    },

    // ------------------------------------------- 2.9 Configurações & flags
    async settings() {
      const { settings } = await BX.api('/api/admin/settings');
      const s = settings.site, f = settings.flags, m = settings.maintenance;
      box.innerHTML = `
        <div class="panel-card form-grid" style="margin-bottom:14px">
          <p class="eyebrow" style="margin:0">SITE</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div><label>Nome do site</label><input id="sName" value="${esc(s.name)}" /></div>
            <div><label>Tagline</label><input id="sTagline" value="${esc(s.tagline || '')}" /></div>
          </div>
          <div><label>Texto institucional (sobre)</label><textarea id="sAbout">${esc(s.about || '')}</textarea></div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
            ${['instagram', 'youtube', 'discord', 'whatsapp'].map((k) => `<div><label>${k}</label><input id="soc_${k}" value="${esc(s.socials?.[k] || '')}" /></div>`).join('')}
          </div>
          <div class="inline-actions"><button class="btn primary" id="saveSite">Salvar</button></div>
        </div>
        <div class="panel-card" style="margin-bottom:14px">
          <p class="eyebrow">FEATURE FLAGS — liga/desliga sem deploy</p>
          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px">
            ${[['sales', 'Vendas'], ['signup', 'Cadastro de contas'], ['tournaments', 'Criação de torneios'], ['decks', 'Publicação de decks']].map(([k, label]) =>
              `<label class="config-check" style="margin:0"><input type="checkbox" data-flag="${k}" ${f[k] !== false ? 'checked' : ''}/> <span>${label}</span></label>`).join('')}
          </div>
        </div>
        <div class="panel-card" style="margin-bottom:14px">
          <p class="eyebrow">MODO MANUTENÇÃO</p>
          <label class="config-check"><input type="checkbox" id="mOn" ${m.on ? 'checked' : ''}/> <span><b>Site em manutenção</b> — usuários comuns veem uma tela amigável; admins continuam navegando.</span></label>
          <div style="margin-top:10px"><label style="display:block;color:var(--muted);font-size:10px;text-transform:uppercase;font-weight:800;margin-bottom:5px">Mensagem</label><input id="mMsg" value="${esc(m.message || '')}" /></div>
          <div class="inline-actions" style="margin-top:10px"><button class="btn primary" id="saveMaint">Salvar manutenção</button></div>
        </div>
        <div class="panel-card">
          <p class="eyebrow">FILTRO DE PALAVRAS PROIBIDAS</p>
          <p style="color:var(--muted);font-size:11px;margin:8px 0">Uma por linha. Conteúdo (nomes, decks, descrições, anúncios) contendo esses termos é bloqueado na hora do envio.</p>
          <textarea id="banned" style="min-height:140px">${esc((settings.bannedWords || []).join('\n'))}</textarea>
          <div class="inline-actions" style="margin-top:10px"><button class="btn primary" id="saveWords">Salvar lista</button></div>
        </div>`;
      box.querySelector('#saveSite').onclick = act(() => BX.api('/api/admin/settings/site', {
        method: 'PUT',
        body: { value: {
          name: box.querySelector('#sName').value,
          tagline: box.querySelector('#sTagline').value,
          about: box.querySelector('#sAbout').value,
          socials: Object.fromEntries(['instagram', 'youtube', 'discord', 'whatsapp'].map((k) => [k, box.querySelector(`#soc_${k}`).value])),
        } },
      }));
      on('[data-flag]', 'change', act(async (el) => {
        const { settings: cur } = await BX.api('/api/admin/settings');
        return BX.api('/api/admin/settings/flags', { method: 'PUT', body: { value: { ...cur.flags, [el.dataset.flag]: el.checked } } });
      }));
      box.querySelector('#saveMaint').onclick = act(() => BX.api('/api/admin/settings/maintenance', {
        method: 'PUT',
        body: { value: { on: box.querySelector('#mOn').checked, message: box.querySelector('#mMsg').value } },
      }));
      box.querySelector('#saveWords').onclick = act(() => BX.api('/api/admin/settings/bannedWords', {
        method: 'PUT',
        body: { value: box.querySelector('#banned').value.split('\n').map((s2) => s2.trim()).filter(Boolean) },
      }));
    },

    // -------------------------------------------------------- 2.10 Logs
    async logs() {
      const q = box.dataset.lq || '';
      const [{ logs }, { errors }] = await Promise.all([
        BX.api(`/api/admin/audit?query=${encodeURIComponent(q)}`),
        BX.api('/api/admin/errors'),
      ]);
      box.innerHTML = `
        <div class="panel-card" style="margin-bottom:14px">
          <div class="section-title-row"><div><p class="eyebrow">AUDITORIA</p><h2 style="font-size:20px">Quem fez o quê</h2></div>
          <input id="lq" placeholder="Filtrar…" value="${esc(q)}" style="max-width:220px" /></div>
          <div class="table-wrap" style="margin-top:10px;max-height:45vh"><table class="data-table"><thead>
            <tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Alvo</th><th>Detalhes</th></tr></thead><tbody>
            ${logs.map((l) => `<tr>
              <td style="white-space:nowrap">${BX.dateFmt(l.createdAt)}</td>
              <td>${esc(l.actorName || 'sistema')}</td>
              <td class="mono">${esc(l.action)}</td>
              <td class="mono">${l.targetType ? `${esc(l.targetType)}:${esc((l.targetId || '').slice(-6))}` : '—'}</td>
              <td class="mono" style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.details || '')}</td>
            </tr>`).join('')}
          </tbody></table></div>
        </div>
        <div class="panel-card">
          <p class="eyebrow">ERROS DO SITE (${errors.length})</p>
          <div style="margin-top:10px">${errors.map((e) => `
            <details style="border-bottom:1px solid #232833;padding:8px 0">
              <summary style="cursor:pointer;font-size:12px"><b style="color:var(--red)">${esc(e.message)}</b> <small style="color:var(--muted)">${esc(e.path || '')} • ${BX.dateFmt(e.createdAt)}</small></summary>
              <pre class="mono" style="white-space:pre-wrap;color:var(--muted);margin:8px 0 0">${esc(e.stack || 'sem stack')}</pre>
            </details>`).join('') || '<div class="empty-state">Nenhum erro registrado. 🎉</div>'}</div>
        </div>`;
      let t;
      on('#lq', 'input', (el) => { clearTimeout(t); t = setTimeout(() => { box.dataset.lq = el.value; render(); }, 350); });
    },
  };

  render();
})();
