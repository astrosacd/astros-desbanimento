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

## Revisão dos serviços compartilhados — 15/10/2026

Ajustes de apresentação: campos SMS/financeiro e pesquisa de serviço com fonte de 16 px em telas pequenas; configuração de venda SMS em uma coluna até 850 px; botões que quebram texto e preservam alvos de 44 px; números/códigos longos com quebra local; ações e paginação SMS adaptadas ao celular; saldo geral e atalhos com largura limitada ao cartão; áreas de navegação com espaço inferior seguro. Eixo de valores do gráfico financeiro usa notação compacta, mantendo valores integrais nos indicadores e tooltip. Sem mudança de cobrança, permissões ou chamadas ao fornecedor.

Verificação local em Chromium, usando DOM renderizado dos componentes reais com respostas sintéticas e CSS compilado. 14 estados em 8 tamanhos: 320×800, 375×812, 430×850, 667×375, 768×1024, 850×1000, 1024×768 e 1440×1000. Total de 112 combinações, sem aumento da largura da página. Estados: login, cadastro, recuperação, redefinição, Início com carteira compartilhada, desbanimento, carteira, SMS, menu do cliente, seletor de serviço SMS aberto, Início administrativo, SMS administrativo, financeiro e menu administrativo. Conferência visual adicional das capturas do Início e dos módulos SMS/financeiro em 375 px e login em 850 px. Valores altos e textos longos foram utilizados para verificar quebra e encaixe.

Limites desta conferência: os snapshots avaliam layout, não executam autenticação, compras, redimensionamento dinâmico do gráfico ou testes de ponta a ponta. Gráfico e componentes externos continuam precisando da validação funcional normal. Não representa todos os aparelhos físicos. Menus e seletor foram capturados abertos; não substitui os testes prévios de foco, navegação e transição de largura. Nenhum dado real foi acessado ou saldo movimentado.

A suíte passou com 393 testes; builds Lovable e VPS concluídos. Não requer SQL nem atualização de Edge Functions. O Início geral agora inclui o saldo compartilhado; somente os indicadores operacionais e a taxa de desbanimento permanecem em /desbanimento.

## Navegação e módulos SMS — revisão de 15/10/2026
Menus do cliente e admin com superfície neutra, ícones em áreas próprias por serviço, seleção ativa mais nítida, hierarquia de submenus e divisores discretos. Cliente mostra nome da conta com truncamento no rodapé. Gavetas móveis usam a mesma superfície do menu e deixam espaço para o fechamento; sidebar recolhida mantém largura própria para ícones. Nenhuma rota, permissão ou configuração financeira foi alterada.

Ajustes em telas pequenas: cabeçalhos SMS quebram em linhas, indicadores admin ficam em duas colunas, configurações de custo/venda ficam em uma coluna e paginação mantém os nomes dos botões inteiros com o número da página abaixo.

Conferência em Chromium 153 com DOM dos componentes reais, respostas sintéticas e CSS compilado, sem acessar contas reais nem comprar números. Foram 56 combinações: sete estados (SMS cliente, detalhes abertos, quatro abas SMS admin e navegação móvel aberta) em 320×800, 375×812, 430×850, 667×375, 768×1024, 850×1000, 1024×768 e 1440×1000. Nenhuma aumentou a largura da página. Capturas de cliente e configurações em 375 px conferidas visualmente; corrigida a quebra dos nomes dos botões de paginação. A conferência é de layout estático; não substitui testes de autenticação, compras reais ou todos os aparelhos físicos. Testes existentes de navegação/abas passaram. Sem SQL ou Edge novo; validar no Lovable antes de trocar a imagem da VPS.

## Módulo Redes sociais — 15/10/2026
Conferência local em Chromium 153 com componentes reais, dados sintéticos e sem chamadas ao fornecedor: cliente (novo pedido, histórico e detalhe aberto) e quatro abas do admin (operação, catálogo, pedidos e configurações). Sete estados nas oito dimensões já descritas, total de 56 combinações sem overflow horizontal. Capturas em 375 px conferidas visualmente; cliente foi renderizado dentro de AppShell e admin na estrutura admin-shell. O seletor de serviços foi substituído por um controle local equivalente somente na captura; os componentes de overlay mantêm os testes próprios. Nenhum pedido real, perfil externo ou saldo foi usado. Formulários e resumo ficam em uma coluna em telas pequenas; listas e tags quebram texto, diálogos têm altura limitada e rolagem interna. Essa validação de layout não confirma a entrega de serviços pelo SMMRaja.

## Revisão geral — 17/10/2026

Revisão local do cliente e da administração após as mudanças em suporte e catálogo social. Suíte completa: **110 arquivos e 585 testes aprovados**. Capturas de componentes reais com respostas sintéticas dos testes, complementadas por entradas de login/cadastro/recuperação/redefinição, perfil, troca obrigatória de senha, termos, API, financeiro com valores altos, histórico de pagamentos com tabela, gestão de contas e abas, configurações de suporte e WhatsApp, navegação e menus. Os testes exercitam também SMS, redes sociais, solicitações, comunicados, países e diálogos.

Foram **107 estados em oito tamanhos**, total de **856 combinações finais sem aumento da largura da página**: 320×800, 375×812, 430×850, 667×375, 768×1024, 850×1000, 1024×768 e 1440×1000. Menus cliente/admin foram repetidos após 400 ms para aguardar a animação de abertura. Tabelas e código mantêm rolagem interna. Conferência visual adicional de menu cliente/admin, suporte administrativo e financeiro no celular.

A primeira captura detectou overflow em quatro estados que usavam um select HTML simplificado exclusivo dos testes. A conferência final retirou esses estados do cálculo e incluiu o seletor pesquisável real, aberto e com serviço selecionado. Não foi necessário alterar o CSS da aplicação para corrigir um componente que não existe na interface real.

Escopo: layout em Chromium local, sem acessar clientes reais, movimentar carteira, comprar números/serviços ou enviar mensagens. Capturas estáticas não comprovam funcionamento de integrações externas, renderização WebGL do avatar nem interação/redimensionamento do gráfico financeiro. Os layouts cobertos não substituem testes em aparelhos físicos e outros navegadores. A verificação adicional de altura encontrou o diálogo comum de detalhes da recarga ultrapassando uma tela de 375 px de altura. O DialogContent compartilhado passou a limitar largura/altura e rolar internamente, mantendo o fechamento e o conteúdo acessíveis. Nenhum SQL, função do Supabase ou configuração de produção foi alterado.

Após o ajuste compartilhado de DialogContent, a suíte completa passou novamente (585 testes) e o build de produção concluiu. Foram repetidos 50 cenários de diálogo em 375×812 e 667×375, aguardando animações: nenhum diálogo ultrapassou a altura da janela. As tabelas continuam com rolagem local; não foi aplicado overflow-x:hidden para ocultar defeitos.

## Revisão geral — 19/10/2026

Revisão exclusivamente de responsividade, incluindo os novos cartões CNPJ, cota/contador, contatos e abordagem manual. A suíte completa passou com **131 arquivos e 722 testes**. Foram renderizados componentes reais com respostas sintéticas em Chromium local, nas dimensões 320×800, 375×812, 430×850, 667×375, 768×1024, 850×1000, 1024×768 e 1440×1000. Cobertura: entradas e recuperação de acesso, perfil, shells cliente/admin e gavetas, solicitações/números, carteira/pagamentos, SMS, redes sociais, suporte, comunicados, API, financeiro, gestão de contas e prospecção Maps/CNPJ (busca, capacidade, histórico, detalhes, cota e CRM).

**121 estados estáticos, 968 combinações.** O seletor real pesquisável foi adicionalmente montado no navegador, aberto e medido nos oito tamanhos (8 verificações), pois posicionamento e altura do popover dependem de variáveis calculadas em execução. Foram excluídos os quatro estados de compra social que substituem o seletor real por um select HTML simplificado exclusivo do teste. Total final: **976 verificações de layout sem aumento da largura da página ou diálogo fora da altura disponível**, após repetir os estados de comunicados corrigidos. Fonte Manrope local carregada na varredura final; tabelas e CRM preservam a rolagem interna.

Ajuste encontrado: no editor administrativo de comunicados, Salvar comunicado e Cancelar edição ultrapassavam 320 px. As ações agora se empilham em telas pequenas e voltam à linha com quebra permitida a partir de 640 px. Alteração limitada às classes de layout; textos, ações, dados, permissões e regras permanecem iguais. Os dois testes existentes de comunicados passaram após o ajuste e o build de produção concluiu. Não exige SQL ou atualização de Edge Functions.

Limites: capturas de componentes e testes locais não substituem todos os dispositivos físicos/navegadores, integrações externas, gráficos interativos ou WebGL. Nenhum cliente real foi acessado, nenhuma mensagem foi enviada e nenhum pagamento ou chamada ao fornecedor foi realizado. Não foi usado overflow-x:hidden para mascarar problemas.
