# Novidades da Astros Mais

Área independente dos comunicados existentes. Clientes autenticados acessam o botão no cabeçalho e `/novidades`, com categorias, pesquisa por título e paginação. A janela nunca abre automaticamente. Um ponto destaca a versão mais recente ainda não vista neste navegador, separado por conta; não é recibo de leitura centralizado.

Administração → Operação → Novidades permite criar rascunhos, pré-visualizar, publicar, editar e arquivar. Datas de publicação são geradas pelo banco. Arquivar esconde o conteúdo dos clientes; a data original é preservada ao republicar. Texto simples com parágrafos, sem execução de HTML. Não envia e-mails nem mensagens. Esta etapa não inclui formulário de feedback.

## Instalação

1. Executar **somente** `supabase/migrations/20261028_updates.sql` no SQL Editor do Supabase. É aditivo, sem alteração de saldo, serviços, comunicados, Auth ou integrações. Não cria publicações demonstrativas.
2. Publicar a interface no Lovable. Sem o SQL, somente Novidades mostra indisponibilidade; os serviços existentes continuam independentes.
3. No admin, salvar um rascunho e conferir sua ausência na conta do cliente. Publicar, conferir janela e histórico do cliente, categorias e pesquisa. Arquivar e conferir que desapareceu. Usar texto de teste que possa ser arquivado; nunca inventar uma atualização operacional.
4. Depois da conferência, atualizar a imagem da VPS do mesmo commit, após o workflow concluir com sucesso. Preservar ambiente, redes e demais opções da stack.

Não precisa de Edge Function, JWT, segredo, cron, DNS ou outro servidor.

## Segurança e manutenção

Leituras usam o token do usuário, RLS e identidade confirmada; rascunhos/arquivados são somente admin. Escritas exigem `requireAdmin` no servidor e permissão administrativa ao vivo na RPC. Sem permissões diretas de INSERT/UPDATE/DELETE para clientes. Versão otimista impede sobrescrever outra edição; UUID persistente durante a edição impede criar uma segunda publicação após falha de resposta. Em resultado incerto, recarregar a lista antes de editar novamente. Nenhum vínculo de usuário é inserido nas publicações globais; não altera exclusão de contas.

Para desfazer a interface, voltar à imagem anterior. As tabelas adicionais podem permanecer sem interferir nos serviços.
