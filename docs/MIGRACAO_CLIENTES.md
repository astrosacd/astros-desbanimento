# Migração do painel antigo

## O que está preparado

Admin → Gestão de contas → Importar clientes do painel antigo. A ferramenta lê o CSV localmente, mostra uma prévia e envia somente id antigo (controle de duplicidades), Nome, Email, WhatsApp e Recarga. Senha, ID MP e Token do arquivo antigo não são enviados ao servidor. Nenhuma planilha real é incluída no repositório.

A conta eudezioj@gmail.com é excluída no parser, servidor, função e SQL. Novas contas são do tipo cliente. Outra identidade já existente no Supabase Auth é ignorada, sem alterar senha, papel, perfil ou saldo. Uma conta criada por esta mesma importação pode ser retomada graças à referência privada em app_metadata, escrita somente pelo serviço administrativo.

## Ativação

1. Execute uma vez supabase/migrations/20261014_legacy_client_import.sql no Supabase atual. Requer os SQLs de perfis, carteira e créditos manuais já instalados. Esse SQL apenas instala o controle; não cria clientes nem muda saldos.
2. Crie a nova Edge Function astros-import-clients. Cole todo supabase/astros-import-clients.deploy.ts e publique. Desative Verify JWT legado somente nessa nova função: ela valida o JWT internamente, exige conta confirmada e consulta o papel admin pelo UUID. Não altere astros-submit-number, e-mails ou pagamentos.
3. Não precisa de secrets adicionais. SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são fornecidas pelo ambiente da função, nunca pelo navegador. Publique a aplicação sincronizada no Lovable.
4. Entre como admin, abra Gestão de contas e a opção de importação. Selecione o CSV original, confira a prévia, marque a confirmação e importe. Cada registro é processado separadamente; confira o resultado final, inclusive contas preservadas.
5. Se interromper, repita com o MESMO arquivo. Não altere IDs, e-mails ou valores para contornar erros. O controle é persistente e rejeita referências divergentes. Pode haver conta Auth criada com saldo ainda pendente; repetir conclui esse mesmo registro.

## Acesso e recuperação

A função cria a identidade no Supabase Auth e o trigger cria o perfil. O e-mail da conta importada é marcado como confirmado, para permitir o fluxo de recuperação já existente; o importador usa os endereços de clientes informados e revisados pelo administrador. Uma senha forte aleatória interna é criada, não registrada nem devolvida. Senhas antigas não são usadas.

Não há envio de convite ou recuperação durante a importação. Após a conclusão, o cliente abre Esqueci minha senha, informa o e-mail antigo e define sua senha pelo link recebido nesse endereço. A configuração Gmail existente e seus limites continuam valendo; não orientar todos a dispararem testes repetidos simultaneamente.

## Saldos e auditoria

Recarga é convertida exatamente para centavos, sem arredondar frações adicionais. Valores negativos, acima de R$ 10.000,00 ou inválidos são rejeitados na prévia. Saldo zero é válido. Para registros pagos, a finalização grava crédito manual e movimentação, soma ao saldo atual e conclui o registro na mesma transação. O motivo é Saldo migrado do painel antigo.

Repetições de registros concluídos não criam novo crédito, mesmo se o cliente já gastou o valor ou houve estorno administrativo posterior. Os registros de controle e a auditoria financeira não devem ser apagados para “refazer” uma migração. Esta é uma importação única do painel antigo, não uma ferramenta genérica de recarga recorrente.

A migração não importa números, pagamentos antigos, datas antigas de login ou cadastro. Números operacionais continuam vinculados ao e-mail pelo Baserow; o histórico financeiro antigo completo permanece no sistema original. Em uma implantação independente, valide a origem e o banco de destino antes de ativar esta ferramenta.

## Verificação

Confira contas criadas em Authentication e perfis, saldos e lançamentos no admin. Faça uma recuperação controlada em conta de teste cujo e-mail você acessa. Testes locais verificam parser, autorização, exclusões, criação e retomada, repetição, transação de crédito e RLS; não comprovam envio de e-mail no ambiente publicado.

As fontes são src/features/client-import, supabase/functions/astros-import-clients e o SQL acima. Regenere o arquivo completo com python scripts/generate-client-import-deploy.py se alterar as fontes.
