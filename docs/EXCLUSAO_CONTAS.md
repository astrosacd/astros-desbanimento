# Exclusão permanente de contas

A aba **Gestão de contas → Gerenciar conta → Zona de perigo** é uma ferramenta exclusiva do proprietário. Não desativa contas, não transfere histórico/saldo e não emite reembolsos. Nenhuma conta é removida ao instalar ou publicar.

## Instalação, uma etapa por vez

1. Execute `supabase/migrations/20261026_account_danger.sql` no SQL Editor e confira o resultado. É aditivo: cria apenas as tabelas privadas e RPCs da ferramenta, sem alterar workers, cron, preços, carteira ou gatilhos operacionais. Pode ser reaplicado preservando permissões/recibos.
2. Publique no Lovable. Não há nova Edge Function, segredo nem alteração de JWT.
3. Atualize o Portainer com a imagem imutável do commit aprovado, depois de conferir que o workflow da imagem passou. Cada publicação afeta seu próprio endereço.
4. Confira primeiro uma conta de teste do tipo cliente. Apenas o proprietário deve poder conferir/excluir. Funcionários continuam com seus controles existentes, sem a permissão de exclusão.

Na primeira instalação, somente o UUID Auth confirmado de `eudezioj@gmail.com`, com perfil admin, é inserido em `astros_deletion_owners`. Não há permissão de edição dessa lista pelo navegador; alterações de proprietário exigem manutenção consciente do banco. O servidor exige `requireAdmin` e a RPC valida proprietário ativo, confirmado, não banido e sem troca obrigatória de senha. Administradores e a própria conta nunca podem ser alvos.

## Operação

- Clique em **Conferir conta antes de excluir**. A prévia lista identidade, saldo, contagens por tabela e impedimentos. Ela não suspende o cliente nem chama fornecedores.
- O saldo positivo exige confirmação explícita de que seu destino foi resolvido. Será apagado, sem transferência automática nem devolução bancária. Saldo negativo impede a exclusão.
- Resolva Baserow e outros sistemas separadamente e confirme isso na tela. Mercado Pago, fornecedores, Chatwoot e backups externos não são apagados nem alterados pela ferramenta.
- Digite exatamente o e-mail exibido e sua senha de proprietário. A senha só vai ao endpoint oficial de login do Supabase pelo servidor; não é persistida em tabelas/cookies nem devolvida ao navegador. A sessão temporária é encerrada com escopo local. A RPC também exige prova JWT de autenticação por senha nos últimos dois minutos.
- A prévia expira em dez minutos e tem referência estável. Antes da exclusão, os registros são conferidos novamente; mudança de conteúdo, saldo, estado ou vínculos exige nova prévia.
- Em resposta incerta, digite novamente a senha e use **Conferir mesma exclusão**. O recibo da mesma referência recupera um sucesso já confirmado, sem repetir a exclusão.

## Impedimentos

Pedidos de desbanimento não finalizados; SMSPool/5SIM em dispatch, pendente ou review; conferências SMS incertas; pedidos sociais não terminais e ações cancel/refill não concluídas; buscas Maps na fila/processando; CNPJ, Instagram e avaliações processando; pagamentos fora dos estados finais reconhecidos; redefinição de senha/importação processando; ajuste negativo; comissões pendentes, divergentes ou concedidas sem estorno; indicados de outra conta e demais referências cruzadas.

Afiliação com efeitos no patrimônio/histórico de terceiros requer tratamento separado: a ferramenta não apaga os eventos/indicações de outros clientes para liberar uma exclusão. Mesmo uma comissão totalmente estornada pode ter eventos pertencentes ao indicador que impedem a operação.

Consultas ainda contabilizadas no dia de Fortaleza ou na última hora também impedem a remoção, pois apagar seus registros liberaria artificialmente cotas globais. Registros ainda posteriores ao último snapshot de capacidade aguardam a atualização normal dessa capacidade. A ferramenta não consulta nem compra no fornecedor para resolver isso.

O estado financeiro é o que já foi conciliado no banco do painel. A ferramenta não detecta um reembolso aberto externamente que ainda não tenha chegado ao sistema. Não cancela Pix aberto automaticamente; resolva o pagamento pelo fluxo existente antes de excluir.

## Escopo e atomicidade

A exclusão usa uma lista fixa e ordenada das tabelas próprias, dos filhos por pedido/consulta e de `backup_desbanimento` por e-mail exato. Remove também login, identidades, sessões e tokens Auth associados. Nunca executa DELETE em uma tabela descoberta automaticamente só por conter um UUID.

Antes de remover, verifica referências exatas ao UUID e aos campos de e-mail em tabelas públicas, além de filhos por FK de registros próprios (inclusive cascades desconhecidos). Referências fora das regras bloqueiam. Uma FK inesperada, falha ou resíduo verificado ao final aborta a transação inteira. Os locks são na conta escolhida; não há lock global nem alteração das autorizações dos outros módulos.

Caches compartilhados de empresas, configurações, contadores sem identidade e dados pertencentes a outras contas não são históricos próprios do cliente e são preservados. Não há varredura de texto livre/JSON por correspondência parcial de e-mail, remoção de arquivos de Storage ou apagamento em sistemas externos; um vínculo/constraint inesperado exige revisão. Não apresentar isso como purga forense de todo o projeto Supabase ou de backups.

A ferramenta conserva um recibo técnico privado para recuperar respostas interrompidas: referência da operação, executor, fingerprint do alvo, horário e quantidades por tabela. Não conserva o e-mail, nome, UUID do alvo, conteúdos dos registros ou senha. Não há FK para a conta apagada nem efeito em saldo alheio.

Após excluir, um novo cadastro com o mesmo e-mail poderá criar outro UUID, sujeito às regras atuais. Nenhum saldo ou histórico apagado é restaurado automaticamente.

## Verificações locais

`PGLITE_MODULE=/caminho/@electric-sql/pglite node scripts/check-account-danger.cjs`

O script usa um banco descartável com definições reais das tabelas/FKs dos módulos e identidades fictícias. Cobre acesso, reautenticação recente, alteração/expiração da prévia, saldo, pendências, ambos os fornecedores SMS, quotas, vínculos cruzados, dependência desconhecida com cascade, rollback por resíduo, backup exato, Auth, repetição e preservação de outra conta. Os testes de servidor/UI cobrem confirmação, senha, guardas, erros e recuperação. Esses testes não excluem contas em produção nem validam o schema particular de produção sem a instalação/conferência guiada.
