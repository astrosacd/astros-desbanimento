# Cadastro: CAPTCHA e limite por IP

Implementação preparada, inicialmente **desativada**. Publicar o frontend não ativa sozinho a proteção. Sem instalação/configuração e um cadastro controlado, não afirmar que foi validada em produção.

## Funcionamento

Somente `/cadastro` carrega Cloudflare Turnstile. O navegador envia token e e-mail diretamente a `astros-signup-guard` no Supabase, evitando que todos os clientes sejam confundidos com o IP da VPS. A Edge valida token no Siteverify, `hostname` exato e `action=signup`. Um token expirado/reutilizado não gera autorização. Falhas de provedor, configuração ou banco bloqueiam a tentativa; não há aprovação simulada.

SQL privado limita **5 tentativas em 15 minutos e 20 em uma hora**, em janelas móveis, incluindo CAPTCHA recusado. A sexta tentativa retorna 429 e `Retry-After: 900`. Pessoas na mesma rede compartilham esse limite; redes móveis/empresariais podem exigir ajuste futuro. IPv6 é agrupado em /64. Não é bloqueio permanente nem garantia contra redes de bots que alternam IPs e resolvem desafios.

O IP vem exclusivamente de `cf-connecting-ip` sobrescrito pelo gateway Cloudflare do endereço fixo `*.supabase.co`. Não aceitar IP no corpo, `X-Forwarded-For` enviado pelo chamador, nem encaminhar a requisição por uma VPS. Se o cabeçalho não chegar nesse ambiente, falhar fechado e investigar o gateway antes da ativação, sem acrescentar fallback arbitrário. Testar essa premissa no cadastro controlado em produção; teste local injeta o cabeçalho, não prova a infraestrutura externa.

Persistem apenas HMACs dos IPs, com sal aleatório privado, e horários. A limpeza ocorre nas próximas tentativas, após uma hora; ausência de tráfego pode conservar registros antigos até a próxima execução. Não registrar IP, e-mail, senha, CAPTCHA, segredo ou autorização nos logs da aplicação.

Após a validação, a Edge emite autorização aleatória de 256 bits, vinculada ao e-mail e válida por 5 minutos. Banco guarda só SHA-256 da autorização/e-mail. RPC pública revela apenas se uma autorização imprevisível é válida; não permite criar autorizações nem ler as tabelas. O servidor confere essa prova antes de gastar a cota de e-mails.

Um gatilho **BEFORE INSERT em `auth.users`** consome a autorização na mesma transação da criação, cobrindo tanto `/auth/v1/signup` quanto `admin.createUser` usado pelo e-mail próprio. Acesso direto à API não dispensa a proteção. A autorização é retirada dos metadados antes de salvar a conta. Uma falha de criação desfaz o consumo, mas uma criação confirmada impede reutilização, inclusive após excluir a conta.

Login, recuperação, redefinição e usuários existentes não inserem usuários e continuam com os fluxos atuais. Confirmação por e-mail e limites existentes do mailer permanecem. Carteira, fornecedores, pedidos, módulos e status não são alterados. A importação administrativa mantém apenas sua exceção estrita: `app_metadata` escrito pelo serviço, job privado pendente, e-mail exato e administrador válido. Metadados editáveis pelo cliente não autorizam exceção.

**Abrangência:** depois de ativado, o gatilho protege todas as novas contas deste projeto Supabase, inclusive Dashboard/admin e eventuais outros sites/OAuth/telefone que usem o mesmo Auth. Não inventar uma exceção pública para esses fluxos. Antes de ativar, confirmar que os pontos de cadastro utilizados foram adaptados; se houver outro fluxo legítimo, adaptá-lo primeiro. Não é necessário ativar CAPTCHA global em Authentication, nem substituir hooks/SMTP/templates compartilhados.

## Instalação, uma etapa por vez

1. Executar `supabase/migrations/20261023_signup_protection.sql` no SQL Editor. É transacional, reaplicável e conserva configurações existentes; primeira instalação fica `enabled=false`. Não modifica usuários, saldo nem cron. Depende das tabelas de perfil/importação já existentes nesta aplicação.
2. Criar widget **Cloudflare Turnstile**, tipo **Managed**, com os dois hostnames, sem protocolo/caminho:
   - `mais.astroscomunicacaodigital.com`
   - `desbanimento-de-numeros.lovable.app`
   A chave do site é pública; a chave secreta fica apenas nos Secrets da Edge. Não pedir que o dono cole a chave secreta no chat.
3. Salvar o segredo da widget em Supabase Edge Functions > Secrets, nome `ASTROS_TURNSTILE_SECRET_KEY`. Não usar chave de testes na produção.
4. Criar/deploy `astros-signup-guard` usando o conteúdo completo de `supabase/astros-signup-guard.deploy.ts`. Desligar **Verify JWT with legacy secret apenas nessa função**, pois atende visitantes sem conta. Ela ainda exige CAPTCHA válido e tem controle de IP privado. Não alterar verificações JWT de outras funções.
5. Atualizar `astros-auth-email` com `supabase/astros-auth-email.deploy.ts`, preservando todos os Secrets existentes. Manter seu segredo interno e a configuração JWT atual. Mesmo que o mailer opcional não esteja ativo, atualizar antes de ativá-lo no futuro.
6. Publicar no Lovable; depois atualizar a imagem do Portainer para o commit desta implementação. Ambos precisam enviar a nova prova. A aplicação continua com o cadastro anterior até a ativação. Testar login/recuperação existentes sem enviar e-mails desnecessários.
7. Confirmados os pontos de cadastro, salvar **a chave pública do site** e ativar em uma única transação. Substituir o placeholder somente pela chave pública:

```sql
begin;
update public.astros_signup_settings
set site_key = 'COLE_A_CHAVE_PUBLICA_DO_SITE_AQUI', enabled = true
where id = true;
commit;
```

8. Recarregar `/cadastro` em cada origem. Fazer **um cadastro controlado pelo dono** com endereço próprio, confirmar e-mail e entrar. Conferir que desafio expirado não cria conta, que a autorização não permanece nos metadados e que tentativa direta sem prova é recusada. Não criar contas de clientes ou bombardear o cadastro de produção para testar rate limit.

Diagnóstico sem expor dados privados:

```sql
select enabled, length(site_key) > 0 as chave_publica_configurada
from public.astros_signup_settings where id;

select count(*) as tentativas_ultima_hora
from public.astros_signup_attempts
where attempted_at > now() - interval '1 hour';

select count(*) filter (where consumed_at is not null) as autorizacoes_usadas,
       count(*) filter (where consumed_at is null and expires_at > now()) as autorizacoes_validas
from public.astros_signup_permits;
```

A configuração do frontend é `no-store`. Apenas RPC realmente inexistente (`PGRST202`/`42883`) usa o comportamento anterior para permitir implantação gradual; falha genérica não desliga a proteção. Banco continua sendo a autoridade mesmo com aba antiga. Depois de ativar, abas antigas devem ser recarregadas antes de criar conta.

## Reversão rápida

Em caso de erro na instalação, desativar a proteção sem mexer em contas ou outros serviços:

```sql
update public.astros_signup_settings set enabled=false where id=true;
```

Recarregar o cadastro. Isso restaura deliberadamente o comportamento anterior, sem CAPTCHA nem limite novo. Não é uma aprovação silenciosa após falha. Não apagar tabelas, gatilhos de terceiros ou usuários. Não desativar a confirmação de e-mail.

## Verificação local

- `node scripts/check-signup-protection.mjs`: Postgres/PGlite com pgcrypto real; instalação inativa/reaplicação, permissões, janelas móveis, agrupamento IPv6, autorização com e-mail/validade/uso único, transação, recusa de bypass e preservação de importação/atualizações/carteira.
- `npx vitest run src/features/auth src/features/panel-address/email.test.ts src/features/client-import/edge.test.ts`: validação Edge, falhas, origem/action/hostname, configuração, formulário e regressões existentes.
- `npx tsc --noEmit`, builds de produção e desenvolvimento.
- `node scripts/build-signup-deploy.mjs` após mudar guard ou mailer; versões `.deploy.ts` devem ser idênticas às fontes.

Os testes usam contas e chaves fictícias e não chamam fornecedores nem criam contas reais. O teste real de CAPTCHA, cabeçalhos do gateway e entrega de e-mail depende da instalação e do dono.

Referências oficiais: [Cloudflare Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [widget explícita](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/), [Supabase Auth e gatilhos](https://supabase.com/docs/guides/auth/managing-user-data).
