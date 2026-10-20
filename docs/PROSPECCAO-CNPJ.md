# Prospecção por CNPJ

Modalidade adicional dentro de Prospecção. Google Maps continua usando sua configuração, fila, cota e cron existentes. CNPJ usa Casa dos Dados para pesquisa e consulta direta e, opcionalmente, a API pública ReceitaWS para dados complementares. Há preparação manual de abordagem no cartão, com mensagem editável, cópia e link WhatsApp preenchido. O usuário revisa e envia no próprio WhatsApp; não há envio automático ou integração com API de mensagens.

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

## Saldo da Casa dos Dados no admin

Em **Cotas e processamento → CNPJ / Casa dos Dados**, a aplicação consulta `GET https://api.casadosdados.com.br/v5/saldo` com a chave privada já cadastrada. A operação exige `requireAdmin` no servidor e autorização administrativa na Edge Function, antes da leitura da chave. Apenas a projeção `saldo_total`, lotes (`valor`, `criado_em`, `expira_em`) e instante da consulta é retornada. Nenhuma chave ou resposta bruta é exibida.

O total é o valor retornado pelo fornecedor, sem conversão monetária, sem somar lotes e sem inferir quantidade de empresas por crédito. Campos ausentes não viram zero. Lotes podem incluir créditos com vencimento e são apresentados como informados. Criação e expiração não são pagamento, renovação ou limite de requisições. Não há dados de plano/hora inventados.

Atualização ao abrir a área e a cada minuto enquanto estiver visível, com cache de tela de até um minuto e botão manual. Falha de atualização mantém o último resultado rotulado como anterior; sem resultado confirmado, saldo fica indisponível. A consulta de saldo não executa buscas, compra leads, altera a carteira ou modifica limites. Não é uma autorização financeira nem uma reserva de créditos. Os limites internos permanecem separados e identificados como configuração da aplicação.

Esta atualização não exige SQL: atualizar a função `astros-prospecting` com o bundle atual e a interface. O reaproveitamento de resultados CNPJ continua validando filtros, validade e entregas por usuário; dados Maps e CNPJ não são misturados nem mesclados automaticamente.

## Rejeições e contatos cadastrais

Uma rejeição definitiva anterior à reserva (como limite diário por conta) encerra a espera local: não consulta status de uma referência que não foi criada. Falhas de transporte mantêm a referência para verificar a mesma tentativa, sem repetir o envio. A cota diária por conta inclui pesquisas, consultas, atualização cadastral e consulta complementar; não é o saldo do fornecedor. Limites e cobranças SQL permanecem inalterados.

O adaptador aceita contatos empresariais em campos diretos e contêineres contato/contatos, com listas e DDD separado, sem duplicar DDD em número completo. A extração é limitada a campos de contato, sem percorrer sócios/documentos ou completar dados ausentes. A mensagem de ausência descreve o registro salvo, sem afirmar que o fornecedor omitiu algo que pode ter sido descartado pelo mapeamento. A validação com dados sintéticos não confirma o conteúdo da resposta real de um cadastro: telefone ainda ausente após atualização exige verificar o retorno efetivo do fornecedor sem compartilhar credenciais. Nenhum fallback de scraping ou segunda consulta paga automática.

## Cota diária visível e contador

A configuração autenticada retorna `dailyQuota` da própria conta, contando os mesmos registros de pesquisa/consulta/enriquecimento/atualização usados pela reserva SQL. Limite, uso, restante, hora do servidor e próxima meia-noite de Fortaleza vêm do banco; não são estimados pelo relógio do navegador nem confundidos com créditos Casa. A UI consulta novamente a cada minuto, após tentativas, e ao encerrar o contador. Não envia uma nova consulta automaticamente. Cota zero bloqueia novas intenções nos dois modos e no cartão cadastral, preservando a verificação de uma referência em andamento. Configuração sem a projeção (SQL antigo) mantém validação autoritativa no servidor, sem inventar contador.

Para instalação existente, executar somente `supabase/migrations/20261019_prospecting_cnpj_daily_quota.sql`. A alteração é de leitura e não aumenta limites, apaga histórico, modifica saldos ou mexe no Maps. A função continua restrita ao service role com validação do ator. Não precisa atualizar a Edge Function para este contador. Novas instalações já incluem a projeção no setup completo.

## Preparar abordagem

O cartão CNPJ usa o mesmo componente de abordagem do Google Maps, com o nome da empresa na sugestão. A sugestão CNPJ não afirma que a empresa foi encontrada no Google. A mensagem editada é usada tanto na cópia quanto no link `wa.me`. Telefone inválido ou ausente não gera link; não inventamos número nem confirmamos WhatsApp/titularidade. Preparar, copiar e abrir não mudam a etapa do CRM, não consomem cota e não fazem consultas ao fornecedor. Layout responsivo existente compartilhado.


### Contatos na pesquisa inicial
A pesquisa v5 solicita `tipo_resultado=completo` na mesma requisição. O padrão do fornecedor é `simples`; a resposta completa permite projetar os contatos disponíveis sem um lookup adicional por empresa. Não há garantia de telefone em todo cadastro. Snapshots antigos não são enriquecidos automaticamente; uma atualização explícita continua sujeita à cota. A preparação de abordagem só é exibida quando o lead possui telefone.


## Correção de cache simplificado e auditoria CNPJ — 20/10/2026

A chamada completa por si só não invalidava os registros antigos: `astros_cnpj_candidates` ainda selecionava snapshots v3; o cursor `page` e a marca `exhausted` também eram preservados. Por isso uma nova tentativa podia entregar outra empresa do mesmo lote antigo sem chamar o fornecedor.

O parser passa a salvar `dataVersion: 4`. A pesquisa exige campos estruturais da resposta completa, mas nunca exige telefone: campos podem estar ausentes na fonte. Uma resposta que só contenha a identificação simplificada encerra sem débito e sem consulta individual oculta. São lidos também `contato_email` e contêiner completo do mesmo CNPJ, preservando os limites de projeção empresarial. A versão do perfil não comprova a exatidão dos dados nem confirma WhatsApp.

O SQL reinicia **uma única vez**, na próxima busca, cada cursor anterior ao perfil 4, sem excluir a pesquisa ou suas entregas. O cache elegível exige o novo perfil; deduplicação por conta, validade, bloqueios, UUID e cobrança atômica permanecem. A mudança não consulta todas as empresas individualmente, não faz recarga nem aumenta cotas. Uma pesquisa nova pode consumir a chamada normal do fornecedor; não é promessa de dados completos grátis. Respostas incertas não são reenviadas.

O histórico existente e o `original_snapshot` permanecem intactos. Contatos já entregues no formato antigo não são retroativamente preenchidos nem cobrados de novo. A atualização cadastral explícita continua sem débito de carteira, mas pode consumir cota e crédito do fornecedor. O problema corrigido é a seleção inicial de novos leads após a ativação.

### Atualizar instalação existente

1. Substituir todo o código da função existente `astros-prospecting` pelo bundle atual `supabase/astros-prospecting.deploy.ts` e publicar.
2. Executar **somente** `supabase/astros-cnpj-complete.update.sql` no SQL Editor. O patch reúne `20261020_cnpj_complete_profiles.sql` e `20261020_cnpj_admin_audit.sql`, é reaplicável, preserva histórico/carteira e não altera o Maps. Se houver uma busca anterior em andamento, aguardar a conclusão antes da implantação do SQL para não misturar formatos durante a troca.
3. Publicar a interface no Lovable. Não atualiza automaticamente a imagem da VPS.
4. Conferir uma busca nova: verificar contato/endereço/atividades quando a fonte os fornecer. Os testes sintéticos e SQL não provam o conteúdo de uma resposta real da conta.

### Admin: empresas e entregas

**Base de empresas → CNPJ** oferece empresas salvas e entregas, com busca por nome/CNPJ, e-mail do destinatário, total e paginação. **Histórico de consultas → CNPJ** oferece **Ver empresas desta pesquisa** e **Ver entregas desta pesquisa** para pesquisas/consultas diretas. Atualizações cadastrais e consultas complementares não criam novas entregas.

Empresas da pesquisa representam a base atual vinculada aos seus critérios; atualizações e chamadas posteriores podem ampliar essa base. Entregas da pesquisa filtram exatamente `request_id` e mostram o snapshot atual da entrega, destinatário, data e etapa. Nenhuma dessas telas chama o fornecedor, consome cota, altera etapa ou cobra. Dados cadastrais no modal admin são somente leitura.

A ação exige `requireAdmin` no servidor, tipo admin verificado na Edge e `astros_prospect_actor(actor,true)` no SQL. A RPC e a função de projeção são exclusivas do service role; clientes não acessam a base ou entregas alheias. A resposta projeta apenas campos empresariais conhecidos, nunca chaves, respostas brutas ou documentos pessoais de sócios.

Validação: `npx tsc --noEmit`, testes de Prospecção (incluindo navegação/filtro/paginação e ausência de refresh no admin), e `ASTROS_PGLITE_MODULE=/caminho/pglite node scripts/check-prospecting-cnpj-sql.cjs` para reaplicação, cache legado/esgotado, campos na entrega, débito idempotente e isolamento administrativo.
