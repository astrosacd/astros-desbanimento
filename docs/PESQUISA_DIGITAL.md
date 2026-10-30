# Pesquisa digital — upgrade independente

## Escopo da primeira versão

Novo módulo `/pesquisa-digital`, separado de Prospecção (Maps/CNPJ) e Redes sociais. Catálogo por objetivo, Minhas pesquisas e Coleções. Três ferramentas fixas, mantidas pela Apify: `apify/instagram-search-scraper`, `apify/instagram-profile-scraper`, `apify/instagram-followers-following-scraper`. TikTok, vídeos e anúncios não são apresentados como serviços disponíveis. Esta versão não transfere resultados ao CRM existente: coleções ficam separadas, preservando os contratos Maps/CNPJ.

Pesquisa de perfis recebe uma única expressão. Consulta detalhada recebe até dez nomes/URLs de perfil. Extração de seguidores recebe um único perfil público e até cem resultados, conforme o limite administrativo. O plano Free da ferramenta de seguidores pode limitar a extração à primeira página. Dados privados não são desbloqueados; contatos podem não existir. Nenhuma chamada é iniciada ao abrir uma página, consultar histórico, salvar coleção ou exportar CSV. A consulta detalhada é explicitamente solicitada e não é executada para cada seguidor automaticamente.

## Instalação guiada — um passo por vez

1. Aplicar `supabase/migrations/20261028_digital_research.sql`. Instala desativado, modo piloto ligado, três ferramentas desativadas e preço zero. Reaplicação preserva configurações e registros. SQL opcional ausente afeta apenas este módulo.
2. Aplicar `supabase/migrations/20261028_digital_finance.sql`. Acrescenta classificações `digital:`/`digital-refund:` ao relatório financeiro existente; preserva os cálculos anteriores. A ativação é bloqueada antes deste complemento.
3. Aplicar `supabase/migrations/20261028_digital_account_deletion.sql`. Acrescenta as três tabelas de propriedade explícita à Zona de perigo; bloqueia exclusão com pesquisas pendentes e cotas atuais. Não exclui contas na instalação. A liberação de clientes é bloqueada antes deste complemento.
4. Criar a função Edge **astros-digital-research** usando `supabase/astros-digital-research.deploy.ts` ou os dois arquivos da pasta da função. Usa somente os secrets Supabase já disponibilizados pelo ambiente (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). A função valida a identidade no Auth e no banco em todas as operações. Não modificar JWT de funções existentes. Para esta função, configurar o gateway conforme suporte do projeto a suas chaves; a validação própria do Bearer permanece obrigatória mesmo se a verificação legada estiver desligada.
5. Publicar pelo Lovable e validar antes de qualquer troca de imagem na VPS. Nenhum rollout VPS é automático por esta implementação.
6. No ADM > Pesquisa digital, cadastrar a chave Apify, preço em centavos de real por perfil entregue, quantidade máxima, limite em centavos de dólar por execução e orçamento diário. Manter **modo piloto** ligado. A chave fica na tabela privada, não é devolvida ao navegador e não entra em URLs/logs. Não colar chaves no chat, no código ou no Git.
7. Fazer um teste pequeno com a conta administradora, sabendo que existe reserva real na carteira e custo potencial Apify. Conferir preço/plano do Actor no console antes do teste. Validar resultado, custo real, contato ausente, devolução parcial e histórico. Nenhum teste pago foi executado automaticamente.
8. Só liberar clientes retirando o modo piloto após validar casos de sucesso e falha. Pausa global e bloqueios individuais afetam novas pesquisas; histórico, resultados e conferência das tentativas existentes continuam acessíveis.

Sem cron, webhook ou alteração de função operacional existente. Nesta versão o acompanhamento é explícito por **Conferir andamento**, pelo cliente ou pelo ADM; abrir o histórico apenas lê o banco. Não apresentar processamento automático em segundo plano como já instalado.

## Segurança e financeiro

- O servidor da aplicação usa cookie HttpOnly e exige `requireAdmin` nas ações administrativas; a Edge verifica Auth confirmado, bloqueio, troca obrigatória de senha e papel atual; a RPC repete a verificação. Tabelas e RPC são service-only; UUID de proprietário nunca vem do cliente.
- POST ao fornecedor usa catálogo fixo, Bearer em header, origem fixa, redirect bloqueado, timeout, quantidade limitada, resposta limitada a 2 MB, `restartOnError=false` e `maxTotalChargeUsd`. A chave não pode ser trocada com pesquisas pendentes/incertas.
- Preço e versão são conferidos no banco. Reserva máxima na carteira ocorre atomicamente com movimento `digital:<UUID>` e intenção durável de envio. Mesma referência e parâmetros recuperam a tentativa sem repetir o POST; parâmetros divergentes são recusados.
- Não existe retry automático de criação. Timeout, 5xx, resposta inválida ou falha ao gravar o retorno entram em conferência e preservam a reserva. Falha entre intenção e envio também exige conferência; não prova que nada foi iniciado.
- Resposta de rejeição definitiva de criação, com erro estruturado e sem execução, devolve a reserva uma vez. `SUCCEEDED` com dataset confirmado cobra por perfil distinto entregue dentro daquela pesquisa e devolve a parte não entregue. A cobrança não exige telefone/e-mail e uma nova pesquisa pode cobrar novamente por um perfil já visto; isso consta na prévia.
- Execuções `FAILED`, `TIMED-OUT` ou `ABORTED` permanecem em conferência; não significam automaticamente devolução, pois pode haver consumo/resultado parcial. Consulta com run ID salvo pode continuar sendo conferida sem reenviar. Se o ID não foi recebido/persistido, não há associação por adivinhação nem tela de estorno manual: exige investigação do operador antes de ampliar o piloto.
- Limites globais são serializados em SQL; limite por conta/dia (Fortaleza), simultaneidade, uma pesquisa pendente por conta e orçamento diário reservado em US$. O orçamento é conservador: soma os tetos das tentativas iniciadas no dia, inclusive rejeitadas. Não é saldo/fatura do fornecedor; leituras e armazenamento adicionais devem ser acompanhados no console Apify.
- Resultados armazenam somente campos projetados e limitados. Não salvam payload bruto, fotos, vídeos, cookies de Instagram nem senhas. CSV neutraliza fórmulas. Coleções têm no máximo mil itens por conta; remover da coleção preserva a pesquisa e o financeiro. Não existe limpeza de registros financeiros.
- A Zona de perigo recebe somente três predicados explícitos: registros salvos, pesquisas e acesso da própria conta, nessa ordem. Pesquisas pendentes/incertas bloqueiam a exclusão; registros de execução ainda contados nas cotas do dia/janela de uma hora também bloqueiam. Registros antigos e concluídos podem ser removidos pelo fluxo original do proprietário, com senha, prévia e confirmações. Vínculos desconhecidos continuam bloqueando; dados de outras contas e provedores externos permanecem preservados. Não reaplicar o SQL antigo de exclusão isoladamente após este complemento.

## Verificações

`npm run build:dev`, `ASTROS_DEPLOY_TARGET=vps npm run build`, `tsc --noEmit`, testes Vitest da pasta `src/features/digital-research`, regressão Prospecção/financeiro/módulos/admin e `node scripts/check-digital-research.mjs` e `node scripts/check-digital-deletion.cjs` (PGlite instalado separadamente sem mudar dependências de produção).

A prévia `tests/digital-preview` usa o componente real com dados sintéticos e módulos mockados apenas no Vite de testes. Não faz parte das rotas da aplicação. Capturas desktop/mobile e checagem de transbordamento devem ser repetidas na CI. Gerar arquivo standalone com `python3 scripts/generate-digital-deploy.py` após mudanças na Edge.

Referências de implementação consultadas em 28/10/2026: https://docs.apify.com/api/v2/actors-runs-post e páginas Input/Output dos três Actors no catálogo Apify. Sem credencial/execução real, a compatibilidade com o plano contratado e a qualidade dos contatos continuam pendentes do piloto controlado.

### Comunicação entre hospedagem e Edge

A ponte usa `fetch` com `redirect: manual`, na origem fixa do projeto, preservando compatibilidade com runtimes Worker. Só leituras podem seguir até dois redirecionamentos canônicos para a mesma origem, caminho e query. Início de pesquisa, conferência com atualização financeira, configuração e coleções nunca são reenviados após erro ou redirecionamento. Nenhum Bearer é encaminhado para outro host. Diagnósticos registram somente ação e classificação D01 (transporte), D02 (redirecionamento recusado), D03 (tempo esgotado) ou D04 (resposta inesperada), sem token, corpo ou erro bruto. A tela administrativa apresenta a mensagem segura para facilitar a validação após publicação. Esta correção de ponte exige publicação da aplicação; não muda SQL ou Edge nem ativa consultas.


### Conferência de resultados e salvamento

O formulário administrativo mantém validação, erro do servidor e confirmação junto ao botão de salvar em uma área fixa durante a rolagem. Preço de ferramenta habilitada deve ser maior que zero; preço é em centavos de reais.

“Atualizar lista” lê o histórico salvo, sem chamar a Apify. “Conferir andamento”, agora também disponível em cada pesquisa pendente da lista do cliente e do administrador, consulta a execução original sob a mesma autorização e lease. Não cria pesquisa, não repete o POST e não faz nova reserva. Não há atualização automática em segundo plano. Se continuar em andamento após a conferência explícita, investigar a execução original no fornecedor; estado salvo sozinho não comprova o motivo da demora.


## Revisão de clareza e operação (29/10/2026)

- Mensagem “Limite diário do fornecedor atingido” é uma recusa local do SQL antes da reserva da carteira/POST. A interface do cliente traduz para limite de novas pesquisas da plataforma e mostra o aviso junto à ação. O texto original continua usado internamente para identificar a recusa definitiva e limpar a tentativa, sem quebrar recuperação por UUID. Não significa saldo esgotado ou cota retornada pela Apify.
- Teto diário: soma `max_usd_cents` dos pedidos criados desde meia-noite em Fortaleza, mais o limite da próxima execução. Soma todas as contas/ferramentas e também pedidos já concluídos ou rejeitados. Não usa gasto real. Exemplo: 100 de teto e 20 por execução comportam cinco reservas de 20. Nenhum limite salvo foi aumentado ou desativado por esta revisão.
- Preço por perfil é em centavos de R$, quantidade é número de perfis e limite da execução é em centavos de US$. Estes campos têm exemplos e intervalos na própria tela; não existe conversão automática do preço de venda. Cobrança é por perfil entregue em cada pesquisa, inclusive sem contato e mesmo se reaparecer em outra pesquisa.
- Acesso individual: conta sem linha segue regras gerais; linha `enabled=false` bloqueia novas pesquisas somente dessa conta, `true` remove esse bloqueio. Nunca ignora pausa geral, ferramenta desligada, piloto ou cotas. Formulário aplica uma alteração ao e-mail exato; não consulta/exibe seu estado atual. Histórico, conferência e coleções não são bloqueados.
- “Perfis salvos” contém coleções, que são pastas opcionais. Exportar a pesquisa não exige salvar perfis. Retirar de coleção não remove pesquisa nem lançamento financeiro. Cartões exibem somente métricas recebidas (zero é preservado); nenhuma consulta adicional é disparada para preencher campos ausentes.
- Conferência permanece manual, da execução original. Não há worker/webhook de conclusão instalado. Falhas de leitura da Apify preservam o estado salvo; o estado sozinho não prova que o provedor ainda esteja executando. Se persistir após conferência explícita, verificar a execução original sem iniciar outra.

Verificação desta revisão: testes de mensagens locais, recuperação de UUID, confirmação de preço e projeções; testes SQL de limites/financeiro e exclusão já existentes; builds e layout sintético desktop/mobile. Não representa auditoria de segurança independente nem teste de todas as respostas reais do Instagram/Apify. Nenhuma execução paga é iniciada pelos testes.


## Atualização automática em tela (30/10/2026)

A conferência manual foi complementada por atualização automática autorizada pelo proprietário. Cliente: detalhe aberto ou pesquisa em andamento na página atual de Minhas pesquisas; ADM: detalhe aberto. Somente IDs já existentes no estado running. Intervalo de 15 segundos, uma chamada em voo, até 20 conferências por ID na vida da tela. Pausa em aba oculta, não concorre com ação manual e ignora respostas após troca de conta/saída. Conclusão, revisão, recusa e erro encerram a conferência automática; botão manual permanece. Limite atingido/erro mostra pausa e orienta a conferência manual. Navegar para outro módulo ou fechar o navegador não mantém o processamento de conferência: não foi instalado cron, webhook ou worker.

O mecanismo chama somente refresh/admin-refresh com o ID original, mantendo a lease SQL e liquidação idempotente. Nunca chama start, não cria reserva e não refaz despacho. Estados incertos dispatching/review continuam manuais. A leitura da lista continua separada da atualização de andamento; instruções anteriores de conferência exclusivamente manual são superadas por esta seção.

O formulário de acesso individual agora se chama “Bloquear ou reabilitar um cliente”, mostra exemplo com e-mail fictício e exige escolher explicitamente bloquear/reabilitar antes de aplicar. Alterar o e-mail limpa a ação selecionada para evitar reaproveitar uma decisão para outra conta. A regra e RPC permanecem as mesmas.


## Respostas sem perfis válidos (30/10/2026)

Corrigido o caso em que uma execução SUCCEEDED retornava registros de erro ou perfis malformados e o catch preservava indevidamente o estado running. Com término confirmado e dataset recebido, erros de projeção agora levam a review sem fingir entrega, reenviar ou presumir devolução. Resultado válido e vazio segue finish com zero perfis, liquidação idempotente e devolução da reserva como já previsto em SQL. Falha de transporte/leitura não prova inexistência do perfil. A interface distingue resultado vazio de conferência pendente e não afirma “perfil inexistente” sem evidência específica. A sintaxe do @ pode ser validada antes, mas sua existência não é conhecida localmente.

Aplicação: publicar painel e atualizar somente a Edge Function astros-digital-research com o standalone regenerado. Não repetir SQLs, trocar chave/JWT nem criar outra pesquisa como teste automático. Conferir o ID original depois do deploy; o estado real da tentativa depende da resposta do fornecedor.


## Marcador sem seguidores (30/10/2026)

Evidência fornecida pelo proprietário: execução SUCCEEDED, log “Not found”, dataset com um único objeto contendo somente sourceUsername. Esse registro não é um perfil entregue. O parser aceita como zero entregas exclusivamente essa forma integral, apenas em instagram_followers, com sourceUsername exatamente igual à query imutável da pesquisa validada no RPC de status. A resposta dos seguidores é lida sem projeção fields e sem clean, ainda com limites de itens/bytes, para não ocultar sinais de erro. Nenhum payload bruto é armazenado ou retornado ao cliente.

Exige o run e dataset originais e SUCCEEDED antes da classificação. Para o marcador, confirma ainda nos metadados do dataset que o ID corresponde e itemCount é exatamente 1, impedindo que um limite de leitura esconda outros registros. Campos extras, origem divergente, mistura com perfis ou erros permanecem em conferência; FAILED/RUNNING não viram sucesso vazio. A liquidação usa finish com rows=[] e lease, devolvendo a reserva uma única vez pelo SQL já instalado. Não devolve custos da conta Apify nem libera teto diário; não dispara nova pesquisa. Consultar novamente o ID antigo em review permite essa liquidação após atualizar a Edge Function; não alterar o banco manualmente.


### Exportação integral com not_found (30/10/2026)

O JSON exportado completo fornecido pelo proprietário inclui três campos: sourceUsername, error="not_found" e errorDescription="Profile does not exist". A visualização anterior omitira os dois últimos. Acrescentado reconhecimento restrito desse objeto de três campos, somente em seguidores, fonte exata igual à pesquisa imutável, run original SUCCEEDED e dataset original com exatamente um item. Erros temporários/diferentes, descrição divergente, campos extras ou mistura com perfis não são liquidados como vazio. Mantém a devolução única via finish(rows=[]); nenhum crédito manual, reenvio ou SQL novo. Testes usam perfil sintético com a mesma estrutura exportada.
