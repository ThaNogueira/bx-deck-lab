BX.renderTopbar('/elos');
(async () => {
  const root = document.getElementById('eloTiers');
  try {
    const { tiers, rules } = await BX.api('/api/ranking/rules');
    const captions = ['A primeira faísca.', 'O giro ganha ritmo.', 'Consistência na arena.', 'Impacto que faz diferença.', 'Precisão sob pressão.', 'Lapidado nos duelos.', 'Domínio de Blader.', 'Um legado em movimento.'];
    root.innerHTML = tiers.map((t,i) => `<article class="elo-tier" style="--tier:${BX.esc(t.color)}"><span class="elo-tier-number">${String(i+1).padStart(2,'0')}</span><img src="${BX.esc(t.icon)}" alt="Emblema ${BX.esc(t.name)}" width="144" height="144"><h3>${BX.esc(t.name)}</h3><strong>${t.min.toLocaleString('pt-BR')}${tiers[i+1] ? `–${(tiers[i+1].min-1).toLocaleString('pt-BR')}` : '+'} <small>PTS</small></strong><p>${captions[i]}</p><div class="elo-frame-example">${BX.avatarHtml({rating:{provisional:false,tier:t}}, {size:40})}<span>Moldura automática</span></div></article>`).join('');
    const slider = document.getElementById('eloGap');
    const signed = n => n > 0 ? `+${n}` : String(n).replace('-', '−');
    const update = () => {
      const gap = Number(slider.value), expected = 1/(1+10**(gap/rules.scale));
      document.getElementById('eloGapLabel').textContent = gap ? `${Math.abs(gap)} pontos ${gap > 0 ? 'acima' : 'abaixo'}` : 'Mesmo Elo';
      for (const [id,score] of [['eloWin',1],['eloLoss',0],['eloDraw',.5]]) document.getElementById(id).textContent = signed(Math.round(rules.k*(score-expected)));
    };
    slider.addEventListener('input',update); update();
  } catch (_) { root.innerHTML = '<p>Não foi possível carregar os elos. Recarregue a página para tentar novamente.</p>'; }
})();
