# Controle de módulos — Astros Mais

Controle independente dos quatro módulos, globalmente e por cliente. Prospecção abrange Maps e CNPJ. Carteira, pagamentos, perfil, suporte, administração e ASTRA não são bloqueados por este recurso.

## Uso

- **Admin → Gestão geral → Controle de módulos:** manutenção para todos os clientes e aviso opcional de até 300 caracteres.
- **Gestão de contas → Gerenciar conta → Módulos:** bloquear/liberar um módulo para aquele cliente. Manutenção global prevalece; liberar globalmente não remove bloqueios individuais.
- Tudo começa liberado. Reaplicar a migração preserva configurações e bloqueios salvos. Os controles próprios de disponibilidade dos fornecedores continuam independentes: liberar aqui não ativa uma integração pausada.
- O cliente mantém acesso ao módulo para ver o aviso, histórico, leads e pedidos existentes. Novas compras/solicitações/consultas são impedidas. Não esconde nem apaga históricos. A interface consulta a situação a cada 15 segundos e ao retornar à janela; o banco decide na criação de cada operação, inclusive para telas antigas e API de desbanimento.
- Pedidos já aceitos, inclusive buscas Maps já enfileiradas, continuam o processamento normal. Uma compra já reservada pode terminar após a manutenção ser ativada. Cancelamento, reposição conforme as regras existentes, códigos de SMS, conferência, recuperação do mesmo UUID e estornos continuam. Não existe cancelamento/estorno em massa.

## Como a proteção funciona

A migração acrescenta configurações globais, exceções por conta e auditoria privada. RPCs de leitura própria e de administração usam a identidade autenticada; clientes não escolhem o proprietário da leitura nem gravam permissões. O servidor também exige `requireAdmin` nas consultas e gravações administrativas.

Triggers `BEFORE INSERT` nas solicitações de desbanimento, pedidos/cotações SMS e redes sociais e consultas Maps/CNPJ impedem criar novas intenções. O bloqueio acontece dentro da mesma transação da reserva: uma recusa desfaz eventuais escritas/débitos anteriores dessa transação. Não se alteram RPCs financeiros existentes. Triggers não interceptam `UPDATE`, portanto conclusão, conferência e estorno de registros existentes seguem intactos. Não dependem da instalação da nova interface/Edge Function para proteger novas reservas.

Os locks da configuração global e da exceção por cliente serializam a alteração administrativa com a criação de operações. Operações já aceitas não são revogadas. Nenhuma chave privada, saldo ou configuração de fornecedor é alterada. A auditoria registra administrador, módulo, alvo, opção, aviso e horário; uma repetição sem mudança não acrescenta outro registro.

## Ativação por etapas

Implementação preparada em branch separada. Não aplicar nada automaticamente em produção.

1. Revisar e aplicar **somente** `supabase/migrations/20261021_module_access.sql` no Supabase atual, após conferir que os quatro módulos já têm suas tabelas instaladas. A migração é transacional, aditiva e começa com todos liberados. Ela não desabilita serviços existentes. Não repetir migrações históricas dos módulos.
2. Atualizar as quatro funções existentes, preservando secrets, configurações JWT e rotinas: `astros-submit-number` com `supabase/astros-submit-number.deploy.ts`; `astros-sms` com `supabase/astros-sms.deploy.ts`; `astros-social` com `supabase/astros-social.deploy.ts`; `astros-prospecting` com `supabase/astros-prospecting.deploy.ts`. Estas alterações apenas permitem apresentar as duas mensagens fixas de bloqueio do banco. Sem elas o bloqueio já protege a reserva, mas a resposta pode ser genérica.
3. Publicar e validar a interface primeiro no Lovable. Antes do SQL, a tela administrativa informa que o controle não está instalado e não oferece comandos de bloqueio. Só a ausência confirmada da nova RPC é tratada como não instalada; falhas de rede/permissão não são convertidas em sucesso.
4. Em uma conta de teste, bloquear apenas um módulo dessa conta e confirmar que não cria nem cobra uma nova operação; conferir outros módulos e recuperar uma operação anterior. Restaurar a permissão. Fazer manutenção global somente em janela escolhida pelo proprietário.
5. Atualizar a imagem da VPS no Portainer apenas depois da validação. GitHub, Lovable, Edge Functions, SQL e VPS são etapas distintas. Não divulgar uma tag de imagem de uma branch sem execução do workflow de produção.

## Validação local

- `npm test`
- `npx tsc --noEmit`
- `npm run build` e `ASTROS_DEPLOY_TARGET=vps npm run build`
- Com `@electric-sql/pglite` disponível no ambiente: `node scripts/check-module-access-sql.mjs` e `node scripts/check-module-access-finance.mjs`.

Os testes SQL cobrem as sete fronteiras de criação, liberação padrão, bloqueio global e individual, precedência, isolamento, permissões, preservação de atualizações, rollback e reaplicação. O teste financeiro usa as funções reais de reserva e liquidação SMS: compra única, cotação anterior bloqueada, recuperação idempotente e estorno único durante manutenção. Testes de interface/servidor cobrem escopo da alteração e falhas. São testes isolados; não comprovam um deploy ou transações reais em produção.
