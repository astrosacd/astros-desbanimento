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
