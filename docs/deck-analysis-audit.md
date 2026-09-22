# Revisão do analisador de decks — 22/09/2026

## Causas encontradas

- A IA tinha apenas 420 tokens para sete campos e a explicação de todas as peças. Respostas truncadas ou JSON inválido eram descartados sem retry; JSON incompleto podia passar como resultado válido.
- Timeout de 12 segundos e qualquer erro HTTP viravam `null`. O fallback era gravado como resultado definitivo, sem registrar a causa na fila.
- Bastava uma resposta individual existir para rotular toda a análise como IA, mesmo quando o resumo era “IDENTIDADE DO TRIO”. O banco continha 35 composições salvas, incluindo nove com esse título.
- Pausas fixas de 35 segundos não respeitavam o `Retry-After`, limites diários nem os limites separados de saída do provedor.
- Fila, progresso e atualização forçada existiam apenas em memória. Reiniciar o processo perdia a intenção de atualizar decks que já tinham análise salva.
- GET escondia a análise anterior quando havia trabalho pendente. A página parava de acompanhar ao receber qualquer resultado, removia o aviso de progresso assim que o POST retornava e aceitava novos cliques.
- Cache em memória podia servir um resultado antigo após outro processo gravar uma análise. Criação, edição e atualização manual não aguardavam a confirmação de entrada na fila.
- Recolors sem descrição não herdavam as propriedades da peça original. O fallback era um texto fixo por categoria da Blade, pouco sensível ao Bit e sem análise física do deck.

## Novo fluxo

1. Criar/alterar as peças do deck ou atualizar como admin grava a tarefa no banco. Cópias reaproveitam a composição já analisada. Leitura pública nunca gera nem consulta fontes externas.
2. Há uma fila global com trava e prazo de recuperação. Atualizações concorrentes são deduplicadas. A gravação do progresso e do resultado público é atômica.
3. Cada Bey tem duas etapas: análise prática e explicação das peças. O resumo do deck vem ao final. Um trio completo usa sete chamadas, com no mínimo 70 segundos entre chamadas concluídas.
4. Respostas só entram após término completo, JSON válido e validação de todos os campos. A explicação deve cobrir cada peça por nome.
5. Rate limit aguarda o prazo informado e pausa toda a fila. Rede/timeout/JSON inválido repetem a etapa com espera crescente. Após cinco falhas não relacionadas à cota, o trabalho fica visível para o administrador retomar do checkpoint.
6. O resultado anterior permanece visível durante atualização. Deck novo recebe uma leitura física local completa; cada etapa válida melhora o resultado salvo. Não há afirmação de que um fallback inteiro veio da IA.
7. A página acompanha a fila e atualiza automaticamente. O painel administrativo exibe etapa, tentativas e erros; permite limpar espera e retomar falhas. Limpar não remove resultados nem interrompe uma chamada já iniciada.
8. Uma migração única identifica resultados antigos incompletos e os encaminha para reparo. Reinicializações posteriores retomam a fila, sem refazer análises concluídas ou tarefas canceladas.

## Fallback e limitações de dados

O fallback usa Blade, Bit, altura identificável do Ratchet, propriedades locais e peças CX. Inclui lançamento, vantagem, fraqueza, ajuste e motivo de cada peça. Peças sem dados são tratadas como incerteza; não há peso, taxa de vitória ou formato inventado. Metadados faltantes de recolors herdam a peça original.

A fonte externa existente de presença continua sendo Beycrate, cujo recorte é de decks de pódio. Essa amostra não demonstra uso em **todos** os participantes de todos os torneios. O resultado registra `sampleScope: podium-decks`; a análise textual não transforma essa presença em chance de vitória. Trocar essa métrica por uso total exige uma fonte com listas completas e denominador verificável.

Nenhuma aplicação pode garantir disponibilidade permanente do provedor. Em falha prolongada, o objetivo é preservar conteúdo útil, registrar o motivo e permitir retomada, sem loop de cobrança nem tela vazia.

Referências técnicas: [limites da Groq](https://console.groq.com/docs/rate-limits) e [contrato de chat completions](https://console.groq.com/docs/api-reference).

## Validação

- Testes unitários: concorrência entre workers, deduplicação, cooldown global, reinicialização, checkpoint, worker expirado, cancelamento, retry limitado, JSON truncado, campos ausentes e fallback físico/CX.
- Integração em container sem rede externa, banco SQLite descartável e provedor simulado: criar, editar, ler anonimamente sem gerar, atualizar como admin, impedir atualização por usuário comum, preservar resultado anterior, copiar/duplicar sem novas chamadas, privacidade, herança de recolor e recuperação.
- A verificação com o provedor real e o estado da publicação são registrados na entrega da tarefa.
