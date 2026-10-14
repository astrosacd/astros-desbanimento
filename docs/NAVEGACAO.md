# Navegação e carregamento

A estrutura da página deve responder ao clique antes das consultas de dados terminarem. Rotas protegidas continuam verificando identidade, e cada operação de servidor mantém sua autenticação/autorização existente.

- O root antes de navegar reutiliza por até 15 segundos a identidade obtida de getClientSession em um QueryClient por router, somente em memória. Não armazena senha, token, saldo ou decisão administrativa, nem autoriza operações por esse cache.
- Consultas simultâneas da navegação são coalescidas. Após a janela, verificar novamente; falhas e resultado sem sessão não devem liberar acesso por identidade expirada.
- Login, cadastro com sessão, logout, alteração de perfil, recuperação concluída e troca obrigatória limpam o cache antes de atualizar a navegação. Não usar localStorage ou um cache global compartilhado entre usuários.
- A rota Perfil usa a identidade já verificada pelo root, evitando uma segunda consulta Auth bloqueante. A alteração de perfil continua autenticando no servidor.
- O cliente mostra Abrindo página durante navegação pendente, sem antecipar o breadcrumb ou aplicar título de uma página ainda não apresentada.
- O admin aquece somente consultas de configurações ao apontar/focar o botão, com 15 segundos de frescor. Operações de salvar forçam refetch; requireAdmin das consultas e mutations preservado.
- As consultas de números, saldo, pagamentos e operações externas não foram transformadas em saldo simulado ou cache de autorização. Elas ainda podem levar tempo e devem manter estados claros de carregamento/erro.

Verificação: testes de concorrência, janela expirada, falha, ausência de sessão e troca de conta/flag de senha. Teste local de navegação com atraso artificial de 1 segundo em Auth; não representa medição do serviço em produção. Builds das duas hospedagens e testes apropriados concluídos.
