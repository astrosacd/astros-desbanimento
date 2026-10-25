# Organização visual do painel — 25/10/2026

Alteração de apresentação, sem SQL, Edge Functions, preços, saldos ou mudanças de regras. Publicar no Lovable e conferir antes de atualizar a imagem da VPS.

## Mudanças

- Início com saudação curta, carteira, quatro atalhos de serviços e acesso a suporte/afiliação. Cards com texto mais curto e cor por área; quatro colunas em monitores largos, duas em telas intermediárias e uma no celular.
- Pedidos recentes mostram até três registros de cada fonte (envios de desbanimento, SMS, redes sociais, Maps e CNPJ), ordenados por criação, com até oito no resumo. O filtro seleciona entre os registros recentes carregados; não é uma busca em todo o histórico. O link abre o módulo, onde continuam os filtros e detalhes completos.
- As consultas reutilizam as ações autenticadas de leitura existentes, sem compras, buscas pagas, cancelamentos ou chamadas de conferência ao fornecedor. Retentativa automática desligada; atualização a cada minuto somente em primeiro plano. Chaves de cache incluem a conta. A carteira reutiliza o cache do resumo de saldo.
- A projeção dos pedidos guarda apenas identificador, título, módulo, data e situação. Não guarda código SMS, telefone, credenciais ou dados de outro cliente. Falha de uma fonte não é apresentada como ausência de pedidos; as fontes que responderam continuam visíveis.
- Atividade da carteira usa os movimentos existentes. Débito de saldo não é apresentado como pedido concluído. Comissão continua diferenciada de recarga e estorno.
- Larguras dos contêineres aproveitam o computador; formulários deixam de ter o limite genérico de 660px, preservando os limites específicos de cada formulário. Cabeçalhos e espaçamentos mais compactos.
- Avisos de ajuste financeiro com título, explicação e link em linhas próprias; o valor e o cálculo do ajuste permanecem os mesmos. O aviso prévio da recarga só aparece com um valor válido, conforme a correção anterior.
- Filtros dos históricos e etiquetas de situação compartilham acabamento consistente; detalhes continuam sob ação explícita e diálogos preservam altura limitada/rolagem interna.
- Campos e ações móveis mantêm alvos de toque, filtros em largura disponível e a navegação por gaveta existente. Não foi usado overflow escondido na página.

## Verificação

Testes focados nos componentes e fluxos preservados: Início, navegação, limites por módulo, carteira, histórico de pagamentos, afiliação, históricos SMS/social e prospecção. A nova seção tem testes de filtragem, ausência de códigos SMS no cache, falha parcial e descrição de movimentos financeiros. TypeScript e compilações Lovable/VPS.

Conferência visual local com componentes reais renderizados, ações e contas sintéticas, sem acessar dados reais ou movimentar dinheiro. O ambiente de captura inclui CSS compilado e Chromium. Capturas estáticas não substituem autenticação real, integrações, testes em aparelhos físicos ou interações completas de todos os módulos.

Resultado desta revisão: **85 testes passaram em 21 arquivos**, tipos sem erro. A verificação final de layout passou em **99 combinações**, sem aumento da largura da página: 11 estados em 320×800, 375×812, 430×850, 667×375, 768×1024, 850×1000, 1024×768, 1440×1000 e 1920×1080. Estados: Início com registros e vazio, carteira com ajuste, afiliação com estorno, histórico de envios, SMS, detalhe SMS aberto, histórico social, aviso de manutenção, Início administrativo e gaveta de navegação aberta. Capturas de computador/celular conferidas visualmente; o Início administrativo usa a estrutura de shell e o componente real, sem consultar fornecedor/saldo administrativo. A gaveta foi capturada após aguardar a animação. Os valores das capturas são exclusivamente exemplos de teste.
