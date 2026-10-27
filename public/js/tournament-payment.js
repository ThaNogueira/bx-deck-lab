/* One payment notice shared by tournament and registration screens. */
(() => {
  BX.tournamentPaymentNotice = tournament => {
    let url;
    try { const parsed = new URL(tournament.ticketUrl); if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) url = parsed; } catch {}
    const ticket = url && tournament.entryFeeCents > 0;
    const tamer = url && ['tamershop.com.br','www.tamershop.com.br'].includes(url.hostname);
    const store = tournament.storeName || 'loja';
    return `<div class="payment-notice${ticket ? ' payment-notice-ticket' : ''}" role="status">
      <div class="payment-notice-copy"><strong>Pagamento pendente</strong><p>${ticket ? 'Após a compra, aguarde a confirmação do gestor para participar das rodadas.' : 'Faça o pagamento na loja ou com o organizador. Sua participação nas rodadas depende da confirmação do gestor.'}</p></div>
      ${ticket ? `<a class="ticket-purchase${tamer ? ' tamer-ticket' : ''}" href="${BX.esc(url.href)}" target="_blank" rel="noopener noreferrer" aria-label="Comprar ingresso · ${BX.esc(store)} (abre em nova aba)">${tamer ? '<img src="/assets/stores/tamer-shop.jpg" alt="Tamer Shop" width="80" height="34">' : '<svg class="ticket-shop-mark" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4Z M15 5v3m0 3v2m0 3v3"/></svg>'}<span><b>Comprar ingresso</b><small>${BX.esc(store)}</small></span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 3h7v7M21 3 10 14M10 3H4v17h17v-6"/></svg></a>` : ''}
    </div>`;
  };
})();
