/* Public, read-only statistics; never generates AI analysis. */
BX.renderCompetition = function (root, data) {
  const e = BX.esc;
  if (!data?.summary) {
    root.innerHTML = '<div class="empty-state">Não foi possível carregar as estatísticas. <button class="btn ghost" data-retry>Tentar novamente</button></div>';
    root.querySelector('[data-retry]').onclick = async () => {
      root.innerHTML = '<div class="empty-state">Carregando estatísticas…</div>';
      BX.renderCompetition(root, await BX.api(`/api/users/${encodeURIComponent(BX.pathPart(1))}/tournaments`).catch(() => null));
    };
    return;
  }
  const s = data.summary;
  const pct = n => n == null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  const date = d => BX.dateFmt(d, { day: '2-digit', month: 'short', year: 'numeric' });
  const status = { OPEN: 'Inscrições abertas', RUNNING: 'Em andamento', FINISHED: 'Encerrado' };
  const outcome = { W: 'Vitória', L: 'Derrota', D: 'Empate' };
  const metrics = [
    [s.events, 'Torneios encerrados', `${data.tournaments.filter(t => t.status === 'RUNNING').length} em andamento`],
    [s.wins, 'Vitórias', `${s.losses} derrotas · ${s.ties} empates`],
    [s.podiums, 'Pódios', `${pct(s.podiumRate)} das participações`],
    [s.bestStreak, 'Melhor sequência', `${s.currentStreak} vitórias seguidas agora`],
  ];
  root.innerHTML = `
    <div class="pc-heading"><div><p class="eyebrow">HISTÓRICO COMPETITIVO</p><h2>Na arena</h2></div><span class="pc-sample">${s.matches} partidas registradas</span></div>
    ${!s.events ? '<p class="pc-empty">A história começa na primeira arena. As estatísticas aparecem quando um torneio é encerrado.</p>' : ''}
    <div class="pc-overview">
      <div class="pc-win-card"><div class="pc-ring" style="--rate:${s.winRate || 0}%"><span><strong>${pct(s.winRate)}</strong><small>WIN RATE</small></span></div><div><h3>Taxa de vitória</h3><p>${s.matches ? `${s.wins} vitórias em ${s.matches} partidas` : 'Ainda sem partidas concluídas'}</p><small>Sem contar BYEs</small></div></div>
      <div class="pc-metrics">${metrics.map(([value,label,hint]) => `<div class="pc-metric"><strong>${value}</strong><span>${label}</span><small>${hint}</small></div>`).join('')}</div>
    </div>
    <div class="pc-columns">
      <section class="pc-card"><div class="pc-card-heading"><h3>Sala de troféus</h3><small>${s.top4} vezes no Top 4</small></div><div class="pc-medals">${['Ouro','Prata','Bronze'].map((name,i) => `<div class="pc-medal p${i+1}"><img src="/assets/achievements/trophy-neon-gold.png" alt="" width="40" height="40"><strong>${s[['gold','silver','bronze'][i]]}</strong><span>${name}</span></div>`).join('')}</div></section>
      <section class="pc-card"><div class="pc-card-heading"><h3>Beys mais usadas</h3><small>Top 3</small></div>
        ${data.favoriteBeys.length ? `<div class="pc-beys">${data.favoriteBeys.map(b => `<div class="pc-bey">${BX.beyMini(b.ids.map(id => data.parts[id] || id), { u: 44, link: true })}<strong>${e(b.name)}</strong><small>${b.uses} torneio${b.uses === 1 ? '' : 's'} · ${pct(b.usageRate)}</small><div class="pc-track"><i style="width:${b.usageRate}%"></i></div></div>`).join('')}</div>` : '<p class="pc-empty">Ainda não há decks registrados nos torneios encerrados.</p>'}
        <p class="pc-footnote">${s.decksRecorded} de ${s.events} torneios com deck registrado. Cores da mesma Blade são agrupadas.</p>
      </section>
      <section class="pc-card"><div class="pc-card-heading"><h3>Últimas partidas</h3><small>${pct(s.recentWinRate)} de vitórias</small></div><div class="pc-form">${data.recent.length ? data.recent.map(r => `<a href="/torneio/${e(r.slug)}" class="pc-result ${r.outcome}" aria-label="${e(`${outcome[r.outcome]} · ${r.tournament} · rodada ${r.round}`)}" title="${e(`${outcome[r.outcome]} · ${r.tournament} · rodada ${r.round}`)}">${r.outcome === 'W' ? 'V' : r.outcome === 'L' ? 'D' : 'E'}</a>`).join('') : '<p class="pc-empty">Os resultados das partidas aparecerão aqui.</p>'}</div><p class="pc-footnote">Mais antiga → mais recente · até 10 partidas de torneios encerrados</p></section>
      <section class="pc-card"><div class="pc-card-heading"><h3>Evolução nas arenas</h3><small>Vitórias / partidas</small></div><div class="pc-months">${data.monthly.length ? data.monthly.map(m => `<div class="pc-month"><span>${e(BX.dateFmt(`${m.month}-15T12:00:00Z`, { month: 'short', year: '2-digit' }))}</span><div class="pc-track" role="img" aria-label="${pct(m.winRate)} de vitórias"><i style="width:${m.winRate || 0}%"></i></div><b>${pct(m.winRate)}</b><small>${m.wins}/${m.matches}</small></div>`).join('') : '<p class="pc-empty">Acompanhe aqui a evolução mês a mês.</p>'}</div></section>
    </div>
    <section class="pc-history"><div class="pc-card-heading"><h3>Passaporte de torneios</h3><small>${data.tournaments.length} participações</small></div><div data-history></div><nav class="pc-pagination" aria-label="Páginas do histórico de torneios" data-pages></nav></section>
    <details class="pc-method"><summary>Como essas estatísticas são calculadas?</summary><p>Os números consolidados usam todos os torneios encerrados públicos ou acessíveis por link. Torneios privados, testes, cancelados e excluídos não entram. A taxa de vitória é vitórias ÷ partidas com resultado confirmado e oponente; empates contam como partidas, mas não como vitórias. BYEs (${s.byes}) e derrotas administrativas por entrada tardia (${s.administrativeLosses}) ficam fora dessa taxa. Resultados homologados pelo gestor também contam.</p><p>O uso de uma Blade conta uma vez por torneio com deck registrado, independentemente do resultado. A miniatura mostra a montagem realmente registrada mais frequente, priorizando Ratchet e depois Bit. Não é uma taxa de vitória individual da Bey. Quando não há composição salva no torneio, usamos o deck vinculado disponível, que pode ter sido editado posteriormente.</p></details>`;
  let page = 0;
  const total = Math.max(1, Math.ceil(data.tournaments.length / 5));
  function history() {
    root.querySelector('[data-history]').innerHTML = data.tournaments.slice(page * 5, page * 5 + 5).map(t => `<a class="pc-event" href="/torneio/${e(t.slug)}"><span class="pc-place ${t.status === 'FINISHED' && t.placement <= 3 ? `p${t.placement}` : ''}">${t.status === 'FINISHED' && t.placement ? `${t.placement}º` : '—'}</span><span class="pc-event-name"><strong>${e(t.name)}</strong><small>${e(t.storeName || '')}${t.storeName ? ' · ' : ''}${date(t.startsAt)} · ${t.players} jogadores</small><small>${status[t.status]}${t.dropped ? ' · desistiu' : ''}</small></span><span class="pc-event-score"><b>${t.wins} V <em>/</em> ${t.losses} D${t.ties ? ` / ${t.ties} E` : ''}</b><small>${pct(t.winRate)} de vitórias</small></span><span aria-hidden="true">→</span></a>`).join('') || '<p class="pc-empty">Nenhuma participação pública por enquanto.</p>';
    const nav = root.querySelector('[data-pages]');
    nav.innerHTML = total > 1 ? `<button class="btn secondary" data-prev ${page === 0 ? 'disabled' : ''} aria-label="Página anterior">←</button><span>${page+1} de ${total}</span><button class="btn secondary" data-next ${page === total-1 ? 'disabled' : ''} aria-label="Próxima página">→</button>` : '';
    nav.querySelector('[data-prev]')?.addEventListener('click', () => { page--; history(); });
    nav.querySelector('[data-next]')?.addEventListener('click', () => { page++; history(); });
  }
  history();
};
