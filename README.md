# Astros Desbanimento

Crie um NOVO projeto chamado "ASTROS • Painel de Desbanimento V2". O usuário quer um frontend muito mais profissional para seu painel existente. Não altere o projeto original 65b4004c-1306-4b1b-9b3c-6e360e7eceb4. Nesta entrega construa um frontend navegável completo em português brasileiro com modo de demonstração explícito, sem conectar webhooks ou banco original e sem enviar solicitações reais/cobrar pagamentos. Não implementar força bruta nem métodos de contornar sistemas da Meta. O produto é gestão e acompanhamento de solicitações de revisão/desbloqueio, sem promessa de aprovação.

Direção visual premium Astros Comunicação Digital® / Ecossistema de Crescimento Digital: fundo #020711, superfícies navy #0B1423, ciano #00D7E8 e azul elétrico. Tipografia refinada, títulos fortes, bordas discretas, bastante espaço, ícones lucide, gráficos úteis, sem excesso de brilho e sem visual genérico de landing page. Sem inventar logo: use wordmark tipográfico ASTROS com símbolo geométrico discreto. Dashboard deve ser tela inicial para fácil revisão, com badge "Demonstração" persistente e dados fictícios explicitamente identificados. Login pode ser acessado pelo menu da conta e ter botão "Explorar demonstração".

Funções reais identificadas no painel antigo: login, cadastro, recuperação de senha, saldo, nova solicitação com número e tipo, histórico de solicitações, recargas, API e perfil; área administrativa existe. Tipos: WhatsApp Business, WhatsApp Messenger, WhatsApp Business (Internacional), WhatsApp Messenger (Internacional), Rebanimento. Custo apresentado no original R$3,97 por solicitação: preservar como preço de referência na demo, não cobrar. Rebanimento deve avisar que exige número já registrado.

Faça sidebar desktop com Visão geral, Nova solicitação, Solicitações, Carteira/Recargas, API, Perfil e suporte. Mobile drawer ou bottom navigation com rótulos. Header com breadcrumb, badge demo e avatar. Dashboard: saudação, hero funcional discreto, CTA Nova solicitação e Adicionar saldo, cards saldo/andamento/concluídas/total (derivados dos registros demo), gráfico de atividade, tabela de solicitações recentes com filtros status e busca por número. Use BRL/pt-BR em valores e datas. Status textuais coloridos, detalhes em drawer com timeline apenas ilustrativa. Solicitações com paginação e export CSV realmente funcional. Nova solicitação: formulário com seletor dos 5 tipos, validação de número nacional e internacional clara, revisão de número/tipo/custo e confirmação; só adicionar registro local demo em andamento e ajustar saldo demo, nunca alegar desbloqueio. Impedir duplicatas acidentais e saldo insuficiente. Recargas: valores rápidos, customizado, modal de confirmação explicitamente simulado e histórico de movimentações demo. API: documentação demonstrativa, snippets copiáveis, não expor chaves reais nem inventar endpoint de produção. Perfil edição local com feedback. Login/cadastro/reset com validação visual, sem armazenar senhas ou fingir autenticação real. Termos e suporte acessíveis. Persistência local somente de demo; botão restaurar demo. Estados vazios, loading, erro, toasts, focus acessível e prefers-reduced-motion. Não mostrar promessas de sucesso nem alegar serviço online a partir de dados falsos.

Implemente agora todo frontend e confira build TypeScript, rotas/menu, filtros, modais, mobile sem overflow. Não publique em produção. Retorne resumo do que funciona e limitações de backend.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a135bd51-5c95-48af-b761-0912ca8dea47).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
