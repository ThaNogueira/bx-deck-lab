# BX Deck Lab

Montador 3-on-3 de **Beyblade X** com coleção física, catálogo online, análise heurística, decks meta, modo de decks físicos e organizador de torneios.

## Stack

- HTML/CSS/JS puro, sem build e sem backend — um site estático.
- Coleção, decks e torneios ficam no `localStorage` do navegador.
- Catálogos e stats são consultados online direto do navegador (fontes abaixo).

## Rodando local

Abra `index.html` no navegador. Como o app consulta catálogos online, a forma mais compatível é servir a pasta localmente:

```bash
python -m http.server 8080
```

Depois abra `http://localhost:8080`.

## Deploy

Passo a passo para servir numa VPS (Caddy, acesso por IP) em [DEPLOY.md](DEPLOY.md).

## Coleção e catálogo

- A coleção inicial é vazia.
- O catálogo é atualizado online ao abrir o site e combina partes/estatísticas com listas atuais de produtos Takara Tomy e Hasbro.
- A lista de Beys aceita o tipo entre parênteses opcionalmente, por exemplo `Sword Dran 3-60 F` ou `Sword Dran 3-60 F (Attack)`.
- Produtos conhecidos são decompostos em suas peças; CX e sistemas integrados recebem estrutura própria.
- “Adicionar pelo catálogo” só aceita uma peça existente no mesmo resolvedor online usado pela busca. Se a peça for nova demais para o índice principal, o site tenta consultar produtos da BEYBLADE X Database antes de desistir.
- A busca mostra ao mesmo tempo **peças** e **Beys/produtos**; encontrar uma peça local não impede mais a consulta de lançamentos online (caso do BrachioWhip).
- Peças adicionadas individualmente ficam registradas como **Adicionada à parte**.
- Ao passar o mouse sobre uma peça da coleção ou do montador, o tooltip mostra de quais Beys da sua lista vieram suas cópias físicas. Se houver uma cópia avulsa, ela é indicada separadamente.

## Faltam na coleção

- Nova aba que compara os Beys importados com catálogos Takara Tomy + Hasbro atualizados online.
- Filtros: todos, mainline, colecionador/limitadas, collabs e não-main; também pode filtrar por marca.
- Quando um lançamento TT e um Hasbro parecem representar o mesmo Bey, eles ficam no mesmo card com toggle de marca/nome. Random Booster “Select” também tenta agrupar a versão Hasbro equivalente pela Blade principal.
- Cards mostram código, linha/tipo e atalhos de pesquisa no Mercado Livre, Shopee e Amazon/Amazon JP. Os links são pesquisas, não garantia de estoque/preço.
- Itens de launcher/grip/acessório puro não entram no checklist de Beys.

## Tipos e heurísticas

- Blades só recebem Attack / Defense / Stamina / Balance quando há dado confiável (stats/perfil conhecido). Uma Blade sem informação suficiente não ganha “Balance” por padrão.
- A fonte de imagens não sobrescreve mais o tipo de uma Blade.
- Ratchets não recebem uma categoria Attack / Defense / Stamina / Balance na interface. O analisador usa altura, saliências, stats disponíveis e exposição a contatos/Burst.
- Bits continuam recebendo tipo e descrição de comportamento quando disponíveis.
- O analisador de Bey/deck é heurístico e não substitui testes reais de matchup, peso individual, molde, desgaste, estádio ou técnica de lançamento.

## Deck Builder

- Deck 3-on-3 com controle de quantidade física e validação de repetição.
- Visual separado de Blade/Main, Lock Chip, Assist/Over Blade, Ratchet, Bit e peças integradas.
- Reordenação por drag-and-drop ou setas.
- Deck aleatório e aleatório viável.
- Cópia de Bey individual/deck inteiro a partir de decks salvos e populares.
- Cópia de peças da aba Meta de peças para qualquer slot.

## Decks físicos

Permite reservar peças em decks já montados para partidas casuais com várias pessoas. Peças reservadas deixam de ser oferecidas nos próximos decks até o deck físico ser desmontado/removido da sessão.

## Torneio

- 2 a 32 jogadores.
- Nome, foto e deck por participante.
- Chave de eliminação simples com BYEs.
- Placar por confronto e tabela de J/V/D/PF/PA/Saldo.
- Opção **Disputa de 3º lugar**: os dois perdedores das semifinais recebem um confronto extra, que também conta na tabela. O confronto aparece menor, logo abaixo da Final, com campos de placar mais largos.

## Fontes principais

- WBO — regras e Winning Combinations: https://worldbeyblade.org/
- BEYBLADE X Database: https://beyblade.phstudy.org/
- BeybladeHub — índice visual de partes: https://beybladehub.app/parts
- Byyblade X HQ — stats e geometria: https://byybladebuilder.com/parts
- BBX Weekly: https://www.bbxweekly.com/4weeks
- BBX DB: https://bbxdatabase.com/record
- Beycrate: https://beycrate.com/
- BBXHub: https://bbxhub.net/
- BeyBase: https://beybase.com/
- BeyCommunity — listas de produtos TT/Hasbro: https://beycommunity.com/en/x/products/ e https://beycommunity.com/en/x/hasbro/

Este projeto não é afiliado à Takara Tomy, Hasbro, WBO ou às bases acima.
