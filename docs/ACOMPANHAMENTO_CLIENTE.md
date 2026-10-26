# Acompanhamento, notificações, extrato e ajuda

Melhoria incremental do painel do cliente. Não altera preços, cobranças, pagamentos, fornecedores, filas ou funções operacionais.

## O que muda

- **Prospecção:** anotação de até 2.000 caracteres e data de retorno por lead próprio, tanto Maps quanto CNPJ. A aba **Retornos** mostra hoje, atrasados e próximos sete dias, no horário de Brasília (America/Fortaleza). Até 100 retornos por filtro, com o total explicitado. Marcar o retorno como concluído o retira da agenda; a anotação continua nos detalhes do lead. Remover a data mantém apenas a anotação. Não envia mensagens, e-mails ou notificações ao navegador.
- **Sino:** mantém os comunicados e a abertura automática do último comunicado, acrescentando **Minhas atividades**. Mostra até 50 registros recentes dos últimos 30 dias e um contador de não lidas dentro dessa janela. Marcação de leitura é salva por conta e funciona entre dispositivos. Nenhuma mensagem é enviada a terceiros.
- **Carteira:** exporta o extrato real de movimentações para CSV, separado por ponto e vírgula, UTF-8 com BOM. Período máximo de 366 dias e 5.000 linhas por arquivo. Acima disso recusa a exportação e pede período menor, sem truncar silenciosamente. Os lançamentos assinados, datas em Brasília e referências internas das movimentações são preservados. Não contém pagamentos ainda sem lançamento de saldo, credenciais, códigos SMS ou IDs dos fornecedores. Não calcula saldo de abertura/fechamento nem altera o saldo atual.
- **Ajuda rápida:** seção recolhível em Google Maps/CNPJ, SMS, redes sociais, envio de números e carteira, sem consultas externas.

## Sem interferir nas operações existentes

As tabelas novas `astros_lead_followups` e `astros_activity_reads` são isoladas e têm RLS e acesso direto revogado. RPCs autenticadas derivam o titular de `auth.uid()` e exigem conta confirmada, não banida e sem troca obrigatória pendente. Não aceitam um proprietário informado pelo cliente. Não existem gatilhos sobre tabelas de compras, funções de webhook, cron novo ou mudanças em reservas de cota.

O vínculo Maps/CNPJ é validado na leitura e no salvamento; UUIDs iguais em modalidades distintas não colidem. O salvamento bloqueia a linha, usa versão para evitar perda entre abas e recupera uma repetição com conteúdo idêntico sem incrementar duas vezes. Ler um lead não cria uma anotação. Anotações são texto puro; não há HTML executável.

A central é uma visão dos resultados atualmente registrados (envios, SMS, redes sociais, pesquisas e movimentos de crédito/ajuste). Não é um histórico de cada transição intermediária nem faz nova verificação no fornecedor. “Solicitação de número enviada” confirma o envio, não o resultado da análise na Meta. Marcar como lido não altera os pedidos. Pode haver um evento de devolução do pedido e outro do lançamento correspondente; representam registros distintos.

Os registros de leitura com mais de 60 dias são removidos apenas quando o próprio titular marca atividades. Nenhuma limpeza de histórico operacional ou financeiro é executada. Não há alerta push, WhatsApp ou e-mail nesta implementação.

## Instalação, um passo por vez

1. Supabase SQL Editor: executar integralmente **`supabase/migrations/20261026_client_workspace.sql`**. É transacional e pode ser reaplicado preservando anotações e leituras. Exige os módulos Maps, CNPJ, SMS, redes sociais e carteira já instalados.
2. Após sucesso, sincronizar e publicar no Lovable.
3. Conferir com conta própria: anotar um lead, marcar retorno para hoje, localizar em Retornos, concluir e reabrir a anotação. Conferir também um lead CNPJ.
4. Abrir o sino, consultar atividades, marcar uma como lida e abrir Comunicados. Conferir em outra sessão da mesma conta e verificar isolamento usando outra conta de teste autorizada.
5. Baixar um extrato de um período conhecido e comparar os lançamentos, inclusive negativos. Um período sem movimentos exibe mensagem e não baixa arquivo vazio.
6. Depois da conferência, usar a imagem do commit correspondente na VPS. Não usar `latest` como referência imutável.

**Não é necessário atualizar nenhuma Edge Function, alterar JWT, secrets ou cron.** Antes do SQL, as novas áreas ficam indisponíveis de forma isolada; o restante do painel continua utilizável. Erros de leitura nunca são apresentados como gravações bem-sucedidas.

Se necessário voltar à interface anterior, publicar o commit/imagem anterior. Manter as tabelas e RPCs adicionais instaladas preserva anotações e leituras, sem efeito nas compras. Não apagar dados para desfazer a publicação.

## Validação local

- Testes TypeScript/Vitest de identidade no servidor, degradação sem SQL, CSV seguro e períodos, conflito de edição, agenda e leitura compartilhada do sino.
- `scripts/check-client-workspace.cjs` executa verificações em PostgreSQL local PGlite: instalar e reaplicar, autorização/RLS, outras contas, fonte Maps/CNPJ, nota longa, datas, conflito/repetição, conclusão, marcação idempotente, janela do extrato, recusa acima de 5.000 linhas e preservação de saldo/snapshot/etapa.
- Usar uma instalação local de `@electric-sql/pglite` ou informar `PGLITE_MODULE` com o caminho do módulo ao executar o script na raiz do repositório. Nunca apontar os testes ao banco de produção.
- Build Lovable e build VPS devem passar antes da publicação. Os testes locais não representam testes ao vivo de fornecedores ou compras.
