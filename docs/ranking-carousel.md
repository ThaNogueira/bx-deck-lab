# Carrossel do ranking

Admin → Carrossel do ranking (`/admin#rankingArt`). Gera páginas quadradas de 2160 px para Instagram e um ZIP com PNGs numerados, sem publicar automaticamente.

Ranking atual usa a mesma ordem da página pública: jogadores estabelecidos, elo decrescente e pontos do circuito como desempate. O modo mensal filtra os torneios pela data de início no mês de São Paulo e ordena pelos pontos do circuito, ouros e vitórias. Os elos mostrados no modo mensal continuam sendo os elos atuais. A imagem declara esse critério; liderança mensal não é apresentada como título oficial de um torneio.

Cada categoria tem uma capa de introdução própria com os dois personagens enviados, data/mês dinâmico e chamada “Arraste para conhecer os bladers!” com quatro setas. O top 3 ocupa uma página por jogador. As demais páginas mostram até cinco jogadores cada. A página final mostra o total do período e destaques entre os jogadores exibidos, com mínimo de dez partidas para o destaque de win rate. WR usa vitórias / (vitórias + derrotas), explicitado na última página. Só entram torneios concluídos públicos ou por link, sem os testes administrativos. As regras e os pontos dos torneios não mudam.

As duas capas e o fundo das estatísticas foram gerados pela ferramenta embutida ImageGen. A tipografia, os dados e as setas são desenhados em canvas para preservar nitidez e atualização; os logos originais são usados sem recriação pela IA. BeyStyle aparece em destaque e Tamer como PARCEIRA. Painéis possuem sombras e bordas com glow azul. Avatares usam um endpoint autenticado por ID, com tratamento de imagem e fallback para o avatar padrão. Somente ADMIN pode gerar e acessar esses dados/imagens. O arquivo final não contém controles da prévia. Alterar o período ou a quantidade invalida o carrossel anterior.

Validação: `node scripts/ranking-art.integration.mjs`. Usa banco isolado e cobre permissões, fronteira do mês, campos públicos, cinco páginas, navegação, PNG 2160 px, ZIP e layout de celular. As prévias em `artifacts/ranking-art` usam jogadores de teste e não são publicadas.
