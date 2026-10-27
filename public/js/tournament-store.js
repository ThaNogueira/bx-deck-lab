/* Store picker used by tournament creation and management. */
(() => {
  const esc = BX.esc;
  const install = () => {
    const select = document.getElementById('store') || document.getElementById('eStore');
    if (!select) return;
    // The existing form loads stores asynchronously and replaces its options.
    // Restore the explicit no-store choice after that load as well.
    let noStore = [...select.options].find(option => option.value === '');
    if (!noStore) {
      noStore = new Option('Sem loja definida', '');
      select.prepend(noStore);
      if (select.id === 'store') select.value = '';
    }
    if (noStore.textContent !== 'Sem loja definida') noStore.textContent = 'Sem loja definida';
    if (document.querySelector('[data-create-store]')) return;
    select.removeAttribute('required');
    const holder = select.parentElement;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'btn ghost'; button.dataset.createStore = '1'; button.textContent = '＋ Criar loja';
    button.style.cssText = 'margin-top:8px;width:100%';
    holder.append(button);
    const box = document.createElement('div');
    box.hidden = true; box.className = 'store-create-box';
    box.innerHTML = '<p class="eyebrow">NOVA LOJA</p><label>Nome da loja<input data-store-name maxlength="80" placeholder="Ex.: Arena X"></label><label>Endereço<input data-store-address maxlength="200" placeholder="Rua, número, cidade e estado"></label><label>Site <small class="muted">opcional</small><input data-store-website maxlength="240" type="url" placeholder="https://exemplo.com"></label><div class="inline-actions"><button type="button" class="btn primary" data-save-store>Salvar loja</button><button type="button" class="btn ghost" data-cancel-store>Cancelar</button></div>';
    holder.parentElement.append(box);
    const ticketField = document.createElement('label');
    ticketField.innerHTML = 'Página do ingresso <small class="muted">opcional</small><input data-store-ticket maxlength="2000" type="url" placeholder="https://loja.com/ingresso">';
    box.insertBefore(ticketField, box.querySelector('.inline-actions'));
    button.onclick = () => { box.hidden = !box.hidden; if (!box.hidden) box.querySelector('[data-store-name]').focus(); };
    box.querySelector('[data-cancel-store]').onclick = () => { box.hidden = true; };
    box.querySelector('[data-save-store]').onclick = async () => {
      const save = box.querySelector('[data-save-store]'); save.disabled = true; save.textContent = 'Salvando…';
      try {
        const store = (await BX.api('/api/stores', { method: 'POST', body: { name: box.querySelector('[data-store-name]').value, address: box.querySelector('[data-store-address]').value, website: box.querySelector('[data-store-website]').value, ticketUrl: box.querySelector('[data-store-ticket]').value } })).store;
        select.insertAdjacentHTML('beforeend', `<option value="${esc(store.id)}">${esc(store.name)}</option>`); select.value = store.id; select.dispatchEvent(new Event('change')); box.hidden = true; BX.toast('Loja criada e selecionada.');
      } catch (error) { BX.toast(error.message); } finally { save.disabled = false; save.textContent = 'Salvar loja'; }
    };
    if (select.id === 'store') {
      const form = document.getElementById('form');
      form.onsubmit = async (event) => {
        event.preventDefault();
        try {
          const r = await BX.api('/api/tournaments', { method: 'POST', body: { name: document.getElementById('name').value, storeId: select.value, startsAt: document.getElementById('date').value, format: document.getElementById('format').value, roundsPlanned: document.getElementById('rounds').value, entryFeeCents: Math.round(+document.getElementById('fee').value * 100), description: document.getElementById('description').value } });
          const file = document.getElementById('cover').files[0];
          if (file) { const data = new FormData(); data.append('file', file); await BX.api(`/api/tournaments/${r.tournament.slug}/cover`, { method: 'POST', body: data }); }
          location.href = `/torneio/${r.tournament.slug}`;
        } catch (error) { BX.toast(error.message); }
      };
    }
  };
  const observer = new MutationObserver(install); observer.observe(document.body, { childList: true, subtree: true }); install();
})();
