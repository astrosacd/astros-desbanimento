# API de clientes Astros

> Guia por recurso, com etapas históricas. Para uma nova conta, comece pelo [guia de instalação](docs/INSTALACAO.md). Não repita migrações já aplicadas. Descrições antigas de “ainda não implementado” não são inventário do estado atual; consulte o README e o mapa do projeto.

1. Execute `supabase/migrations/20261013_client_api.sql` no SQL Editor deste projeto. As contas começam sem liberação; nenhuma tabela de outros aplicativos é alterada.
2. Atualize a função existente **astros-submit-number** com todo o conteúdo de `supabase/astros-submit-number-com-api.ts` e faça Deploy. Desative **Verify JWT** somente nessa função se estiver ligado: o código verifica independentemente o JWT das sessões normais, a chave individual da API e o segredo do worker. Não altere outras funções ou configurações globais de Auth.
3. Admin → Gestão de contas → pesquisar conta → Gerenciar conta → Acesso à API → Liberar API.
4. Cliente → API → Gerar chave. A chave é mostrada uma vez e deve ficar no servidor da integração; somente SHA-256 fica no banco. Gerar outra ou revogar invalida a anterior. Bloquear no admin apaga o hash e não bloqueia o login do painel.

Endpoint único: `/functions/v1/astros-submit-number?api=OPERACAO`, cabeçalho `X-Astros-Api-Key`.

- GET `saldo`: saldo em centavos.
- POST `validar`: number e country; valida formato possível, não existência ou WhatsApp.
- POST `consultar`: number, country, requestId UUID; retorna costCents e situação, sem iniciar envio.
- POST `enviar`: mesmos campos e expectedCents igual ao costCents da consulta. As regras e transações são as mesmas do painel. Preserve o UUID em tentativas após instabilidade; nunca crie outro até esclarecer a situação.
- GET `solicitacoes&page=1`: 20 registros, hasMore; só da conta autenticada pela chave.

60 requisições/minuto por conta, contador limitado a uma linha por usuário. GET de saldo e histórico usam somente UUID verificado, jamais email/UUID enviados pelo cliente. Dados inválidos não concedem acesso administrativo. A API não cria recargas, altera perfil ou libera permissões.

Teste controlado após ativação: conta não liberada não gera chave; libere uma conta; gere chave; consulte saldo e valide formato; bloqueie e confirme rejeição 401; faça uma solicitação com UUID único e teste repetição desse UUID sem segunda cobrança. Nunca envie números reais automaticamente em testes de desenvolvimento.

## Logs da API e países
Execute `supabase/migrations/20261013_api_logs.sql` e atualize a função com `supabase/astros-submit-number-com-api.ts`. Chamadas autenticadas geram somente metadados permitidos; chaves, cabeçalhos, corpos e mensagens internas não são gravados. A falha/timeout de registro não muda o resultado do envio. Requisições recusadas antes da autenticação não criam logs, evitando gravações anônimas ilimitadas.

Cliente: somente os próprios logs na aba API, inclusive após bloqueio do acesso à integração. Admin: menu Logs da API e consulta específica em Gestão de contas → Acesso à API. Filtros e páginas de 20 registros.

Retenção: 30 dias e no máximo 5.000 registros por conta, exclusivamente na nova tabela astros_api_logs. O cron diário próprio é cadastrado se pg_cron já estiver instalado; sem pg_cron, expiração é removida nas próximas gravações. Nenhum histórico financeiro, solicitação ou tabela de outro aplicativo é apagado. A retenção do log não altera a proteção contra cobranças duplicadas.

Documentação inclui busca de códigos de país e DDI; country usa ISO em letras maiúsculas ou custom:ID para países adicionais atuais. Internacionais: +DDI e número completo; Brasil: DDD e número.
