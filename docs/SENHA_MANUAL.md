# Redefinição manual de senha de cliente

## Ativação

1. Execute uma vez supabase/migrations/20261014_admin_password_reset.sql. Requer perfis e a API de clientes já instalada. Cria auditoria privada, RPCs exclusivas do serviço e um trigger específico de troca de senha no Auth. Contas sem o marcador astros_password_change_required não sofrem alteração. Nenhuma senha existente é trocada ao instalar o SQL.
2. Atualize as funções existentes com as cópias completas atuais, mantendo suas configurações de verificação interna: astros-submit-number (supabase/astros-submit-number-com-api.ts), astros-payments (supabase/astros-payments-cartao-no-painel.ts) e astros-support-identity (supabase/astros-support-identity.deploy.ts). Elas recusam chamadas de cliente enquanto a senha obrigatória estiver pendente; webhook e worker continuam processando seus fluxos independentes.
3. Crie a nova Edge Function astros-admin-password com todo supabase/astros-admin-password.deploy.ts. Desative Verify JWT legado somente nela: o código valida sessão confirmada e papel admin pelo UUID, antes das RPCs e do Auth Admin. Não há secrets adicionais.
4. Publique a aplicação sincronizada. Não use o recurso até concluir as etapas acima e validar uma conta própria de teste.

## Uso

Admin → Gestão de contas → pesquisar cliente → Gerenciar conta → Senha e segurança. Informe senha temporária, confirmação e motivo; revise o e-mail da conta antes de confirmar. A contingência atende somente clientes confirmados, não o próprio administrador nem outras contas admin. O papel, o saldo e o e-mail não são alterados.

A nova senha substitui a anterior no Supabase Auth. A mesma identidade compartilhada em outro aplicativo usa a mesma senha: o recurso não oferece senhas independentes por aplicativo. Forneça a temporária ao cliente em canal seguro após confirmar sua identidade. O painel não envia e-mail nem mensagem automaticamente.

Ao entrar, o cliente é encaminhado para /alterar-senha e confirma a temporária antes de escolher outra. A aplicação verifica a identidade e bloqueia operações normais no servidor, nas funções acima e na autenticação da chave de API até a mudança. Após salvar e confirmar a liberação, encerra a sessão e encaminha ao login com a nova senha. A recuperação por e-mail permanece possível e uma troca válida também remove a exigência pelo trigger.

## Auditoria e tentativas

O registro privado contém UUID do cliente, administrador, motivo, horário e estado. A interface mostra somente esses dados, nunca a senha. Um HMAC privado da senha, com chave exclusiva do ambiente de serviço, vincula repetições à tentativa original; ele não é exposto pelo histórico nem acessível aos clientes. A senha em texto não fica no banco de auditoria, logs ou armazenamento do navegador.

O UUID da tentativa é estável. O banco permite apenas uma operação em processamento por cliente. Repetir não executa outra alteração: consulta o marcador privado no Auth para conferir o resultado. Uma tentativa completed indica que o cliente já escolheu outra senha; não oferecer a temporária antiga como se ainda fosse válida.

Recusa definitiva gera failed e permite outra tentativa. Em resultado desconhecido, mantenha senha, motivo e referência; aguarde e confira novamente. Não gerar outra referência para forçar a alteração. Uma operação sem marcador confirmado pode exigir investigação do runtime, em vez de repetir uma escrita incerta. Ao recarregar, o histórico indica a operação pendente; preencher os mesmos dados permite conferir sua referência.

O bloqueio utiliza o estado atual do usuário obtido por Auth, não user_metadata editável nem autorização de localStorage. Tokens JWT já emitidos têm seu próprio prazo; não se promete revogação instantânea universal de tokens em outros aplicativos compartilhados. O controle implementado protege os fluxos deste painel. A ação normal de saída usa o logout do Auth.

## Verificação

Em conta de teste: cliente não pode chamar redefinição; admin não redefine a própria conta; senha antiga deixa de autenticar; temporária direciona à troca; envios, cartão e suporte recusam operação pendente; cliente escolhe senha diferente e retorna ao login; nova senha abre o painel; motivo/administrador aparecem sem senha; repetir UUID não reverte a senha escolhida. Os testes locais simulam Auth e verificam SQL/trigger/autorização, mas a validação real exige implantação das funções e um teste controlado do proprietário.

Fonte: src/features/password-admin, a rota alterar-senha, a função astros-admin-password e o SQL de ativação. O arquivo completo da nova função é uma cópia direta do index.ts e deve acompanhar futuras alterações.
