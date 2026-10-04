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
    [s.events, 'Torneios', 'encerrados'],
    [s.podiums, 'Pódios', `${pct(s.podiumRate)} dos torneios`],
    [s.bestStreak, 'Melhor sequência', 'vitórias seguidas'],
  ];
  root.innerHTML = `
    <div class="pc-heading"><h2>Na arena</h2><span>Histórico competitivo</span></div>
    <div class="pc-summary-panel">
      <section class="pc-score"><div class="pc-scope" role="group" aria-label="Período da taxa de vitória"><button type="button" data-scope="all" aria-pressed="true">Geral</button><button type="button" data-scope="recent" aria-pressed="false">Últimas ${data.recent.length || 10}</button></div><div class="pc-score-body" data-score aria-live="polite"></div></section>
      <div class="pc-metrics">${metrics.map(([value,label,hint]) => `<div class="pc-metric"><strong>${value}</strong><span>${label}</span><small>${hint}</small></div>`).join('')}</div>
    </div>
    <div class="pc-medals" aria-label="Medalhas">${['Ouro','Prata','Bronze'].map((name,i) => `<span class="pc-medal p${i+1}"><img src="/assets/achievements/trophy-neon-gold.png" alt="" width="22" height="22"><b>${s[['gold','silver','bronze'][i]]}</b> ${name}</span>`).join('')}<small>${s.top4} Top 4</small></div>
    <div class="pc-columns">
      <section class="pc-card pc-performance"><div class="pc-card-heading"><h3>Vitórias por torneio</h3><small>Últimos ${events.length || 0}</small></div>
        ${events.length ? `<div class="pc-chart" aria-label="Taxa de vitória por torneio, do mais antigo ao mais recente">
          <div class="pc-chart-scale" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
          <div class="pc-chart-bars" style="--events:${events.length}">${events.map((t,i) => `<button type="button" class="pc-chart-event" data-event="${i}" aria-pressed="${i === events.length-1}" aria-label="${e(`${t.name}, ${date(t.startsAt)}, ${pct(t.winRate)} de vitórias, ${t.wins} vitórias em ${t.matches} partidas`)}"><strong>${pct(t.winRate)}</strong><span class="pc-bar-space"><i class="pc-stack-loss" style="height:${t.losses/t.matches*100}%"></i><i class="pc-stack-tie" style="height:${t.ties/t.matches*100}%"></i><i class="pc-stack-win" style="height:${t.wins/t.matches*100}%"></i></span><small>${date(t.startsAt)}</small></button>`).join('')}</div>
        </div><div class="pc-chart-detail" data-event-detail aria-live="polite"></div>` : '<p class="pc-empty">O gráfico aparece após o primeiro torneio encerrado com partidas registradas.</p>'}
      </section>
      <section class="pc-card"><div class="pc-card-heading"><h3>Beys mais usadas</h3><small>${s.decksRecorded} decks registrados</small></div>
        ${data.favoriteBeys.length ? `<div class="pc-beys">${data.favoriteBeys.map((b,i) => `<div class="pc-bey"><span class="pc-bey-rank">${i+1}</span>${BX.beyMini(b.ids.map(id => data.parts[id] || id), { u: 30, link: true })}<div class="pc-bey-copy"><strong>${e(b.name)}</strong><small>${b.uses} torneio${b.uses === 1 ? '' : 's'}</small><div class="pc-track"><i style="width:${b.usageRate}%"></i></div></div><span class="pc-usage"><b>${pct(b.usageRate)}</b><small>de uso</small></span></div>`).join('')}</div>` : '<p class="pc-empty">Ainda sem decks registrados em torneios encerrados.</p>'}
      </section>
    </div><div class="pc-legend"><span class="win">Vitórias</span><span class="loss">Derrotas</span>${s.ties ? '<span class="tie">Empates</span>' : ''}<small>Resultados confirmados · sem BYEs</small></div>
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
  function selectScope(scope) {
    const recent = scope === 'recent';
    const wins = recent ? data.recent.filter(r => r.outcome === 'W').length : s.wins;
    const losses = recent ? data.recent.filter(r => r.outcome === 'L').length : s.losses;
    const ties = recent ? data.recent.filter(r => r.outcome === 'D').length : s.ties;
    const count = wins + losses + ties;
    const rate = count ? wins/count*100 : null;
    const delta = s.recentWinRate == null || s.winRate == null ? null : Math.round((s.recentWinRate-s.winRate)*10)/10;
    root.querySelectorAll('[data-scope]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.scope === scope)));
    root.querySelector('[data-score]').innerHTML = `<div class="pc-donut" style="--wins:${rate || 0}%;--decided:${count ? (wins+losses)/count*100 : 0}%" role="img" aria-label="${pct(rate)} de vitórias em ${count} partidas"><span><b>${pct(rate)}</b><small>vitórias</small></span></div><div class="pc-record"><strong><span>${wins} V</span> <em>/</em> <span>${losses} D</span>${ties ? ` <em>/</em> ${ties} E` : ''}</strong><small>${count} partidas · ${recent ? 'recentes' : 'total'}</small><p>${delta == null ? 'Ainda sem comparação' : `<b class="${delta < 0 ? 'down' : 'up'}">${delta > 0 ? '+' : ''}${delta.toLocaleString('pt-BR')} p.p.</b> nas últimas ${data.recent.length}`}</p></div>`;
  }
  root.querySelectorAll('[data-scope]').forEach(b => b.addEventListener('click',()=>selectScope(b.dataset.scope)));
  selectScope('all');
  root.querySelectorAll('[data-event]').forEach(button => button.addEventListener('click', () => selectEvent(Number(button.dataset.event))));
  if (events.length) selectEvent(events.length-1);
};
