# ASTROS • Painel de Desbanimento V2

## Escopo e isolamento
Construir neste projeto novo já aberto uma V2 exclusivamente demonstrativa. O projeto original `65b4004c-1306-4b1b-9b3c-6e360e7eceb4` não será acessado nem alterado. Nenhuma conexão com banco, webhooks, Meta ou pagamentos; nenhuma publicação.

## Ordem de execução
1. **Identidade e navegação:** design premium solicitado, wordmark tipográfico, sidebar recolhível, menu mobile com rótulos, breadcrumb, avatar e identificação persistente de demonstração.
2. **Dados locais:** registros fictícios, carteira e movimentações; totais derivados, moeda/datas brasileiras e botão restaurar demonstração.
3. **Visão geral:** saudação, destaque funcional, ações de nova solicitação/recarga, indicadores, gráfico de atividade e solicitações recentes com busca/filtros.
4. **Solicitações:** listagem paginada, exportação CSV, detalhes com timeline ilustrativa; formulário com os cinco tipos, validação nacional/internacional, aviso de rebanimento, revisão e confirmação. Debitar R$3,97 do saldo fictício e criar somente registro demo em andamento; bloquear duplicatas e saldo insuficiente.
5. **Carteira:** valores rápidos e personalizado, confirmação simulada, histórico de movimentações e saldo atualizado.
6. **API e conta:** documentação demonstrativa e snippets copiáveis; perfil editável localmente; login, cadastro e recuperação com validação visual e botão Explorar demonstração, sem autenticação real ou armazenamento de senhas.
7. **Termos e suporte:** páginas acessíveis, limites da demonstração e ausência de garantia de aprovação. Área administrativa explicitamente demonstrativa, acessível no menu da conta, sem privilégios reais.
8. **Revisão:** testes de regras de saldo/preço/duplicatas/rebanimento, rotas, filtros, CSV, formulários, modais, persistência e restauração; inspeção desktop/mobile, teclado, overflow e sinais de compilação/TypeScript.

## Decisões e limites
- Login é uma simulação visual, não exige infraestrutura de autenticação ou perfis reais.
- Rebanimento será permitido apenas para número presente nos registros locais da demonstração.
- Dados e timelines serão identificados como fictícios, sem afirmar disponibilidade real ou desbloqueio.
- Estados vazios, carregamento local, erros, feedback e movimento reduzido serão incluídos.

## Detalhes técnicos
- TanStack Start/Router, React, Tailwind v4, componentes acessíveis e lucide.
- Páginas independentes com metadados específicos; estado compartilhado em provider, persistido em localStorage apenas após hidratação.
- Regras de negócio demo em módulo puro com testes Vitest; armazenamento nunca inclui senhas, tokens ou chaves.
- Sem alterações server-side nem ativação de Lovable Cloud, pois o escopo proíbe backend nesta entrega.

## Impactos e riscos
- Substitui apenas a tela vazia deste projeto; preserva o original.
- Limpar armazenamento do navegador remove edições demo. Restauração pede confirmação.
- Sem backend: não há autenticação, revisão real, pagamento, envio de suporte ou acesso administrativo protegido.