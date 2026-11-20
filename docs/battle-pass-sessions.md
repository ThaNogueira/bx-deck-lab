# Histórico e compartilhamento dos treinos

A aba Registros mantém as sessões organizadas por data e horário. Abrir uma sessão carrega seu resumo privado, sem sair da página. Os resumos abertos permanecem abertos quando novos lançamentos são sincronizados.

## Dados da sessão

- Máximo, média, mínimo, mediana, variação, quantidade de lançamentos e duração.
- Gráfico dos lançamentos, média das últimas cinco sessões comparáveis, variação da média e novo recorde em relação às marcas anteriores ao treino.
- Comparação do começo e do fim usa médias de até dez lançamentos por trecho, sem sobreposição. Só aparece com pelo menos seis lançamentos.
- Histórico de missões concluídas, XP, insígnias e níveis efetivamente ganhos na sessão. Títulos e descrições das missões são copiados no momento da recompensa.
- Lista de lançamentos carregada na interface em blocos de 50. O gráfico mantém todos os valores na linha e limita os marcadores visuais a cerca de 600 nas sessões muito longas.

Quando há lançamentos ao vivo, as estatísticas de desempenho e as comparações usam somente esses lançamentos. Registros antigos importados do BX-09 são identificados separadamente: não têm horário original conhecido, não recebem uma duração de treino inventada e não entram na comparação de sessões ao vivo.
O recorde pessoal também considera marcas importadas já conhecidas no início do treino, para não anunciar um recorde menor que um resultado antigo do próprio usuário.

A duração fechada usa o início da conexão e a desconexão registrada. Quando não há encerramento confirmado, o resumo usa o intervalo até o último lançamento conhecido e identifica esse fato. Não prolonga artificialmente uma sessão antiga até o momento atual.

## Persistência

Migração aditiva `prisma/migrations/20261120020000_battle_pass_session_overview/migration.sql`:

- `BattlePassTraining.startXp/lastXp`: estado da progressão na primeira sincronização e na atualização mais recente da sessão.
- `BattlePassMissionReward.sessionId`: atribuição da conquista ao treino que a concluiu; títulos e descrições também são preservados.
- `BattlePassTrainingGain`: cada crédito de XP com saldo anterior e posterior. Os níveis ganhos são derivados desses eventos, evitando atribuir à sessão os níveis de outro treino simultâneo.

O crédito e o vínculo com a sessão são feitos dentro da transação de sincronização já existente. Repetir os mesmos lançamentos não duplica conquistas ou eventos de XP. Lançamentos recebidos sem internet mantêm a sessão original quando a fila é reenviada.

Os ganhos antigos não possuíam vínculo com sessão. Permanecem no saldo e na coleção, mas não são atribuídos por aproximação de horário a um treino. O resumo mostra que o registro detalhado de XP por sessão começou nesta atualização. O saldo inicial de uma sessão offline é o saldo conhecido na primeira sincronização, não uma reconstrução de contas anteriores.

## API e privacidade

`GET /api/battle-pass/sessions/:id/overview` exige autenticação e retorna apenas sessões da conta atual. Sessões de outras contas respondem 404. Não inclui e-mail, endereço BLE ou identificadores internos do dispositivo. A rota antiga de lançamentos paginados é preservada.

Gráficos e comparações de sessões locais continuam acessíveis pelo IndexedDB quando estão neste navegador. Nesse caso, não são fabricados dados de XP que dependem do servidor.

## Imagem compartilhável

O usuário gera e revisa um PNG quadrado de 2160 × 2160, com nome, foto, nível atual, data, máximo, média, quantidade, tempo registrado, evolução, comparação, recorde e ganhos de XP/missões/níveis. Fotos que não permitem leitura por CORS usam a inicial do nome; isso mantém o PNG exportável sem buscar URLs arbitrárias no servidor.

O arquivo pode ser baixado. Quando o navegador oferece compartilhamento nativo de arquivos, aparece também Compartilhar. A geração não publica nem envia automaticamente nenhum dado. O PNG é gerado no próprio navegador e a memória do canvas é liberada após a exportação.

## Verificação

```text
node --test scripts/battle-pass-sessions.test.mjs scripts/battle-pass-missions.test.mjs scripts/battle-pass.test.mjs
node scripts/battle-pass.integration.mjs
node scripts/check-frontend-contracts.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Os testes usam SQLite temporário e rádio simulado. Conferem propriedade e autenticação, duração, exclusão de importações da comparação ao vivo, média ponderada, recorde, atribuição única de XP e níveis, preservação de sessões antigas, interface responsiva e dimensões do PNG baixado.
