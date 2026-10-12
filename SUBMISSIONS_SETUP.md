# Envios reais: Supabase e Baserow

O n8n não participa desta integração. O fluxo antigo serviu apenas de referência das regras. Não importe ou ative o arquivo preparado anteriormente. Não é necessária planilha Google.

## 1. SQL

`supabase/migrations/20261012_submit_numbers.sql` já executado pelo usuário. Não execute novamente: o SQL cria a tabela. Esse controle é independente do n8n e continua sendo usado pela função abaixo.

## 2. Token do Baserow

No Baserow, crie um token exclusivo com permissões **Read, Create e Update somente na tabela 511**. Não precisa de Delete. Preserve o token de consulta atual e as outras integrações.

No Supabase do projeto `tevljvidqbvrcgzqypwf`, abra **Edge Functions → Secrets** e salve:

- Nome: `ASTROS_BASEROW_WRITE_TOKEN`
- Valor: o novo token do Baserow (não compartilhe no chat).

As credenciais internas SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são fornecidas pelo ambiente da função; não coloque a chave privada no Lovable ou no navegador.

## 3. Função

Crie uma nova Edge Function chamada **astros-submit-number**, usando o editor do Supabase.

- Apague o código inicial de `index.ts` e cole **todo** o conteúdo de `supabase/astros-submit-number.deploy.ts`. Este arquivo contém a função completa; não precisa adicionar outro arquivo.
- Deploy. A função verifica o token do usuário por `auth.getUser` e exige e-mail confirmado. Caso a verificação JWT antiga do gateway não aceite as chaves do projeto, desative **Verify JWT** apenas nesta função; a verificação de usuário dentro da função permanece obrigatória.

Alternativa CLI: `supabase functions deploy astros-submit-number --project-ref tevljvidqbvrcgzqypwf`.

Não altere SMTP, URL geral de autenticação, outras funções ou outros projetos. Não são necessárias as variáveis ASTROS_SUBMISSION_WEBHOOK_URL/SECRET que foram sugeridas anteriormente; o código não as utiliza.

## 4. Publicação e teste

A versão do GitHub já aponta diretamente à função Supabase. Publique a versão atual no Lovable após a função estar ativa. Faça primeiro a consulta de taxa, que não escreve nem desconta saldo, com um número de teste. Só confirme o envio após revisar o valor e o status.

Regras:

| Situação no Baserow | Destino | Cobrança |
|---|---|---|
| Número novo | EM ANÁLISE PELA META | Taxa configurada pelo admin |
| EXCLUIDO | EM ANÁLISE PELA META | Taxa configurada pelo admin |
| ANÁLISE NEGADA, DESBANIMENTO OK, EM ANÁLISE PELA META ou REEDESBANIMENTO | REEDESBANIMENTO | Zero |

A identidade é obtida pelo Supabase; o cliente não escolhe e-mail, saldo, status ou modalidade de cobrança. Números de outro proprietário, sem e-mail, duplicados ou com status desconhecido ficam bloqueados para conferência. O nome usado em um número novo vem do perfil.

O número é normalizado para DDD + número, sem 55. A consulta examina a tabela no servidor para reconhecer registros antigos com formatação/sufixos e detectar conflitos. Usa paginação de 200 registros, limitada a 20 mil; tabelas maiores exigem ampliar a estratégia de consulta. Nenhuma linha de outro cliente é devolvida ao painel.

## Operações incertas

A reserva/debito é transacional no Supabase e usa a referência UUID para impedir desconto repetido. Baserow é um sistema externo e não participa dessa transação. Após reservar, a função confere a situação novamente, escreve uma vez e lê o registro salvo para validar número, e-mail, status e marcador `[ASTROS:UUID]`.

Se a situação mudar antes da gravação, a solicitação é encerrada como falha e a taxa é devolvida uma vez. Falhas de rede ou respostas incertas após reserva ficam em `review` ou `processing`, bloqueando novo envio para o número. Nunca repetimos uma gravação automaticamente ou estornamos um envio potencialmente concluído. O cliente deve consultar o histórico e o suporte deve verificar o marcador no Baserow antes de finalizar/estornar pelo RPC administrativo `astros_finish_service`. Não chamar esse RPC com credenciais do navegador.

A ativação e testes reais dependem do deploy manual e do token com permissões. Os testes locais não enviam números reais nem movimentam saldo real.
