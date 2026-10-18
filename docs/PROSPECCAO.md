# Prospecção — SerpApi

Módulo separado no cliente e no admin. Usa a carteira compartilhada, sem disparar mensagens ou abordar empresas automaticamente.

## Ativação desta atualização
1. No SQL Editor do Supabase, execute `supabase/migrations/20261018_prospecting.sql`.
2. Execute `supabase/migrations/20261018_prospecting_finance.sql` para classificar os débitos no financeiro.
3. Crie a Edge Function **astros-prospecting**, cole todo o conteúdo de `supabase/astros-prospecting.deploy.ts` e faça Deploy. Desative a verificação JWT legada somente nesta função: ela valida a identidade pelo Supabase Auth internamente. Não altere as configurações globais de autenticação.
4. No admin → Prospecção, salve sua chave privada da SerpApi. Ela não é retornada ao navegador depois de salva. Configure preço por lead, validade do cache e limites diários. O módulo começa pausado.
5. Consulte a conta do fornecedor, confira a cota e faça uma busca pequena controlada. Pode configurar preço zero para o primeiro teste. Depois confira leads, histórico, carteira e financeiro antes de liberar buscas pagas.

Os secrets padrão SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são fornecidos pelo ambiente da função. Nunca coloque a chave SerpApi no GitHub, em variáveis VITE ou no chat. Publicar no Lovable não executa SQL nem publica funções no Supabase. A VPS continua na imagem atual até atualização manual.

## Busca e cobrança
O cliente informa nicho, país e cidade/região. A situação do site é verificada automaticamente e exibida nos resultados; não é uma escolha no formulário. Cada busca pede de 1 a 20 leads. Uma tentativa consulta no máximo uma página de até 20 resultados do Google Maps pela SerpApi, podendo entregar menos após filtros e exclusão de repetidos. Apenas leads efetivamente entregues são debitados. Uma busca sem entregas não cobra.

A entrega, o débito e o movimento da carteira são gravados na mesma transação. Um UUID identifica a tentativa: reenviar a mesma referência não faz nova cobrança. Se a resposta se perder, use Verificar esta busca ou o histórico; não inicie outra tentativa para descobrir o resultado. Uma busca pendente expira sem débito caso não tenha concluído a entrega.

O preço é por lead entregue, em reais. Não representa o preço da SerpApi nem garantia de lucro. O custo do fornecedor é suportado pela conta administrativa conforme seu plano e uso. Há limites de buscas por conta e de chamadas globais por dia, considerando America/Fortaleza. Atualizar a conta do fornecedor também usa seu endpoint de conta, sem coletar leads.

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

Os testes locais não comprovam a chave, a cota nem uma chamada real da instalação. Não há cron necessário nesta primeira versão. Nenhuma integração externa é acionada pelos testes simulados.

## Leitura complementar com Jina Reader
A função também consulta `https://r.jina.ai/` para ler páginas públicas de sites próprios classificados como acessíveis ou inconclusivos. Guarda somente título, trecho de até 600 caracteres, até cinco e-mails publicados e data da leitura. A interface e o CSV mostram esses campos quando disponíveis. Não gera abordagem, não envia mensagem, não executa instruções encontradas na página e não confirma a validade ou titularidade dos contatos. O trecho é uma extração, não uma avaliação por IA.

Para ativar esta atualização em uma instalação existente, substitua todo o código da função **astros-prospecting** pelo arquivo `supabase/astros-prospecting.deploy.ts` atualizado e faça Deploy. Não é necessário novo SQL. Entregas antigas permanecem como estavam; o enriquecimento ocorre nas novas coletas.

A integração tenta o acesso básico sem chave. Isso está sujeito aos limites e disponibilidade da Jina e não significa serviço ilimitado. Opcionalmente, configure **JINA_API_KEY** nos secrets do Supabase para usar sua conta Jina; a chave nunca vai para o cliente. Não reutilize a chave SerpApi nesse secret. Não há novo campo obrigatório no painel.

A leitura usa prazo e resposta limitados, solicita conteúdo atualizado sem cache do fornecedor e omite parâmetros de consulta do endereço. Só chama o domínio fixo Jina, nunca repassa cookies ou tokens da sessão. URLs sociais, locais, com credenciais e endereços DNS privados são recusados. A verificação direta mantém a proteção de conexão descrita acima; a navegação executada pela Jina depende das proteções do fornecedor.

Falhas, bloqueios, limites e respostas inconsistentes da Jina são opcionais: não impedem a entrega dos demais dados. Não mudam uma verificação direta conclusiva. Uma leitura válida pode esclarecer um resultado antes inconclusivo. O processamento tem orçamento de tempo compartilhado; chegar ao limite mantém os casos restantes inconclusivos. A base compartilhada reaproveita os dados para reduzir chamadas.
