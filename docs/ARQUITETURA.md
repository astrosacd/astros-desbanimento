# Mapa do projeto

## Visão funcional

| Componente | Responsabilidade |
|---|---|
| Aplicação TanStack Start/React no Lovable | Telas, navegação e operações de servidor |
| Supabase Auth | Contas, confirmação, login e recuperação |
| Supabase PostgreSQL | Perfis, permissões, saldo, configurações, pagamentos e controle de envios |
| Edge Functions Supabase | E-mails, pagamentos, envio de números e identidade do suporte |
| Baserow | Registros operacionais dos números e seus status |
| Mercado Pago | Processamento e confirmação de pagamentos |
| Chatwoot | Atendimento e conversas |

O n8n não é dependência interna do painel. Pode ser usado por um cliente como consumidor da API.

## Onde alterar cada recurso

| Diretório | Recurso |
|---|---|
| src/routes | Rotas das páginas |
| src/features/password-admin | Redefinição administrativa e troca obrigatória de senha |
| src/features/auth | Login, cadastro, sessões e perfil |
| src/features/panel | Interface do painel |
| src/features/admin | Área administrativa |
| src/features/clients | Gestão de contas, saldo manual e acesso à API |
| src/features/numbers | Consulta e apresentação dos números |
| src/features/submissions | Envio e histórico de solicitações |
| src/features/payments | Carteira, recargas e pagamentos |
| src/features/client-import | Migração administrativa única de clientes e saldo legado |
| src/features/client-api | Documentação, chaves, permissões e logs da API |
| src/features/notices e banners | Comunicados e faixa informativa |
| src/features/countries | Países e DDIs adicionais |
| src/features/support | Atendimento |
| src/styles.css | Estilos compartilhados |
| supabase/migrations | Evolução do banco e permissões |
| supabase/functions | Código-fonte das funções externas |
| scripts/generate-submission-deploy.py | Gera cópias completas da função de envio para o editor |

## Acesso

O perfil está em public.painel_de_desbanimento e usa o mesmo UUID do Supabase Auth. Novos cadastros são cliente. Admin pode usar ambas as áreas; cliente acessa somente a própria área. A autorização é verificada no servidor e no banco, não apenas pelo menu. Sessões usam cookies HttpOnly. O cliente não escolhe o proprietário das consultas nem altera papel ou saldo diretamente.

## Dinheiro e solicitações

Pagamentos só creditam saldo após confirmação no servidor. Retorno do navegador não comprova pagamento. Saldo fica em recarga, em reais; a API trabalha com centavos inteiros. Créditos manuais e estornos administrativos mantêm histórico e proteções contra duplicidade.

Uma solicitação consulta número, proprietário, status e taxa. Número novo ou EXCLUIDO é pago; processo aberto da mesma conta pode ser reenviado sem cobrança para REEDESBANIMENTO. O Supabase reserva/debita atomicamente antes da escrita externa. Falha comprovada pode devolver a taxa; resultado incerto fica em conferência automática pelo recibo UUID no Baserow. Após o limite de conferências, pode exigir revisão humana. Não há transação única entre Supabase e Baserow.

O requestId identifica uma solicitação. Repetir um envio com o mesmo UUID não cobra nem grava novamente. Uma nova solicitação intencional precisa de outro UUID. Não gerar outra referência para contornar um timeout.

Linhas com observação SIM não aprovisionado são históricas e ocultas para o antigo titular. Outro titular pode criar uma nova linha paga, preservando a antiga. A API segue as mesmas regras do painel.

## Dados e histórico

Baserow contém o estado operacional. Supabase contém o controle de envio, pagamento e auditoria. Eles têm responsabilidades diferentes. Logs da API são metadados com retenção de 30 dias e limite de 5.000 por conta; não substituem históricos financeiros ou referências de idempotência. Limpar logs não autoriza apagar esses históricos.

## O que cada publicação atualiza

| Alteração | Etapa necessária |
|---|---|
| Tela ou código do servidor da aplicação | Commit, sincronização e publicação no Lovable |
| Código de Edge Function | Deploy da função correspondente no Supabase |
| Estrutura ou RPC do banco | Aplicar a migração revisada no Supabase |
| Credencial | Configuração privada no servidor, função ou admin apropriado |
| Apenas documentação | Commit; não exige SQL nem deploy de função |

Sincronização não equivale a backup. Uma restauração completa também depende de backup do banco, Baserow e configurações externas.
