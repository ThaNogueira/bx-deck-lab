# Carrossel do ranking

Admin → Carrossel do ranking (`/admin#rankingArt`). Gera páginas quadradas de 2160 px para Instagram e um ZIP com PNGs numerados, sem publicar automaticamente.

Ranking atual usa a mesma ordem da página pública: jogadores estabelecidos, elo decrescente e pontos do circuito como desempate. O modo mensal filtra os torneios pela data de início no mês de São Paulo e ordena pelos pontos do circuito, ouros e vitórias. Os elos mostrados no modo mensal continuam sendo os elos atuais. A imagem declara esse critério; liderança mensal não é apresentada como título oficial de um torneio.

Cada categoria tem uma capa de introdução própria com os dois personagens enviados, data/mês dinâmico e chamada “Arraste para conhecer os bladers!” com quatro setas. O top 3 ocupa uma página por jogador. As demais páginas mostram até cinco jogadores cada. A página final mostra o total do período e destaques entre os jogadores exibidos, com mínimo de dez partidas para o destaque de win rate. WR usa vitórias / (vitórias + derrotas), explicitado na última página. Só entram torneios concluídos públicos ou por link, sem os testes administrativos. As regras e os pontos dos torneios não mudam.

As duas capas e o fundo das estatísticas foram gerados pela ferramenta embutida ImageGen. A tipografia, os dados e as setas são desenhados em canvas para preservar nitidez e atualização; os logos originais são usados sem recriação pela IA. BeyStyle aparece em destaque e Tamer como PARCEIRA. Painéis possuem sombras e bordas com glow azul. Avatares usam um endpoint autenticado por ID, com tratamento de imagem e fallback para o avatar padrão. Somente ADMIN pode gerar e acessar esses dados/imagens. O arquivo final não contém controles da prévia. Alterar o período ou a quantidade invalida o carrossel anterior.

## Revisão v3

15 chibis compactos dos cinco personagens, com poses e expressões diferentes, corpo curto, mãos vazias e fundo transparente. A implementação usa `public/assets/ranking/chibis-v3/`, com derivados PNG de até 512 px para reduzir memória e tráfego; os originais de geração continuam preservados. Os desenhos altos/com Beyblades não são usados. Prompts em `docs/ranking-carousel-imagegen-v3.md`.

A edição mensal usa fundos e glows vermelhos, capa “Bladers do mês” e nome do mês grande. A edição geral permanece azul e traz “Reporte geral semanal”; continua sendo um retrato da classificação geral atual, não um filtro da última semana. Métricas possuem blocos individuais e centralização pelos limites reais das letras. Top 3 inclui troféu minimalista nas cores ouro/prata/bronze e posição em destaque.

A Bey mais usada é derivada do primeiro combo frequente encontrado pelo ranking, escolhendo sua Blade/Main Blade; sem imagem disponível, usa a favorita cadastrada no perfil. Peças ocultas e jogadores sem essas informações não recebem Bey inventada. A informação identifica se é uso no período ou preferência do perfil. Chibis aparecem ao lado das Beys e nas áreas livres de todas as páginas.

## Revisão v4

Somente um chibi por página, em um canto. No top 3, fica no canto direito junto da colocação: número grande e troféu à esquerda, sem card em volta. A identidade e as métricas ficam mais próximas; vitórias usam bloco verde e derrotas bloco vermelho. Torneios e win rate completam a primeira linha. Medalhas ocupam uma faixa única com divisórias finas e a Bey, quando disponível, uma faixa inferior. Os 15 desenhos continuam disponíveis para variação entre páginas, sem acumular personagens no mesmo slide. O teste verifica uma única ilustração chibi desenhada em cada página de ambas as categorias.

Na revisão v5, ouro, prata e bronze recebem blocos separados com fundo e borda na cor de cada medalha e um pequeno troféu correspondente no canto superior direito. O total de pódios conserva a cor da edição.

Validação: `node scripts/ranking-art.integration.mjs`. Usa banco isolado e cobre permissões, fronteira do mês, campos públicos, cinco páginas, navegação, PNG 2160 px, ZIP e layout de celular. As prévias em `artifacts/ranking-art` usam jogadores de teste e não são publicadas.
