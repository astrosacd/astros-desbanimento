# Assistente ASTRA

Assistente de consulta exclusivo do administrador, em Gestão geral → Assistente ASTRA. Mostra rosto de partículas, conversa por texto, ditado e leitura por voz quando o navegador suporta. O microfone só inicia após clique em Conversar por voz. A pergunta reconhecida é enviada automaticamente; após a resposta falada, a escuta volta a iniciar. Encerrar conversa interrompe a escuta e cancela respostas de áudio pendentes. Erros do microfone ou da consulta pausam esse modo. A opção de digitar e enviar permanece disponível.

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

## Consultas ampliadas e retrato 3D
+
+Execute também `supabase/migrations/20261016_assistant_extended.sql` para contas e saldo atual, último login, extrato, tentativas de pagamento, pendências atuais, catálogo liberado/oculto e parâmetros públicos de preços. A função complementar repete a autorização admin e não escreve em dados financeiros. Se ela ainda não foi instalada, as consultas anteriores continuam funcionando e a fonte ampliada aparece indisponível.
+
+O servidor consulta as ações **admin-balance** existentes de **astros-social** e **astros-sms**, sem comprar, sincronizar catálogo ou alterar pedidos. Cada resposta valida moeda USD, unidades e horário e projeta somente o saldo e seus metadados. Falhas individuais não se transformam em saldo zero. Essas duas fontes são saldos atuais externos; nunca são substituídas pelo saldo interno da carteira. Não é necessário republicar astros-admin-context para esta ampliação. Um e-mail explícito na pergunta ativa automaticamente o filtro de cliente quando o campo está vazio; para nomes, use o campo de filtro.
+
+O retrato usa a malha canônica do MediaPipe com partículas amostradas, projeção 3D e animação local em canvas. Arquivo e origem em `face-mesh.ts`, licença Apache-2.0 em `public/licenses/mediapipe-Apache-2.0.txt`. Nenhuma imagem de câmera é capturada. Respostas têm renderização restrita de negrito e parágrafos; HTML do modelo nunca é executado.

### Leitura e articulação
+
+A voz recebe uma versão sem Markdown: asteriscos, crases, títulos, marcações de link e HTML não são pronunciados. Datas e valores em real/dólar são preparados como texto falado. A apresentação escrita mantém negrito.
+
+O rosto usa partículas brancas, contornos da malha e deformação de lábios e mandíbula. A articulação acompanha início, pausa, fim e limites de palavras informados pelo SpeechSynthesis; entre eventos, estima a posição das letras para interpolar formatos de vogais e consoantes. Navegadores sem eventos de palavra usam estimativa temporal. Não há análise do áudio nem sincronização fonética garantida. A voz disponível depende do navegador e sistema operacional. Uma reprodução literalmente idêntica do avatar e da voz da referência exigiria os ativos e o motor originais; esta implementação é uma reconstrução própria.


### Conversa e leitura natural

A leitura remove emojis, sequências de emojis, bandeiras e shortcodes como `:smile:`. Valores em moeda são convertidos em expressões faladas: R$ 0,00 → zero reais; R$ 10,50 → dez reais e cinquenta centavos. A resposta escrita preserva a formatação. O prompt pede linguagem breve e conversacional, sem emojis e sem repetir métricas desnecessárias.

O modo de conversa por voz usa turnos: escutar → enviar transcrição final uma vez → consultar → falar → aguardar 450 ms → escutar. Não grava enquanto o assistente fala, nem abre o microfone ao carregar a página. Sem resultado ou com erro, pausa em vez de reiniciar indefinidamente. Não permite interromper a fala por reconhecimento simultâneo. A autorização e os dados de consulta continuam iguais; nenhuma operação de alteração foi adicionada.

O retrato também inclui facetas translúcidas coloridas, reflexos móveis e maior rotação da cabeça, inspirados na fase de vidro da referência. A malha e a articulação são uma reconstrução própria, não os ativos originais do vídeo.
