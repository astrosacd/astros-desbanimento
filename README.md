# Astros Desbanimento

Painel de clientes e administradores da Astros Comunicação Digital®, com autenticação Supabase, carteira, pagamentos Mercado Pago, solicitações integradas ao Baserow, suporte Chatwoot e API de clientes liberada pelo administrador.

Este repositório contém a aplicação real. As instruções antigas de demonstração não descrevem o estado atual.

## Documentação

| Objetivo | Guia |
|---|---|
| Entender a estrutura e os fluxos | [Mapa do projeto](docs/ARQUITETURA.md) |
| Preparar outra instalação em outra conta | [Instalação e replicação](docs/INSTALACAO.md) |
| Conferir layout e dispositivos | [Responsividade](docs/RESPONSIVIDADE.md) |
| Planejar manutenção e próximos recursos | [Plano de evolução](docs/PLANO_DE_EVOLUCAO.md) |
| Senha temporária para contingência | [Redefinição manual](docs/SENHA_MANUAL.md) |
| Acesso e permissões | [Administradores](docs/ADMIN_SETUP.md) |
| E-mails personalizados | [Gmail](docs/GMAIL_SETUP.md) |
| Carteira e pagamentos | [Pagamentos](PAYMENTS_SETUP.md) |
| Envios e conferência automática | [Solicitações](SUBMISSIONS_SETUP.md) |
| Atendimento | [Suporte](SUPPORT_SETUP.md) |
| Trazer clientes e saldos do painel antigo | [Migração de clientes](docs/MIGRACAO_CLIENTES.md) |
| API, chaves e logs | [API](API_SETUP.md) |

Os guias por recurso registram também etapas históricas da implementação. Para uma nova instalação, comece por INSTALACAO.md. Não execute novamente SQLs já aplicados na instalação em produção.

## Desenvolvimento

```bash
git clone https://github.com/astrosacd/astros-desbanimento.git
cd astros-desbanimento
npm ci
npm run dev
```

Verificações: `npm test` e `npm run build`. Testes locais usam simulações e não comprovam pagamentos, e-mails ou gravações reais nos serviços externos.

## Sincronização e publicação

As alterações enviadas à branch main sincronizam com o projeto conectado no [Lovable](https://lovable.dev/projects/a135bd51-5c95-48af-b761-0912ca8dea47). Sincronizar código e publicar o site são etapas distintas. SQLs, Edge Functions e secrets do Supabase exigem instalação própria; um commit não os aplica automaticamente.

O GitHub não é uma cópia dos dados de produção nem das credenciais privadas. Não coloque tokens, senhas de app ou chaves administrativas em commits ou exemplos.
