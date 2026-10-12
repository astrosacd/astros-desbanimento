# Envio de números — Astros

A implementação utiliza o fluxo n8n para preservar o registro no Google Sheets e as credenciais de Baserow existentes. O fluxo antigo fica intacto: importe o novo como outro workflow. O arquivo novo inicia desativado.

1. Execute `supabase/migrations/20261012_submit_numbers.sql` no SQL Editor do projeto usado pelo painel. Ele cria registros de serviço, proteção contra cobrança repetida e funções de reserva/finalização. O saldo fica em `painel_de_desbanimento.recarga`.
2. Importe `n8n/astros-submit-number.json` no n8n. Nos três nós Baserow, selecione a credencial já usada pelo fluxo antigo. A tabela é 511, database 97.
3. Nos nós HTTP que usam `Supabase Astros - Servidor`, escolha/crie uma credencial Supabase com a URL do projeto e sua chave privada de servidor (service role/secret key). Ela permanece no n8n; nunca use essa chave no frontend.
4. No webhook, configure uma credencial Header Auth: nome do cabeçalho `x-astros-secret`, valor aleatório com pelo menos 32 caracteres. Essa mesma credencial será salva como segredo no Lovable.
5. Em `Registrar na planilha`, selecione a planilha e a aba usadas pelo fluxo anterior. As credenciais e o mapeamento foram preservados; o ID da planilha deve ser escolhido no editor para não publicar um link privado no repositório.
6. Ative somente após conferir essas configurações. Copie a URL de produção do webhook. No Lovable, configure `ASTROS_SUBMISSION_WEBHOOK_URL` e `ASTROS_SUBMISSION_WEBHOOK_SECRET`, depois publique novamente. Não informe a chave secreta em chat.
7. Teste primeiro com um número de teste e uma taxa pequena. A consulta inicial não desconta saldo; o cliente confirma o valor antes do envio.

## Regras

- Novo: cobra a taxa atual do admin, cria como `EM ANÁLISE PELA META`.
- EXCLUIDO: cobra nova taxa, atualiza como `EM ANÁLISE PELA META`.
- ANÁLISE NEGADA, DESBANIMENTO OK, EM ANÁLISE PELA META ou REEDESBANIMENTO: atualiza como `REEDESBANIMENTO`, sem cobrança.
- Número de outro e-mail, registro duplicado ou status desconhecido: bloqueia e solicita conferência.
- Valores diferentes entre consulta e confirmação: bloqueia sem nova cobrança e solicita uma nova consulta.
- O status escrito na planilha corresponde ao status escrito no Baserow.

## Falhas e conferência

A reserva de saldo e o histórico são transacionais no Supabase. A escrita no Baserow e o append da planilha pertencem a serviços externos e não formam uma única transação.

Se a gravação externa ficar incerta ou a planilha falhar, a solicitação fica `review` e bloqueia novo envio para o mesmo número. Não reexecute os nós de gravação manualmente sem conferir o marcador `[ASTROS:ID_DA_SOLICITAÇÃO]` nas observações. A equipe deve verificar o Baserow e a planilha antes de finalizar ou cancelar a reserva. A função `astros_finish_service`, restrita ao servidor, permite marcar `completed` ou `failed`; uma falha confirmada devolve a taxa uma única vez. Um cliente não pode chamar essa função diretamente.

Pagamentos do Mercado Pago continuam sendo recargas da carteira. Não dependem da ativação do novo fluxo para serem confirmados; o desconto de serviço acontece no envio confirmado.
