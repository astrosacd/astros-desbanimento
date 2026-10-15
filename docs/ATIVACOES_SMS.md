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

## Cotação automática opcional

Ativação: execute `supabase/migrations/20261014_sms_auto_fx.sql`, atualize `astros-sms` com o arquivo de deploy e publique a interface. O modo atual permanece **manual** até o administrador escolher **Automático** e salvar. Não modifica recargas, Mercado Pago, saldos, pedidos ou regras de desbanimento.

A função consulta `https://api.frankfurter.dev/v2/rate/USD/BRL`, valida par/data/limites e armazena a referência. A fonte fornece referência diária, não uma cotação de cartão em tempo real. O cron SMS existente tenta atualizá-la a cada hora, e consultas/compras também exigem atualização quando o cache tem mais de uma hora. Falha de atualização bloqueia a nova consulta/compra; a reconciliação dos pedidos existentes continua. A reserva SQL também rejeita cache com mais de 6 horas ou data de referência anterior a 7 dias (tolerância para fins de semana/feriados). Nunca muda silenciosamente para manual.

Taxas editáveis, inicialmente baseadas no checkout observado: 3,25% do depósito + US$ 0,25 descontados do saldo recebido; acréscimo de conversão de 4%; outros custos percentuais inicialmente zero. O administrador informa o valor habitual da recarga (inicial US$ 10), porque a taxa fixa tem impacto proporcional diferente conforme o depósito. Não há consulta automática à conta Stripe do fornecedor nem às tarifas do cartão.

Crédito USD estimado = arredondar a centavos (depósito USD × (1 − taxa percentual) − taxa fixa USD).
Cotação efetiva estimada = dólar de referência × (1 + conversão) × (1 + outros custos) × depósito USD / crédito USD estimado.

Essa cotação é usada no preço da ativação, somada aos acréscimos de venda já existentes. A recarga do cliente continua integral: R$ 50 pagos correspondem a R$ 50 de saldo. A estimativa não garante o custo exato de liquidação, impostos ou lucro líquido. O modo manual aceita o custo efetivo total informado pelo administrador e não acrescenta essas taxas novamente.

Uma mudança na cotação efetiva invalida cotações de compra anteriores, exigindo nova confirmação. Repetir um pedido já reservado continua retornando o mesmo pedido, mesmo com FX indisponível. Não apaga histórico. Testes isolados verificam fórmula SQL/TypeScript, validade da fonte, bloqueio de débito com FX vencido, invalidação de ofertas, privilégios e volta ao manual.

## Saldo do fornecedor e verificação antes da compra

A administração exibe o saldo em USD consultado por `request/balance`, com data da consulta, atualização manual e consulta a cada 60 segundos somente enquanto a tela está aberta. O aviso abaixo de US$ 5 é um indicador fixo, não um mínimo de compra nem de depósito. Erros são exibidos como saldo não confirmado, nunca zero fictício. A chave permanece privada e o cliente não recebe o saldo do fornecedor. A consulta administrativa passa por requireAdmin e verificação do papel na Edge Function. Salvar uma chave atualiza a consulta do saldo.

Antes de `astros_sms_reserve`, a compra consulta novamente o saldo do fornecedor e o compara em unidades inteiras de USD ao custo do pedido, não ao preço de venda em BRL. Saldo insuficiente, resposta inválida ou falha de rede bloqueiam essa tentativa antes do débito. A mensagem ao cliente não menciona fornecedor ou saldo empresarial. Repetição de um pedido já existente retorna o pedido sem exigir saldo no fornecedor. Se o preflight falhar, há uma segunda leitura do request ID para recuperar uma criação concorrente antes de apresentar a mensagem.

O preflight não reserva o saldo do fornecedor e não elimina corridas com outras compras ou uso externo da mesma conta. Depois da reserva, continuam valendo as regras existentes: recusa explícita devolve uma única vez; timeout/resultado incerto permanece em conferência, sem repetir a compra nem devolver às cegas. Verificação/cancelamento/reconciliação dos pedidos existentes não dependem do saldo do fornecedor. Nenhum depósito automático é realizado.

Ativação: atualizar o código completo da Edge Function `astros-sms` usando `supabase/astros-sms.deploy.ts` e publicar a interface. Esta alteração não requer SQL nem novas credenciais. Os testes usam fornecedor simulado, sem compra ou consulta autenticada real.


## Confirmação, prazo, filtros e conferência administrativa

Ativação desta etapa: execute `supabase/migrations/20261015_sms_review.sql`, atualize a Edge Function `astros-sms` com o conteúdo integral de `supabase/astros-sms.deploy.ts` e publique a interface. Teste primeiro no Lovable; a imagem da VPS pode ser atualizada depois. A migração preserva pedidos e saldo e acrescenta auditoria privada e funções restritas ao serviço.

Antes de comprar, a confirmação mostra serviço, país, preço integral e saldo estimado após a compra. O número é temporário. Uma tentativa incerta conserva o mesmo UUID e não libera outra compra às cegas. Consultar novamente invalida a cotação antiga sob bloqueio transacional, ou recupera o pedido já existente; não altera saldo nem faz compra.

O contador de validade da oferta é separado do prazo para receber SMS. Chegar a zero no contador não confirma cancelamento nem devolução: o resultado depende da conferência do fornecedor. O relógio da interface não autoriza operações financeiras.

O histórico oferece busca por número, serviço e país, situação e intervalo de datas, com paginação de 20 registros no servidor. O admin também filtra e-mail. O cliente permanece limitado ao próprio UUID confirmado, sem poder consultar outra conta por filtros. Códigos SMS não são expostos no histórico administrativo.

Em Conferir pedido, o admin pode consultar o estado, solicitar cancelamento confirmado ou registrar uma observação, com justificativa e auditoria de administrador/data/resultado. Uma ação possui UUID estável; repetir a mesma ação não repete a chamada externa. Cancelamento incerto bloqueia outro cancelamento até conferência, sem impedir consultas. Devolução exige confirmação do fornecedor e usa a regra atômica de devolução única. Pedido concluído com SMS não é estornado por esse fluxo.

Pedidos sem identificação confirmada no fornecedor continuam em investigação: permitem registrar observação, mas não associar IDs por suposição nem devolver sem prova. Não há botão de estorno arbitrário. A auditoria é privada e acessível somente por operações administrativas verificadas.

Validação: 409 testes da aplicação passaram e o build foi concluído. O script `scripts/check-sms-review-sql.mjs` verificou a migração em PostgreSQL isolado, incluindo privilégios, repetição, cancelamento incerto, devolução única e proteção de pedidos recebidos. Testes da integração usam respostas simuladas; nenhuma compra real foi realizada nesta etapa.


## Operação, pausa rápida e suporte por pedido

Ativação: após as migrações SMS anteriores e `20261015_financial_dashboard.sql`, execute `supabase/migrations/20261015_sms_operations.sql`. Depois substitua integralmente a função `astros-sms` por `supabase/astros-sms.deploy.ts`. Publique e teste no Lovable antes de trocar a imagem da VPS. Não exige novas credenciais, mudança no webhook ou depósito automático.

No cliente, os avisos antes da compra explicam que o número é temporário, não garante aceitação na plataforma e não deve ser usado para recuperação futura de contas. Copiar número/código confirma o resultado visualmente e orienta a cópia manual quando o navegador recusa acesso à área de transferência. As situações continuam usando mensagens do cliente, sem fornecedor ou códigos técnicos.

Cada ativação oferece Suporte deste pedido. A Central consulta a referência na conta autenticada, mostra resumo e permite copiá-lo sem incluir o código SMS. Ao abrir o chat, a preparação verifica novamente a propriedade no servidor e associa pedido/serviço/país aos atributos de identificação do contato. Não cria uma conversa nem envia mensagem automaticamente; o cliente continua pelo chat existente. Atendimento geral limpa esses atributos contextuais. A referência em URL não concede acesso a pedidos de outra conta. A operação usa a mesma caixa de atendimento, preservando a identificação já existente.

O início do admin mostra o saldo privado do fornecedor (e alerta abaixo de US$ 5) e um resumo de atenção SMS. No módulo, indicadores usam os pedidos criados no período, com a situação atual: quantidade, recebidos, abertos, devolvidos, vendas com código recebido, devoluções à carteira, custo conhecido e margem bruta estimada. Não são recebimentos bancários do período. Custo só usa a estimativa histórica salva; se faltar custo em pedidos recebidos, a margem é marcada parcial. Não é lucro líquido e não soma recargas com vendas. Datas seguem Fortaleza e o período máximo é de 366 dias.

A fila atual independe do filtro de datas: inclui conferência, preparação há mais de 90 segundos e pendentes com prazo vencido. Mostra os 20 pedidos mais antigos e o total completo, com cliente e botão para a conferência auditada existente. Não expõe código SMS nem ID privado do fornecedor. O cron continua responsável por verificar os resultados; o contador ou a inclusão na fila não autoriza devolução.

Pausar compras é uma ação administrativa dedicada, com confirmação. Não consulta câmbio/fornecedor, não salva preços nem altera saldo ou pedidos. A função SQL bloqueia a configuração, desabilita novas reservas e registra quem pausou; repetir a pausa não duplica o evento. Pedidos já registrados continuam sendo recuperados, consultados e reconciliados. Reservas novas são barradas no SQL, mesmo com catálogo aberto em outra aba. Uma compra já reservada antes da pausa pode terminar normalmente. Para retomar, habilite compras nas configurações e salve; as verificações de chave/rotina continuam obrigatórias.

Permissões: servidor requireAdmin, papel verificado na Edge e RPCs SQL somente service_role com actor admin. Auditoria de pausa privada. Atualizações automáticas somente enquanto a tela está visível, sem processamento de compras pelo dashboard. Testes usam banco isolado e respostas simuladas; a compra real continua pendente de teste controlado pelo usuário.


## Diagnóstico privado de compra recusada

Ative `supabase/migrations/20261015_sms_purchase_diagnostics.sql`, depois atualize integralmente a Edge Function com `supabase/astros-sms.deploy.ts`. A janela Conferir pedido passa a mostrar diagnóstico exclusivo do admin: categoria, HTTP, horário e texto limitado/sanitizado da resposta. Não expõe chave, cabeçalhos, payload, código SMS ou diagnóstico na resposta ao cliente. Só há um registro por pedido existente, sem duplicação por polling. Falha ao registrar diagnóstico não deve alterar o resultado financeiro nem repetir compra.

A documentação oficial foi revisada em 15/10/2026: `https://api.smspool.net/resources/postman.json`, Order SMS (`purchase/sms`). O envio mantém serviço/país/pool selecionados, quantidade 1, activation_type SMS, create_token 0 e teto exato do custo cotado em USD; não aumenta o teto nem tenta outra compra automaticamente. Não foi identificado erro comprovado nesses parâmetros e nenhuma compra autenticada foi feita nesta revisão.

O recurso corrige o descarte de recusas estruturadas em HTTP 400/422: success igual a 0, sem sinal de ativação entregue, pode seguir o protocolo de devolução única existente, como a recusa em HTTP 200. HTTP 5xx, timeout, JSON inválido ou resposta contraditória permanecem incertos, sem estorno automático e sem nova tentativa de compra. Categorias documentadas incluem OUT_OF_STOCK, PRICE_NOT_FOUND e BALANCE_ERROR; outras recusas aparecem como genéricas, com texto sanitizado para investigação. A categoria não é inferida a partir do saldo mostrado ou de suposição sobre estoque.

Pedidos anteriores não tiveram o motivo original salvo; não é possível reconstruí-lo a partir de refunded. Não inventar diagnóstico nem repetir pedidos antigos para tentar descobri-lo. Após ativar, um novo teste controlado permitirá examinar o retorno real se houver recusa. A ausência de diagnóstico não comprova qualquer causa.

## Estoque exibido na consulta

A resposta de cotação e da consulta administrativa inclui `stock` e `stockCheckedAt`, obtidos de `sms/stock` para o mesmo serviço/país/pool selecionados na oferta. A Edge valida sucesso e quantidade inteira não negativa; valor ausente, inválido ou fracionário não é apresentado como zero. Estoque zero bloqueia a criação de cotação. Não expõe pool, chave ou custo privado na cotação do cliente.

Cliente e admin mostram a quantidade e horário de Fortaleza. A confirmação de compra repete esse contexto. A quantidade não reserva números e não comprova autorização para o serviço (por exemplo, whitelist). Após a expiração da cotação, a interface pede nova consulta; não atualiza o horário localmente para aparentar dado recente. Uma versão antiga da função sem esses campos aparece como estoque não confirmado, nunca como quantidade fictícia. Não há compra automática nem consultas adicionais por polling.

Ativação: atualizar `astros-sms` com o arquivo integral `supabase/astros-sms.deploy.ts` e publicar o frontend; não exige novo SQL. Testes são simulados, sem compra real.

### DDD opcional (Brasil)
Aplicar `20261015_sms_area_code.sql` antes do novo `astros-sms.deploy.ts`.
O cliente pode deixar Qualquer DDD ou informar dois dígitos, sem 55. A Edge verifica o país no catálogo e consulta `request/areacodes` com serviço/país/pool da oferta. Respostas desconhecidas falham sem cobrar; nunca presumimos suporte brasileiro. A compra usa apenas o DDD salvo na cotação privada (`areacode` como JSON e `exclude=0`), mantendo UUID, limite de preço e uma única compra. O estoque exibido continua sendo geral da oferta, explicitamente identificado quando há filtro de DDD. Não promete estoque específico ou sucesso na plataforma. Não altera pedidos antigos nem saldo. Sem teste real de compra com DDD; requer validação controlada pelo usuário.

#### Verificação de suporte, 15/10/2026
Consulta pública real `request/areacodes` para Brasil (68), Telegram (907) e WhatsApp (1012), pool Charlie (3), responderam success=0 e “Custom areacodes is not supported for this pool.” Logo não há suporte confirmado de DDD nessa oferta; não tratar como falta de estoque. Parser distingue essa recusa conhecida de resposta desconhecida. Não foi feita compra. Nomes de países no seletor usam Intl.DisplayNames pt-BR e ISO validado; IDs e parâmetros enviados ao fornecedor não mudam. Bandeiras SVG por ISO no FlagCDN, sem credenciais/referrer, fallback para globo em erro; nomes continuam acessíveis sem imagem.

### Seleção condicional e acompanhamento
`area-options` autenticado consulta oferta atual e DDDs sem reservar/comprar. A UI mantém o campo oculto em carregamento, falha, lista vazia ou recusa de suporte; lista apenas DDDs explicitamente retornados. Consulta de preço revalida serviço/país/pool/DDD e persiste a seleção. Seleção antiga não é enviada quando não pertence à lista atual. Brasil apenas nesta versão. Atualizar Edge é necessário, sem SQL novo.
A ativação atual aparece antes do formulário de outra compra, com instruções de pedir SMS na plataforma e acompanhamento automático com página visível a cada 10–15 segundos. Método por e-mail não é SMS. Botão manual permanece como alternativa; falha de consulta não implica cancelamento nem devolução.

### Histórico compacto e retomada
Histórico do cliente usa linhas compactas e detalhes em diálogo com rolagem interna; admin mantém ferramentas de revisão. Paginação permanece em 20 pedidos, filtros persistem durante atualizações. “Acompanhar” foca o pedido no bloco principal sem comprar. Após confirmação da compra, a tela rola e foca a ativação quando o diálogo fecha, respeitando movimento reduzido; atualizações automáticas não provocam rolagem. Ao reabrir a página, uma consulta autenticada ao histórico pendente recupera a ativação pendente mais recente (até 20 resultados), sem nova compra. Pedidos em revisão e preparação continuam acessíveis pelo histórico. Consulta manual aproveita o resultado já recebido para atualizar o cartão, eliminando a segunda consulta redundante. Sem SQL ou Edge adicional.
