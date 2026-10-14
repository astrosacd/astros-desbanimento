> Após ativar [Endereço principal](ENDERECO_PRINCIPAL.md), o destino dos novos e-mails é definido pelo admin na tabela astros_panel_address. ASTROS_APP_URL é a configuração histórica, substituída após atualizar a função.

# E-mails exclusivos do painel Astros

> Guia por recurso, com etapas históricas. Para uma nova conta, comece pelo [guia de instalação](INSTALACAO.md). Não repita migrações já aplicadas. Descrições antigas de “ainda não implementado” não são inventário do estado atual; consulte o README e o mapa do projeto.

Implementação disponível; a ativação depende da configuração de cada instalação. Não altera SMTP, templates ou confirmação de e-mail compartilhados no Supabase. Até ativar a variável de servidor abaixo, permanece o envio existente do Supabase.

## Configuração no Supabase

1. Execute `supabase/migrations/20261011_custom_email_limits.sql` no SQL Editor. Requer também o script de perfis já preparado para o painel. Este script cria somente uma tabela e uma função exclusivas para limitar envios (3 tentativas por e-mail/hora, 60 totais/hora).
2. Publique a Edge Function `supabase/functions/astros-auth-email/index.ts` com nome `astros-auth-email`, JWT verification desligada. Ela exige um segredo interno de pelo menos 32 caracteres em toda chamada. Com CLI: `supabase functions deploy astros-auth-email --no-verify-jwt --project-ref tevljvidqbvrcgzqypwf`.
3. Em Edge Functions > Secrets, configure:
   - `ASTROS_GMAIL_USER`: endereço Gmail remetente da Astros.
   - `ASTROS_GMAIL_APP_PASSWORD`: senha de app Gmail, nunca a senha normal.
   - `ASTROS_APP_URL`: endereço HTTPS fixo do painel, sem caminho. Precisa servir a logo pública e as telas de login/reset.
   - `ASTROS_EMAIL_INTERNAL_SECRET`: segredo aleatório de no mínimo 32 caracteres. Use o mesmo no servidor do painel.
   A função usa a chave administrativa fornecida automaticamente pelo ambiente Supabase; não é colocada no navegador, repositório ou configuração pública do painel.
4. Preserve Site URL e Redirect URLs existentes. Acrescente somente os endereços `/login` e `/reset-password` deste painel à lista permitida em Authentication > URL Configuration.

## Configuração no servidor do painel

Use o mecanismo de secrets/variáveis de servidor da hospedagem, sem prefixo VITE:
- `ASTROS_EMAIL_INTERNAL_SECRET`: mesmo segredo da Edge Function.
- `ASTROS_CUSTOM_EMAIL_ENABLED`: `true`, somente depois da função estar publicada e configurada.

Se a hospedagem não oferecer secrets em tempo de execução, esta integração não pode ser ativada nela. Não substitua por variáveis públicas. O Gmail usa SMTP TLS na porta 465 na Edge Function; valide a conectividade do runtime antes de ativar.

## Validação antes de ativar para clientes

Teste um novo cadastro próprio, a chegada do e-mail e a confirmação. Teste recuperação de uma conta do painel, link expirado, e-mail sem perfil e cadastro duplicado. No modo personalizado não são chamados signup/recover públicos do Supabase, evitando mensagens duplicadas. Cadastro duplicado não modifica a senha nem os dados de contas já existentes. A recuperação só gera link se o e-mail possui perfil na tabela deste painel; como o Auth é compartilhado, redefinir a senha de uma conta também redefine seu acesso em outras aplicações que usam a mesma identidade.

Se SMTP falhar após a criação da conta, ela pode ficar pendente de confirmação. Não exclua contas automaticamente; reenvie a confirmação por um fluxo administrativo confiável antes de liberar o cadastro em produção. Reenvio automático para contas pendentes ainda não foi implementado. Erros não incluem credenciais ou links nos logs ou nas respostas.

O envio real só poderá ser confirmado depois de inserir os secrets e testar no runtime publicado. Para desativar o envio exclusivo, remova o valor `true` da variável de ativação. Isso retorna ao fluxo original de e-mails do Supabase.
