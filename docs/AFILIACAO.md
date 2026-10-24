# Afiliação direta — Astros Mais

Implementação aditiva, desligada na primeira instalação. Não cria uma segunda carteira, não altera credenciais de pagamentos e não gera comissões retroativas. A publicação do código não instala SQL nem funções no Supabase.

## Regras

- A indica B, B indica C: A recebe pelas recargas de B; B pelas de C. Não há comissão de segundo nível nem saque: o crédito usa a carteira compartilhada dos serviços.
- Qualquer conta confirmada pode obter seu código em **Indique e ganhe**. A captura vale apenas na criação de uma nova conta. O primeiro código válido recebido naquele navegador/origem fica em cookie HttpOnly por 30 dias. Login, edição de metadados e importação legada não vinculam contas antigas. O mesmo usuário não pode se indicar.
- O cadastro continua passando pelo CAPTCHA e limite por IP existentes. Código de indicação não dispensa confirmação de e-mail nem autoriza operações administrativas.
- A porcentagem global fica em **Admin → Gestão geral → Afiliação**. Em **Gestão de contas → Gerenciar conta → Afiliação**, a porcentagem individual pertence ao afiliado que recebe: desmarcada herda a global; marcada com 0% suspende ganhos dessa conta em novas recargas.
- Mínimo e máximo são limites do valor integral da recarga elegível, não limites de saque ou da comissão. Mínimo 0 inclui qualquer valor já aceito pelo pagamento; máximo 0 significa sem teto adicional. O mínimo do gateway continua independente.
- Vínculo, taxa e valor ficam congelados na criação da ordem de recarga real. Alterações posteriores não reescrevem ordens antigas. Ordens anteriores à ativação, testes, créditos administrativos, importações, reembolsos de serviços e outras comissões não geram comissão.
- Só o crédito financeiro confirmado no registro da carteira comprova pagamento. Status aprovado sozinho não basta. A rotina separada processa até 20 ordens por execução, normalmente a cada minuto; atrasos e fila podem postergar a comissão, sem reter a recarga original.
- Pedido de reembolso não estorna comissão: o estorno financeiro confirmado é a prova. Reembolso parcial reduz a comissão proporcionalmente; total e chargeback confirmado revertem toda a comissão. Valores em centavos: comissão = piso(valor × taxa / 10000); estorno = comissão original menos piso(valor restante × taxa / 10000). Repetições não duplicam movimentos. Reversões são monotônicas: uma aprovação atrasada não restaura comissão estornada.
- Se o reembolso chega antes da primeira conferência, crédito e estorno podem aparecer juntos no histórico. São escritos na mesma transação, sem disponibilizar saldo intermediário para compras.

## Saldo e explicações

O saldo líquido real continua na coluna existente `recarga`, inclusive negativo após um estorno de valor já utilizado. Nenhum guardião de compra é substituído por saldo de navegador. A carteira e a área de afiliação exibem separadamente **saldo disponível = máximo(líquido, 0)** e **ajuste pendente = máximo(-líquido, 0)**.

Exemplo: ganhou R$ 10, usou R$ 8, e a recarga indicada foi totalmente reembolsada. Disponível R$ 0; ajuste R$ 8. Um próximo crédito de R$ 20 compensa R$ 8 e deixa R$ 12 disponíveis. Não há taxa ou cobrança adicional. A estimativa antes de gerar a recarga é conferida novamente no crédito real.

O histórico do cliente mostra data em Brasília, comissão, taxa, recarga, estorno, UUID da ordem e identificação protegida do indicado, sem seu e-mail ou telefone. Registra também créditos que compensam um déficit depois de estornos de afiliação; a descrição é genérica porque o crédito pode vir de recarga, comissão ou outro ajuste da carteira. Déficits do sistema anterior continuam possíveis e não são todos atribuídos à afiliação.

Admin pode consultar o mesmo histórico por conta. Mudanças globais/individuais têm auditoria privada. O financeiro distingue comissão concedida/estornada/líquida dos recebimentos em dinheiro e do consumo dos serviços. Não há contagem de cliques ou visitas nesta versão: os números são cadastros vinculados e indicados com comissão concedida.

## Segurança e operação

As tabelas não permitem leitura/escrita direta de `anon` ou `authenticated`. RPCs autenticadas derivam o ator de `auth.uid()` e validam acesso confirmado e senha temporária; consultar outra conta/configurar regras exige admin no servidor e no SQL. Comissão é service-only, bloqueia a ordem e a carteira e escreve saldo, movimento e evento atomicamente. Não usa porcentagem nem identidade fornecida pelo navegador.

O worker aceita somente segredo dedicado privado ou token de administrador validado por Auth e SQL. Segredo é criado no banco, não publicado ao cliente nem copiado para o git. **Verify JWT OFF somente em astros-affiliates**, pois o cron usa o segredo; a validação própria continua obrigatória. A falha de uma ordem é isolada, fica sanitizada com retentativa crescente até 30 minutos e não impede as demais. A tela mostra última execução, pendências e erros; heartbeat recente não prova que todas as pendências foram processadas.

A pausa impede novas atribuições e novas ordens elegíveis e adia concessões ainda não feitas. Ordens previamente elegíveis preservam a taxa e podem ser processadas quando retomar. **Estornos de comissões já concedidas continuam mesmo pausado.** Não desligue o cron nem remova a função para pausar o programa. Uma interrupção do worker atrasa concessões e estornos; acompanhar heartbeat/fila continua necessário.

## Instalação guiada, uma etapa por vez

Este roteiro é para o responsável técnico. Ao orientar o proprietário, enviar somente uma etapa e aguardar sua confirmação antes de enviar a próxima. Não colar vários scripts juntos.

1. Supabase → SQL Editor → New query: executar integralmente `supabase/migrations/20261024_affiliates.sql`. Cria tabelas, funções e gatilhos, inicialmente desligado. Não modifica saldos existentes nem vincula contas antigas. Reaplicar preserva configurações, códigos e históricos.
2. Nova consulta: executar integralmente `supabase/migrations/20261024_affiliates_finance.sql`. Mantém o relatório financeiro atual e adiciona classificação de comissões. Se reinstalar versões antigas do relatório, reaplicar esta por último.
3. Criar Edge Function **astros-affiliates**, substituir pelo conteúdo integral de `supabase/astros-affiliates.deploy.ts`, publicar e desligar **Verify JWT with legacy secret** somente nela. Usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já fornecidas pelo Supabase; não requer chave de fornecedor nem nova variável de segredo.
4. Atualizar **astros-auth-email** com o conteúdo integral de `supabase/astros-auth-email.deploy.ts`, preservando todos os segredos e o modo Verify JWT que ela já usa. Isso transporta o código também no cadastro com e-mail privado sem remover a prova CAPTCHA.
5. Publicar no Lovable; depois atualizar a imagem da VPS/Portainer conforme a versão gerada no GitHub. Conferir login, carteira e telas admin enquanto o programa está desligado. Não sobrescrever variáveis/volumes do serviço.
6. Nova consulta: executar integralmente `supabase/migrations/20261024_affiliates_schedule.sql`. Instala somente o cron `astros-affiliate-worker`, a cada minuto, e faz a primeira chamada. Não altera cron de outros módulos. Requer pg_net/pg_cron disponíveis como os outros agendamentos do projeto.
7. No admin, conferir execução recente e ausência de erros. Definir porcentagem e limites desejados. A ativação exige heartbeat dos últimos cinco minutos. Só então ativar o programa; os valores comerciais são decisão do proprietário, não presumir 10% em produção.
8. Validação ao vivo feita pelo proprietário: cadastro novo através do link, confirmação de e-mail e uma recarga controlada; conferir carteira do pagante, histórico/comissão do afiliado e relatório. Eventual teste de reembolso deve ser solicitado conscientemente pelo proprietário, nunca executado como compra/reembolso automático de verificação. Dados e dinheiro reais não foram usados nos testes locais.

Consulta de instalação, sem revelar segredos:

```sql
select enabled as afiliacao_ativa, rate_bps / 100.0 as comissao_global_percentual,
       worker_at as ultima_execucao,
       (select count(*) from public.astros_affiliate_commissions where pending) as pendentes,
       (select count(*) from public.astros_affiliate_commissions where last_error_at is not null) as com_erro
from public.astros_affiliate_settings where id;
```

Contingência: desmarcar ativação no admin, manter SQL, Edge e cron para os estornos e históricos. Não apagar movimentos nem converter manualmente saldos negativos em zero. Antes de remover infraestrutura, conciliar todas as comissões e possíveis reembolsos. A versão separada e os scripts não substituem backup/restauração do Supabase.

## Verificação local

- `node scripts/check-affiliates-sql.mjs`: PGlite com pgcrypto, funções reais de pagamento/cadastro/afiliação/financeiro. Verifica cadastro direto, CAPTCHA, isolamento de acesso, taxa congelada, 0 versus global, min/max, testes excluídos, pagamento sem crédito, crédito real, repetição, reembolsos, pausa, comissão utilizada, compensação e reinstalação.
- `npx vitest run src/features/affiliates src/features/auth src/features/payments src/features/clients src/features/finance src/features/panel-address/email.test.ts`: regras, autorização, transporte de indicação, carteira, renderização e worker simulado sem chamadas a fornecedores.
- `npx tsc --noEmit`, `npm run build:dev` e `ASTROS_DEPLOY_TARGET=vps npm run build`: tipos e compilações para os dois ambientes.
- Regenerar cópias completas de Edge após alterações: `node scripts/build-affiliates-deploy.mjs`. O script de cadastro existente continua compatível.

Os testes locais não comprovam entrega real de e-mail, execução do cron hospedado, comportamento visual em todos os aparelhos nem todos os cenários de concorrência de uma instância Postgres em produção. A conferência após instalação continua necessária.
