(() => {
  const number=value=>Math.round(value||0).toLocaleString('pt-BR');
  BX.battlePassProfile = (stats,{owner=false}={}) => {
    if(!stats || !stats.count && !owner) return '';
    return `<section class="panel-card bp-profile"><div class="bp-profile-head"><div><p class="eyebrow">BATTLE PASS LAB</p><h2>Força de lançamento</h2></div>${owner?'<a href="/battle-pass">Treinar</a>':''}</div>${stats.count?`<div class="bp-profile-stats"><div><span>Média geral</span><strong>${number(stats.average)}<small>SP</small></strong></div><div><span>Recorde</span><strong>${number(stats.best)}<small>SP</small></strong></div><div><span>Lançamentos</span><strong>${number(stats.count)}</strong></div></div><div class="bp-profile-chart" role="img" aria-label="Últimos ${stats.recent?.length||0} lançamentos">${(stats.recent||[]).map(r=>`<i style="height:${Math.max(4,r.sp/Math.max(stats.best,1)*48)}px" title="${number(r.sp)} SP"></i>`).join('')}</div><p>${number(stats.sessions)} sessões · ${number(stats.live)} ao vivo · ${number(stats.imported)} importados</p>`:'<p>Conecte seu BX-09 para registrar SP, médias e evolução.</p>'}<small>Registros de treino · sem efeito no elo dos torneios.</small></section>`;
  };
})();
