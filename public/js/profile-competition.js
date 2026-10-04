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
  const date = d => BX.dateFmt(d, { day: '2-digit', month: '2-digit' });
  const outcome = { W: 'Vitória', L: 'Derrota', D: 'Empate' };
  const events = data.tournaments.filter(t => t.status === 'FINISHED' && t.matches > 0 && t.winRate != null).slice(0, 5).reverse();
  const metrics = [
    [pct(s.winRate), 'Taxa de vitória', `${s.matches} partidas`],
    [s.events, 'Torneios', 'encerrados'],
    [`${s.wins} / ${s.losses}`, 'Vitórias / derrotas', s.ties ? `${s.ties} empates` : 'sem contar BYEs'],
    [s.podiums, 'Pódios', `${pct(s.podiumRate)} dos torneios`],
  ];
  root.innerHTML = `
    <div class="pc-heading"><h2>Na arena</h2><span>Histórico competitivo</span></div>
    <div class="pc-metrics">${metrics.map(([value,label,hint]) => `<div class="pc-metric"><strong>${value}</strong><span>${label}</span><small>${hint}</small></div>`).join('')}</div>
    <div class="pc-medals" aria-label="Medalhas">${['Ouro','Prata','Bronze'].map((name,i) => `<span class="pc-medal p${i+1}"><img src="/assets/achievements/trophy-neon-gold.png" alt="" width="22" height="22"><b>${s[['gold','silver','bronze'][i]]}</b> ${name}</span>`).join('')}<small>${s.top4} Top 4</small></div>
    <div class="pc-columns">
      <section class="pc-card pc-performance"><div class="pc-card-heading"><h3>Vitórias por torneio</h3><small>Últimos ${events.length || 0}</small></div>
        ${events.length ? `<div class="pc-chart" aria-label="Taxa de vitória por torneio, do mais antigo ao mais recente">
          <div class="pc-chart-scale" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
          <div class="pc-chart-bars" style="--events:${events.length}">${events.map((t,i) => `<button type="button" class="pc-chart-event" data-event="${i}" aria-pressed="${i === events.length-1}" aria-label="${e(`${t.name}, ${date(t.startsAt)}, ${pct(t.winRate)} de vitórias, ${t.wins} vitórias em ${t.matches} partidas`)}"><strong>${pct(t.winRate)}</strong><span class="pc-bar-space"><i style="height:${t.winRate}%"></i></span><small>${date(t.startsAt)}</small></button>`).join('')}</div>
        </div><div class="pc-chart-detail" data-event-detail aria-live="polite"></div>` : '<p class="pc-empty">O gráfico aparece após o primeiro torneio encerrado com partidas registradas.</p>'}
      </section>
      <section class="pc-card"><div class="pc-card-heading"><h3>Beys mais usadas</h3><small>${s.decksRecorded} decks registrados</small></div>
        ${data.favoriteBeys.length ? `<div class="pc-beys">${data.favoriteBeys.map(b => `<div class="pc-bey">${BX.beyMini(b.ids.map(id => data.parts[id] || id), { u: 42, link: true })}<strong>${e(b.name)}</strong><small>${b.uses} torneio${b.uses === 1 ? '' : 's'} · ${pct(b.usageRate)}</small><div class="pc-track"><i style="width:${b.usageRate}%"></i></div></div>`).join('')}</div>` : '<p class="pc-empty">Ainda sem decks registrados em torneios encerrados.</p>'}
      </section>
    </div>
    <details class="pc-more"><summary>Mais estatísticas</summary>
      <div class="pc-extra-metrics"><span><b>${s.bestStreak}</b> vitórias na melhor sequência</span><span><b>${s.currentStreak}</b> vitórias seguidas agora</span><span><b>${pct(s.recentWinRate)}</b> nas últimas ${data.recent.length} partidas</span></div>
      <div class="pc-form">${data.recent.map(r => `<a href="/torneio/${e(r.slug)}" class="pc-result ${r.outcome}" aria-label="${e(`${outcome[r.outcome]} · ${r.tournament} · rodada ${r.round}`)}" title="${e(`${outcome[r.outcome]} · ${r.tournament} · rodada ${r.round}`)}">${r.outcome === 'W' ? 'V' : r.outcome === 'L' ? 'D' : 'E'}</a>`).join('') || '<p class="pc-empty">Ainda sem partidas concluídas.</p>'}</div><p class="pc-footnote">Resultados: mais antigo → mais recente.</p>
      <details class="pc-method"><summary>Como os números são calculados?</summary><p>Todos os torneios encerrados públicos ou acessíveis por link entram nos totais. Privados, testes, cancelados e excluídos não entram. Taxa de vitória = vitórias ÷ partidas confirmadas com oponente. Empates contam como partidas; BYEs (${s.byes}) e derrotas administrativas por entrada tardia (${s.administrativeLosses}) ficam fora da taxa. O gráfico mostra os últimos cinco torneios com partidas, em ordem cronológica, sempre na escala de 0 a 100%. Toque em uma barra para ver o torneio.</p><p>O uso da Blade conta uma vez por torneio com deck registrado, agrupando cores. A miniatura mostra a montagem mais frequente, priorizando Ratchet e depois Bit. Quando não há composição salva no torneio, usamos o deck vinculado disponível, que pode ter sido editado posteriormente.</p></details>
    </details>`;
  function selectEvent(index) {
    const t = events[index];
    root.querySelectorAll('[data-event]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.event) === index)));
    root.querySelector('[data-event-detail]').innerHTML = `<a href="/torneio/${e(t.slug)}">${e(t.name)} <span aria-hidden="true">↗</span></a><small>${date(t.startsAt)} · ${t.wins} vitória${t.wins === 1 ? '' : 's'} em ${t.matches} partida${t.matches === 1 ? '' : 's'}${t.placement ? ` · ${t.placement}º lugar` : ''}</small>`;
  }
  root.querySelectorAll('[data-event]').forEach(button => button.addEventListener('click', () => selectEvent(Number(button.dataset.event))));
  if (events.length) selectEvent(events.length-1);
};
