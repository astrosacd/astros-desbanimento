# Instalação em outra conta

Este guia organiza a replicação. Não é um instalador automático e não deve ser executado na produção atual. Os SQLs existentes foram escritos para uma tabela de perfis previamente criada; o repositório ainda não contém uma migração inicial independente para um banco totalmente vazio. Uma nova instalação exige preparar e validar essa base antes dos SQLs incrementais.

## 1. Preparar ambiente independente

Copie/fork o repositório, conecte-o ao novo projeto Lovable e crie um Supabase separado. Defina domínio, conta administrativa, Baserow de destino, aplicação Mercado Pago e caixa Chatwoot. Usar o mesmo Supabase preserva identidades compartilhadas: trocar a senha de uma conta pode afetar outras aplicações que usam essa identidade. Uma cópia independente deve ter banco e credenciais próprios.

## 2. Preparar tabela de perfis

A tabela public.painel_de_desbanimento deve existir antes de 20261011_admin_access.sql. Ela precisa de id UUID, tipo_usuario, nome, email, cpfcnpj, whatsapp, data_do_cadastro, ultimo_login, senha_hash e recarga. Confira tipos, nulabilidade e restrições contra os SQLs; recarga é numérica em reais e id deve corresponder ao Auth. senha_hash não é usada para autenticar: senhas pertencem ao Supabase Auth.

Não copie uma tabela contendo UUIDs de usuários antigos para outro Auth como se fossem novas contas. Prepare o esquema vazio ou planeje migração de identidades separadamente. Este guia não fornece nem executa um SQL improvisado de criação dessa base.

## 3. Revisar referências específicas da instalação

Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_ANON_KEY) no servidor. Isso não substitui todos os endereços fixos existentes no código.

Antes de publicar a cópia, procure as referências atuais:

```bash
rg -n 'tevljvidqbvrcgzqypwf|baserow.astroscomunicacaodigital.com|table/511|field_47|field_48|desbanimento-de-numeros' .
```

Pontos conhecidos: src/features/submissions/transport.server.ts; documentação da API; consultas em src/features/numbers; BASE/PATH e campos da função astros-submit-number; cron em 20261012_reconciliation_schedule.sql. Os IDs dos campos e opções de status pertencem ao Baserow atual: outra tabela pode ter IDs diferentes. Revise também as funções de reconciliação e os testes correspondentes. Não basta mudar a URL pública do Supabase.

## 4. Aplicar migrações revisadas

Use os arquivos de supabase/migrations, respeitando as dependências abaixo. Registre cada SQL aplicado. Alguns criam constraints/triggers sem proteção para execução repetida; não rode todos novamente na produção.

| Etapa | Ordem dentro do grupo |
|---|---|
| Perfis | admin_access → client_signup → profile_edit |
| E-mail exclusivo | custom_email_limits, após perfis |
| Carteira | payments → payment_prices |
| Comunicados | notices_and_price_save → notice_images → notice_history → delete_notice |
| Solicitações | submit_numbers → international_numbers → auto_reconciliation → reconciliation_schedule |
| Países | custom_countries → unique_ddis |
| Suporte | support_chat → support_chat_api |
| Complementos administrativos | admin_last_login; manual_wallet_credit → manual_wallet_credit_admin_accounts → manual_wallet_reversal |
| Cartão | embedded_card, após pagamentos |
| Faixa | overview_banner → overview_banner_history |
| API | client_api → api_logs, após perfis e solicitações |
| Contingência de senha | admin_password_reset, após perfis e client_api; seguir SENHA_MANUAL.md |

Cada nome corresponde ao sufixo de um arquivo datado. Confira o SQL inteiro e seus pré-requisitos; a lista não substitui a revisão do esquema inicial. O cron precisa da URL e da chave pública da nova instalação e das extensões necessárias descritas no próprio SQL. Não copie o segredo do worker atual.

## 5. Publicar funções e configurar secrets

| Função | Fonte/guia |
|---|---|
| astros-admin-password | supabase/functions/astros-admin-password/index.ts; SENHA_MANUAL.md |
| astros-auth-email | supabase/functions/astros-auth-email/index.ts; GMAIL_SETUP.md |
| astros-payments | supabase/functions/astros-payments/index.ts; ../PAYMENTS_SETUP.md |
| astros-submit-number | supabase/functions/astros-submit-number; ../SUBMISSIONS_SETUP.md e ../API_SETUP.md |
| astros-support-identity | supabase/functions/astros-support-identity; ../SUPPORT_SETUP.md |

Para colar a função de envio no editor, use uma cópia completa gerada pelo script, como supabase/astros-submit-number-com-api.ts. Se adaptar fonte ou destinos, regenere as cópias com `python scripts/generate-submission-deploy.py` antes de implantá-las. Não use arquivos antigos de etapas anteriores como se fossem a última versão.

As funções recebem SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do ambiente Supabase. Nunca exponha service_role na aplicação pública. A configuração de Verify JWT é específica por função: siga o guia de cada uma; o código implementa as verificações internas de sessão, API, webhook ou segredo correspondentes.

Secrets de e-mail: ASTROS_GMAIL_USER, ASTROS_GMAIL_APP_PASSWORD, ASTROS_APP_URL e ASTROS_EMAIL_INTERNAL_SECRET; no servidor, o mesmo segredo e ASTROS_CUSTOM_EMAIL_ENABLED=true somente após configurar a função. Baserow: token de escrita ASTROS_BASEROW_WRITE_TOKEN; no servidor da aplicação, BASEROW_API_TOKEN é o token privado de leitura. Worker: ASTROS_RECONCILE_SECRET correspondente ao Vault/cron da nova instalação.

Credenciais Mercado Pago e Chatwoot são configuradas na área administrativa, conforme os guias específicos. Use novos valores para a instalação independente. Configure o webhook no novo endpoint e o domínio correto nos links de e-mail. Preserve configurações de outras aplicações.

## 6. Criar administrador e configurar recursos

Cadastre uma conta, confirme o e-mail e promova seu UUID para admin conforme ADMIN_SETUP.md. Configure taxa, mínimo, pagamentos, suporte e comunicados. API começa bloqueada e só é liberada por admin. Não copie chaves de clientes da instalação antiga.

## 7. Validar antes de liberar

Teste login, cliente bloqueado no admin, confirmação, recuperação, perfil, ausência de números, consulta restrita ao titular e histórico. Confira Pix/cartão e crédito único somente após confirmação; teste novo envio pago, reenvio gratuito e repetição do UUID sem nova cobrança. Confira heartbeat/recibo/conferência, suporte associado ao contato e logs de uma chamada real da API. No n8n, desafixe pinData para executar chamadas reais.

`npm test` e `npm run build` verificam o código local. Não comprovam conectividade externa. Testes reais podem enviar e-mails, gravar números ou movimentar valores: faça-os deliberadamente em contas de teste apropriadas. Só publique a cópia após essas verificações.

## Limite atual

A replicação é possível com adaptação e instalação assistida. Para ser uma instalação totalmente automática, ainda faltam uma base inicial de banco validada, parametrização central de destinos/IDs e um ensaio completo em ambiente novo. Nenhuma dessas mudanças de código foi feita nesta organização documental.
