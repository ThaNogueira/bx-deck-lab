(() => {
  const number=value=>Math.round(value||0).toLocaleString('pt-BR');
  BX.battlePassProfile = (stats,{owner=false}={}) => {
    if(!stats || !stats.count && !owner) return '';
    const tone=BX.shootPower.tone;
    return `<section class="panel-card bp-profile"><div class="bp-profile-head"><h2>Força de lançamento</h2>${owner?'<a href="/battle-pass">Treinar</a>':''}</div>${stats.count?`<div class="bp-profile-stats"><div class="bp-metal bp-profile-max"><span>Máximo</span><strong class="bp-power-number" data-power-tone="${tone(stats.best)}">${number(stats.best)}<small>SP</small></strong></div><div class="bp-metal"><span>Média</span><strong class="bp-power-number" data-power-tone="${tone(stats.average)}">${number(stats.average)}<small>SP</small></strong></div><div class="bp-metal"><span>Lançamentos</span><strong>${number(stats.count)}</strong></div></div>${BX.shootPower.meter(stats.best)}`:'<p>Conecte seu BX-09 para registrar seus lançamentos.</p>'}</section>`;
  };
})();
