# Status dos serviços

Página local em `/status`, sem sessão de cliente ou admin. A integração externa opcional usa https://astros-mais.betteruptime.com (ver instalação adicional abaixo). Endereço de contingência anterior: https://desbanimento-de-numeros.lovable.app/status. Deve ser publicado no Lovable antes de usar como contingência. A mesma rota na VPS depende da disponibilidade da VPS; os dois hosts compartilham o monitor Supabase, mas não o processo web.

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
- O monitor e a página local funcionam sem a ponte opcional do Better Stack. Se o Supabase falhar, a página local mostra que não conseguiu confirmar o status. A página externa mantém sua última publicação; consulte as limitações da integração adicional abaixo.

## Verificação local

Testes de modelo e worker em `src/features/service-status/*.test.ts`; integração SQL em `scripts/check-service-status.cjs` com PGlite opcional instalado no ambiente de desenvolvimento. O teste SQL usa papéis e tabelas mínimas sintéticas e não acessa banco real. Builds Cloudflare e VPS separados.

Validação em 22/10/2026: 18 testes passaram (modelo, endpoints somente leitura, autorização administrativa, publicação/remoção de avisos e roteamento), TypeScript sem erros, integração SQL local passou, builds Cloudflare e VPS passaram. Chromium local conferiu `/status` sem login em 320, 375, 430, 667, 768, 850, 1024 e 1440 px sem overflow; o cenário de falha do monitor não mostrou status verde. Nenhuma compra, alteração de saldo, chamada real a fornecedor ou instalação no Supabase de produção foi realizada por essa validação.

## Better Stack (integração opcional, 23/10/2026)

A página externa configurada pelo proprietário é **https://astros-mais.betteruptime.com**, ID `268731`. Os sete componentes foram cadastrados manualmente como `ManuallyTrackedItem`; a integração reutiliza seus nomes exatos e nunca cria/remove recursos ou modifica monitores existentes. O monitor técnico continua no Supabase, fora da VPS. O Better Stack hospeda a página pública e seu histórico. A rota local `/status` permanece como prévia/fallback com o desenho próprio; o Better Stack usa seu próprio layout, com personalização conforme o plano contratado.

### Instalação adicional

1. Guardar o token de Incidents API da equipe em **Supabase → Edge Functions → Secrets → `ASTROS_BETTERSTACK_API_TOKEN`**. Não colar no SQL, repositório ou chat. O proprietário já realizou este passo.
2. Executar `supabase/migrations/20261023_betterstack_status.sql`. É aditivo/reaplicável, preserva os componentes, avisos, segredos e cron existentes. Cria somente estado privado de sincronização e amplia o timeout HTTP do próprio `astros_status_tick`; não cria outro cron.
3. Atualizar a função existente **astros-status** com o arquivo inteiro `supabase/astros-status.deploy.ts`, mantendo Verify JWT desativado somente nela. O deploy é autocontido; não precisa criar arquivo adicional no editor do Supabase. Gerar esse arquivo com `node scripts/build-status-deploy.mjs` após alterações em index.ts ou betterstack.ts.
4. Esperar a próxima execução (até dois minutos) e conferir a página Better Stack. Validar sete recursos e um aviso/retorno ao automático controlado no admin. A integração só é considerada confirmada depois de observar os resultados reais.
5. Integrar/publicar a interface no Lovable. Ela altera o link de status para Better Stack e mostra diagnóstico/última confirmação da sincronização no admin. Atualizar a imagem da VPS pelo processo habitual; não há implantação automática na VPS.

### Regras de sincronização

- A chave é enviada somente no header Bearer do host fixo `incidents.betterstack.com`. Nunca segue redirects ou recebe página/URL/IDs arbitrários do navegador. A página precisa ter o ID/subdomínio esperados; os sete recursos precisam ser únicos, do tipo manual e com os nomes previamente cadastrados. Um vínculo salvo não é trocado silenciosamente após recriar um recurso.
- Primeiro conclui os checks locais; depois sincroniza a projeção pública efetiva, já com a prioridade manutenção global → aviso manual → automático. Erro no Better Stack não descarta os checks locais nem altera operações ou carteira.
- A sincronização tem lease próprio de quatro minutos, intervalo mínimo de um minuto, checkpoint privado por serviço e diagnóstico sem respostas brutas, credenciais ou dados de clientes.
- `operational` corresponde a `resolved`, `degraded` a `degraded`, `unavailable` a `downtime`; `unknown` corresponde a `degraded` com mensagem explícita de que não foi possível confirmar a disponibilidade. O relatório manual da API não oferece um estado equivalente a `unknown`; nunca converter ausência de confirmação em verde.
- Manutenção usa o tipo nativo `maintenance`. Quando há prazo manual, ele é enviado ao Better Stack. Manutenção sem prazo usa janela renovável de 90 dias (a API exige fim); retorno ao automático encerra o relatório na próxima sincronização. Mudanças de tipo encerram somente o relatório criado por esta integração e abrem outro conforme necessário. Avisos salvos diretamente no Better Stack não são apagados pela integração e podem afetar o estado final da página.
- Cada criação é registrada como pendente antes do POST. Se a resposta se perder, procura o relatório por título salvo, página, tipo e recurso exatos antes de associá-lo. Não repete uma criação incerta automaticamente. Se o relatório não puder ser confirmado ou houver ambiguidade, aparece `awaiting_confirmation`; exige investigação antes de liberar uma nova tentativa. Rejeições HTTP inequívocas permitem nova tentativa após correção.
- Alterações de status são comparadas com o relatório remoto; verificações idênticas não criam atualizações repetidas. Serviços inicialmente saudáveis não recebem incidentes sintéticos. O histórico anterior à integração não deve ser apresentado como medição realizada por ela.
- Todos os POSTs de relatório/atualização enviam `notify_subscribers:false`; esta integração não envia e-mails ou mensagens a assinantes. Não escreve assinantes, configurações de cobrança, monitores, fornecedores ou operações da aplicação.
- A página externa continua acessível se a VPS cair, mas os dados automáticos dependem do Supabase e da comunicação com o Better Stack. Se o Supabase parar completamente, o Better Stack mantém a última informação publicada; esta ponte não substitui um monitor independente do próprio monitoramento.
- O monitor SMS agora usa o mesmo multipart FormData do fluxo SMSPool existente e os mesmos limites de espera de consulta (SMSPool 20 s, 5SIM 15 s). Não modifica astros-sms nem compras; o diagnóstico anterior de erro de conexão precisa ser revalidado após o deploy, sem concluir que todo fornecedor caiu.

Referências oficiais: [autenticação da API](https://betterstack.com/docs/uptime/api/getting-started-with-uptime-api/), [recursos](https://betterstack.com/docs/uptime/api/list-existing-resources-of-a-status-page/), [relatórios](https://betterstack.com/docs/uptime/api/create-a-new-status-page-report/), [atualizações](https://betterstack.com/docs/uptime/api/create-a-new-status-update/), [manutenção](https://betterstack.com/docs/uptime/api/update-an-existing-status-page-report/).

Testes adicionais: `src/features/service-status/betterstack.test.ts` cobre mapeamento, perda de resposta, deduplicação, ausência de confirmação, manutenção, recuperação, mensagens manuais, segredo ausente e notificações desativadas. `node scripts/check-betterstack-status.cjs` verifica SQL/RLS, leases, checkpoint, reaplicação e projeções privadas com PGlite opcional de desenvolvimento, sem banco real.
