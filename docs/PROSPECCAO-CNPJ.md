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
