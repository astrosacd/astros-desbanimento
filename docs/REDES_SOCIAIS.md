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
