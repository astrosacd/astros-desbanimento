# Atendimento dentro do painel

## Ativação

1. No projeto Supabase atual, execute `supabase/migrations/20261012_support_chat.sql` no SQL Editor. Esse arquivo cria somente as configurações e RPCs do suporte; não altera Auth, SMTP, pagamentos ou Baserow.
2. Abra **Admin → Central de suporte**. Cole o código completo de instalação da caixa de entrada de site do Chatwoot. O painel extrai apenas endereço HTTPS e websiteToken; nunca executa o HTML/JavaScript colado diretamente.
3. Na configuração da mesma caixa no Chatwoot, copie a chave HMAC de **Validação de identidade** para o campo privado correspondente no admin. Não envie a chave no chat. Na edição, campo vazio mantém a chave; trocar endereço/token exige informar a chave da nova caixa.
4. Ative o atendimento e salve. A Central de suporte do cliente consulta a configuração periodicamente e novamente ao iniciar uma conversa.
5. Teste com uma conta confirmada: informe WhatsApp e país, abra a conversa e envie uma mensagem pelo widget. Confira o contato e a conversa na caixa correta do Chatwoot. Os testes locais não enviam mensagens reais.

## Caixa compartilhada com o site

Para separar atendimento do painel e evitar mudanças no site, uma caixa de site exclusiva para o painel é recomendada. É possível usar a caixa existente. Contudo, **não ative a exigência global de validação de identidade em uma caixa já usada pelo site sem adaptar também o site**: visitantes sem assinatura podem deixar de conseguir conversar. O painel gera a assinatura HMAC; para proteção obrigatória contra personificação, a opção de validação precisa estar habilitada na caixa do Chatwoot. Não é possível verificar essa opção só pelo código de instalação. A configuração de formulário, agentes, horários, mensagens e automações da caixa continua no Chatwoot. O formulário pré-chat já existente pode continuar aparecendo dentro do widget; não o alteramos automaticamente.

## Dados e sessões

Nome e e-mail vêm exclusivamente da conta autenticada e do perfil Supabase, não do navegador. A identidade usa UUID da conta com assinatura HMAC gerada no banco. A chave fica em tabela privada sem permissões de leitura para anon/authenticated, acessível somente aos RPCs seguros.

O WhatsApp é obrigatório antes de abrir o widget, validado no servidor e enviado em formato internacional (`phone_number`). Isso não altera o WhatsApp cadastrado nem os números de desbanimento. A mensagem é escrita e enviada dentro do widget; abrir o chat não significa que uma mensagem já foi enviada.

O SDK é carregado sob demanda somente depois de preparar a identidade. Não há bolha livre para iniciar chat sem contato. A sessão do widget é encerrada/limpa ao sair do painel ou trocar de conta, e um carregamento pendente não abre a conversa de uma sessão encerrada. Na mudança da caixa com widget já carregado, é necessário atualizar a página.

A disponibilidade e a aparência do widget dependem da instalação do Chatwoot e das opções da caixa. O formulário do painel é responsivo; não reescrevemos o iframe externo.
