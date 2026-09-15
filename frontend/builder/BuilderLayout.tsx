// One-time React shell. Empty regions below are explicitly owned by engine adapters.
// Do not add React children to legacy-managed regions without migrating their renderer.
export function BuilderLayout() {
  return <>
      <div className="hero compact">
        <div>
          <p className="eyebrow">DECK COMPETITIVO • WBO</p>
          <h1>Deck <em>Builder</em></h1>
          <p>Escolha o modo abaixo: qualquer peça do catálogo ou só a sua coleção. Repetições proibidas pelo regulamento ficam bloqueadas nos dois.</p>
        </div>
      </div>

      {/* Barra do builder: modo (catálogo × coleção) bem visível + ações agrupadas */}
      <div className="builder-bar">
        <div className="mode-switch" id="modeSwitch" role="radiogroup" aria-label="Com quais peças montar">
          <button type="button" role="radio" data-mode="all" aria-checked="true" className="active" title="Monte com qualquer peça do catálogo, mesmo sem possuir">
            <span className="ms-ic"><svg className="vicon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="bevel" strokeLinecap="square" aria-hidden="true"><use href="#i-globe"/></svg></span><span className="ms-txt"><b>Catálogo inteiro</b><small>qualquer peça, sem avisos de estoque</small></span>
          </button>
          <button type="button" role="radio" data-mode="mine" aria-checked="false" title="Monte só com as peças que você cadastrou na coleção">
            <span className="ms-ic"><svg className="vicon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="bevel" strokeLinecap="square" aria-hidden="true"><use href="#i-backpack"/></svg></span><span className="ms-txt"><b>Minha coleção</b><small>só o que você tem</small></span>
          </button>
          <i className="ms-thumb" aria-hidden="true"></i>
        </div>
        <div className="builder-actions">
          <div className="ba-tools">
            <div className="menu-wrap">
              <button type="button" className="btn secondary" id="genDeckBtn" aria-haspopup="menu" aria-expanded="false" title="Gerar um deck automaticamente"><svg className="vicon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="bevel" strokeLinecap="square" aria-hidden="true"><use href="#i-dice"/></svg><span>Gerar</span><svg className="vicon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="bevel" strokeLinecap="square" aria-hidden="true"><use href="#i-chevron"/></svg></button>
              <div className="gen-menu" id="genMenu" role="menu" hidden>
                <button type="button" role="menuitem" id="randomDeckBtn"><svg className="vicon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="bevel" strokeLinecap="square" aria-hidden="true"><use href="#i-dice"/></svg><span><b>Deck aleatório</b><small>3 Beys legais com as peças disponíveis</small></span></button>
                <button type="button" role="menuitem" id="viableDeckBtn"><svg className="vicon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="bevel" strokeLinecap="square" aria-hidden="true"><use href="#i-sparkle"/></svg><span><b>Aleatório viável</b><small>busca cobertura e sinergia pelas heurísticas</small></span></button>
              </div>
            </div>
            <button type="button" className="btn secondary" id="clearDeckBtn" title="Limpar os 3 Beys"><svg className="vicon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="bevel" strokeLinecap="square" aria-hidden="true"><use href="#i-trash"/></svg><span>Limpar</span></button>
            <button type="button" className="icon-btn" id="undoDeckBtn" data-undo title="Desfazer (Ctrl+Z) — últimos 10 passos" disabled><svg className="vicon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="bevel" strokeLinecap="square" aria-hidden="true"><use href="#i-rotate"/></svg></button>
            <button type="button" className="icon-btn" id="sfxBtn" title="Som ao encaixar peça"></button>
          </div>
          <div className="ba-main">
            <button type="button" className="btn secondary" id="shareDeckBtn" title="Publica o deck como um post na comunidade (tag Deck) com botões de abrir e copiar"><svg className="vicon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="bevel" strokeLinecap="square" aria-hidden="true"><use href="#i-community"/></svg><span>Compartilhar</span></button>
            <button type="button" className="btn primary" id="publishDeckBtn"><svg className="vicon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="bevel" strokeLinecap="square" aria-hidden="true"><use href="#i-save"/></svg><span>Salvar deck</span></button>
          </div>
        </div>
      </div>

      <div className="builder-layout">
        <div className="deck-area">
          <div className="deck-toolbar">
            <div className="deck-name-wrap">
              <label htmlFor="deckName">Nome do deck</label>
              <input id="deckName" maxLength={40} placeholder="Ex.: Deck de torneio" />
            </div>
            <div className="deck-toolbar-right">
              <div id="deckLegality" className="legality"></div>
            </div>
          </div>
          <div className="draft-notice" id="draftNotice" hidden></div>
          <div className="bey-pager" id="beyPager" aria-label="Navegar entre os Beys">
            <button type="button" data-pg="-1" aria-label="Bey anterior"><svg className="vicon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="bevel" strokeLinecap="square" aria-hidden="true"><use href="#i-back"/></svg></button>
            <div className="bey-pager-title"><p className="eyebrow">EDITANDO</p><b id="pagerTitle">Bey 1</b></div>
            <button type="button" data-pg="1" aria-label="Próximo Bey"><svg className="vicon flip-x" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="bevel" strokeLinecap="square" aria-hidden="true"><use href="#i-back"/></svg></button>
          </div>
          <div className="deck-grid" id="deckGrid"></div>
          <div className="pager-dots" id="pagerDots" aria-hidden="true"></div>
          <section className="analysis-card" id="deckAnalysis"></section>
          <div className="saved-panel">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">ARQUIVO PESSOAL</p>
                <h2>Meus decks</h2>
              </div>
              <a href="/meus-decks" style={{"color":"var(--cyan)","fontSize":"11px","textDecoration":"none"}}>organizar em pastas →</a>
            </div>
            <div id="myDecksPanel" className="saved-decks"></div>
          </div>
          <div className="saved-panel physical-panel">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">SESSÃO FÍSICA</p>
                <h2>Decks físicos</h2>
              </div>
              <a href="/#session" style={{"color":"var(--cyan)","fontSize":"11px","textDecoration":"none"}}>reservar peças →</a>
            </div>
            <p className="form-help" style={{"margin":"6px 0 0"}}>Decks que você montou com peças reais. Importe pro builder para ajustar, ou publique direto na sua conta.</p>
            <div id="physicalDecksPanel" className="saved-decks"></div>
          </div>
        </div>

        <aside className="side-panel">
          <div className="panel-card picker sticky">
            <div className="picker-head">
              <div>
                <p className="eyebrow">CATÁLOGO</p>
                <h2>Peças</h2>
              </div>
              <span className="picker-target">Bey <b id="activeSlotLabel">1</b></span>
            </div>
            <input id="pickerSearch" placeholder="Buscar peça…" />
            <div className="picker-filters" id="pickerFilters"></div>
            <div className="picker-recs" id="pickerRecs" hidden></div>
            <div className="picker-grid" id="pickerGrid"></div>
            <p className="picker-hint" id="pickerHint"></p>
          </div>

          <div className="panel-card">
            <div className="panel-title">
              <span className="status-dot"></span>
              <strong>Validação em tempo real</strong>
            </div>
            <div id="validationList" className="validation-list"></div>
            <hr />
            <div className="mini-rule">
              <span>3</span>
              <p><strong>3 Beys</strong><br/>para um deck completo.</p>
            </div>
            <div className="mini-rule">
              <span>1×</span>
              <p><strong>Sem repetir peças</strong><br/>mesmo possuindo cópias extras.</p>
            </div>
            <div className="mini-rule danger">
              <span>!</span>
              <p><strong>Metal Needle</strong><br/>banida por padrão na WBO.</p>
            </div>
          </div>
        </aside>
      </div>

      <div className="modal-backdrop" id="publishModal" hidden>
        <div className="modal">
          <button className="modal-close" id="publishClose">×</button>
          <h2 id="publishTitle">Salvar deck</h2>
          <p style={{"color":"var(--muted)","fontSize":"11px","margin":"0 0 14px"}}>Decks ficam guardados na sua conta em <b><a href="/meus-decks" style={{"color":"var(--cyan)"}}>Meus decks</a></b>. Se for público, também aparece em Decks da comunidade.</p>
          <div className="form-grid">
            <div><label>Título do deck</label><input id="pubTitle" maxLength={80} placeholder="Ex.: Trio anti-meta da loja X" /></div>
            <div><label>Descrição</label><textarea id="pubDesc" maxLength={2000} placeholder="Por que essas peças? Contra o que o deck joga bem?"></textarea></div>
            <div><label>Guia de lançamento</label><textarea id="pubGuide" maxLength={2000} placeholder="Como lançar cada Bey: força, ângulo, quando usar cada um…"></textarea></div>
            <div><label>Vídeo do YouTube (opcional)</label><input id="pubVideo" placeholder="https://youtube.com/watch?v=…" /></div>
            <div>
              <label>Quem pode ver</label>
              <div className="pill-toggle vis-picker" id="pubVisibility">
                <button type="button" data-public="1" className="active"><svg className="vicon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="bevel" strokeLinecap="square" aria-hidden="true"><use href="#i-globe"/></svg> Público — aparece na comunidade</button>
                <button type="button" data-public="0"><svg className="vicon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="bevel" strokeLinecap="square" aria-hidden="true"><use href="#i-lock"/></svg> Privado — só eu vejo</button>
              </div>
            </div>
            <div><label>Pasta (opcional)</label><input id="pubFolder" maxLength={40} placeholder="Ex.: Torneios, Ideias, Meta atual" /></div>
            <div id="pubPreview" className="pub-preview"></div>
            <div className="inline-actions"><button className="btn primary" id="pubSubmit">Salvar deck</button></div>
          </div>
        </div>
      </div>
    
  </>;
}
