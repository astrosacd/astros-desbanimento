# Ativar a área administrativa

A rota `/admin` usa Supabase Auth no servidor e consulta `public.painel_de_desbanimento`. O UUID de `id` deve ser o mesmo de Authentication > Users. A coluna `senha_hash` não é usada. Ainda não existem operações administrativas de gestão; elas serão implementadas depois.

1. Revise e execute `supabase/migrations/20261011_admin_access.sql` uma vez no SQL Editor. O script usa as colunas mostradas na captura, requer os nomes exatos e não cria outra tabela. Se existirem perfis antigos sem vínculo com Auth ou outros campos obrigatórios, adapte o esquema antes. Em caso de erro, a transação desfaz as alterações. Não repita o script após sucesso.
2. Cadastre o usuário em Supabase Authentication (ou pelo futuro cadastro integrado ao Auth). O trigger cria o perfil como `cliente`, ignorando qualquer tipo enviado pelo cadastro.
3. Para autorizar um administrador, execute no SQL Editor, substituindo o UUID pelo usuário confirmado em Authentication:

```sql
update public.painel_de_desbanimento
set tipo_usuario = 'admin'
where id = 'UUID-DO-USUARIO';
```

4. Configure no servidor do projeto as variáveis `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` (ou `SUPABASE_ANON_KEY`). Use somente a chave pública; não use `service_role`. O projeto já possui a URL e a chave pública fornecidas pelo proprietário como configuração padrão. Essas variáveis permitem substituir a conexão. Uma URL ou chave vazia bloqueia o login.
5. Acesse `/admin` com email e senha do Auth. Teste também um cliente: o login administrativo deve ser recusado. Revogar o tipo `admin` bloqueia a próxima verificação da sessão. A sessão expira em até uma hora e exige novo login.

O script restringe a leitura dos perfis a seu titular ou administradores. Escritas diretas pelo cliente ficam indisponíveis. Antes de integrar o painel do cliente ao banco, acrescente apenas as permissões necessárias; nunca permita alterar `tipo_usuario`, `id` ou saldo pelo cliente. Funções futuras de gestão devem chamar `requireAdmin()` no servidor e usar políticas apropriadas no banco.

A conexão pública já está configurada. A autorização real depende da aplicação desse script e de um usuário do Auth com perfil admin. Os dados atuais das rotas de cliente continuam sendo demonstração.

## Entrada de clientes

As telas `/login`, `/cadastro`, `/recuperar-senha` e `/reset-password` agora usam Supabase Auth. O cadastro pede nome completo, e-mail, WhatsApp e senha. Nome e WhatsApp são enviados como metadados; o trigger do script acima cria o perfil em `painel_de_desbanimento` sempre como `cliente`. Se o script não foi aplicado, o Auth pode criar uma conta sem o perfil: aplique o script antes de usar o cadastro.

Em Supabase Authentication > URL Configuration, configure Site URL com o endereço do painel e inclua em Redirect URLs os endereços exatos de `/login` e `/reset-password` no domínio da aplicação (incluindo o domínio de preview quando for testar). A confirmação e a recuperação dependem do serviço de e-mail do Supabase; configure SMTP para envio aos clientes reais. Use o template padrão com ConfirmationURL; não use um template antigo do n8n com tokens diferentes. Os links retornam à aplicação pelo fluxo implicit do Auth.

Uma tentativa de cadastro com e-mail existente nunca substitui os dados ou a senha do usuário. Quando o Supabase oculta a existência de uma conta, a resposta orienta confirmar o e-mail ou entrar/recuperar a senha. A recuperação usa mensagem neutra e também oferece criar conta.

O painel de cliente exige uma sessão verificada pelo servidor e inclui Sair da conta. A sessão dura até uma hora. Os dados de solicitações, carteira e perfil operacional continuam demonstrativos; não representam o cliente autenticado nesta etapa.
