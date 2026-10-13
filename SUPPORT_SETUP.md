# Atendimento dentro do painel

> Guia por recurso, com etapas históricas. Para uma nova conta, comece pelo [guia de instalação](docs/INSTALACAO.md). Não repita migrações já aplicadas. Descrições antigas de “ainda não implementado” não são inventário do estado atual; consulte o README e o mapa do projeto.

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

## Campo de e-mail repetido

A versão consultada do widget oculta o campo padrão emailAddress quando o contato retornado tem has_email=true. O painel reenvia e-mail/nome/telefone assinados a cada abertura, removendo somente o cache cw_user_<websiteToken> do SDK para evitar que uma identificação antiga/falha seja ignorada como repetida. Não remove o cookie de conversa para esse reenvio. Erros reportados pelo widget fecham a janela e exibem uma orientação, sem manter um falso estado de atendimento preparado. Se ainda houver campo de e-mail após essa atualização, é necessário conferir a identificação e o contato no Chatwoot: conflitos entre contatos já identificados podem impedir a atribuição do e-mail. Não mesclar/excluir contatos automaticamente nem mudar a identidade para contornar essa proteção.

## Associação ao contato existente por API (atual)

1. Execute somente `supabase/migrations/20261012_support_chat_api.sql`, após o SQL inicial do suporte já aplicado. As credenciais da API ficam na tabela privada sem leitura para clientes.
2. Crie uma **nova** Edge Function `astros-support-identity` no Supabase atual. Cole todo `supabase/astros-support-identity.deploy.ts` no index.ts e faça Deploy. Não substitua astros-submit-number ou astros-auth-email. A nova função valida o JWT e o e-mail confirmado em auth.getUser. Se necessário para o gateway legado, desative Verify JWT somente nessa nova função; a validação interna é obrigatória. SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY vêm do ambiente padrão da Edge Function.
3. No Admin → Central de suporte, informe ID da conta e token de API do Chatwoot, mantendo o código do widget e a chave HMAC já salvos. Token em branco preserva o anterior; trocar conta/servidor exige novo token. Nenhuma chave privada é devolvida ao navegador.
4. Atualize o painel e teste a abertura com o e-mail já existente. A busca é somente leitura: compara e-mail completo e bloqueia resultados ambíguos/incompletos. Se existe um contato, mantém seu identificador, nome e telefone no SDK. Se não existe, usa o UUID da conta do painel. A assinatura usa exatamente o identificador escolhido, sem alterar o identificador antigo.
5. O WhatsApp informado no painel vai no atributo de contato `astros_whatsapp_retorno`, separado do telefone antigo. Para exibi-lo com um rótulo no atendimento, crie no Chatwoot um atributo personalizado de **Contato**, tipo texto, chave `astros_whatsapp_retorno`, rótulo "WhatsApp para retorno". O chat segue na mesma caixa de site; nenhuma conversa/mensagem é criada automaticamente apenas pela consulta da API. O SDK pode associar o contato à caixa ao abrir; esse vínculo precisa ser confirmado na instalação real.

A função não consulta nem devolve mensagens privadas de outras caixas. Não apaga/mescla contatos por API, não troca identificadores e não substitui o telefone antigo pelo retorno informado. Um campo de telefone antigo vazio é omitido do setUser para evitar conflitos com outro contato; o número de retorno permanece no atributo separado. A configuração global de formulário do site permanece intacta. A nova função precisa estar publicada antes de usar o novo fluxo; falha de configuração interrompe a abertura com mensagem clara, sem voltar silenciosamente ao vínculo antigo.
