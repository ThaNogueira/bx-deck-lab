/* The Tamer ticket is specific to Tamer events, never another store's entry fee. */
(() => {
  const ticketUrl = 'https://www.tamershop.com.br/?view=ecom/item&ing=46575';
  BX.tournamentPaymentNotice = tournament => {
    const tamer = /\btamer(?:\s+shop)?\b/i.test(tournament.storeName || tournament.name || '');
    const ticket = tamer && tournament.entryFeeCents > 0;
    return `<div class="payment-notice${ticket ? ' payment-notice-ticket' : ''}" role="status">
      <div class="payment-notice-copy"><strong>Pagamento pendente</strong><p>${ticket ? 'Após a compra, aguarde a confirmação do gestor para participar das rodadas.' : 'Faça o pagamento na loja ou com o organizador. Sua participação nas rodadas depende da confirmação do gestor.'}</p></div>
      ${ticket ? `<a class="tamer-ticket" href="${ticketUrl}" target="_blank" rel="noopener noreferrer" aria-label="Comprar ingresso na Tamer Shop (abre em nova aba)"><img src="/assets/stores/tamer-shop.jpg" alt="Tamer Shop" width="80" height="34"><span><b>Comprar ingresso</b><small>Na Tamer Shop</small></span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 3h7v7M21 3 10 14M10 3H4v17h17v-6"/></svg></a>` : ''}
    </div>`;
  };
})();
