# Dashboard financeiro administrativo

Menu: Administração → Pagamentos → Dashboard financeiro. Somente administradores: requireAdmin no servidor e astros_is_admin na RPC. Sem segredos financeiros ou consultas disponíveis a clientes.

## Ativação

Executar uma vez `supabase/migrations/20261015_financial_dashboard.sql` no Supabase externo existente. Não muda o Auth, SMTP, credenciais, webhook, saldos, débitos ou histórico. Instala RPC agregada de leitura, índices de datas e um campo de custo estimado nos pedidos SMS. Um trigger preenche esse campo somente em novas compras, usando a mesma cotação salva usada na reserva; não interfere no valor cobrado. Não exige atualizar Edge Functions.

## Critérios

- Recargas recebidas: movimentos de crédito efetivamente gravados, vinculados a um pagamento de produção do Mercado Pago. Data do crédito, não da criação do Pix. Inclui recebimentos posteriormente devolvidos; devoluções de pagamento são exibidas separadamente.
- Consumo por módulo: débitos da carteira menos devoluções ao saldo no período. Pode incluir operações ainda em processamento; valores e quantidades concluídos aparecem separadamente. Uma devolução de pedido antigo pode deixar o consumo do período negativo.
- Créditos manuais e importações ficam separados: não são recebimentos comprovados pelo gateway.
- Saldos: posição atual de todas as contas, inclusive administradores, independente do filtro de datas. Não é fluxo de caixa, receita nem lucro.
- Quantidade, valor concluído e valor em andamento: pedidos criados no período, na situação atual. Não são uma soma adicional às recargas.
- SMS: custo e ganho bruto estimados somente para pedidos com SMS recebido e snapshot de custo. Não usa o câmbio atual para estimar pedidos antigos. Sem snapshot, a venda é contada mas custo e ganho são explicitamente parciais. Não é lucro líquido e não desconta tarifas do recebimento, impostos ou outras despesas. Custo unitário em centavos arredondado para cima, como a consulta administrativa.
- Movimentos sem origem reconhecida geram aviso, não atribuição arbitrária a um módulo.

Datas em America/Fortaleza; máximo 366 dias por consulta. Agregação integral no banco, sem limite de paginação dos históricos. A série inclui dias sem movimento e oferece gráfico e tabela acessível com rolagem local. Sem consultas periódicas: atualizar ou aplicar filtro busca dados novos. Novos módulos precisam de classificação explícita de suas referências financeiras.

## Verificação

`ASTROS_PGLITE_MODULE=/caminho/pglite/dist/index.js node scripts/check-finance-sql.mjs` valida permissões, limites de datas, créditos reais, estornos, créditos manuais, fronteiras de horário, ausência de dupla contagem, snapshot histórico, gráfico sem lacunas e repetição da migração. Testes do servidor verificam autorização e erros sem falsos zeros. Fixtures sintéticas; não efetua pagamentos nem compra números.

## Tentativas SMS devolvidas

Pedidos SMS com situação `refunded` não entram nas vendas concluídas, no custo dessas vendas nem no ganho estimado. O gráfico de participação entre módulos usa valores de vendas concluídas, não débitos brutos. As movimentações reais de débito e devolução continuam no histórico e na evolução diária, identificadas como movimentações de carteira. No mesmo intervalo, uma tentativa de R$ 17,65 debitada e devolvida tem consumo líquido zero; não representa nova receita. Se a devolução ocorrer em outro período, os movimentos seguem suas datas reais. O script de banco inclui esse cenário isolado para verificar vendas, custo e ganho iguais a zero. Esta mudança de apresentação não exige SQL nem nova função.

## Redes sociais
`20261015_social_finance.sql`, incluído no setup do módulo, mantém o mesmo RPC e acrescenta o objeto `social`. Débitos `social:` e devoluções `social-refund:` entram no consumo diário e ficam separados por módulo. Vendas somente de pedidos completed/partial com o valor após a devolução proporcional. Custos usam charge confirmado e FX histórico da compra. O ganho estimado inclui apenas linhas com custo confirmado; sem afirmar lucro líquido. Pedidos devolvidos não somam vendas/custo. A recarga segue sendo entrada única, sem nova receita fictícia ao consumir saldo.
