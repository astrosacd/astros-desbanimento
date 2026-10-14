# VPS e Lovable com os mesmos dados

## Estado
Preparação do código; instalação e teste na VPS ainda pendentes. Não foram alterados DNS, Portainer, secrets nem configurações globais do Supabase por esta preparação.

## Estrutura
- Principal: https://desbanimento.astroscomunicacaodigital.com
- Alternativa: https://desbanimento-de-numeros.lovable.app
- Mesmo Supabase atual, mesmas funções Edge, registros, contas e saldos; nenhum banco novo.
- Sessão separada por endereço: entrar novamente ao trocar de domínio.
- Baserow e Chatwoot continuam dependentes da VPS; o Lovable não substitui esses serviços se a VPS cair.

## Compilar e publicar
O Dockerfile usa o bun.lock e compila com ASTROS_DEPLOY_TARGET=vps. Isso seleciona Nitro node-server somente na compilação VPS; o build padrão do Lovable permanece inalterado. O runtime Node usa usuário sem privilégios e cookies Secure mesmo atrás do Traefik.
GitHub Actions gera uma imagem por commit: ghcr.io/astrosacd/astros-desbanimento:<SHA completo>. O build ocorre no runner, não no servidor de produção. Não injete secrets de produção no build.
Antes de instalar, aguarde Actions concluir e confira se o pacote pode ser baixado pelo servidor. Pacotes GHCR podem começar privados mesmo quando o repositório é público: configure acesso no registro do Portainer ou torne o pacote público somente se isso for adequado ao repositório. Nunca publique uma imagem contendo secrets.
Não foi possível executar Docker neste ambiente; construção completa da imagem deve ser confirmada no Actions antes do deploy.

## Portainer
Crie uma stack separada chamada astros-painel usando deploy/portainer-stack.yml.
Variáveis da stack (preencher somente no Portainer, não enviar no chat):
- ASTROS_IMAGE: imagem do commit confirmado no Actions.
- BASEROW_API_TOKEN: mesmo token de leitura usado na hospedagem Lovable.
- ASTROS_EMAIL_INTERNAL_SECRET: mesmo segredo interno usado pelo servidor Lovable e pela função astros-auth-email. Não é a senha de app Gmail.
Não transfira SMTP, service_role ou credenciais Mercado Pago para essa stack. Elas continuam no Supabase.
Traefik existente: rede externa AstrosNet; websecure; letsencryptresolver. Sem publicar porta adicional no host. Limites iniciais 1 CPU e 768 MiB; medir uso em teste. Atualização start-first pode usar temporariamente duas réplicas durante troca. Logs locais limitados a 3 arquivos de 10 MB.

## E-mails e HTTPS
Após ativar docs/ENDERECO_PRINCIPAL.md, os novos e-mails usam o endereço salvo pelo admin no Supabase. Principal normal: domínio da Astros. Para contingência, entre pelo Lovable e selecione Acesso de contingência no admin. Links antigos não mudam. A senha vale nas duas hospedagens. A mudança não troca DNS nem desliga serviços.
Conferir no Supabase os Redirect URLs exatos de login e reset-password dos dois domínios, preservando as entradas dos outros aplicativos. Não substituir Site URL global, SMTP nem desativar confirmações.
Conferir certificado HTTPS e cookies HttpOnly/Secure na VPS. Não usar iframe para contingência.

## Teste antes de adotar
1. Actions com sucesso e imagem disponível; deploy da stack separado das aplicações existentes.
2. HTTPS no domínio próprio; páginas públicas e login cliente/admin.
3. Mesma identidade e saldo nos dois domínios; cliente impedido de acessar admin.
4. Recuperação e cadastro com uma conta de teste: link Lovable e nova senha válida também na VPS.
5. Consulta de números, suporte e recarga, com teste controlado de pagamento autorizado; nenhuma cobrança automática de teste.
6. Medir CPU, memória e logs; confirmar impacto nas aplicações existentes.

## Atualizar e voltar
Push main sincroniza editor Lovable e dispara construção da imagem. Isso não publica automaticamente o Lovable nem atualiza automaticamente a stack: publicar Lovable e trocar ASTROS_IMAGE na stack para o mesmo commit depois da imagem pronta. Registre o SHA ativo em ambos. Só considerar sincronizado após confirmar os dois deploys.
Para desativar a hospedagem VPS, escale o serviço astros-painel_painel para 0 réplicas no Portainer e use o link Lovable. Não pare Traefik/Baserow/Chatwoot. Para retornar, escale para 1 e teste HTTPS. Manter a stack e variáveis evita reconfiguração. Para reverter código, use o SHA da imagem anterior; não reescreva histórico Git e não reverta SQL financeiro.
Não há troca automática de DNS nem failover automático nesta preparação.
