# Prospecção — SerpApi

Módulo separado no cliente e no admin. Usa a carteira compartilhada, sem disparar mensagens ou abordar empresas automaticamente.

## Instalação completa em uma base nova
1. Execute `supabase/migrations/20261018_prospecting.sql` no SQL Editor.
2. Execute `supabase/migrations/20261018_prospecting_finance.sql` para classificar os débitos no financeiro.
3. Execute `supabase/migrations/20261018_prospecting_capacity_queue.sql` para instalar capacidade e fila.
4. Crie a Edge Function **astros-prospecting**, cole todo o conteúdo de `supabase/astros-prospecting.deploy.ts` e faça Deploy. Desative a verificação JWT legada somente nesta função: ela valida a identidade pelo Supabase Auth e o worker pelo segredo privado. Não altere autenticação global.
5. Execute `supabase/migrations/20261018_prospecting_queue_schedule.sql` para instalar o processamento a cada minuto.
6. No admin → Prospecção, salve sua chave SerpApi e configure preço por lead, validade da base, limite individual e teto global diário opcional. O módulo começa pausado. Confira a sincronização e o processamento Ativo antes de liberar.
7. Faça uma busca pequena controlada. Pode configurar preço zero para o primeiro teste. Confira leads, histórico, carteira e financeiro antes de liberar buscas pagas.

Os secrets padrão SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são fornecidos pelo ambiente da função. Nunca coloque a chave SerpApi no GitHub, em variáveis VITE ou no chat. Publicar no Lovable não executa SQL nem publica funções no Supabase. A VPS continua na imagem atual até atualização manual.

## Busca e cobrança
O cliente informa nicho, país e cidade/região. A situação do site é verificada automaticamente e exibida nos resultados; não é uma escolha no formulário. Cada busca pede de 1 a 20 leads. Uma tentativa consulta no máximo uma página de até 20 resultados do Google Maps pela SerpApi, podendo entregar menos após filtros e exclusão de repetidos. Apenas leads efetivamente entregues são debitados. Uma busca sem entregas não cobra.

A entrega, o débito e o movimento da carteira são gravados na mesma transação. Um UUID identifica a tentativa: reenviar a mesma referência não faz nova cobrança. Se a resposta se perder, use Verificar esta busca ou o histórico; não inicie outra tentativa para descobrir o resultado. Uma busca na fila pode aguardar até 24 horas e não reserva saldo. Ao começar o processamento, tem três minutos para concluir. Se expirar ou o saldo ficar insuficiente, encerra sem débito.

O preço é por lead entregue, em reais. Não representa o preço da SerpApi nem garantia de lucro. O custo do fornecedor é suportado pela conta administrativa conforme seu plano e uso. Há limite de buscas por conta e um teto global diário opcional, considerando America/Fortaleza. Definir o teto global como 0 desativa apenas esse teto; não desativa limites do fornecedor. Atualizar a conta do fornecedor também usa seu endpoint de conta, sem coletar leads.

## Cache e repetição
As empresas e consultas formam uma base compartilhada privada. Uma consulta equivalente pode aproveitar resultados recentes sem uma nova chamada ao fornecedor. O cache tem validade configurável de 1 a 30 dias. A paginação avança de 20 em 20, até seis páginas por janela. Uma trava impede chamadas simultâneas para a mesma página.

Uma empresa já entregue não é entregue novamente como nova para a mesma conta, inclusive em outra pesquisa. Outra conta pode receber essa empresa. A identificação usa place_id do fornecedor ou CID como alternativa; mudanças de identidade na origem não permitem afirmar que dois registros representam a mesma empresa física. O cliente só acessa suas entregas e seu funil, nunca a base compartilhada ou os dados de outra conta.

## Verificação de site
- Sem site informado: a origem não forneceu endereço.
- Rede social ou página de links: não equivale a site próprio.
- Site acessível: respondeu na verificação, sem garantia de funcionamento de todas as páginas.
- Possível problema: sinais como página suspensa, domínio estacionado ou HTTP 404/410.
- Não foi possível confirmar: timeout, bloqueio, erro de rede/TLS, resposta insuficiente ou incompatível.

A checagem é uma observação datada, não uma conclusão definitiva. Não executa JavaScript, tem limites de tempo/tamanho e usa IPv4 público. A leitura direta aceita até 512 KiB e analisa o trecho disponível quando a página ultrapassa esse limite, sem descartar automaticamente uma resposta bem-sucedida. Scripts e estilos incompletos no corte não são evidência de conteúdo visível. URLs locais, credenciais, portas e redes privadas são bloqueadas; a resolução é validada na conexão efetiva e em redirecionamentos. HTML não é armazenado. Erros 403/429/5xx não são tratados como prova de site desativado.

## Uso pelo cliente
Meus leads oferece pesquisa, etapas individuais e exportação CSV da página atual. O histórico mostra quantidades e cobrança reais. Nome, endereço, telefone, site e Maps dependem dos campos públicos retornados; e-mail e WhatsApp não são prometidos. A existência do telefone não confirma conta WhatsApp ou consentimento para contato.

## Manutenção e validação
Fontes: `supabase/functions/astros-prospecting`, `src/features/prospecting`, rota `/prospeccao`. Gere novamente o arquivo de deploy após alterar a função:

```bash
python3 scripts/generate-prospecting-deploy.py
npm test
npm run build
```

Teste transacional isolado, com PGlite instalado fora do projeto:

```bash
ASTROS_PGLITE_MODULE=/caminho/node_modules/@electric-sql/pglite node scripts/check-prospecting-sql.cjs
```

Os testes locais não comprovam a chave, a cota nem uma chamada real da instalação. A versão com fila depende do cron exclusivo `astros-prospect-queue`. Nenhuma integração externa é acionada pelos testes simulados.

## Leitura complementar com Jina Reader
A função também consulta `https://r.jina.ai/` para ler páginas públicas de sites próprios classificados como acessíveis ou inconclusivos. Guarda somente título, trecho de até 600 caracteres, até cinco e-mails publicados e data da leitura. A interface e o CSV mostram esses campos quando disponíveis. Não gera abordagem, não envia mensagem, não executa instruções encontradas na página e não confirma a validade ou titularidade dos contatos. O trecho é uma extração, não uma avaliação por IA.

Para ativar esta atualização em uma instalação existente, substitua todo o código da função **astros-prospecting** pelo arquivo `supabase/astros-prospecting.deploy.ts` atualizado e faça Deploy. Não é necessário novo SQL. Entregas antigas permanecem como estavam; o enriquecimento ocorre nas novas coletas.

A integração tenta o acesso básico sem chave. Isso está sujeito aos limites e disponibilidade da Jina e não significa serviço ilimitado. Opcionalmente, configure **JINA_API_KEY** nos secrets do Supabase para usar sua conta Jina; a chave nunca vai para o cliente. Não reutilize a chave SerpApi nesse secret. Não há novo campo obrigatório no painel.

A leitura usa prazo e resposta limitados, solicita conteúdo atualizado sem cache do fornecedor e omite parâmetros de consulta do endereço. Só chama o domínio fixo Jina, nunca repassa cookies ou tokens da sessão. URLs sociais, locais, com credenciais e endereços DNS privados são recusados. A verificação direta mantém a proteção de conexão descrita acima; a navegação executada pela Jina depende das proteções do fornecedor.

Falhas, bloqueios, limites e respostas inconsistentes da Jina são opcionais: não impedem a entrega dos demais dados. Não mudam uma verificação direta conclusiva. Uma leitura válida pode esclarecer um resultado antes inconclusivo. O processamento tem orçamento de tempo compartilhado; chegar ao limite mantém os casos restantes inconclusivos. A base compartilhada reaproveita os dados para reduzir chamadas.

## Atualização de capacidade e fila em uma instalação existente
1. Aplique **20261018_prospecting_capacity_queue.sql**. Ele preserva saldos, leads, configurações e histórico; acrescenta capacidade, reservas de consulta e estado de fila.
2. Substitua o código de **astros-prospecting** por **astros-prospecting.deploy.ts** atualizado e faça Deploy. A verificação JWT legada deve continuar desativada apenas nessa função; login e worker são validados internamente.
3. Aplique **20261018_prospecting_queue_schedule.sql**. Ele cria/recria somente o cron deste módulo, a cada minuto, com segredo gerado e guardado na tabela privada. Não pede chave manual nem altera crons de outros módulos.
4. No admin, confira o plano, cota do ciclo, limite por hora, uso informado, renovação, horário da sincronização e processamento Ativo. Pode levar o primeiro minuto para o cron confirmar o heartbeat. Novas buscas são recusadas enquanto o processamento não estiver confirmado.
5. Configure o teto diário global: **0** significa sem teto diário adicional. Mantenha o limite individual adequado ao atendimento. A chave é a referência do plano; não há lista fixa de planos para escolher. Trocas de plano são refletidas pela conta do fornecedor.

O worker consulta a Account API no máximo a cada dois minutos na rotina automática; o admin pode solicitar atualização explícita. A leitura não consome créditos de pesquisa segundo a documentação do fornecedor. O painel atualiza a exibição enquanto aberto a cada minuto. A cota é compartilhada por todos os clientes e também pode ser consumida por outras integrações que usem a mesma conta.

Antes de uma chamada externa, o banco combina a cota informada com reservas feitas após o início da sincronização, contabilizando solicitações ainda em andamento. Para o limite por hora, considera também as reservas locais dos últimos 60 minutos. Esses guardas são conservadores e podem aguardar a próxima sincronização. O fornecedor continua sendo a autoridade final; uso por outras integrações entre sincronizações não é instantaneamente visível.

O processamento local mantém no máximo três consultas externas em andamento. Cada execução agendada considera até 20 tentativas vencidas para espera e despacha até três trabalhos. O ritmo local não promete atingir todo o throughput máximo de um plano grande. A fila aguarda capacidade por hora, teto diário ou coleta da mesma região. Dados suficientes na base são entregues sem reservar chamada SerpApi, inclusive se a cota externa estiver esgotada. Se precisar de consulta nova e a cota do plano acabar, encerra sem débito e informa indisponibilidade ao cliente; o admin recebe o diagnóstico de cota.

O preço por lead aceito na confirmação é congelado para a tentativa. Alterar a configuração não altera pedidos na fila. A carteira é conferida de novo antes do trabalho e na transação final de entrega. Contatos só aparecem para a conta na mesma transação que registra o débito proporcional. Nenhuma cobrança ocorre por aguardar na fila.

Reservas são feitas uma única vez por UUID antes da chamada externa. Uma tentativa interrompida ou de resultado incerto não é reenviada automaticamente, para evitar consumir consultas duplicadas; expira sem débito e o cliente pode iniciar outra tentativa explícita. Reservas locais podem contar consultas que o fornecedor não cobrou (falhas/cache), protegendo a cota de forma conservadora até a sincronização/janela seguinte. Elas são removidas após 35 dias; o histórico de pedidos e a unicidade de entregas permanecem.

Verificações adicionais isoladas:

```bash
ASTROS_PGLITE_MODULE=/caminho/node_modules/@electric-sql/pglite node scripts/check-prospecting-queue-sql.cjs
```

Os testes simulam cota mensal, limite horário, teto diário, cache compartilhado, fila, preços congelados, saldo insuficiente, expiração, três vagas externas, segredo do worker e permissões. A instalação real do cron e a sincronização com sua conta precisam ser conferidas após o Deploy.

### Contatos publicados nos leads

A coleta aproveita o telefone e o endereço de site efetivamente retornados na pesquisa. Quando esse endereço é uma rede social, o link é identificado como origem Google Maps. A verificação direta do site e a leitura complementar também extraem links publicados de redes sociais, WhatsApp, telefone e e-mail, com origem site da empresa. Links de compartilhamento, endereços inseguros e duplicados são descartados; não se procura um perfil pelo nome nem se confirma titularidade/WhatsApp. Até 20 contatos são armazenados por nova coleta. O cartão reúne esses contatos com os e-mails de leituras anteriores, e o CSV inclui origem e valor. A coleta respeita os limites e tempos existentes, sem chamadas extras à SerpApi. Falha na leitura não cancela a entrega do lead.

Ativação: atualize a função `astros-prospecting` com `supabase/astros-prospecting.deploy.ts`. Não exige novo SQL. A versão de leitura é 2; novas coletas reavaliam dados antigos quando passam pela coleta normal. Snapshots de leads já entregues permanecem preservados; não se promete preenchimento retroativo nem nova cobrança para atualizá-los.

### Visão administrativa da base

Em Prospecção / Base de empresas, o administrador consulta os totais reais de empresas únicas, pesquisas, entregas e contas atendidas, sem chamadas ao fornecedor. O filtro de nicho/localização pagina pesquisas; abrir uma pesquisa pagina suas empresas. O e-mail exato de uma conta permite conferir as empresas já entregues e as válidas ainda não entregues, com a mesma validade de correspondência e de atualização da empresa usada pelo mecanismo de candidatos. A deduplicação por conta considera também entregas feitas por outras pesquisas.

Empresas salvas, entregas e respostas brutas são medidas diferentes. Uma empresa pode atender várias contas e aparecer em várias pesquisas. Não somar os saldos das pesquisas como empresas únicas e não subtrair entregas globais do total salvo. Respostas brutas antigas do fornecedor não podem ser reconstruídas; a tela não inventa esse histórico. Consulta sem correspondência única de e-mail deixa os indicadores individuais não informados.

Ativação: execute `supabase/migrations/20261019_prospecting_admin_base.sql` e atualize `astros-prospecting` com o arquivo único regenerado. A nova RPC é somente leitura, exige administrador confirmado no banco e só aceita execução por service_role; o handler e a aplicação também verificam admin. Não altera saldo, histórico, catálogo, fila ou cron. Falta da migração mostra erro de ativação, nunca contagens zeradas artificiais. Teste SQL isolado: `ASTROS_PGLITE_MODULE=/caminho/@electric-sql/pglite node scripts/check-prospecting-base-sql.cjs`.

### Pesquisas equivalentes e localização

Instalação desta atualização: execute `supabase/migrations/20261019_prospecting_search_equivalence.sql`, atualize a função pelo arquivo único e publique o frontend. O seletor do Brasil segue país, estado e município; a lista de municípios vem do endpoint público fixo do IBGE, é validada, limitada e mantida em memória por até 24 horas. Não usa consultas da SerpApi nem encaminha credenciais ao IBGE. Uma falha oferece nova tentativa, sem inventar cidades; países diferentes mantêm região e cidade digitadas nessa ordem. Trocar país/estado limpa dependências.

A identificação equivalente normaliza caixa, acentos e espaços, siglas/nomes das 27 UFs brasileiras e uma lista explícita de variantes de nichos, como dentista/dentistas. Especialidades e termos desconhecidos continuam distintos; não há remoção indiscriminada de plural. A UF não é inferida quando ausente e não se equipara um estado brasileiro a uma região de outro país. Quantidade e filtro não ampliam a identidade geográfica; o filtro continua aplicado aos candidatos.

Uma rota canônica privada aponta para uma identidade de pesquisa estável. Na primeira resolução e nas seguintes, correspondências já salvas nas rotas antigas equivalentes são reunidas com a data original, sem transformar dados vencidos em novos. Não se apagam rotas, não se renomeiam solicitações existentes e não se alteram cursores, leases ou snapshots. Solicitações repetidas com o mesmo UUID continuam verificando seus critérios originais antes de resolver aliases. Saldo, entrega atômica, não repetição por conta, cota e cron permanecem sob os guardas existentes. As rotas antigas continuam visíveis no inventário como histórico e seus totais não devem ser somados como empresas únicas.

Validação SQL isolada: `ASTROS_PGLITE_MODULE=/caminho/@electric-sql/pglite node scripts/check-prospecting-equivalence-sql.cjs`. O teste de fila também carrega esta migração.

### Limite diário e contador do cliente

Execute `supabase/migrations/20261019_prospecting_daily_quota.sql` e atualize a função pelo arquivo único. A leitura da cota deriva o proprietário autenticado, conta solicitações registradas no dia de Fortaleza e retorna limite, uso, disponibilidade, horário do servidor e próxima meia-noite local. Rejeições anteriores à criação de uma solicitação não são contadas. Não há chamada à SerpApi nessa consulta.

A tela atualiza a cota a cada minuto e após buscas. Quando zerada, o relógio usa a diferença informada pelo servidor, desconta o tempo decorrido e bloqueia a confirmação; não oferece recarga como solução para limite diário. Ao chegar a zero, consulta novamente, sem enviar busca automaticamente; o botão só é liberado com a cota confirmada. O horário do navegador não define o dia do servidor. Os guardas transacionais já existentes continuam sendo a autoridade, inclusive para tentativas em outras abas. A leitura não altera saldo nem pedidos. A indisponibilidade da leitura é informada e não remove a verificação do banco.

### Destinatários e dados efetivamente entregues

Na Base de empresas, use **Ver entregas por cliente**, o atalho no indicador de entregas, **Ver entregas desta pesquisa** ou **Ver destinatários desta empresa**. Em Buscas dos clientes, **Ver leads desta busca** abre a referência já preenchida. A visão permite filtrar por e-mail exato, nome da empresa entregue e UUID da busca, pagina 20 entregas e calcula totais completos conforme os filtros. Cada linha identifica destinatário, empresa, data em Fortaleza, etapa atual e valor por lead do pedido.

**Ver dados entregues** mostra uma projeção explícita do snapshot da entrega, nunca o cadastro atual da empresa: contato, endereço, site, avaliação, evidência da verificação, conteúdo e links publicados que estavam presentes. Dados que não foram armazenados não são reconstruídos. Nome/e-mail do destinatário e etapa do contato são os valores atuais da conta/entrega; a referência da busca e a data original permitem rastreamento. O total da busca é separado do valor por lead, sem inventar uma nova movimentação financeira.

Ativação: execute `supabase/migrations/20261019_prospecting_admin_deliveries.sql` e atualize `astros-prospecting` com o arquivo único. A consulta só lê entregas existentes, verifica admin no servidor, na Edge Function e na RPC service-only e não chama fornecedores, não altera carteira, snapshots, status ou cron. A resposta exclui metadados privados e limita contatos a 20 e e-mails a cinco por snapshot. O acesso do cliente permanece ao próprio histórico; o novo relatório não tem rota de cliente. Verificação SQL: `ASTROS_PGLITE_MODULE=/caminho/@electric-sql/pglite node scripts/check-prospecting-deliveries-sql.cjs`.

### Resumo de etapas dos leads

O resumo de Meus leads usa a consulta somente de leitura `astros_prospect_lead_summary`, limitada à conta autenticada. Total e cinco etapas incluem todas as páginas e não mudam com os filtros da lista. Mover um lead invalida o resumo e as colunas. Falhas exibem indisponibilidade, sem substituir contagens por zero.

Ativação: executar `supabase/migrations/20261019_prospecting_lead_summary.sql` e atualizar a função `astros-prospecting` com `supabase/astros-prospecting.deploy.ts`. Não altera carteira, entregas, snapshots ou a base compartilhada. Validação isolada: `scripts/check-prospecting-lead-summary-sql.cjs`.
