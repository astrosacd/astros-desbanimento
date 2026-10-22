# Status dos serviços

Página pública em `/status`, sem sessão de cliente ou admin. Endereço de contingência: https://desbanimento-de-numeros.lovable.app/status. Deve ser publicado no Lovable antes de usar como contingência. A mesma rota na VPS depende da disponibilidade da VPS; os dois hosts compartilham o monitor Supabase, mas não o processo web.

## Instalação em etapas

1. Executar somente `supabase/migrations/20261022_service_status.sql` no SQL Editor. É aditivo e reaplicável; preserva configurações e controles existentes.
2. Criar a Edge Function **astros-status**, colar `supabase/astros-status.deploy.ts`, desativar **Verify JWT** apenas nesta função e publicar. Usa as variáveis internas `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. O segredo de Baserow já usado na aplicação, `ASTROS_BASEROW_WRITE_TOKEN`, precisa estar disponível também para esta função. Não colocar chaves no navegador, git ou chat.
3. Executar separadamente `supabase/migrations/20261022_service_status_schedule.sql`. Cria somente o cron `astros-status-monitor`, a cada dois minutos, e dispara a primeira verificação. A chave exclusiva do monitor é gerada no banco; não exige copiar segredos manualmente.
4. Integrar a interface e publicar primeiro no Lovable. Verificar `/status` anonimamente, editar um aviso no admin e retomar automático. Depois publicar a imagem da VPS pelo processo habitual, sem implantação automática. O item Painel ficará sem confirmação/instável até a VPS publicar o novo `/status-health`.
5. Validar resultados reais: conexões, workers, módulos pausados, falha de leitura e manutenção manual com prazo. A validação local usa respostas sintéticas; não confirma fornecedores em produção.

## Comportamento

- Componentes: painel, autenticação, desbanimento, SMS, redes sociais, Maps e CNPJ.
- Prioridade: manutenção global do controle de módulos → aviso manual ativo → resultado automático. Restrição individual de cliente não é publicada.
- Aviso manual pode expirar após 1, 2, 4 ou 24 horas ou durar até remoção. O banco usa seu próprio relógio. Retomar automático não reativa módulos nem altera configurações de fornecedores.
- Um erro técnico gera instabilidade; três verificações consecutivas falhas indicam indisponibilidade. São necessárias duas confirmações consecutivas para recuperar após falha. Sem configuração ou serviço pausado: sem confirmação. Mais de dez minutos sem verificação: sem confirmação, inclusive no navegador se o JSON ficar velho.
- Checks: marcador JSON HTTPS na VPS, configurações públicas de Auth, schema Baserow e heartbeat de desbanimento, saldo/perfil do fornecedor SMS selecionado e heartbeat, saldo SMMRaja e heartbeat, Account API SerpApi e heartbeat, saldo Casa dos Dados. Nunca chama compra, envio, busca de empresas, enriquecimento ou alterações de pedidos/carteira. Estoque de um serviço/país, preço/FX e qualidade da entrega não são garantidos por estas consultas.
- Sem troca automática de fornecedor SMS. Somente o fornecedor selecionado é consultado para a disponibilidade geral de novas ativações. Pedidos existentes continuam com o fornecedor original.
- Saldo zero/capacidade zero é falha técnica de capacidade; valores de saldo nunca são públicos. Limites diários/por hora e estoque específico continuam protegidos pelos módulos operacionais.
- A consulta pública não inicia monitoramento. POST exige segredo dedicado, comparação por hash, lease de 90 segundos e intervalo mínimo de um minuto. Um lote pode finalizar uma única vez, sempre com horário do banco.
- Tabelas privadas com RLS e sem leitura anon/authenticated; somente projeção sanitizada via Edge. RPCs administrativos verificam `astros_is_admin`; servidor também exige `requireAdmin` e Auth confirmado. Histórico público limitado às últimas 40 atualizações de 30 dias. Mensagens escritas no admin são públicas e renderizadas como texto; nunca incluir dados pessoais ou segredos.
- Sem dependência de Better Stack, assinatura paga, e-mail ou notificações a terceiros. Dependência compartilhada remanescente: projeto Supabase. Se ele falhar, a página mostra que não conseguiu confirmar o status.

## Verificação local

Testes de modelo e worker em `src/features/service-status/*.test.ts`; integração SQL em `scripts/check-service-status.cjs` com PGlite opcional instalado no ambiente de desenvolvimento. O teste SQL usa papéis e tabelas mínimas sintéticas e não acessa banco real. Builds Cloudflare e VPS separados.

Validação em 22/10/2026: 18 testes passaram (modelo, endpoints somente leitura, autorização administrativa, publicação/remoção de avisos e roteamento), TypeScript sem erros, integração SQL local passou, builds Cloudflare e VPS passaram. Chromium local conferiu `/status` sem login em 320, 375, 430, 667, 768, 850, 1024 e 1440 px sem overflow; o cenário de falha do monitor não mostrou status verde. Nenhuma compra, alteração de saldo, chamada real a fornecedor ou instalação no Supabase de produção foi realizada por essa validação.
