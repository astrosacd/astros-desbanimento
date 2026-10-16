# Redes sociais — SMMRaja v3

Módulo independente `/redes-sociais`, com entrada própria nos dois sidebars. Usa o mesmo login, carteira (`painel_de_desbanimento.recarga`), Mercado Pago, perfil e suporte. Não expõe API para clientes. Não altera credenciais nem regras de SMS/desbanimento.

## Contrato consultado em 15/10/2026
Fonte: https://www.smmraja.com/api (página React; documentação atual no chunk oficial `ApiDocsVelocity-FsgXgt3h.mupvprsz.js`). Endpoint fixo HTTPS `https://www.smmraja.com/api/v3`, POST `application/x-www-form-urlencoded`, parâmetros `key` e `action`, retorno JSON. Não usar v2 por suposição de compatibilidade com outros fornecedores.
- `services`: IDs, nome/categoria/descrição, tipo, rate em USD por 1.000, min/max, refill/cancel. Apenas Default sem subscription nesta versão. Não importar comentários personalizados, avaliações, assinaturas ou tipos especiais como se fossem pedidos simples.
- `add`: service, link, quantity; confirmação contém order. A documentação não oferece chave de idempotência nem limite máximo de preço por compra.
- `status`: order; charge, currency, status, remains, start_count. Só USD confirmado é aceito.
- `balance`: saldo e moeda. Conta deve usar USD.
- `refill` e `cancel`: order; success textual confirma somente a solicitação. Não é confirmação de entrega/reposição/cancelamento. A v3 consultada não documenta `refill_status` nem histórico de pedidos para recuperar uma compra incerta. Não inventar esses endpoints.

O adaptador usa URL fixa, timeout, redirect bloqueado e resposta limitada a 12 MiB. Não acessa o link de destino: valida HTTPS e hosts da rede cadastrada pelo admin. Não solicita senhas sociais. Serviço habilitado e ID sempre vêm da base privada, não do preço enviado pelo navegador. Material de fornecedor é texto sem HTML executável.

## Ativação guiada (testar no Lovable)
1. Executar `supabase/astros-social.setup.sql`: tabelas privadas, RPCs service-only e extensão do relatório financeiro existente. Nenhum saldo ou pedido antigo é modificado; compras começam desativadas.
2. Criar a Edge Function **astros-social** e substituir todo o código por `supabase/astros-social.deploy.ts`. Desativar Verify JWT **somente nessa função**, pois o cron usa segredo privado. Toda chamada de cliente/admin ainda verifica o usuário confirmado via Auth, banimento, troca obrigatória de senha e role; worker exige seu segredo próprio. Não modificar configurações globais de Auth/SMTP.
3. Admin → Redes sociais → Configurações: informar chave, custo efetivo manual por US$ 1, acréscimo percentual e fixo. Salvar mantendo compras pausadas. A chave é testada com balance USD e guardada em tabela sem leitura de anon/authenticated. Deixar chave vazia mantém a atual. Nunca enviar chave pelo chat ou colocar em URL/git.
4. Catálogo: sincronizar, revisar os serviços e habilitar somente os escolhidos. Definir rede real e nome que será visto pelo cliente. Serviço novo fica oculto; sincronização preserva a curadoria e marca ausentes como indisponíveis. A importação invalida cotações anteriores. Consulta administrativa paginada em 100 serviços e busca; catálogo cliente em até 500 por pesquisa. Confirmar nomes/descrições e regras reais de reposição, sem prometer público interessado, permanência ou crescimento orgânico.
5. Executar `20261015_social_worker.sql`, exclusivo deste módulo. Agendamento `astros-social-monitor`, segredo gerado no banco e lido privadamente pelo tick. Atualiza até 10 pedidos por minuto; nunca repete compras. Cotações antigas não usadas são removidas em lotes limitados; pedidos/financeiro não são apagados.
6. Confirmar rotina recente no admin. Só então liberar compras e salvar. Testar um pedido pequeno, acompanhamento, recusa e eventual entrega parcial. Não houve teste real de SMM nesta implementação.
7. Atualizar a imagem da VPS somente após validar no Lovable, como os demais módulos.

## Preço, saldo e resultado incerto
Custo = rate USD por 1.000 × quantidade (arredondado para cima em milionésimos de dólar). Preço em centavos = custo × dólar efetivo manual × (1 + percentual) arredondado para cima, mais acréscimo fixo. O admin configura seu custo efetivo incluindo taxas; não há câmbio automático neste módulo. Carteira do cliente é sempre em reais e a recarga não abastece o fornecedor. Custo do fornecedor pode mudar: consulta ao vivo antes da reserva, mas a API não oferece price cap; eventual divergência entra em conferência e não gera cobrança extra automática ao cliente.

Cotação privada por 2 minutos, com owner, serviço, destino, quantidade e versões de configuração/catálogo. Confirmação explícita e UUID estável. SQL bloqueia a carteira, verifica saldo/versões/rotina/limites e registra `social:<UUID>` antes de uma única chamada add. Duplo clique/retry recupera o mesmo pedido. Troca de pedido após uma resposta perdida precisa de release sob o mesmo lock da carteira: recupera pedido existente ou invalida cotação não usada. Pré-consulta de saldo insuficiente não reserva a carteira; não é uma reserva do saldo do fornecedor.

Somente erro explícito conhecido de add sem order permite devolução imediata. Timeout, HTTP não OK, resposta desconhecida ou divergente: conferência, sem replay/refund por suposição. Preservar a referência e não associar um ID de fornecedor por semelhança de link/quantidade. Diagnóstico salvo é categoria fechada, nunca erro bruto com chave/link de acesso.

Status terminal válido: completed com remains=0; partial com quantidade restante válida e charge confirmado; refunded/canceled com charge=0 permite devolução total. Cancelamento com entrega parcial só encerra proporcionalmente quando remains e charge são confirmados. Status inválido, custo acima do orçado ou moeda divergente: conferência. SQL devolve uma vez por `social-refund:<UUID>`, proporcional à quantidade não entregue no partial, e nunca altera um terminal já encerrado. Financeiro registra custo histórico/charge convertido com a cotação da compra, não câmbio atual.

Cancelamento/reposição: confirmação visual, ação durável antes do fornecedor, uma solicitação de cada tipo por pedido nesta versão. Repetições recuperam o registro. Só em estados elegíveis/flags da compra. Resposta incerta nunca repete automaticamente; recebimento da solicitação não causa devolução. Reposição permanece como solicitada; não inferir sua conclusão do status do pedido original já concluído. Admin pode consultar pedidos, registrar observações internas e acessar suporte do fornecedor; a UI não permite inventar aprovação, reembolso sem prova ou associação automática de compra incerta.

## Acesso e financeiro
Todos os métodos administrativos exigem requireAdmin no servidor e tipo_usuario=admin na Edge; RPCs sensíveis repetem o controle do ator e só service_role executa. Clientes leem apenas seu UUID; detalhes, cancelamento, reposição e histórico têm checagem de dono. Todas as tabelas têm RLS e nenhum grant de leitura/escrita para anon/authenticated. Segredo worker e chave não aparecem nos retornos. Limite de 60 chamadas/minuto por usuário com uma linha atualizada, sem logs acumulados a cada polling.

Relatório financeiro estendido para social: débitos/devoluções classificados pelo prefixo, consumo diário inclui o módulo, vendas só completed/partial após devoluções e custo histórico confirmado. Pedidos devolvidos ficam fora de vendas/custo/ganho. Reembolso não é receita; recarga não é contada duas vezes. Gráfico/participação e carteira identificam o novo módulo. UI anterior ao SQL continua compatível por campo social opcional.

## Validação
Scripts isolados PGlite e testes de Edge/UI cobrem saldo, cotação, replay, terminal, devolução única, parcial, escopo do cliente e privacidade. Não usam chaves reais nem enviam pedidos/pagamentos externos. A conferência de layout e resultados dos checks desta entrega estão em RESPONSIVIDADE/registro do trabalho; não equivalem à validação real do fornecedor. Fontes das políticas de plataformas: https://about.fb.com/br/news/2022/08/tomando-medidas-legais-contra-servicos-de-engajamento-falso-no-brasil/ e regras oficiais de integridade das redes; esse tipo de serviço não deve ser anunciado como orgânico ou isento de restrições.

A chave guarda uma geração privada de integração. Pedidos/cotações preservam essa geração e as condições da compra. Após uma troca de chave, serviços ficam ocultos e exigem sincronização/liberação de novo; ações sobre pedidos da geração antiga ficam bloqueadas. Assim um ID antigo não é enviado acidentalmente a outra conta do fornecedor. Cancelamento pendente/incerto é encerrado no audit quando o pedido atinge um terminal confirmado, sem inferir que o fornecedor aceitou cancelar uma entrega que já terminou.

## Informação operacional e preços
- Entrada pública inclui redes sociais; os termos abrangem estimativas de prazo, quedas, reposição condicionada e confirmação de cancelamento.
- Catálogo administrativo mostra custo estimado, preço de venda e diferença bruta para uma quantidade de referência dentro dos limites; editor permite simular outra quantidade. Usa configurações salvas e último catálogo; não é cotação garantida nem lucro líquido. A autorização e o preço de compra continuam no servidor.
- Operação avisa saldo inferior a US$ 10 (limiar fixo informativo), com horário da consulta; erro de consulta não aparece como saldo zero.
- Indicação explícita NR / No refill / Sem reposição no nome ou descrição prevalece sobre flag contraditória: não oferecer reposição. Sincronizar catálogo após atualizar astros-social. Pedidos históricos preservam valores; solicitações de reposição também passam por esse bloqueio no servidor.
- Teste real requer saldo do fornecedor e confirmação pelo proprietário; nenhuma compra foi executada pelos testes automatizados.

## Catálogo e liberação em lote
- Filtros de rede e situação são aplicados no servidor antes da paginação. Clientes recebem somente serviços liberados e disponíveis, independentemente de filtros enviados.
- Seleção limitada aos serviços configurados e disponíveis da página atual (até 100), limpa ao mudar filtros/página. Não existe liberar catálogo inteiro sem revisão.
- Ações individuais e em lote exigem confirmação; itens sem rede abrem o editor para configuração explícita. Não adivinhar a rede pelo nome do fornecedor.
- Nova RPC service-only `astros_social_visibility` valida admin, quantidade, existência, disponibilidade, nome e rede; lote inválido é rejeitado por inteiro, sem alteração parcial. Somente visibilidade e versão dos serviços mudam; preços, carteira, pedidos e pausa geral são preservados.
- Ativação: executar `20261016_social_catalog_visibility.sql` e atualizar `astros-social` com o arquivo deploy completo.
- Cliente: selecionar rede, pesquisar, filtrar categoria e escolher serviço; descrição e condições aparecem no bloco Sobre o serviço. Categorias refletem o resultado encontrado e a pesquisa ajuda em catálogos extensos. Sem estatísticas ou prazos fictícios.

## Sincronização automática e operação
Aplicar `20261016_social_operations.sql`, atualizar a função completa `astros-social`, então executar `20261016_social_catalog_cron.sql`. O cron de catálogo é separado do acompanhamento de pedidos e roda a cada 5 minutos; só consulta o fornecedor quando a atualização tem pelo menos uma hora ou houve falha. Tentativas usam lease de 90 segundos e geração da integração para impedir concorrência e publicação de catálogo obtido com uma chave antiga. Nenhuma rotina de catálogo cria pedidos, debita ou devolve saldo. Falha mantém catálogo anterior e registra só status/timestamps fixos, sem payload ou credenciais.

Serviços novos entram ocultos. Sincronização preserva rede, título, categoria e descrição em português. Alteração de preço atualiza estimativas; alteração de descrição, limites ou condições de reposição/cancelamento marca o serviço para revisão e o oculta. Lotes não podem pular essa revisão. Um catálogo idêntico não altera versões de serviços nem invalida cotações.

Apresentação em português é editável, com categoria sugerida por palavras conhecidas e descrição geral conservadora quando não há texto revisado; não é tradução automática integral das condições do fornecedor. O original permanece administrativo. Cotação/pedido preservam a descrição original e o texto ao cliente separadamente; a descrição original continua sendo usada para bloquear reposição contraditória. Preços e condições atuais são verificados antes da cobrança.

Resumo operacional conta todos os pedidos, sem confundir contagem com faturamento. Fila mostra os 20 mais antigos em conferência ou ativos há mais de 24 horas, com contagem completa; 24h é critério de acompanhamento, não promessa de prazo. ID externo e descrição original aparecem somente nos detalhes administrativos, com copiar ID e confirmação visual. Clientes não recebem ID do fornecedor.


## Catálogo automático e seleção em etapas
Aplicar `20261016_social_automatic_catalog.sql` e publicar `astros-social.deploy.ts`. Em Catálogo, o administrador pode ativar o catálogo automático uma vez. A rotina já existente atualiza os serviços compatíveis sem classificação individual. A pausa global continua independente. Decisões manuais de ocultar/liberar são preservadas.

O cliente filtra rede → tipo de serviço → categoria/origem original do fornecedor → serviço. As opções de categorias são agrupadas no servidor sobre todo o catálogo liberado, antes da paginação. Instagram, Facebook, YouTube, TikTok, X e Telegram são reconhecidos pelo início do nome/categoria; serviços não reconhecidos ficam ocultos. Serviços especiais não compatíveis com pedidos simples continuam excluídos.

A descrição original e suas informações de início, velocidade e quedas aparecem quando fornecidas pela API. Métricas exclusivas do site não são inventadas; campos ausentes exibem “Não informado pelo fornecedor”. O preço final continua calculado no servidor e debitado da carteira única, pelas regras existentes.


### Ampliação de redes
Aplicar `20261016_social_more_networks.sql`, atualizar a função e sincronizar o catálogo. Também reconhece Twitch, LinkedIn, Spotify, Threads, Website, Snapchat, WhatsApp, Kick e Pinterest, além das seis redes iniciais. Categorias/nomes sem reconhecimento continuam ocultos. As mesmas validações de pedidos Default, saldo, preços e idempotência permanecem. Website aceita apenas URL HTTPS de domínio público com nome DNS; nenhum destino é acessado pelo servidor. Os demais destinos permanecem limitados aos domínios da plataforma. Não equivale a importar todos os formatos especiais do fornecedor.


### Conferência do catálogo original
O botão administrativo “Exportar catálogo original da API” usa leitura autenticada/admin do endpoint oficial services, sem filtrar tipos, redes ou categorias e sem executar compra. O JSON preserva valores de campos documentados e metadados de entrega opcionais presentes, mas nunca exporta chave/headers. Permite comparar o que a API fornece com o site antes de ampliar formulários e taxonomia. A lista comercial continua com os limites explicitados; a exportação não significa suporte de compra a todos os formatos. Filtro de rede usa busca com altura limitada ao viewport.

A listagem comercial do cliente agora permite avançar/voltar nas páginas de 500 serviços de cada filtro, sem descartar permanentemente os demais resultados. A seleção é limpa ao trocar de página; cotação em aberto bloqueia essa troca.


## Política atual: publicação exclusivamente manual
A atualização `20261016_social_manual_release.sql` substitui a liberação automática anterior. Na primeira execução oculta os serviços atuais para nova revisão administrativa, sem alterar saldos ou pedidos. Um marcador torna a reaplicação segura: liberações manuais posteriores não são ocultadas novamente. Serviços novos permanecem ocultos; identificação de rede/tipo continua automática. A antiga ação de habilitar publicação automática é rejeitada no servidor e no banco.

O nome de venda, a descrição personalizada e as decisões manuais persistem nas sincronizações. Nome e categoria originais ficam no administrador para referência. Mudanças só de custo atualizam preços, preservando o nome e a liberação; mudanças relevantes nas condições exigem revisão. A compra continua validando o custo atual no fornecedor e a carteira no servidor.

“Ver detalhes” abre a referência original, ID, custo USD por mil, limites e informações de início, velocidade, quedas, confiabilidade e prazo disponíveis na API/descrição. Metadados opcionais são guardados sem cálculos de prazo. A API pode não fornecer as estatísticas históricas/gráficos exibidos no site; campos ausentes são identificados e nunca estimados pelo painel.


## Preferências do cliente e referência de suporte
Aplicar `20261016_social_client_preferences.sql` e atualizar a função. A consulta é somente leitura, service-role, com autenticação da função; sempre restringe a serviços liberados/disponíveis e sem revisão pendente. Ordenação/filtros são aplicados sobre todo o catálogo antes das páginas de 500. Mais barato usa o preço de referência para pedido de mil unidades em reais, calculado com câmbio/margem/taxa atuais, sem expor o custo do fornecedor. A cotação real continua independente e valida quantidade/preço antes de cobrar.

Confiabilidade ordena apenas os níveis explicitamente reconhecidos da API; quedas só ordenam percentuais individuais comparáveis, não estimam faixas. Dados ausentes ficam por último. Região é busca textual por menções originais, não certificação de geolocalização. Quantidades filtram serviços cujo intervalo permite alguma quantidade na faixa desejada. Nada altera nomes, liberações ou carteira.

A referência do serviço é o ID original `service_id`, exposto no catálogo, cotação e pedidos. Não confundir com o pedido do fornecedor (privado ao administrador) ou com o UUID do pedido Astros. A cópia para suporte inclui a referência do serviço e o pedido Astros quando disponível. O histórico também permite buscar o número da referência, mantendo o filtro de proprietário.


## Inventário completo e plataformas derivadas do catálogo
A análise do arquivo original fornecido em 16/10/2026 confirmou 5.832 registros, 515 categorias e 16 formatos. A limitação anterior era parcialmente interna: redes fixas, formatos filtrados e limites de quantidade de importação menores que os retornados.

Aplicar `20261016_social_complete_source_catalog.sql`, atualizar a função e sincronizar. A sincronização salva todos os registros originais no inventário administrativo `astros_social_source_catalog`, incluindo valores/formatos não vendáveis pelo formulário atual. Nomes, categorias, formatos e referência originais ficam consultáveis. A gravação de inventário e catálogo comercial é atômica e protegida pela mesma geração/lease; falha preserva o catálogo anterior. Registros removidos ficam indisponíveis sem apagar histórico. Inventário tem RLS e nenhum acesso direto de clientes; endpoints administrativos verificam ator.

As plataformas dos seletores são consultadas do inventário real (admin) e dos serviços efetivamente liberados (cliente), sem uma lista fixa que descarte novos grupos. A API exportada informa categorias; o agrupamento de plataforma é uma interpretação normalizada por aliases e por prefixo da categoria para grupos desconhecidos, nunca um novo campo alegadamente fornecido pelo fornecedor. A categoria original continua intacta para comparação. A categoria Private permanece consultável.

A classificação automática não publica nada. Nomes manuais e decisões de liberação permanecem. Apenas serviços compatíveis com os campos/validações do formulário atual podem ser editados/liberados para compra; todos os demais continuam visíveis para análise no inventário, com indicação explícita de necessidade de adaptação. Não converter assinaturas, pacotes ou comentários personalizados em pedidos Default. Serviços Default com limites máximos válidos até 2.147.483.647 agora são importados; a quantidade efetivamente comprada ainda respeita os limites de segurança do pedido. Valores zero ou metadados inválidos são visíveis no inventário, sem cobrança automática.

Plataformas conhecidas mantêm validação de host. Para plataformas adicionais, o destino é uma URL HTTPS pública com hostname DNS (sem IPs, credenciais, portas, hosts internos), obtido de um serviço salvo e aprovado pelo admin; o servidor nunca acessa o link do cliente. Formatos cuja entrada não é URL precisam de adaptação antes de publicação. A mudança não altera carteira, gateway, pedidos ou rotina de reconciliação.

Na amostra real também havia muitos `type: Default` com a flag `subscription: true`; a capacidade opcional não é usada como prova de que o pedido exige o formulário Subscriptions. A seleção de formulário usa o campo `type`. Foram encontrados preços JSON numéricos com resíduos binários (ex.: `2.5725000000000002`). A conversão para unidades inteiras aceita apenas a proximidade de até duas unidades de epsilon da representação de seis casas; precisão genuinamente maior continua rejeitada para compra e preservada no inventário. Strings decimais continuam estritamente validadas, sem arredondamento silencioso.


### Distribuição da tela do cliente
A apresentação divide o novo pedido em catálogo, detalhes e destino/quantidade. Em telas largas, os detalhes ficam ao lado; até 1.150px, ficam antes do formulário do pedido. Referência do serviço, limites e preço para mil unidades têm hierarquia própria; entrega/condições e orientações são expansíveis. A confirmação e as regras de saldo, cotação, expiração e recuperação de tentativas permanecem iguais. Sem SQL ou atualização de função nesta mudança visual. Validação: testes do módulo e layout antes/depois de selecionar serviço em oito tamanhos, 320 a 1440px.
