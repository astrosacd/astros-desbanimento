# Responsividade do painel

## Estrutura

Cliente e administrador usam menu lateral no computador. Até 850 px, a navegação abre em uma gaveta; o menu do admin não ocupa mais uma grade inteira acima do conteúdo. Ao passar para uma largura de computador, uma gaveta aberta fecha automaticamente. Fechar o menu em tela pequena devolve o foco ao botão de abertura.

Formulários têm largura limitada ao contêiner. Campos usam texto de 16 px em telas até 850 px e em dispositivos com ponteiro de toque. Nomes longos no cabeçalho não empurram as ações para fora da tela. Gestão de contas distribui suas quatro abas em duas colunas no celular.

Tabelas e exemplos de código podem rolar horizontalmente dentro de seus próprios blocos; essa rolagem não deve aumentar a largura da página. Diálogos de confirmação mantêm margem lateral, altura máxima da janela e rolagem interna para telas baixas, com quebra de textos longos. A altura usa vh como fallback e dvh quando disponível.

## Verificação local realizada em 14/10/2026

Browser Chromium, com contas e respostas fictícias exclusivamente no ambiente local, sem enviar e-mails, executar pagamentos, alterar senhas ou consultar dados reais.

Larguras: 320, 375, 768, 1024 e 1440 px. Também orientação horizontal de 667 × 375 px e tablet com entrada por toque.

Cobertura: visão geral, novo envio, solicitações, carteira, API, perfil, suporte, login, cadastro, recuperação, redefinição, termos e troca obrigatória de senha. No admin: visão geral, gestão de contas e suas abas, logs, pagamentos, configurações, comunicados/faixas, suporte, países/DDIs, histórico e envios em conferência.

A varredura principal avaliou 148 estados e não encontrou rolagem horizontal da página. As posições das gavetas foram conferidas novamente após a animação de entrada; 15 verificações finais passaram para menus, foco, troca de largura, campos por toque e confirmação de senha em tela baixa. Tabelas largas mantêm sua rolagem local. A suíte do projeto passou com 339 testes durante a revisão.

Isso é uma verificação do layout da aplicação em ambiente local; não é um teste em todos os aparelhos físicos ou em todos os navegadores. O conteúdo interno de widgets externos continua sendo renderizado por seus fornecedores.

## Manutenção

Estilos compartilhados: src/styles.css. Navegação de cliente: src/features/demo/shell.tsx (shell operacional reutilizado). Navegação administrativa: src/features/admin/page.tsx. Confirmações: src/components/ui/alert-dialog.tsx.

Ao acrescentar uma tela ou diálogo, conferir largura de página, textos longos, tabelas em contêiner próprio, toque, orientação horizontal, navegação por teclado e foco após fechar. Não usar overflow-x:hidden na página para esconder componentes que excedem a largura. Alterações desta revisão não exigem SQL, secrets ou deploy de Edge Functions.

## Menu por serviço
Cliente e admin agrupam as opções atuais em Desbanimento, recolhível por botão com aria-expanded/aria-controls. A Central de suporte permanece fora do grupo. No menu compacto do cliente, clicar no serviço expande a sidebar para mostrar os nomes. Submenus possuem alvos de toque de pelo menos 44 px; as sidebars rolam em telas baixas. Rotas, permissões e regras financeiras preservadas.

Verificação local desta alteração: Chromium com respostas fictícias de Auth/Supabase/Baserow, sem dados ou pagamentos reais. Cliente e admin conferidos a 320, 375, 768, 1024 e 1440 px; abrir/fechar grupo, suporte acessível e ausência de overflow horizontal. 351 testes automatizados; builds Lovable e VPS concluídos.

## Entrada geral Astros Mais
A rota / agora apresenta os serviços disponíveis e atendimento, sem consultar ou apresentar indicadores de desbanimento. O dashboard operacional permanece em /desbanimento. Admin inicia na seção Início e acessa o dashboard por Desbanimento. Conferência local nas mesmas cinco larguras, com dados fictícios; 353 testes e builds das duas hospedagens passaram.
