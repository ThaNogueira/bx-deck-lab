# Missões e progressão do Battle Pass

Implementadas na aba **Missões**, dentro de `/battle-pass`. A correção de conexão/Bluefy foi publicada separadamente antes deste recurso.

## Regras

- Quatro missões diárias, quatro semanais e quatro mensais, com metas de lançamentos, dias ativos e regularidade.
- Dia e mês seguem `America/Sao_Paulo`; a semana começa segunda-feira. O prazo aparece na aba.
- Apenas lançamentos novos ao vivo, com horário conhecido, entram nas missões. Importações do histórico, demonstrações e registros duplicados não geram progresso nem recompensas. Não há recálculo retroativo dos lançamentos antigos do banco.
- A fila offline preserva a data do lançamento. Registros ao vivo sincronizados até 35 dias depois entram no período original; datas futuras além da tolerância de cinco minutos são rejeitadas pela API. Dentro dessa tolerância, o calendário é limitado ao horário atual do servidor.
- Regularidade usa trios sem sobreposição: `(máximo - mínimo) / média <= 0,20`. Cada trio elegível conta uma vez, em cada período correspondente.
- Cada missão só recompensa uma vez em seu período. O fechamento de um período zera as metas desse período, sem remover XP, insígnias ou conquistas já ganhos. Dias de treino não precisam ser consecutivos.

As metas e recompensas ficam em `public/js/battle-pass/mission-rules.mjs`, compartilhado como módulo puro com o servidor. O cliente não determina XP, saldo, conclusão ou alvo.

## Níveis e insígnias

- Nível inicial 1; máximo 100.
- Custo do próximo nível `L`: `100 + 25 × (L−1) + 2 × (L−1)²` XP. O custo aumenta a cada nível, de 100 XP no primeiro para 21.758 no nível 99.
- O nível é derivado do XP acumulado. No nível 100 a barra mostra MAX; novas missões continuam acumulando recompensas, sem criar nível 101.
- Cada nível possui uma cor; faixas mais altas ganham contorno, aura e órbita adicionais. Os efeitos respeitam a preferência de reduzir movimento.
- Insígnias vetoriais próprias em `public/assets/battle-pass/insignias.svg`: Faíscas (diárias), Órbitas (semanais) e Núcleos (mensais). Os totais por tipo e o total geral são preservados.
- Não há gasto, loja ou troca implementada. Uma eventual economia com bens ou valor real precisará de regras e controles adicionais: os dados BLE recebidos pelo navegador não são prova criptográfica de lançamento físico.

## Persistência e idempotência

Migração aditiva: `prisma/migrations/20261120000000_battle_pass_missions/migration.sql`.

| Modelo | Uso |
|---|---|
| `BattlePassProgress` | XP total, insígnias totais e missões concluídas por usuário |
| `BattlePassMissionPeriod` | Contagem, dias ativos, trios e amostras pendentes por usuário/período |
| `BattlePassMissionReward` | Registro permanente de cada recompensa e estado da notificação |

A chave única de recompensa é `(userId, cadence, period, missionKey)`. Os avanços e créditos ocorrem na mesma transação que insere os lançamentos novos; conflitos ou falhas desfazem tudo. Repetir uma sincronização aceita não volta a creditar a carteira.

`GET /api/battle-pass/missions` retorna somente o progresso do usuário autenticado. `POST /api/battle-pass/missions/ack` confirma a exibição de suas notificações; exige o mesmo `accountId` da sessão e não altera saldo ou XP. Não existe endpoint de reivindicação de XP enviado pelo cliente.

## Interface e som

`public/js/battle-pass/missions.mjs` exibe carteira, nível, barra de XP, períodos e cartões de metas. A coleção é feita com SVGs planos; os efeitos mais fortes são reservados à evolução de nível.

O progresso e os avisos de conquista funcionam em todas as abas do Battle Pass, inclusive Treinar, sem precisar abrir Missões. Fora de Treinar, cada lançamento novo também mostra um aviso compacto com o último SP; tocar nele abre Treinar. A conexão não muda a aba selecionada.

Um avanço observado no contador A0 identifica o lançamento novo mesmo quando as páginas de sensores não chegam ou a captura coincide com uma leitura de histórico. O registro precisa estar no histórico com checksum válido; usa o horário de recebimento do A0. A primeira leitura ao conectar continua sendo importação, sem progresso ou aviso de lançamento. Releituras e quadros duplicados não repetem créditos nem avisos.

Novas recompensas geram um aviso temporário de conquista, sem bloquear cliques. A fila e os IDs vistos evitam repetir o mesmo aviso a cada atualização. Notificações ainda não confirmadas podem ser recuperadas após uma queda de rede. A recuperação ocorre depois de sincronizar, ao voltar para a página e periodicamente enquanto a página está visível, independentemente da aba interna. O som é sintetizado com Web Audio e desbloqueado por interação real do usuário; o botão de som permite desligá-lo e guarda a preferência. As políticas de áudio do navegador continuam sendo respeitadas.

O marcador de Blade vazio agora é um círculo HTML, escondido quando há render selecionado. Isso evita a sobreposição do SVG genérico anterior, cujo atributo `hidden` não era refletido pelo DOM de SVG em alguns navegadores.

## Verificação

```text
node --test scripts/battle-pass-missions.test.mjs
node --test scripts/battle-pass.test.mjs
node scripts/battle-pass.integration.mjs
node scripts/check-frontend-contracts.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Os testes usam SQLite temporário e rádio simulado. Cobrem nível máximo, curva crescente, cores únicas, virada do dia/semana/mês, dados offline, descarte de histórico/demonstração, idempotência, concorrência, tentativas de injetar XP, isolamento entre contas, confirmação de avisos, metas mensais e preservação das recompensas após renovação. O teste de navegador cobre os três períodos, progresso, controle de som, conquista em Treinar antes de visitar Missões, lançamentos sem sensores nas cinco abas, avisos de SP e layouts de 360/390/1440 px.
