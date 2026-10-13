# API de clientes Astros

1. Execute `supabase/migrations/20261013_client_api.sql` no SQL Editor deste projeto. As contas começam sem liberação; nenhuma tabela de outros aplicativos é alterada.
2. Atualize a função existente **astros-submit-number** com todo o conteúdo de `supabase/astros-submit-number-com-api.ts` e faça Deploy. Desative **Verify JWT** somente nessa função se estiver ligado: o código verifica independentemente o JWT das sessões normais, a chave individual da API e o segredo do worker. Não altere outras funções ou configurações globais de Auth.
3. Admin → Clientes e saldo → pesquisar conta → Gerenciar saldo → Acesso à API → Liberar API.
4. Cliente → API → Gerar chave. A chave é mostrada uma vez e deve ficar no servidor da integração; somente SHA-256 fica no banco. Gerar outra ou revogar invalida a anterior. Bloquear no admin apaga o hash e não bloqueia o login do painel.

Endpoint único: `/functions/v1/astros-submit-number?api=OPERACAO`, cabeçalho `X-Astros-Api-Key`.

- GET `saldo`: saldo em centavos.
- POST `validar`: number e country; valida formato possível, não existência ou WhatsApp.
- POST `consultar`: number, country, requestId UUID; retorna costCents e situação, sem iniciar envio.
- POST `enviar`: mesmos campos e expectedCents igual ao costCents da consulta. As regras e transações são as mesmas do painel. Preserve o UUID em tentativas após instabilidade; nunca crie outro até esclarecer a situação.
- GET `solicitacoes&page=1`: 20 registros, hasMore; só da conta autenticada pela chave.

60 requisições/minuto por conta, contador limitado a uma linha por usuário; sem tabela crescente de logs. GET de saldo e histórico usam somente UUID verificado, jamais email/UUID enviados pelo cliente. Dados inválidos não concedem acesso administrativo. A API não cria recargas, altera perfil ou libera permissões.

Teste controlado após ativação: conta não liberada não gera chave; libere uma conta; gere chave; consulte saldo e valide formato; bloqueie e confirme rejeição 401; faça uma solicitação com UUID único e teste repetição desse UUID sem segunda cobrança. Nunca envie números reais automaticamente em testes de desenvolvimento.
