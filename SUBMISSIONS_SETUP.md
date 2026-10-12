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

A versão do GitHub já aponta diretamente à função Supabase. Publique a versão atual no Lovable após a função estar ativa. O cliente agora usa apenas **Enviar número**. Esse clique consulta a situação e o saldo no servidor e, se permitido, conclui automaticamente o envio. A taxa atual aparece junto ao saldo. Para um teste real, use uma conta/número de teste e saiba que um envio pago com saldo suficiente grava no Baserow e desconta a taxa; não há um segundo botão de confirmação.

Regras:

| Situação no Baserow | Destino | Cobrança |
|---|---|---|
| Número novo | EM ANÁLISE PELA META | Taxa configurada pelo admin |
| EXCLUIDO | EM ANÁLISE PELA META | Taxa configurada pelo admin |
| ANÁLISE NEGADA, DESBANIMENTO OK, EM ANÁLISE PELA META ou REEDESBANIMENTO | REEDESBANIMENTO | Zero |

A identidade é obtida pelo Supabase; o cliente não escolhe e-mail, saldo, status ou modalidade de cobrança. Números de outro proprietário, sem e-mail, duplicados ou com status desconhecido ficam bloqueados para conferência. O nome usado em um número novo vem do perfil.

O Brasil permanece em DDD + número, sem 55, preservando os registros existentes. Países internacionais são selecionados pelo ISO/DDD no painel e validados por libphonenumber-js no cliente e na função. Números estrangeiros ficam em formato +DDI e número completo no Baserow e no histórico; o + identifica o formato internacional e evita conflito com chaves nacionais de 10/11 dígitos. A validação verifica país e comprimento possível, sem consultar se há uma conta WhatsApp ativa.

Em números novos e renovações de EXCLUIDO, `observacoes` contém **somente** `nacional` (Brasil) ou `internacional` (outros países), sem marcador UUID. Reenvios gratuitos preservam as observações existentes. A referência de controle fica no Supabase e, no protocolo atual, na coluna separada astros_solicitacao_id; nunca no texto de observações. Registros antigos sem país identificável que colidirem com um número internacional ficam bloqueados para conferência. A consulta examina a tabela no servidor para reconhecer registros antigos com formatação/sufixos e detectar conflitos. Usa paginação de 200 registros, limitada a 20 mil; tabelas maiores exigem ampliar a estratégia de consulta. Nenhuma linha de outro cliente é devolvida ao painel.

## Conferência automática — ativação atual

As etapas antigas acima descrevem a instalação inicial. Para ativar a versão com conferência automática, siga esta ordem:

1. Na tabela **511 do Baserow**, adicione uma coluna **Texto de uma linha** com nome exato `astros_solicitacao_id`. Ela armazena apenas a referência do envio; não modifique `observacoes` nem os dados existentes. O token de escrita precisa continuar com Read/Create/Update na tabela.
2. Execute `supabase/migrations/20261012_auto_reconciliation.sql` no SQL Editor do Supabase atual. Ele acrescenta a fila, leases e RPCs privados; preserva os envios anteriores como protocolo 1.
3. Execute `supabase/migrations/20261012_reconciliation_schedule.sql`. Ele configura um cron exclusivo do Astros a cada minuto e gera uma chave privada no Vault. Copie o valor retornado **somente** para Edge Functions → Secrets, nome `ASTROS_RECONCILE_SECRET`. Não envie essa chave no chat.
4. Substitua todo o `index.ts` da função existente **astros-submit-number** pelo arquivo **supabase/astros-submit-number-automatico.ts** e faça Deploy. O arquivo é completo. Se o gateway estiver exigindo JWT legado, desative Verify JWT apenas nessa função: o código valida independentemente o usuário, o admin ou a chave privada do worker.
5. Aguarde cerca de um minuto para o cron executar. Novos envios pagos ficam bloqueados antes do débito enquanto a coluna, chave e heartbeat não estiverem prontos. Publique a versão atual do Lovable e teste primeiro uma conta sem saldo; depois faça um envio controlado com saldo suficiente.

Não altere Auth, SMTP, outras funções ou crons de outros projetos. O botão **Conferir agora**, em **Admin → Envios em conferência**, usa a mesma verificação segura, sem repetir a gravação.

### Cobrança e falhas

A reserva e o débito continuam ocorrendo atomicamente no Supabase **antes** da gravação no Baserow. O Baserow é externo e não participa dessa transação. A referência UUID impede nova cobrança do mesmo envio.

- Falha comprovada antes de iniciar a gravação, ou rejeição definitiva do Baserow: encerra e devolve automaticamente a taxa uma única vez.
- Resposta perdida após iniciar a gravação: mantém o envio em processamento e consulta automaticamente o recibo exclusivo no Baserow. Recibo com número e proprietário corretos confirma o envio, mesmo se o status operacional já avançou.
- Recibo ainda ausente ou consulta indisponível: repete somente a leitura. Não repete POST/PATCH nem estorna apenas por não encontrar o registro.
- Após 12 conferências sem resultado seguro, ou recibo ambíguo: sinaliza para a equipe no admin. Essa exceção ainda exige conferência humana; não é correto prometer resolução automática de todos os casos.

O histórico do cliente acompanha as mudanças e atualiza saldo/lista de números após a conclusão. Envios antigos sem o recibo continuam exigindo conferência manual. Um lease vencido revoga a permissão do despachante antigo antes de permitir estorno de uma operação ainda não iniciada.

Os testes locais não enviam números reais nem movimentam saldo real. A validação em produção depende da ativação manual acima.

## Países adicionais pelo admin

1. Execute `supabase/migrations/20261012_custom_countries.sql` no projeto Supabase atual. A tabela armazena somente os países adicionais e não altera Auth, pagamentos ou perfis.
2. Atualize `astros-submit-number` com **todo** o arquivo atual `supabase/astros-submit-number.deploy.ts`. O token já salvo continua sendo usado.
3. No `/admin`, abra **Países e DDIs**. Cadastre nome e DDI sem +. O DDI deve ter 1 a 3 dígitos; Brasil continua na opção padrão e não pode ter um alias adicional com +55.
4. O cliente busca país ou DDI no seletor. Países adicionais aparecem na próxima consulta (atualização automática a cada 30 segundos). Cadastros adicionados podem ser editados ou excluídos com confirmação dentro do painel. Excluir apaga o registro da tabela, sem apagar envios anteriores.

A lista padrão vem da biblioteca e permanece disponível. A lista personalizada é lida somente por usuários autenticados e escrita apenas por admin, com checagem no servidor e RLS no Supabase. O cliente envia apenas o ID do país adicional; a Edge Function consulta o DDI atual no banco antes de validar/reservar. País removido ou DDI alterado incompatível impede o envio antes da cobrança. Países adicionais não conhecidos pela biblioteca são validados pelo formato internacional (DDI, prefixo e comprimento até 15 dígitos); o cadastro não verifica uma conta WhatsApp ou a atribuição oficial de um DDI. Confira o DDI antes de cadastrar.

## Bloqueio de DDIs duplicados

Execute `supabase/migrations/20261012_unique_ddis.sql`. O formulário e o servidor rejeitam qualquer DDI já presente na lista padrão da biblioteca, além de DDIs adicionais já cadastrados. Na edição, o próprio registro é excluído da consulta de duplicidade. O Supabase aplica índice único nos DDIs adicionais para barrar gravações concorrentes e uma restrição contra os DDIs padrão (lista extraída de libphonenumber-js 1.13.15).

Registros antigos com DDI padrão são preservados, podem ser consultados/excluídos, mas não podem ser salvos novamente com um DDI padrão. A migração não exclui dados automaticamente. Se houver dois registros adicionais antigos com o mesmo DDI, o índice único não será criado: exclua a duplicata pelo admin e execute novamente. Mudanças futuras nos DDIs padrão da biblioteca exigem atualizar a restrição SQL correspondente.

## Saldo e envio automático

Atualize a Edge Function com o arquivo de deploy atual. Não é necessário SQL adicional para esse ajuste. O painel faz quote + submit automaticamente, com o mesmo UUID, em um clique. A função classifica primeiro para identificar se a solicitação é paga ou gratuita. Para uma paga, verifica `recarga` contra a taxa vigente; saldo insuficiente bloqueia antes da reserva ou gravação e aparece com botão para `/carteira`. Para reenvios gratuitos, saldo zero é suficiente. O RPC `astros_start_service` continua conferindo e bloqueando atomicamente o saldo na reserva, inclusive se ele mudar entre consulta e envio. Falhas não são repetidas automaticamente; a referência permanece disponível para uma tentativa segura ou conferência. O botão fica bloqueado enquanto a operação está em andamento.

## Consulta lenta ou falha de conexão

A leitura completa do Baserow agora usa até três páginas em paralelo, com os mesmos limites de 200 registros/página e 20 mil registros e conferência de contagem/IDs para impedir falsos resultados vazios ou novos. Atualize a função com o arquivo de deploy atual; não há alteração SQL.

Se o transporte falhar durante quote, o painel informa **Nenhum envio foi iniciado (E01)**. Se falhar durante submit, mantém a orientação de consultar o histórico antes de uma nova referência (**E02**), pois uma operação pode ter sido reservada. Falha de conexão não é tratada como número inexistente nem como saldo insuficiente: é preciso consultar a situação para preservar reenvios gratuitos, inclusive com saldo zero. Logs técnicos de transporte da função registram apenas etapa, tempo decorrido, estado de reserva e tipo do erro, sem token, e-mail ou número.

## Chamada do painel para a função

O painel usa `src/features/submissions/transport.server.ts` para chamar diretamente o endpoint fixo deste projeto, com JWT do usuário previamente validado e chave pública. Redirecionamentos canônicos são seguidos manualmente apenas no mesmo host/caminho de função, mantendo POST e UUID; destinos externos/outras funções/query strings divergentes são bloqueados. Uma falha de rede não repete POST automaticamente. O transporte registra no servidor apenas ação, tipo/código de erro e identificador de redirecionamento, nunca credenciais ou dados do usuário. Este ajuste exige somente sincronizar/publicar o Lovable, sem novo deploy da Edge Function ou SQL.

Na investigação de 12/10, as capturas do Supabase mostravam apenas o diagnóstico sem sessão às 09:23 (401), sem as tentativas mais recentes do cliente. O ajuste da chamada precisa de validação autenticada pelo usuário; esse diagnóstico não comprova o resultado do envio real.
