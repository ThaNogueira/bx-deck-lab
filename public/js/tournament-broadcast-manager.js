(() => {
  const panelPath = t => '/ao-vivo/' + encodeURIComponent(t.slug);

  BX.broadcastShare = t => `
    <section class="broadcast-share" aria-label="Painel ao vivo">
      <h3>${BX.ic('screen', 19)} Painel ao vivo · modo TV</h3>
      ${t.visibility === 'PRIVATE' ? '<p>Acesso restrito à organização e aos participantes.</p>' : ''}
      <div class="broadcast-share-links">
        <a class="btn primary" href="${panelPath(t)}" target="_blank" rel="noopener">Abrir painel</a>
        <button type="button" class="btn secondary" data-copy-broadcast>Copiar link</button>
        <a class="btn ghost" href="${panelPath(t)}?fullscreen=1" target="_blank" rel="noopener">${BX.ic('fullscreen', 14)} Tela cheia</a>
      </div>
    </section>`;

  BX.broadcastMatchControl = match => `
    <div class="broadcast-match-control">
      <button type="button" class="btn ${match.liveTableNo ? 'broadcast-on' : 'secondary'}" data-broadcast-match="${BX.esc(match.id)}">
        ${match.liveTableNo ? `<i aria-hidden="true"></i> Ao vivo · Mesa ${match.liveTableNo}` : `${BX.ic('screen', 13)} Iniciar ao vivo`}
      </button>
    </div>`;

  function chooseTable(t, match, matches, reload) {
    const dialog = document.createElement('dialog');
    dialog.className = 'broadcast-table-dialog';
    dialog.setAttribute('aria-labelledby', 'broadcast-table-title');
    const occupied = new Set(matches.filter(m => m.id !== match.id && m.liveTableNo).map(m => m.liveTableNo));
    dialog.innerHTML = `
      <h2 id="broadcast-table-title">${match.liveTableNo ? 'Transmissão ao vivo' : 'Iniciar ao vivo'}</h2>
      <p>${BX.esc(match.p1.user.name)} <span>vs</span> ${BX.esc(match.p2.user.name)}</p>
      <div class="broadcast-table-options" role="group" aria-label="Mesa física">
        ${[1, 2, 3, 4].map(number => `
          <button type="button" class="btn secondary" data-live-table="${number}" aria-pressed="${number === match.liveTableNo}" ${occupied.has(number) ? 'disabled' : ''}>
            Mesa ${number}<small>${occupied.has(number) ? 'Ocupada' : number === match.liveTableNo ? 'Mesa atual' : 'Disponível'}</small>
          </button>`).join('')}
      </div>
      <p class="broadcast-table-error" role="alert" hidden></p>
      <div class="broadcast-table-actions">
        <button type="button" class="btn secondary" data-close-live autofocus>Cancelar</button>
        ${match.liveTableNo ? '<button type="button" class="btn danger-outline" data-stop-live>Encerrar transmissão</button>' : ''}
        <button type="button" class="btn primary" data-save-live disabled>${match.liveTableNo ? 'Trocar mesa' : 'Iniciar transmissão'}</button>
      </div>`;
    let selected = match.liveTableNo;
    let saving = false;
    const save = dialog.querySelector('[data-save-live]');
    const error = dialog.querySelector('.broadcast-table-error');
    const choices = [...dialog.querySelectorAll('[data-live-table]')];
    const stop = dialog.querySelector('[data-stop-live]');
    const close = dialog.querySelector('[data-close-live]');
    dialog.addEventListener('close', () => dialog.remove());
    dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
    function updateButtons() {
      for (const button of choices) {
        const number = Number(button.dataset.liveTable);
        button.disabled = saving || occupied.has(number);
        button.setAttribute('aria-pressed', String(number === selected));
      }
      save.disabled = saving || !selected || selected === match.liveTableNo || occupied.has(selected);
      close.disabled = saving;
      if (stop) stop.disabled = saving;
    }
    for (const choice of choices) choice.addEventListener('click', () => {
      selected = Number(choice.dataset.liveTable);
      error.hidden = true;
      updateButtons();
    });
    async function submit(table) {
      if (saving) return;
      saving = true;
      updateButtons();
      error.hidden = true;
      try {
        await BX.api('/api/tournaments/' + encodeURIComponent(t.slug) + '/matches/' + encodeURIComponent(match.id) + '/broadcast', {
          method: 'PUT', body: { table },
        });
        dialog.close();
        await reload();
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        const fresh = await BX.api('/api/tournaments/' + encodeURIComponent(t.slug)).catch(() => null);
        if (fresh) {
          occupied.clear();
          for (const other of fresh.matches) if (other.id !== match.id && other.liveTableNo) occupied.add(other.liveTableNo);
          for (const choice of choices) {
            const number = Number(choice.dataset.liveTable);
            choice.querySelector('small').textContent = occupied.has(number) ? 'Ocupada' : number === match.liveTableNo ? 'Mesa atual' : 'Disponível';
          }
        }
      } finally {
        saving = false;
        updateButtons();
      }
    }
    close.onclick = () => dialog.close();
    save.onclick = () => submit(selected);
    if (stop) stop.onclick = () => submit(null);
    document.body.append(dialog);
    dialog.showModal();
  }

  BX.wireTournamentBroadcast = (box, t, data, reload) => {
    box.querySelector('[data-copy-broadcast]')?.addEventListener('click', async () => {
      const link = new URL(panelPath(t), location.origin).href;
      try { await navigator.clipboard.writeText(link); BX.toast('Link do painel copiado.'); }
      catch { BX.promptDialog({ title: 'Link do painel', defaultValue: link, okLabel: 'Fechar' }); }
    });
    for (const button of box.querySelectorAll('[data-broadcast-match]')) button.addEventListener('click', () => {
      const match = data.matches.find(m => m.id === button.dataset.broadcastMatch);
      if (match?.p1 && match.p2) chooseTable(t, match, data.matches, reload);
    });
  };
})();
