# SMSPool + 5SIM: escolha manual

A 5SIM é um segundo fornecedor do mesmo módulo de SMS e da mesma carteira. O SMSPool continua instalado e selecionado por padrão. O administrador escolhe o fornecedor em Gestão de ativações → Configurações → Fornecedores de SMS. Não existe contingência automática: falta de estoque, restrição de WhatsApp, erro ou saldo baixo nunca provoca compra no outro fornecedor.

O catálogo, o simulador, o estoque e as novas cotações usam o fornecedor selecionado. Cada pedido guarda seu fornecedor e seus identificadores originais. Trocar o fornecedor invalida as cotações anteriores e preserva o acompanhamento de ambos os fornecedores pelo mesmo worker/cron. Pedidos antigos recebem o valor padrão `smspool`, sem reconstruir preços/saldos/histórico. A unicidade de identificação externa passa a ser `(supplier, provider_id)`, porque dois fornecedores podem emitir o mesmo ID.

## Preços e chave

Use a chave do **protocolo 5SIM**, não a integração legada API1. Autenticação `Authorization: Bearer`, host fixo `https://5sim.net/v1/`, sem redirects e sem SDK externo. A chave nunca vai em URL, resposta, log ou repositório. Salvar uma nova chave consulta `/user/profile` antes da gravação; a RPC administrativa verifica novamente que não há pedidos 5SIM em andamento/conferência antes de permitir rotação. Deixar o campo vazio mantém a chave.

O campo **Conversão do preço da API para reais** é um fator de conversão, não preço fixo por número. Cada serviço/país/operador tem preço próprio obtido na API. O contrato chama as unidades do saldo de coins; os endpoints de preços não retornam um código de moeda confirmado. Não assumir USD só porque o site exibe `$`, nem reutilizar silenciosamente o câmbio do SMSPool.

Na configuração 5SIM, a conferência administrativa consulta catálogo e preços por operador diretamente da Edge, sem chave/câmbio configurados e independentemente do fornecedor ativo. Mostra preço bruto da API, estoque informado e taxa histórica (ausência = Não informado, nunca 0 inventado). Não realiza compra, reserva, crédito ou mudança de fornecedor. Apenas administradores autenticados podem consultar esses endpoints.

Para calcular o fator sem presumir moeda, escolha exatamente o mesmo serviço, país e operador e informe o custo dessa oferta em reais, sem markup. Se o site exibir dólar/outra moeda, é preciso converter o preço correspondente para reais com o custo efetivo de câmbio antes de informar. O cálculo é `custo BRL da oferta / preço bruto API da mesma oferta`, arredondado para cima em quatro casas. Uma confirmação explícita evita usar moedas ou ofertas diferentes. Calcular somente preenche o formulário: o admin precisa salvar para aplicar. A conferência não prova automaticamente uma moeda e não promete correspondência global USD/coins. O dado ao vivo deve ser verificado após deploy.

Os valores de conversão previamente salvos são preservados até o admin salvar outra conversão. Nenhum pedido antigo é recalculado. Acréscimo percentual e fixo permanecem separados e o cliente continua consultando preço final em reais, com o mesmo fluxo de serviço/país/número/código.

A compra consulta preço/estoque e saldo externo novamente antes da reserva atômica da carteira. Reserva congela fornecedor, preço, conversão e referência UUID. A compra 5SIM usa `operator=any` com `maxPrice` da cotação, pois a documentação afirma que esse teto só é aplicado com `any`. Nenhuma seleção de DDD é anunciada para a 5SIM. O estoque mostrado considera apenas as ofertas na faixa exata do teto, sem somar estoque de operadores mais caros.

## Estados, falhas e cancelamento

- `PENDING` e `RECEIVED` sem código: aguardando. O nome RECEIVED sozinho não significa que o código chegou.
- Código SMS validado, identidade/serviço/país/telefone conferidos, estado compatível: recebido. O código aparece somente ao proprietário; admin recebe projeção sem código.
- `CANCELED` sem qualquer SMS: cancelamento confirmado e estorno único pela RPC financeira existente.
- `TIMEOUT`, `BANNED`, `FINISHED` sem código, resposta contraditória ou não reconhecida: conferência. Expiração local/ausência de SMS não prova estorno. Estes casos precisam de confirmação pelo suporte do fornecedor se não evoluírem para cancelamento confirmado. Não há botão administrativo de crédito sem evidência.
- Recusa textual exata documentada (ex.: `no free phones`, `not enough user balance`) em HTTP 200/400, sem ativação: devolução pela mesma RPC. HTTP 5xx, 429/503, `server offline`, resposta malformada e falhas de rede: conferência, sem repetir compra ou devolver por suposição.

A 5SIM usa GET até para comprar/cancelar. A compra tem uma única autorização de despacho na reserva. O cancelamento possui uma autorização durável adicional, compartilhada entre cliente e revisão administrativa; timeout ou erro após a chamada não autoriza outra chamada de cancelamento. Consultas posteriores podem reconciliar o resultado. A revisão administrativa mantém UUID/justificativa/auditoria existentes. O worker nunca repete uma compra nem tenta adivinhar vínculo pelo histórico do fornecedor.

## Instalação, em etapas

Pré-requisito: todas as migrações SMS anteriores, inclusive FX, custo financeiro, revisão, operações, diagnósticos e controles de módulos já instaladas.

1. Executar **somente** `supabase/migrations/20261021_sms_five_sim.sql` no SQL Editor. É aditiva, transacional e reaplicável; preserva fornecedor ativo, chaves, restrições e pedidos. Nenhuma chave real deve ser colada no SQL.
2. Substituir o conteúdo inteiro da Edge Function `astros-sms` por `supabase/astros-sms.deploy.ts` e dar deploy. O arquivo é cópia exata de `supabase/functions/astros-sms/index.ts`. Não alterar o cron, o segredo do worker nem outras funções.
3. Publicar a interface no Lovable/ambiente de validação. Não selecionar 5SIM antes de instalar SQL + Edge + interface. Após a migração, a Edge antiga continua funcionando para SMSPool enquanto o administrador não muda o fornecedor.
4. No admin, salvar chave 5SIM + custo efetivo/margem/taxa. Consultar saldo nativo. É possível selecionar 5SIM com compras pausadas para consultar o catálogo e o simulador sem comprar.
5. Conferir preço do simulador. Liberar compras, realizar uma ativação controlada e verificar débito, número, código/cancelamento e histórico. Não afirmar teste real sem ter feito essa compra com autorização e saldo.
6. Validar que um pedido SMSPool já existente continua acompanhando após mudar para 5SIM e vice-versa. Só depois atualizar a imagem da VPS manualmente, mantendo o mesmo banco/Edge.

Se precisar recuar, selecione SMSPool e pause novas compras conforme necessário. **Mantenha SQL e a nova Edge**, pois pedidos 5SIM existentes dependem deles. Não apagar tabelas/colunas e não recolocar a Edge antiga depois de existirem pedidos 5SIM.

## Validação local

`npx tsc --noEmit`; `npx vitest run`; `node scripts/check-sms-five-sql.mjs`; `node scripts/check-sms-sql.mjs`; `node scripts/check-sms-review-sql.mjs`; `node scripts/check-sms-operations-sql.mjs`; `node scripts/check-sms-diagnostics-sql.mjs`; `node scripts/check-module-access-sql.mjs`; `npm run build`.

O teste SQL executa as funções reais em PostgreSQL/PGlite e cobre preservação histórica, escolha/versão de fornecedor, chave privada/rotação, preço nativo, débito idempotente, ID externo igual em fornecedores distintos, cancelamento único, pausa/reconciliação, falta de câmbio USD na 5SIM, heartbeat, bloqueio por módulo e reaplicação. Os testes HTTP usam respostas simuladas da documentação, sem conta real, compras ou acesso ao Supabase de produção.

## Fontes oficiais conferidas em 21/10/2026

- https://5sim.net/docs — profile, guest/products/any/any (apenas Category activation), guest/countries, guest/prices por país/produto, buy/activation com any + maxPrice, check, cancel, estados e limites. Sem hospedagem/reutilização/banimento automático.
- https://5sim.net/docs2/offer.html — saldo em coins, regras de cancelamento/não implementação e limites das garantias. O adaptador exige cancelamento confirmado, sem prometer reembolso por rejeição da plataforma depois de um SMS.
- https://5sim.net/rules — uso correto do serviço e da API, ausência de garantia de aceitação/contas nas plataformas.

Não foi realizada compra real nem validação da credencial do proprietário durante a implementação. A existência pública de API não comprova autorização comercial individual para revenda.

## Organização administrativa

Há um único controle de liberação nas Configurações, no bloco Controle de novas compras, com o fornecedor escolhido e o botão Salvar funcionamento. As abas Configurar SMSPool e Configurar 5SIM guardam apenas chave e preços de cada API; trocar de aba ou salvar preços não seleciona fornecedor. O salvamento SMSPool consulta a disponibilidade atual no servidor, sem aceitar o valor antigo do navegador. Rascunhos das duas contas são preservados ao trocar de aba.

Os dois saldos são consultados automaticamente e separadamente, com chave de cache por conta/fornecedor e unidade própria (USD no SMSPool; unidades nativas na 5SIM). Uma falha não oculta o saldo do outro fornecedor nem inventa saldo zero. O mesmo cartão aparece na aba de configuração da respectiva API. Os ícones de interrogação explicam os campos por clique/toque/teclado e não submetem os formulários. Alteração da interface e das server functions apenas: não requer SQL, novo deploy da Edge nem mudança do cron.

## Atualização de conferência de preços

Requer apenas atualizar/deploy a Edge `astros-sms` usando o arquivo standalone e depois publicar a interface. Não há migração SQL, mudança de cron, alteração automática da conversão ou das compras. Endpoints novos: `admin-five-catalog` e `admin-five-offers`, com confirmação de Auth/role e limite existente. A consulta ao vivo deve ocorrer a partir do servidor; o ambiente de desenvolvimento recebeu HTTP 403 da 5SIM e não foi possível confirmar valores reais por aqui. Usar a tela administrativa para conferir a oferta após a instalação; se o servidor também receber bloqueio, tratar com o suporte da 5SIM, sem inventar valores.
