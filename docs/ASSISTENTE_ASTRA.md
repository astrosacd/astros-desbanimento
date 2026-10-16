# Assistente ASTRA

Assistente de consulta exclusivo do administrador, em Gestão geral → Assistente ASTRA. Mostra rosto de partículas, conversa por texto, ditado e leitura por voz quando o navegador suporta. O microfone só inicia após clique; revise o texto antes de enviar.

## Ativação nesta instalação

1. Execute `supabase/migrations/20261016_admin_assistant.sql` no SQL Editor do Supabase externo já usado pelo painel. Requer os módulos financeiro, SMS e redes sociais e suas migrações anteriores. Não altera configurações globais do Auth.
2. Crie a Edge Function **astros-admin-context** no mesmo projeto e publique o conteúdo de `supabase/astros-admin-context.deploy.ts`. Ela valida o token e o tipo admin por conta própria; mantenha os secrets Supabase padrão. Não precisa copiar tokens de fornecedores para esta função.
3. No Lovable, a integração nativa usa `LOVABLE_API_KEY` no servidor, provisionada pelo conector de IA. O transporte usa `openai/gpt-6-luna`, até 1.000 tokens de saída e nenhuma repetição automática. O uso depende dos créditos e limites de IA do workspace; não é ilimitado.
4. Publique no Lovable e teste com uma conta admin. A VPS não é atualizada por esta etapa. Se hospedar o assistente na VPS futuramente, será necessário fornecer a configuração de IA como secret de servidor; não coloque a chave em código, imagem ou variável pública.

## Dados e limites

Cada pergunta consulta dados atuais do Supabase: créditos confirmados de produção, cadastros, processamento interno de desbanimento, pedidos SMS e sociais, ocorrências e indicadores financeiros existentes. Recarga não é receita de venda. Ajustes manuais e pagamentos de teste não entram na lista de depósitos confirmados. O financeiro geral só é enviado sem filtro de cliente.

O período é limitado a 31 dias e usa America/Fortaleza. Expressões hoje, ontem e últimos 7 ou 30 dias ajustam o período. Listas mostram no máximo dez registros recentes, com contagens do período completo. Importações podem compartilhar a data de criação no Auth. Status internos não confirmam status atual de números no Baserow. Horários das rotinas não comprovam saúde atual de fornecedores.

Chamados são consultados no Chatwoot usando a integração existente, apenas no inbox identificado pelo website token do painel. Mostram o estado aberto atual, sem filtro de período ou cliente. Se o inbox ou a resposta não forem confirmados, a fonte fica indisponível; não se converte falha em zero chamados. Mensagens de conversas e credenciais não são enviadas ao modelo.

O modelo recebe a pergunta, até quatro mensagens anteriores e o resumo autorizado, que pode incluir nomes, e-mails, números e referências dos registros recentes. A conversa fica na memória da página e é descartada ao sair ou limpar; este recurso não cria histórico persistente de chat. Não há monitoramento nem notificações automáticas.

## Segurança e verificação

Autorização administrativa no servidor, na Edge Function e nas funções SQL. O cliente não escolhe SQL, ferramentas, URLs ou comandos. Não existem operações de compra, estorno, saldo, envio de mensagens ou edição de contas no assistente. A única escrita própria é um contador por administrador para limitar a oito perguntas por minuto.

Verifique com admin uma pergunta de recargas e uma de chamados; confira período, fontes e registros no painel. Com cliente, o acesso deve ser negado. Se a integração de suporte falhar, a resposta deve informar indisponibilidade. Testes locais usam dados simulados e não substituem a verificação após a publicação das funções no Supabase real.

Testes: `npm test -- src/features/assistant`; SQL isolado: `node scripts/check-assistant-sql.mjs` com PGlite disponível; compilação: `npm run build`.
