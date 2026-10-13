# Plano de evolução e manutenção

Este plano descreve próximos passos possíveis. Não ativa mudanças nem altera a instalação atual.

## Etapa concluída nesta organização

README atualizado para o painel real, índice de guias, mapa dos recursos e roteiro de replicação com dependências e limites explícitos. Documentação permanece no GitHub junto do código e pode acompanhar futuras mudanças.

## Próxima etapa para facilitar novas instalações

1. Preparar e testar uma migração inicial para um Supabase vazio, incluindo a tabela de perfis e todos os pré-requisitos.
2. Centralizar URLs, tabela e IDs externos em configuração validada, para evitar adaptações espalhadas. Esta etapa altera código e deve ser feita em trabalho separado.
3. Consolidar instruções históricas em procedimentos atuais e registrar quais migrações foram aplicadas em cada ambiente.
4. Montar uma instalação de teste independente e validar cadastro, permissões, pagamentos, envio e conferência sem depender da configuração da produção.

Essa etapa é o que permitirá afirmar que a replicação foi comprovada do início ao fim. Hoje o guia identifica o trabalho necessário, sem prometer instalação em um clique.

## Como acrescentar recursos sem perder organização

Identifique o módulo pelo mapa ARQUITETURA.md. Separe alteração de tela, banco e função; faça migração incremental quando necessário, preserve autorização no servidor e proteções financeiras. Use testes proporcionais à mudança, execute o build e publique apenas os componentes alterados. Atualize o guia do recurso junto da implementação.

## Planejamento de operação

| Tema | Próximo trabalho possível | Situação |
|---|---|---|
| Replicação | Base inicial + configuração central + teste em nova conta | Planejado, não executado |
| Logs da API | Confirmar registros reais e funcionamento da retenção no ambiente publicado | A verificar em produção |
| Pagamentos | Verificar confirmação, histórico e crédito único no ambiente escolhido | Validação externa por cenário |
| Backup | Definir restauração de banco, Baserow e configuração privada | Exige plano próprio; GitHub sozinho não restaura tudo |
| Capacidade | Acompanhar tamanho do banco e volume dos históricos antes de alterar retenção | Sem limpeza geral autorizada nesta etapa |
| Novos recursos | Implementar por módulo e atualizar os guias | Conforme prioridades do proprietário |

Não apagar histórico financeiro ou referências de solicitações para reduzir tamanho sem estudar a integridade e a idempotência. A retenção já implementada para logs da API é independente desses históricos.
