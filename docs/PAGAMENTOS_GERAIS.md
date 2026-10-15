# Pagamentos gerais da Astros Mais

A carteira já é compartilhada pelos serviços. Esta organização não cria outro saldo, gateway, credencial, webhook ou histórico financeiro.

## Administração

- **Pagamentos → Gateway e recargas**: integração do Mercado Pago, Pix/cartão, ambiente, habilitação das recargas, mínimo da carteira e URL atual das notificações.
- **Pagamentos → Histórico de pagamentos**: registros existentes de recargas, com seus estados e clientes.
- **Desbanimento → Configurações do desbanimento**: taxa específica das solicitações de desbanimento. Os preços de SMS continuam na configuração de SMS.
- No cliente, **Carteira / Recargas** fica fora dos grupos de serviços.

A recarga aprovada pelo Mercado Pago credita a carteira existente. Cada serviço continua cobrando pela sua própria operação autenticada e transação. A compra de SMS usa o saldo previamente abastecido pelo administrador no fornecedor; o gateway não deposita automaticamente no SMSPool.

## Compatibilidade

Mantidos os endpoints, tabelas, IDs financeiros, métodos Pix/cartão, verificação de assinatura, reconciliação e regras de crédito único. Não requer migração SQL, troca de credenciais ou mudança do webhook. Serviços futuros devem consumir esta carteira e integração em vez de criar cópias; sua implementação não é automática.

Os formulários preservam os valores de outro escopo por uma consulta autenticada atual antes da gravação nas RPCs existentes. Isso evita reenviar valores do cache da tela. As RPCs legadas ainda recebem taxa e mínimo juntos: não constitui isolamento de edição simultânea entre administradores; uma futura evolução para atualizações parciais deve manter a validação administrativa e a atomicidade no banco.

## Verificação

Testes de componentes cobrem separação dos campos e preservação dos valores atuais de outro escopo, incluindo o salvamento das credenciais. Os testes financeiros existentes continuam cobrindo autorização, mínimo no servidor e processamento dos pagamentos. A mudança de navegação usa os mesmos menus responsivos existentes.
