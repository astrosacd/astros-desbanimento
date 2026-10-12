# Envios reais: Supabase e Baserow

O n8n não participa desta integração. O fluxo antigo serviu apenas de referência das regras. Não importe ou ative o arquivo preparado anteriormente. Não é necessária planilha Google.

## 1. SQL

`supabase/migrations/20261012_submit_numbers.sql` já executado pelo usuário. Não execute novamente: o SQL cria a tabela. Esse controle é independente do n8n e continua sendo usado pela função abaixo.

Para habilitar internacionais, execute **somente** `supabase/migrations/20261012_international_numbers.sql`. Ele amplia a validação do número no RPC de reserva e preserva as regras de saldo e cobrança. Depois atualize a função com o arquivo de deploy atual.

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

O Brasil permanece em DDD + número, sem 55, preservando os registros existentes. Países internacionais são selecionados pelo ISO/DDD no painel e validados por libphonenumber-js no cliente e na função. Números estrangeiros ficam em formato +DDI e número completo no Baserow e no histórico; o + identifica o formato internacional e evita conflito com chaves nacionais de 10/11 dígitos. A validação verifica país e comprimento possível, sem consultar se há uma conta WhatsApp ativa.

Em números novos e renovações de EXCLUIDO, `observacoes` contém **somente** `nacional` (Brasil) ou `internacional` (outros países), sem marcador UUID. Reenvios gratuitos preservam as observações existentes. A referência de controle permanece no Supabase, não no texto de observações. Registros antigos sem país identificável que colidirem com um número internacional ficam bloqueados para conferência. A consulta examina a tabela no servidor para reconhecer registros antigos com formatação/sufixos e detectar conflitos. Usa paginação de 200 registros, limitada a 20 mil; tabelas maiores exigem ampliar a estratégia de consulta. Nenhuma linha de outro cliente é devolvida ao painel.

## Operações incertas

A reserva/debito é transacional no Supabase e usa a referência UUID para impedir desconto repetido. Baserow é um sistema externo e não participa dessa transação. Após reservar, a função confere a situação novamente, escreve uma vez e lê o registro salvo para validar número, e-mail, status e observação esperada.

Se a situação mudar antes da gravação, a solicitação é encerrada como falha e a taxa é devolvida uma vez. Falhas de rede ou respostas incertas após reserva ficam em `review` ou `processing`, bloqueando novo envio para o número. Nunca repetimos uma gravação automaticamente ou estornamos um envio potencialmente concluído. O cliente deve consultar o histórico e o suporte deve conferir o número completo, proprietário, status e histórico no Baserow antes de finalizar/estornar pelo RPC administrativo `astros_finish_service`. Não chamar esse RPC com credenciais do navegador.

A ativação e testes reais dependem do deploy manual e do token com permissões. Os testes locais não enviam números reais nem movimentam saldo real.

## Países adicionais pelo admin

1. Execute `supabase/migrations/20261012_custom_countries.sql` no projeto Supabase atual. A tabela armazena somente os países adicionais e não altera Auth, pagamentos ou perfis.
2. Atualize `astros-submit-number` com **todo** o arquivo atual `supabase/astros-submit-number.deploy.ts`. O token já salvo continua sendo usado.
3. No `/admin`, abra **Países e DDIs**. Cadastre nome e DDI sem +. O DDI deve ter 1 a 3 dígitos; Brasil continua na opção padrão e não pode ter um alias adicional com +55.
4. O cliente busca país ou DDI no seletor. Países adicionais aparecem na próxima consulta (atualização automática a cada 30 segundos). Cadastros adicionados podem ser editados ou excluídos com confirmação dentro do painel. Excluir apaga o registro da tabela, sem apagar envios anteriores.

A lista padrão vem da biblioteca e permanece disponível. A lista personalizada é lida somente por usuários autenticados e escrita apenas por admin, com checagem no servidor e RLS no Supabase. O cliente envia apenas o ID do país adicional; a Edge Function consulta o DDI atual no banco antes de validar/reservar. País removido ou DDI alterado incompatível impede o envio antes da cobrança. Países adicionais não conhecidos pela biblioteca são validados pelo formato internacional (DDI, prefixo e comprimento até 15 dígitos); o cadastro não verifica uma conta WhatsApp ou a atribuição oficial de um DDI. Confira o DDI antes de cadastrar.

## Bloqueio de DDIs duplicados

Execute `supabase/migrations/20261012_unique_ddis.sql`. O formulário e o servidor rejeitam qualquer DDI já presente na lista padrão da biblioteca, além de DDIs adicionais já cadastrados. Na edição, o próprio registro é excluído da consulta de duplicidade. O Supabase aplica índice único nos DDIs adicionais para barrar gravações concorrentes e uma restrição contra os DDIs padrão (lista extraída de libphonenumber-js 1.13.15).

Registros antigos com DDI padrão são preservados, podem ser consultados/excluídos, mas não podem ser salvos novamente com um DDI padrão. A migração não exclui dados automaticamente. Se houver dois registros adicionais antigos com o mesmo DDI, o índice único não será criado: exclua a duplicata pelo admin e execute novamente. Mudanças futuras nos DDIs padrão da biblioteca exigem atualizar a restrição SQL correspondente.
