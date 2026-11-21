# Battle Pass Lab — BX-09

Implementação integrada em `/battle-pass`, adicionada em novembro de 2026.
Usa a conta, a sessão de autenticação, o Express e o SQLite/Prisma existentes.
Não exige aplicativo próprio nem Bluetooth no servidor.

## Uso e interface

- **Treinar:** tela direta nas abas, três indicadores compactos (Bluetooth, bateria estimada e Bey encaixada), último SP, máximo, média, quantidade e evolução. Opções de conexão ficam num painel recolhido. O gráfico SVG liga todos os lançamentos da sessão, sem limitar aos 20 últimos. Não há cabeçalho promocional, confirmação constante de salvamento, contadores técnicos, diagnóstico ou rodapé na interface.
- **Registros:** média geral, recorde, quantidade e sessões pessoais. Sessões expansíveis, 10 por página, lançamentos de 30 em 30. Importações preservam `measuredAt = null`; o início da sessão indica a captura/importação, não a hora de lançamentos antigos.
- **Ranking SP:** top 50 por recorde ou média, mínimo de 10 lançamentos com SP positivo e compartilhamento ativado por padrão para todas as contas. Inclui apenas usuários ativos; quem desmarca a opção sai do ranking. Contas sem lançamentos ou somente com zeros não aparecem. Zeros não entram na contagem nem na média do ranking. Não altera o elo. Dados de treino enviados pelo navegador, sem prova criptográfica; não representam resultado competitivo homologado. Suspensão/banimento existente remove o usuário da lista. Uma competição oficial exigirá moderação dos lançamentos e regras adicionais contra fraude.
- **Como conectar:** instruções baseadas no manual Takara Tomy, imagens oficiais do BX-09, compatibilidade e solução de problemas.
- **Perfil:** máximo em primeiro, média e quantidade, sem barras de lançamentos. Uma régua marca o máximo nas faixas Iniciante (0), Aprendiz (6.000), Intermediário (11.000), Habilidoso (15.000) e Profissional (20.000 SP). Faixas visuais de treino do BX Lab, não classificação oficial. O proprietário vê seus dados; visitantes veem os agregados enquanto o compartilhamento estiver ativado em Registros (padrão).
- **Demonstração:** dados temporários em memória, identificados como simulação. Não chama a fila de gravação e não alimenta banco, perfil ou ranking.
- **Animações:** etapa visual breve de cálculo e dígitos em rolos alternados a cada lançamento, inclusive quando o SP é igual ao anterior. Verde a partir de 11.000, laranja a partir de 12.000, vermelho a partir de 15.000. Reflexos metálicos e fundo espacial suave usam animações de transformação; a preferência de reduzir movimento é respeitada.
- **Reconexão:** `getDevices()` recupera somente permissões já concedidas; um BX-09 autorizado pode reconectar diretamente ao abrir o Lab ou ao tocar no Bluetooth. Na primeira conexão `requestDevice()` continua exigindo o seletor nativo e um gesto do usuário. Não existe varredura sem autorização. Conexões conhecidas indisponíveis geram erro recuperável, sem tentativas infinitas.
- **Mini Blade:** a renderização do catálogo aparece no card do último SP. Toque nela para escolher entre as Blades; a escolha fica no navegador por conta e usa a favorita como padrão. Ao receber o primeiro `A0` com contador novo, o modelo visual já recebe impulso, antes do número final. O SP recebido ajusta a velocidade; arrasto, precessão, inclinação e sombra desaceleram até o repouso. É uma dinâmica decorativa em 2,5D, sem conversão SP/RPM e sem motor 3D pesado. Fora da tela/aba o desenho pausa; reduzir movimento mantém o render estático. O perfil mostra somente os números, a régua e suas descrições.

## Arquitetura e arquivos

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| Transporte | `public/js/battle-pass/transport.mjs` | Web Bluetooth, permissão por clique, descoberta, Notify, comandos permitidos e desconexão |
| Protocolo | `public/js/battle-pass/protocol.mjs` | Fragmentos, páginas, little endian, checksum e eventos decodificados |
| Sessão | `public/js/battle-pass/session.mjs` | Estados, contador, FIFO de 50, rollover/reinicialização e deduplicação |
| Persistência | `public/js/battle-pass/sync.mjs` | IndexedDB por conta, fila durável, lotes de 100, repetição com espera progressiva |
| Interface | `public/battle-pass.html`, `public/ui/battle-pass.css`, `public/js/battle-pass/lab.mjs`, `public/js/battle-pass/chart.mjs` | Abas, gráfico SVG completo, estados, tutorial e demo |
| Escala SP | `public/js/battle-pass/power.js`, `public/ui/battle-pass-power.css` | Cores, faixas de treino, régua e reflexos compartilhados com o perfil |
| Mini Blade | `public/js/battle-pass/spinner.mjs` | Seletor do catálogo e dinâmica visual desacoplada dos dígitos |
| Perfil | `public/js/battle-pass/profile.js`, `public/ui/battle-pass-profile.css`, `public/u.html`, `public/perfil.html` | Cartão compacto de estatísticas |
| API | `server/routes/battle-pass.js`, `server/battle-pass-stats.js` | Autorização, transações, agregações e ranking opcional |
| Integração | `server/index.js`, `server/routes/profile.js`, `public/js/shared.js` | Rotas, dados de perfil e navegação existente |

Web Bluetooth roda no navegador. O servidor recebe os lançamentos usando o cookie autenticado existente. As escritas exigem que `accountId` corresponda à sessão atual; esse campo é uma proteção contra troca de conta durante uma fila pendente, nunca uma autorização para escolher outro usuário.

Em caso de queda da rede, os registros permanecem no IndexedDB da conta. A fila tenta novamente, retoma no evento `online` e após recarregar. O backend usa a chave única `(userId, deviceId, epoch, counter)` e uma transação para impedir duplicatas. Conflito de SP para a mesma chave retorna 409 sem substituir o registro. Escritas simultâneas da mesma conta são serializadas no processo Express.

Convidados podem capturar dados localmente, mas a sincronização requer entrar **antes** do treino. Registros de convidado não são transferidos automaticamente para outra identidade. Navegação privada, limpeza do navegador e remoção dos dados do site podem eliminar uma fila ainda não enviada.

## Protocolo documentado

- Nome anunciado: `BEYBLADE_TOOL01`.
- Serviço: `55c40000-f8eb-11ec-b939-0242ac120002`, confirmado no cliente web Battlebey citado abaixo.
- Notify: `55c4f002-f8eb-11ec-b939-0242ac120002`.
- Write without response: `55c4f001-f8eb-11ec-b939-0242ac120002`.
- Únicos comandos implementados: metadados `0x51` e histórico `0x74`. O comando destrutivo `0x75` não é implementado nem transmitido.
- `A0`, 17 bytes: estado no byte 3; recorde SP no offset 7; contador no offset 9; endereço em 11–16, invertido. Inteiros de 16 bits little endian. `4` indica Bey encaixada e `0` estado pronto. Retirada sem incremento de contador é tratada como cancelamento.
- Bateria estimada: offset 4 do `A0`, escala bruta de 0–255; conversão `round(byte × 100 / 255)` usada pelo decoder aberto do DiZZi. A interface mostra `Bateria` e `N%`, inclusive quando o byte vale zero. Clicar no indicador abre a explicação de que é uma estimativa sem calibração de carga restante, que pode oscilar. Atualiza ao receber metadados na conexão, no encaixe e no lançamento; desconexão, nova busca e demo limpam a leitura. Nenhum comando adicional é enviado.
- `B0` a `B7`, 17 bytes cada: 1 tag e 16 bytes de dados. Após remover as tags, os primeiros 100 bytes guardam até 50 valores SP, do mais antigo ao mais recente; offsets 102/104/106 guardam recorde, contador e quantidade. O último byte, 127, é a soma dos 127 anteriores módulo 256. Tags não entram no checksum.
- `70` a `73`: páginas de sensores. São preservadas no diagnóstico e identificam o fluxo ao vivo. Não há conversão validada para gráficos de aceleração ou RPM.
- `A1`: sinal de reinicialização reconhecido, sem envio de comandos de reset.
- Notificações fragmentadas e várias páginas em uma notificação são aceitas. Quadros incompletos, páginas fora de sequência, checksum inválido e valores vazios são descartados. A leitura pode ser repetida sem apagar o acessório.
- Um lançamento é marcado ao vivo com sensores e contador novo ou quando há avanço observado no contador A0, mesmo sem sensores. A primeira leitura e os demais registros antigos são importados, com horário original desconhecido.
- Cada dispositivo é associado à conta usando SHA-256 do identificador reportado. O ID de navegador é apenas metadado local; não serve como chave entre navegadores.
- A época local distingue rollover do contador de 16 bits e regressões após reset. Um histórico que atravessa o rollover também é tratado na primeira conexão. Ausência prolongada, múltiplos rollovers ou reset externo não documentado ainda podem criar ambiguidades e precisam de validação física. Um conflito não sobrescreve registros automaticamente.

O indicador de bateria apresenta uma estimativa do nível bruto, não uma medição calibrada de carga restante. A engenharia reversa identifica o byte que diminui com o uso, mas registra oscilações entre repouso e lançamento; o DiZZi o normaliza linearmente, e BeyGear/Bey Power Meter também descrevem suas leituras como estimadas. A fórmula não prevê autonomia nem foi calibrada por esta implementação com pilhas físicas em diferentes estados. Sem A0 válido, aparece `—`; não se reutiliza o valor de outra conexão. SP não é declarado como RPM. O recorde do acessório pode ser maior que o recorde registrado no Lab porque o dispositivo só preserva os últimos 50 SP individuais; os dados técnicos continuam no protocolo, sem ocupar a tela de treino.

## Banco e API

Migração: `prisma/migrations/20261119000000_battle_pass_lab/migration.sql`.

Adiciona `User.battlePassPublic` e os modelos abaixo. A migração `20261120030000_battle_pass_public_default` altera o padrão para `true` e ativa uma vez o compartilhamento nas contas existentes. Desmarcações posteriores continuam sendo respeitadas.

- `BattlePassDevice`: proprietário, chave, nome, identificador local, último uso e cursor.
- `BattlePassTraining`: sessão, proprietário, dispositivo, início/fim e contagem/média/recorde.
- `BattlePassLaunch`: SP, contador, época, origem, horário real opcional, sincronização e combo opcional.

Todas as relações com usuário/dispositivo/sessão usam exclusão em cascata. Consultas pessoais são filtradas por proprietário, sem cache compartilhado. O payload máximo de sincronização é de 100 lançamentos. Valores são inteiros SP 1–65535, contador 0–65535, épocas limitadas e datas validadas. O frontend não é uma fonte autenticada de medição física; alguém com controle do navegador pode falsificar um payload.

| Endpoint | Acesso |
|---|---|
| `GET /api/battle-pass?page=1` | Conta: estatísticas, sessões, dispositivos e preferência |
| `GET /api/battle-pass/sessions/:id?page=1` | Somente proprietário, 30 lançamentos por página |
| `POST /api/battle-pass/devices` | Conta correspondente: associação e cursor |
| `POST /api/battle-pass/sync` | Conta correspondente: lote idempotente |
| `PATCH /api/battle-pass/preferences` | Conta correspondente: compartilhamento público |
| `GET /api/battle-pass/ranking?sort=best` ou `average` | Agregados de contas ativas com compartilhamento ligado e pelo menos 10 SP positivos |
| `GET /api/users/:slug` | Cartão agregado conforme privacidade, sem histórico BLE individual |

Aplicação da migração segue o deploy existente: `prisma generate` durante o build e `prisma migrate deploy` na inicialização do contêiner. Não requer novas variáveis, serviços ou dependências.

## Estatísticas

Médias usam registros SP individuais, incluindo importações válidas. A média geral é ponderada por lançamento, não uma média de médias de sessão. A variação é `desvio-padrão / média × 100` dos últimos 10 lançamentos da sessão; menor significa maior regularidade. A evolução compara a média dos últimos 10 com a dos 10 anteriores, aparecendo somente após 20 registros. Não são métricas oficiais Takara Tomy. Horários importados permanecem desconhecidos.

## Testes executáveis

```text
node --test scripts/battle-pass.test.mjs
node --test scripts/battle-pass-public.migration.test.mjs
node scripts/battle-pass.integration.mjs
node scripts/check-frontend-contracts.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Fixtures reais: `scripts/fixtures/battle-pass.json`, extraídas do artigo e do DiZZi, com crédito MIT. Cobrem o primeiro lançamento e o lançamento 55 com FIFO cheio. Os testes incluem endianness, checksum, fragmentação/coalescência, recuperação de quadro inválido, cancelamento, captura ao vivo, rollover, reset, repetição e reconexão.

A integração cria um banco SQLite temporário, aplica todas as migrações e usa sessões reais de autenticação. Testa permissões entre contas, troca de conta, simultaneidade, idempotência, validação, paginação, privacidade, ranking e exclusão de usuários banidos. O navegador Edge com rádio BLE simulado testa IndexedDB, falha de rede, recarga e retomada, comando por clique, demo isolada, compartilhamento e layouts de 1440/390/360 px. Capturas ficam em `artifacts/battle-pass/` (fora do Git).

## Teste obrigatório com BX-09 físico

O desenvolvimento usou payloads reais publicados e rádio simulado. **Ainda não houve teste físico de GATT, Notify ou lançamento em um BX-09 nesta implementação.** A área visual de diagnóstico foi removida a pedido do usuário; instrumentação de bancada pode usar os callbacks `onPacket`/`onInvalid` do protocolo e `onDiagnostic` do transporte.

1. Abra `/battle-pass` por HTTPS no Chrome Android ou Chrome/Edge desktop. Faça login antes de lançar. Sem permissão anterior, não deve surgir solicitação ao abrir a página. Com permissão anterior e BX-09 disponível, confira a reconexão direta sem seletor.
2. Coloque pilhas boas, instale o BX-09 corretamente e retire a Bey. Ligue: botão por cerca de 1 segundo, LED verde. Depois, pressione por cerca de 1 segundo para alternar verde e laranja. Não mantenha pressionado por 3 segundos, pois isso pode encerrar a comunicação.
3. Toque **Conectar Battle Pass**, selecione `BEYBLADE_TOOL01` e autorize. Confirme o serviço e as características reais. Feche outro app que esteja usando a conexão.
4. Com instrumentação de bancada, confira o envio apenas de `51` e `74`, recepção de `A0` e `B0`–`B7`, checksum e importação. Verifique no dispositivo que a leitura não apagou o histórico.
5. Encaixe a Bey: confira o indicador de encaixe. Retire sem lançar: confira cancelamento e ausência de novo registro. Encaixe novamente e lance dentro do estádio: confira SP, contador, páginas `70`–`73`, animação e gravação.
6. Compare os SP com a leitura oficial/DiZZi sem manter os dois conectados simultaneamente. Teste várias notificações e os intervalos reais. O timeout de quadros parciais é 1,5 s; o fluxo completo aguarda até 350 ms pelas páginas finais de sensores.
7. Faça mais de 50 lançamentos e releia: a FIFO deve importar somente os ainda não registrados. Desconecte e reconecte; o total salvo não deve aumentar sem novos SP.
8. Desative apenas a internet, mantendo Bluetooth ligado. Lance novamente; veja indicação de salvamento local. Recarregue e reative a rede; confira a retomada sem duplicatas.
9. Encerre a sessão e confira os registros. O compartilhamento vem marcado em Registros; desmarcar oculta os agregados para visitantes e retira a conta do ranking. Dez lançamentos com SP positivo são necessários para o ranking.
10. No iPhone, repita no Bluefy com Bluetooth autorizado. Teste também beacio instalado e habilitado para o site no Safari, após recarregar. Safari/Chrome sem ponte devem oferecer orientação e consulta ao histórico, sem prometer conexão nativa. WebViews sem `navigator.bluetooth` também exibem esse fallback.

Capturas de bancada e discrepâncias de checksum/contador permitem refinar o protocolo sem adivinhar campos. Rollover físico, reset, dispositivos de versões diferentes, suspensão da aba e reconexão após bloqueio da tela são pendências específicas para bancada. Os testes também cobrem as três fronteiras de cor, 100 pontos no gráfico, repetição do mesmo SP, Profissional em 20.000 SP e reconexão automática sem chamar `requestDevice()` novamente.

## Fontes e licenças

- Engenharia reversa: https://blog.simone.computer/reverse-beyblade-launch-tracker
- DiZZi (MIT), commit `ea18b7b3e5b18a00e2557537acfcf8753b0d5c33`: https://github.com/syxanash/DiZZi
- Estimativa de bateria no decoder do DiZZi: https://github.com/syxanash/DiZZi/blob/main/backend/decoder.js
- Leituras descritas como estimativas pelos desenvolvedores: https://beygear.app/bey-battle-pass/ e https://note.com/keikeiplaygames/n/nf168dbf97f88?hl=en
- Arquivos de protocolo: `backend/decoder.js` e `backend/scanner.js`. Aviso MIT preservado em `public/battle-pass/THIRD-PARTY.txt`.
- Referência web: https://battlebey.com/en/battlespin
- Serviço GATT confirmado como constante usada em `optionalServices`/`getPrimaryService` no bundle público consultado em 19/11/2026: https://battlebey.com/_next/static/chunks/app/%5Blocale%5D/battlespin/page-3456d4449cc1f9d1.js . Nenhum layout ou código de implementação proprietário foi copiado.
- Web Bluetooth: https://developer.chrome.com/docs/capabilities/bluetooth
- Permissões e dispositivos autorizados: https://bluetooth.spec.whatwg.org/
- Produto, imagens e manual oficiais: https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx09.html
- Manual oficial de comunicação: https://beyblade.takaratomy.co.jp/beyblade-x/manual/BX-09_manual.pdf
- Manual físico: https://www.takaratomy.co.jp/support/manual/items/4904810905240%20BX-09%20%E3%83%99%E3%82%A4%E3%83%90%E3%83%88%E3%83%AB%E3%83%91%E3%82%B9_%E5%8F%96%E6%89%B1%E8%AA%AC%E6%98%8E%E6%9B%B8.pdf
- Pontes iOS: https://bluefy.app/ e https://beacio.com/

Imagens de identificação do produto mantêm o copyright TOMY/BBXProject. A ferramenta é uma integração independente do BX Lab; não implementa Bey Points, login japonês ou APIs privadas da Takara Tomy.
