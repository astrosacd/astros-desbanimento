# Prospecção por CNPJ

Modalidade adicional dentro de Prospecção. Google Maps continua usando sua configuração, fila, cota e cron existentes. CNPJ usa Casa dos Dados para pesquisa e consulta direta e, opcionalmente, a API pública ReceitaWS para dados complementares. Não há envio de mensagens ou integração WhatsApp nesta modalidade.

## Ativação

1. Execute `supabase/astros-cnpj.setup.sql` no SQL Editor do projeto Supabase atual. O arquivo contém as duas migrações aditivas de CNPJ e a inclusão das operações no relatório financeiro. É reaplicável; não apaga cadastros ou resultados Maps.
2. Atualize **a função existente `astros-prospecting`** com todo o conteúdo de `supabase/astros-prospecting.deploy.ts`. Preserve as configurações atuais e o cron Maps. Não crie outro cron para CNPJ. O código-fonte modular é regenerado com `python3 scripts/generate-prospecting-deploy.py`.
3. No admin, abra Prospecção → Empresas por CNPJ. Cadastre a chave da Casa dos Dados, o preço por lead e limites compatíveis com o plano contratado. Ative e salve. A chave fica em tabela privada, nunca é devolvida à interface; campo vazio preserva a chave atual.
4. Dados complementares são opcionais, têm preço próprio e usam ReceitaWS pública (sem chave, até 3 chamadas/minuto para a aplicação, além do limite global diário configurado). Não habilite esperando um telefone novo ou contato confirmado do proprietário: os cadastros podem estar incompletos.
5. Faça uma consulta controlada com uma conta de cliente. Confira entrega no CRM, histórico, carteira e relatório financeiro. Esta etapa real depende das credenciais/plano do fornecedor; testes locais não confirmam disponibilidade comercial.

## Busca e cobrança

- Empresas brasileiras, CNPJ **numérico de 14 dígitos** com dígitos verificadores válidos. CNPJ alfanumérico não é suportado nesta versão.
- Pesquisa por UF e município obrigatórios; CNAE principal numérico, nome exato, porte, situação e intervalo de abertura opcionais. Não há tradução por IA de nichos em CNAEs.
- Cada chamada Casa busca até 20 registros. Entregamos até a quantidade solicitada (1–20); não prometemos completar todas as vagas numa chamada. As páginas seguintes são consultadas em novas solicitações quando necessário.
- O valor máximo é apresentado antes da confirmação e o saldo máximo é conferido antes de consultar. Na entrega, o débito é proporcional aos novos CNPJs entregues. Sem entrega, não há débito de busca. A Casa pode consumir sua cota mesmo sem resultados.
- Dados complementares têm confirmação e cobrança separadas, apenas quando recebidos e salvos; não significam um novo lead. A versão original é preservada.
- O UUID da tentativa é único e preservado em verificações. Uma tentativa incerta nunca é reenviada ao fornecedor. Após 5 minutos sem conclusão, encerra sem cobrança; não usa o worker Maps.
- Reutilização privada de resultados por critérios e validade; cache não debita cota do fornecedor. Nunca há repetição de um CNPJ para a mesma conta nesta modalidade. Contas diferentes podem receber a mesma empresa. Maps e CNPJ não são mesclados automaticamente.
- Limite de consultas por conta é individual/dia. Limites de chamadas por dia e por minuto são globais da aplicação. Não são sincronizados do plano Casa: o administrador configura conforme seu contrato.

## CRM, segurança e finanças

O CRM une as próprias entregas Maps e CNPJ com filtro de origem; etapas e contadores incluem ambas. Snapshots e históricos são restritos ao dono, inclusive nas atualizações de etapa e enriquecimento. Admin vê o histórico global CNPJ. API key e registros compartilhados não têm acesso direto por `anon`/`authenticated`; RPCs operacionais são exclusivas do serviço e validam o ator.

Persistimos apenas a projeção cadastral empresarial, não a resposta bruta nem documentos pessoais de sócios. Telefone cadastral não comprova WhatsApp, titularidade ou autorização para abordagem. Apenas campos realmente retornados são mostrados.

Entrega, débito e movimento de carteira são uma transação atômica com bloqueio da conta e UUID único. Referência financeira `prospect:cnpj:<UUID>` mantém classificação no módulo Prospecção, sem contar consumo como nova recarga. O relatório inclui Maps, entregas CNPJ e consultas complementares concluídas, excluindo tentativas falhas.

## Validação local

- `npx vitest run` e `npx tsc --noEmit`; `npm run build`.
- Com PGlite disponível: `ASTROS_PGLITE_MODULE=/caminho/pglite node scripts/check-prospecting-cnpj-sql.cjs` e `node scripts/check-prospecting-cnpj-finance.cjs` com a mesma variável. Verificam reaplicação, propriedade, idempotência, saldo, cache, falhas, etapas, enriquecimento e classificação financeira.

Fontes do contrato: [Casa dos Dados](https://docs.casadosdados.com.br/) e [ReceitaWS](https://developers.receitaws.com.br/).

## Diagnósticos de consultas

Para instalações anteriores, execute `supabase/migrations/20261019_prospecting_cnpj_diagnostics.sql` e atualize a função `astros-prospecting` com o bundle regenerado. O patch apenas amplia os motivos operacionais e projeta uma categoria pública (`balance` ou `unavailable`); preserva carteira, transações, UUIDs e históricos. Não altera Maps.

Clientes recebem aviso amigável sem nomes de fornecedores ou erros HTTP. Saldo insuficiente na carteira tem CTA de recarga. Apenas o administrador recebe as categorias técnicas: 401 credencial, 402 recusa por cobrança, 403 recurso não autorizado, 400 requisição, 404 consulta/recurso, 429 limite, 5xx servidor, timeout, conexão e formato inesperado. HTTP 403 não comprova falta de saldo. Mensagens brutas, corpos HTTP e chaves nunca são registrados. Registros antigos `provider` continuam genéricos: não podem ser reclassificados sem evidência. Novas tentativas exigem nova confirmação e UUID; não reenviar automaticamente consultas incertas.

## Leitura cadastral e atualização de contatos existentes

O adaptador lê contatos na raiz ou em `contato`, situação textual ou com descrição, atividades secundárias, natureza jurídica, matriz/filial, MEI/Simples e datas quando a fonte os fornece. Somente projeções empresariais são armazenadas; não se grava o payload bruto nem documentos de sócios. Campos ausentes continuam não informados. Não se presume que o conteúdo da página pública e o da API sejam idênticos.

A interface formata CNPJ, datas de calendário e capital em reais. A leitura de uma data de abertura em ISO preserva a data na fonte, sem converter meia-noite UTC para o dia anterior. Contatos cadastrais não comprovam WhatsApp ou titularidade.

Para atualizar instalações existentes: execute `supabase/migrations/20261019_prospecting_cnpj_refresh.sql`, depois substitua a função com `supabase/astros-prospecting.deploy.ts`. Não execute o patch antigo de diagnósticos depois deste, pois as funções de reserva/conclusão foram ampliadas aqui.

Leads antigos foram salvos sem os campos descartados: atualizar o código não pode recuperar retroativamente dados que não foram armazenados. O botão **Atualizar dados cadastrais** consulta novamente a Casa dos Dados por confirmação explícita, para o próprio lead, com UUID estável, preço de carteira zero, limite individual/global e uma única chamada. Pode consumir créditos do fornecedor; não cobra novamente do cliente. A transação preserva UUID do lead, etapa e snapshot original; registra a tentativa como consulta `lookup` com `refreshLeadId`, sem nova entrega ou movimento financeiro. A tentativa incerta apenas verifica o mesmo UUID. Nunca há atualização de outro dono, ainda que compartilhe o CNPJ. Não dispara consulta ao abrir o modal ou automaticamente.

## Navegação e histórico

O cliente consulta Google Maps e CNPJ em **Histórico de buscas**; o administrador usa **Histórico de consultas**. O filtro mostra todas as modalidades ou uma delas. As listas são separadas por origem, com paginação própria; não representam uma única ordenação cronológica. O atalho na busca/configuração CNPJ abre o histórico já filtrado. As telas de busca e configuração não duplicam as listas de consultas. Nenhum SQL ou mudança de fornecedor é necessário para esta organização visual.
