# Ativações SMS — SMSPool

Serviço independente em `/ativacoes-sms`, com grupo próprio nos dois menus e acesso pela página inicial. Não oferece chaves nem API de ativações aos clientes. A API de desbanimento existente permanece como está. Perfil e suporte são gerais. Carteira é compartilhada, mas pedidos, cotações, configurações e referências contábeis SMS são separados.

## Ativação, nesta ordem

1. Execute `supabase/migrations/20261014_sms_activations.sql` no SQL Editor do mesmo Supabase. Não apaga nem zera registros existentes.
2. Crie a Edge Function `astros-sms` com `supabase/astros-sms.deploy.ts`. Desative a verificação JWT do gateway: o próprio código verifica o usuário no Auth e o tipo no perfil, inclusive nas ações administrativas. O cron usa um segredo privado específico. As variáveis SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY são as fornecidas automaticamente pelo Supabase; nunca colocar service role no navegador ou GitHub.
3. Publique o painel e atualize a imagem da VPS. No admin, abra **Ativações SMS → Configurações e pedidos**. Salve a chave privada SMSPool, cotação de venda USD/BRL, acréscimo percentual e acréscimo fixo. Deixe compras DESATIVADAS inicialmente. O campo de chave vazio mantém o segredo salvo; a chave nunca retorna para o formulário.
4. Execute `supabase/migrations/20261014_sms_worker.sql`. A extensão pg_cron/pg_net precisa estar disponível no projeto. O agendamento nomeado `astros-sms-monitor` roda a cada minuto. O SQL usa apenas a chave privada do serviço SMS, sem alterar os outros agendamentos ou autenticação global.
5. No admin clique **Atualizar situação**. Somente com a rotina automática em funcionamento, habilite as compras e salve. A interface rejeita habilitação antes do primeiro heartbeat; novas reservas também exigem heartbeat com menos de 3 minutos.
6. Faça um teste controlado com uma ativação barata, após depositar saldo no fornecedor e na conta de teste do painel. Verifique preço, número, código, débito único, cancelamento e devolução. Testes automatizados não comprovam entrega real de SMS.

## Preços e catálogo

Catálogo de serviços e países do fornecedor, sem lista limitada a WhatsApp. Estoque e preço consultados para a combinação escolhida e o pool retornado pelo fornecedor. Estoque muda; uma cotação não reserva o número.

Preço final em reais = custo em USD × cotação definida no admin × (1 + acréscimo percentual/100) + acréscimo fixo. O cálculo usa inteiros e BigInt, arredondando para cima ao centavo. A cotação cambial é manual e não segue automaticamente o mercado. O custo máximo de compra é fixado na chamada SMSPool e a cotação vale 2 minutos. Mudança de preço ou configuração exige nova consulta; não aumenta silenciosamente o preço confirmado.

## Segurança e consistência financeira

- Auth confirmado, bloqueios e troca obrigatória de senha verificados pelo servidor. A identidade do cliente vem do token; nunca do formulário.
- requireAdmin na aplicação e papel admin novamente na Edge Function. Segredos/cotações/pedidos sem privilégios diretos para anon/authenticated; service-role-only RPCs movimentam saldo.
- Pedido usa UUID novo por intenção. Mesmo UUID e cotação retornam o pedido já registrado. O cliente guarda o UUID para repetir após erro de transporte; nunca gera outro automaticamente ao tentar confirmar de novo.
- Saldo reservado e débito registrados atomicamente ANTES da compra; somente a primeira reserva autoriza despacho. Limite de 5 ativações pendentes/em conferência por conta e 60 chamadas/minuto por conta.
- Rejeição explícita da compra devolve o saldo uma vez. Sucesso de cancelamento documentado pelo fornecedor ou status `6` permite devolução. Expiração, ausência de resultado, erro HTTP ou timeout NÃO são prova de devolução.
- Timeout na compra não é reenviado. Pedido fica em conferência, preservando o débito, até apuração. **Limitação do fornecedor:** a API documentada não fornece idempotência por UUID da Astros. Se a resposta de compra se perder antes de persistir o ID SMSPool, é necessária conferência administrativa com o histórico do fornecedor. Não vincular pedidos por coincidência de telefone, horário ou preço. A versão inicial lista esses casos no admin; não inclui botão de estorno sem evidência nem vinculação automática de pedidos sem ID.
- Pedidos conhecidos continuam acompanhados pelo cron mesmo quando o cliente fecha o painel ou novas vendas são desativadas. A cada execução são verificados até 10 pedidos, em lotes de até 5 consultas paralelas, por ordem da última consulta; lista/código próprio pode ser atualizado manualmente. Com grande volume, medir e ampliar a estratégia de acompanhamento antes de escalar.
- Registros financeiros e históricos não são apagados pela rotina. Somente cotações vencidas há mais de um dia, nunca usadas em pedidos, são removidas em lotes limitados.
- Não troque a conta/chave do fornecedor com pedidos pendentes ou em conferência: bloqueio também na transação SQL de configuração. Isso evita abandonar pedidos da conta anterior.
- O SMS chega ao fornecedor, não é gerado pelo painel. Número temporário não significa propriedade permanente ou garantia de aceitação por uma plataforma.

## Contingência e operação

Desativar compras bloqueia catálogo de compra/reserva, sem desligar histórico/acompanhamento. Falha do cron bloqueia novas reservas após 3 minutos. Não repita manualmente uma compra cujo resultado esteja incerto.

A função não depende de Baserow, Chatwoot ou n8n. Não altera SMTP, Site URL, Mercado Pago, regras de desbanimento ou o agendamento de reconciliação existente.

Referências oficiais consultadas: https://www.smspool.net/article/how-to-use-the-smspool-api-0dd6eadf4c e https://api.smspool.net/resources/postman.json.

## Validação de manutenção

`npm test` inclui cálculos de preço, evidências de status do fornecedor, bloqueios de identidade/segredos e navegação da página inicial.

O teste transacional isolado pode rodar sem um Supabase real:

```sh
npm install --prefix /tmp/astros-sms-sql @electric-sql/pglite
ASTROS_PGLITE_MODULE=/tmp/astros-sms-sql/node_modules/@electric-sql/pglite/dist/index.js node scripts/check-sms-sql.mjs
```

Ele cria um PostgreSQL em memória e testa permissão administrativa, heartbeat, repetição de pedido, propriedade, saldo insuficiente, bloqueio de troca de chave, devolução única, finalização de SMS recebido e privilégios privados. Não conecta à produção.

## Consulta administrativa sem liberar vendas

O bloco **Consultar custos e preço de venda** funciona com compras desativadas. Escolha o serviço e país e consulte custo em USD, equivalente em BRL pela cotação salva e preço final. Não cria cotação de compra, não reserva saldo nem compra número. Operações admin-catalog/admin-price exigem requireAdmin na aplicação e papel admin confirmado na Edge Function. A diferença exibida é anterior a impostos, câmbio efetivo e tarifas; não é garantia de lucro líquido.

A origem (pool) e o custo são escolhidos entre ofertas com estoque do endpoint `sms/all_stock`, filtradas pelo serviço e país exatos. O endpoint de preço genérico pode retornar um preço sem pool; isso não significa que a seleção do cliente seja inválida. Antes da compra, o preço é reconfirmado com o pool específico e o teto continua obrigatório. Seletores de serviço/país têm pesquisa interna e lista com altura limitada nos dois painéis.

Compatibilidade verificada com resposta real de estoque: `sms/all_stock` pode devolver lotes aninhados (`[[{...}]]`). A leitura normaliza essas listas antes de filtrar serviço/país e escolher oferta com estoque. Formato não reconhecido deve gerar falha de validação de estoque, nunca ser apresentado automaticamente como ausência de números.
