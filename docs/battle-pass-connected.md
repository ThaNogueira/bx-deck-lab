# Battle Pass: sessão entre aparelhos e Web Push

A captura continua pertencendo ao aparelho conectado ao Battle Pass. A mesma
conta pode abrir Treinar em outro aparelho para acompanhar SP, Blade, média,
recorde, contagem, lista e gráfico na interface normal de treino. Não há modal
de sessão. O indicador mostra `Ao vivo · iPhone`, `Android`, `iPad`, `Mac` ou `PC`;
depois de 60 segundos sem sinal da captura, passa a `Sem sinal de captura`.
Encerrar a visualização não desconecta o aparelho de origem.

## Navegar e receber avisos

Ao navegar por links do site durante uma conexão, a página dona do Bluetooth
permanece aberta como estrutura principal. As outras páginas abrem dentro da
estrutura, com um atalho pequeno para retornar ao treino. A conexão não é
transferida para um iframe, worker ou outro aparelho. Atualizar a página,
fechar o navegador ou sair para outro site ainda pode encerrar a conexão.

Novos lançamentos geram avisos discretos nas outras páginas. Abrir o aviso
leva à aba Treinar. SSE transmite apenas dados da própria conta; reconectar
recarrega um snapshot atual. A visualização remota mostra até os últimos 60
registros da sessão, com totais agregados completos. Registros importados são
identificados e não disparam push.

`Manter tela ligada` é opcional e usa Screen Wake Lock quando disponível; não
impede o sistema operacional de suspender um navegador em segundo plano.

## Ativar push

No menu de **três pontinhos ao lado do estado da Bey**, tocar em
**Notificações → Ativar neste aparelho** solicita a
permissão do sistema diretamente no toque. Nunca há solicitação automática.
Cada aparelho decide se recebe push e pode desativar ou enviar um teste.
O mesmo menu reúne `Sessão ao vivo` e `Manter tela ligada`, sem uma fileira de
botões extra no treino.

No iPhone/iPad, abrir pelo Safari, adicionar à Tela de Início, abrir o ícone,
entrar na mesma conta e ativar as notificações. O Bluefy continua responsável
pelo Bluetooth; o Safari/PWA pode acompanhar os dados e receber notificações.
Safari normal não oferece Web Bluetooth nativo. O suporte do Bluefy a push e
execução em segundo plano não é presumido: a interface verifica as APIs.

Web Push pode chegar com o aparelho bloqueado, desde que o lançamento tenha
chegado ao servidor. **Não é possível garantir captura de novos lançamentos
quando iOS/Android suspendem o navegador conectado.** Service workers não
expõem Web Bluetooth. A implementação não usa áudio oculto nem apresenta
captura suspensa como ativa. O comportamento físico com tela bloqueada e a
entrega real no Bluefy/iPhone ainda precisam de validação no aparelho.

O aviso contém SP, Blade e média. Usa a imagem da Blade onde o sistema permite;
iOS pode usar o ícone instalado do BX Lab. Um único aviso por sessão é
atualizado silenciosamente. Clicar nele prioriza uma janela já aberta, sem
navegar a página que mantém o Bluetooth conectado.

## Servidor e proteção dos dados

- Migração `20261122000000_battle_pass_connected`: presença/Blade/aparelho em
  `BattlePassTraining`, `WebPushSubscription` e fila persistente `WebPushDelivery`.
- `private.webPushVapid` guarda as chaves VAPID no banco. Só a chave pública é
  exposta ao cliente; não é necessária configuração manual de segredo.
- Assinaturas são vinculadas à conta e à sessão de autenticação. Logout ou
  remoção da sessão elimina as assinaturas e entregas pendentes por cascata.
- Endpoints push são restritos a provedores Apple, Google, Mozilla e Windows;
  HTTP, localhost e outros destinos são rejeitados.
- Cada lançamento novo possui identidade estável. Reenvios e importações não
  duplicam avisos. Há até 10 aparelhos inscritos por conta.
- A fila usa Web Push padrão com criptografia `aes128gcm`, VAPID, TTL de 90s,
  envio assíncrono, até 3 tentativas para falhas temporárias e remoção de
  assinaturas expiradas (404/410). Eventos antigos expiram sem inundar o usuário.
- O service worker guarda somente a conta vinculada, verifica o destinatário
  antes de mostrar SP e limpa o vínculo ao desativar/sair.

## Validação

```text
node scripts/battle-pass-connected.integration.mjs
node scripts/battle-pass.integration.mjs
node --test scripts/battle-pass-push-worker.test.mjs
```

Os testes usam banco temporário, autenticação HTTP real, SSE com compressão,
rádio Bluetooth simulado, dois navegadores e transporte push interceptado.
Cobrem isolamento entre contas, captura ao navegar, Treinar nativo com nome do
aparelho, estado sem sinal, duplicatas, permissão só após toque, inscrição,
criptografia, tentativas, expiração, logout, Safari não instalado, foco sem
interromper Bluetooth e layouts de celular/PC. Não substituem teste físico
de entrega no iPhone ou de Bluetooth com a tela bloqueada.

## Referências

- Apple/WebKit: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Apple: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- Bluetooth Web: https://webbluetoothcg.github.io/web-bluetooth/
- Bluefy: https://bluefy.app/
- Web Push: https://github.com/web-push-libs/web-push
