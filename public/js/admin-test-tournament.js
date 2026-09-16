(() => {
  const boot = async () => {
    const me = await BX.me().catch(() => null);
    if (!me || !['ADMIN', 'MOD'].includes(me.role)) return;
    const foot = document.querySelector('.form-foot');
    if (!foot) return;
    foot.insertAdjacentHTML('afterbegin', '<button type="button" class="btn danger-outline" id="adminTestTournament">CRIAR TORNEIO TESTE (8 JOGADORES)</button>');
    document.getElementById('adminTestTournament').onclick = async () => {
      if (!confirm('Criar torneio oculto de teste, já em andamento com 8 jogadores?')) return;
      const button = document.getElementById('adminTestTournament'); button.disabled = true;
      try { const r = await BX.api('/api/tournaments/admin-test', { method: 'POST', body: {} }); location.href = `/torneio/${r.tournament.slug}`; }
      catch (e) { BX.toast(e.message); button.disabled = false; }
    };
  };
  boot();
})();
