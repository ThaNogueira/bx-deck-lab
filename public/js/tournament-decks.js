/* Shared inline composer: the caller chooses player-owned or institutional saving. */
(() => {
  const dialog = (kind, opener = document.activeElement) => {
    const el = document.createElement('dialog');
    el.className = `tournament-deck-dialog ${kind}`;
    el.setAttribute('aria-label', kind === 'tournament-deck-picker' ? 'Meus decks' : 'Montar deck');
    document.body.append(el);
    el.addEventListener('close', () => { el.remove(); if (opener?.isConnected) opener.focus({ preventScroll: true }); });
    el.showModal(); return el;
  };
  const role = p => !p ? null : p.kind === 'BLADE' ? (p.subKind === 'INTEGRATED' ? 'integrated' : 'blade') : p.kind === 'BIT' ? (p.subKind === 'RIB' ? 'rib' : 'bit') : ({ LOCK_CHIP:'lock', MAIN_BLADE:'main', ASSIST_BLADE:'assist', OVER_BLADE:'over', RATCHET:'ratchet' })[p.kind];
  BX.openTournamentDeckEditor = async ({ title = '', beys = [], heading = 'Criar deck', onSave }) => {
    const index = await BX.partTagReady();
    if (document.querySelector('dialog.tournament-deck-dialog[open]')) return;
    const state = { title, beys: Array.from({length:3},(_,i)=>[...(beys[i] || [])]), slot:0, query:'', filter:'', saving:false };
    const modal = dialog('tournament-deck-editor');
    modal.addEventListener('cancel', event => { if(state.saving) event.preventDefault(); });
    const complete = ids => {
      const roles=ids.map(id=>role(index.byId.get(id))), set=new Set(roles);
      if(roles.some(r=>!r) || set.size!==roles.length) return false;
      const exactly = (...wanted) => set.size===wanted.length && wanted.every(r=>set.has(r));
      return exactly('blade','ratchet','bit') || exactly('integrated','bit') || exactly('lock','main','assist','ratchet','bit') || exactly('lock','main','assist','over','ratchet','bit') || exactly('lock','main','assist','rib') || exactly('lock','main','assist','over','rib');
    };
    const status = ids => !ids.length ? 'Vazia' : complete(ids) ? 'Completa' : 'Incompleta';
    const add = part => {
      const r=role(part); if(!r)return;
      const old=state.beys[state.slot].map(id=>index.byId.get(id)).filter(Boolean);
      const without=roles=>old.filter(p=>!roles.includes(role(p)));
      let next;
      if(r==='blade')next=[part,...old.filter(p=>['ratchet','bit'].includes(role(p)))];
      else if(r==='integrated')next=[part,...old.filter(p=>role(p)==='bit')];
      else if(['lock','main','assist','over'].includes(r))next=[...without(['blade','integrated',r]),part];
      else if(r==='rib')next=[...without(['blade','integrated','ratchet','bit','rib']),part];
      else if(r==='ratchet')next=[...without(['integrated','rib','ratchet']),part];
      else next=[...without(['rib','bit']),part];
      state.beys[state.slot]=next.map(p=>p.id);
    };
    const render = (focusSearch = false) => {
      const current=state.beys[state.slot], query=BX.norm(state.query);
      const parts=index.list.filter(p=>!p.parentId && role(p) && (!state.filter || (state.filter==='CX' ? ['LOCK_CHIP','MAIN_BLADE','ASSIST_BLADE','OVER_BLADE'].includes(p.kind) : p.kind===state.filter)) && (!query || [p.name,p.display,p.abbrev,...(p.aliases || [])].some(v=>BX.norm(v).includes(query)))).slice(0,80);
      modal.innerHTML=`<button type="button" class="modal-close" data-mini-close aria-label="Fechar">×</button><p class="eyebrow">DECK LIST</p><h2>${BX.esc(heading)}</h2>
        <label>Nome do deck<input id="miniDeckTitle" value="${BX.esc(state.title)}" maxlength="80" placeholder="Meu deck"></label>
        <div class="mini-builder-slots">${state.beys.map((ids,i)=>`<button type="button" class="${state.slot===i?'active':''}" data-mini-slot="${i}"><small>BEY ${i+1} · ${status(ids)}</small>${BX.beyMini(ids,{u:42})}</button>`).join('')}</div>
        <div class="mini-builder-current"><b>Bey ${state.slot+1}</b><small>${status(current)}</small><div>${current.map(id=>{const p=index.byId.get(id);return `<button type="button" class="mini-part-chip" data-mini-remove="${BX.esc(id)}">${BX.partThumb(p,24)}<span>${BX.esc(p?.display || p?.name || '?')}</span> ×</button>`;}).join('')}</div></div>
        <input id="miniDeckSearch" value="${BX.esc(state.query)}" placeholder="Buscar peça" aria-label="Buscar peça">
        <div class="picker-filters mini-builder-filters">${[['','Tudo'],['BLADE','Blades'],['RATCHET','Ratchets'],['BIT','Bits'],['CX','CX']].map(([key,label])=>`<button type="button" class="picker-chip ${state.filter===key?'active':''}" data-mini-filter="${key}">${label}</button>`).join('')}</div>
        <div class="mini-builder-parts">${parts.map(p=>`<button type="button" data-mini-add="${BX.esc(p.id)}" ${current.includes(p.id)?'disabled':''}>${BX.partThumb(p,28)}<span>${BX.esc(p.display || p.name)}</span><small>${BX.esc(BX.KIND_PT[p.kind] || p.kind)}</small></button>`).join('') || '<small>Nenhuma peça encontrada.</small>'}</div>
        <div class="tournament-deck-actions"><button type="button" class="btn primary" data-mini-save>Salvar deck</button><button type="button" class="btn ghost" data-mini-close>Cancelar</button></div>`;
      modal.querySelectorAll('[data-mini-close]').forEach(b=>b.onclick=()=>modal.close());
      modal.querySelectorAll('[data-mini-slot]').forEach(b=>b.onclick=()=>{state.slot=Number(b.dataset.miniSlot);render();});
      modal.querySelectorAll('[data-mini-filter]').forEach(b=>b.onclick=()=>{state.filter=b.dataset.miniFilter;render(true);});
      modal.querySelectorAll('[data-mini-add]').forEach(b=>b.onclick=()=>{add(index.byId.get(b.dataset.miniAdd));render();});
      modal.querySelectorAll('[data-mini-remove]').forEach(b=>b.onclick=()=>{state.beys[state.slot]=current.filter(id=>id!==b.dataset.miniRemove);render();});
      modal.querySelector('#miniDeckTitle').oninput=e=>{state.title=e.target.value;};
      modal.querySelector('#miniDeckSearch').oninput=e=>{state.query=e.target.value;render(true);};
      modal.querySelector('[data-mini-save]').onclick=async()=>{
        if(state.saving)return;
        if(!state.title.trim()){BX.toast('Dê um nome ao deck.');modal.querySelector('#miniDeckTitle').focus();return;}
        const selected=state.beys.filter(ids=>ids.length);
        if(!selected.length || !selected.every(complete)){BX.toast('Complete as peças de cada Bey antes de salvar.');return;}
        state.saving=true;modal.setAttribute('aria-busy','true');modal.querySelectorAll('button,input').forEach(el=>el.disabled=true);modal.querySelector('[data-mini-save]').textContent='Salvando…';
        try {await onSave({title:state.title.trim(),beys:selected});modal.close();}
        catch(error){state.saving=false;modal.removeAttribute('aria-busy');BX.toast(error.message);render();}
      };
      if(focusSearch)requestAnimationFrame(()=>{if(!modal.isConnected)return;const input=modal.querySelector('#miniDeckSearch');input.focus();input.setSelectionRange(input.value.length,input.value.length);});
    };
    render();
  };

  BX.wireMyTournamentDeck = ({ button, tournament, mine, reload }) => {
    button.onclick = async () => {
      const modal=dialog('tournament-deck-picker');let decks=[],page=1,query='',busy=false;
      const save=async deckId=>{if(busy)return;busy=true;modal.querySelectorAll('button,input').forEach(el=>el.disabled=true);try{await BX.api(`/api/tournaments/${encodeURIComponent(tournament.slug)}/my-deck`,{method:'POST',body:{deckId}});modal.close();await reload();}catch(error){busy=false;BX.toast(error.message);render();}};
      modal.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
      const render=()=>{
        const filtered=decks.filter(d=>BX.norm(d.title).includes(BX.norm(query))),pages=Math.max(1,Math.ceil(filtered.length/5));page=Math.min(page,pages);
        modal.innerHTML=`<button type="button" class="modal-close" data-picker-close aria-label="Fechar">×</button><p class="eyebrow">DECK LIST</p><div class="tournament-deck-picker-head"><h2>Meus decks</h2><button type="button" class="btn primary" data-create-my-deck>Criar deck</button></div>${decks.length>5?`<input data-my-deck-search placeholder="Buscar deck" aria-label="Buscar deck" value="${BX.esc(query)}">`:''}
          <div class="deck-picker-list">${filtered.slice((page-1)*5,page*5).map(d=>`<button type="button" data-use-my-deck="${BX.esc(d.id)}" aria-pressed="${mine.deck?.id===d.id}">${BX.deckPreview(d.beys,{u:34})}<span><b>${BX.esc(d.title)}</b>${!d.isPublic?'<small>Privado</small>':''}</span></button>`).join('') || '<p class="muted">Nenhum deck encontrado.</p>'}</div>
          ${pages>1?`<nav class="deck-pagination" aria-label="Páginas de decks">${Array.from({length:pages},(_,i)=>`<button type="button" class="btn secondary ${page===i+1?'active':''}" data-my-deck-page="${i+1}">${i+1}</button>`).join('')}</nav>`:''}
          ${mine.deck?'<button type="button" class="btn ghost" data-clear-my-deck>Remover declaração</button>':''}`;
        modal.querySelector('[data-picker-close]').onclick=()=>modal.close();
        modal.querySelectorAll('[data-use-my-deck]').forEach(b=>b.onclick=()=>save(b.dataset.useMyDeck));
        modal.querySelector('[data-clear-my-deck]')?.addEventListener('click',()=>save(null));
        modal.querySelectorAll('[data-my-deck-page]').forEach(b=>b.onclick=()=>{page=Number(b.dataset.myDeckPage);render();});
        modal.querySelector('[data-my-deck-search]')?.addEventListener('input',e=>{query=e.target.value;page=1;render();const input=modal.querySelector('[data-my-deck-search]');input.focus();input.setSelectionRange(input.value.length,input.value.length);});
        modal.querySelector('[data-create-my-deck]').onclick=async()=>{
          modal.close();let created=null,lastPayload='';
          try {await BX.openTournamentDeckEditor({onSave:async draft=>{
            const payload=JSON.stringify(draft);
            // Keep the saved deck if declaration fails, so retrying cannot duplicate it.
            if(!created){created=(await BX.api('/api/decks',{method:'POST',body:{...draft,isPublic:true}})).deck;lastPayload=payload;}
            else if(lastPayload!==payload){created=(await BX.api(`/api/decks/${created.id}`,{method:'PATCH',body:draft})).deck;lastPayload=payload;}
            await BX.api(`/api/tournaments/${encodeURIComponent(tournament.slug)}/my-deck`,{method:'POST',body:{deckId:created.id}});await reload();BX.toast('Deck salvo e declarado.');
          }});}catch(error){BX.toast(error.message);}
        };
      };
      modal.innerHTML='<p class="muted">Carregando decks…</p>';
      try {const result=await Promise.all([BX.api('/api/decks?mine=1&sort=updated'),BX.partTagReady()]);if(!modal.isConnected)return;decks=result[0].decks;render();}
      catch(error){modal.close();BX.toast(error.message);}
    };
  };
})();
