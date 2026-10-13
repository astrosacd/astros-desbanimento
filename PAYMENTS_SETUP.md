# Ativação dos pagamentos Astros

> Guia por recurso, com etapas históricas. Para uma nova conta, comece pelo [guia de instalação](docs/INSTALACAO.md). Não repita migrações já aplicadas. Descrições antigas de “ainda não implementado” não são inventário do estado atual; consulte o README e o mapa do projeto.

A implementação no GitHub contém a carteira real, a configuração privada do Mercado Pago e o processamento de pagamentos. Ainda é necessário instalar o SQL e publicar a função no Supabase antes de ativar as recargas.

## 1. SQL
Abra o SQL Editor do projeto `tevljvidqbvrcgzqypwf`, crie uma consulta, copie o conteúdo de `supabase/migrations/20261011_payments.sql` e execute uma vez. O script preserva o saldo existente na coluna `recarga` em reais e adiciona precisão de centavos. Cria tabelas exclusivas da Astros; não altera SMTP, autenticação ou configurações de outras aplicações.

## 2. Função
Crie uma Edge Function com nome exato `astros-payments`. Substitua o conteúdo do editor por `supabase/functions/astros-payments/index.ts` e publique. Desative a opção de verificação JWT legada dessa função: o endpoint valida a sessão do Supabase por conta própria e valida a assinatura dos webhooks. As credenciais internas do Supabase são as variáveis automáticas da função; nunca coloque a service role no navegador.

## 3. Administrador
Acesse `/admin` com uma conta cujo `tipo_usuario` é `admin`. Em Configurações, informe o Access Token do Mercado Pago, a chave secreta de assinatura do webhook, o ambiente e a taxa do serviço. Campos privados vazios mantêm a credencial salva; os valores nunca são devolvidos à interface.

Cadastre somente na aplicação do Mercado Pago usada pela Astros o webhook mostrado no formulário, com evento `payments`. Não substitua URLs de outras aplicações. Salve inicialmente com recargas desativadas. O modo de teste não credita dinheiro no saldo real.

## 4. Verificação
Após configurar as notificações, habilite as recargas e faça um teste. Confira a geração do Pix, copia e cola, link de cartão, confirmação, saldo e histórico. O cliente pode reabrir uma recarga ao retornar do Mercado Pago e usar Verificar pagamento. Um retorno aprovado no navegador nunca é prova de pagamento: o servidor consulta a API oficial antes de alterar o saldo.

Créditos e estornos são transacionais e idempotentes. O valor da recarga é creditado integralmente; eventuais tarifas do Mercado Pago não são descontadas automaticamente do saldo do cliente. O mínimo de recarga é configurável no admin, incluindo a opção sem mínimo definido pela Astros. Pagamentos precisam ter valor positivo e respeitar os limites do meio de pagamento; o limite superior do painel é R$ 10.000.

## Contratação de serviços
A taxa configurada e o débito atômico de saldo estão preparados. A execução atual está integrada ao Baserow, com reserva e compensação/conferência descritas em SUBMISSIONS_SETUP.md. Nunca desconte saldo apenas por clicar no botão ou sem registrar o serviço correspondente.

## Atualização da taxa global e mínimo opcional
Se o SQL inicial já foi executado, rode apenas `supabase/migrations/20261011_payment_prices.sql`. Depois substitua o código da Edge Function `astros-payments` pelo `index.ts` atualizado e publique novamente, mantendo a verificação JWT legada desligada. Os valores públicos não incluem credenciais. As telas dos clientes atualizam a taxa ao abrir e a cada 30 segundos enquanto estiverem visíveis. A contratação efetiva consulta a taxa do admin no servidor, rejeitando alteração de preço entre a exibição e a confirmação.

## Diagnóstico de configuração
Atualize a função existente astros-payments com supabase/astros-payments-configuracao-atualizada.ts. Mensagens P01/P02 indicam incompatibilidade de campos; P03/P04 identificam o campo sem mostrar valores privados. Use ambiente Produção para credenciais de produção, salve inicialmente com recargas desativadas e depois habilite. Não gere credenciais novas apenas por um erro de validação do formulário.

## Cartão integrado ao painel
1. Rode supabase/migrations/20261013_embedded_card.sql.
2. Substitua a função existente astros-payments pelo arquivo completo supabase/astros-payments-cartao-no-painel.ts e publique.
3. Configure a Public Key da mesma aplicação e ambiente do Access Token no admin.
O Pix mantém a integração atual. Novas recargas de cartão usam Card Payment Brick; recargas antigas por link continuam consultáveis. Valor, conta, e-mail e referência vêm do servidor. Somente token temporário e identificação necessária são enviados ao backend: número de cartão e CVV não são armazenados. Cada recarga possui uma tentativa imutável com fingerprint, idempotência por UUID e crédito transacional existente. Respostas incertas devem ser consultadas; não gerar nova recarga para repetir um pagamento sem antes esclarecer sua situação. Pagamentos recusados podem ser refeitos criando outra recarga após a confirmação da recusa. Quando o banco exigir autenticação 3DS, o Status Screen Brick apresenta o desafio de confirmação dentro do painel.
