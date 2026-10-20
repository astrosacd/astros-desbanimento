# PWA — Astros Mais

O mesmo painel pode ser instalado pelo navegador. A conta, carteira compartilhada, permissões e integrações permanecem as existentes. Não é uma segunda aplicação nem publicação em lojas. Requer HTTPS; localhost é usado somente para testes. Registro do worker e promoção de instalação são habilitados em builds de produção, não no editor em desenvolvimento.

## Instalação

“Instalar Astros Mais” aparece na tela de login e nos menus cliente/admin quando o recurso está habilitado, o navegador possui suporte e a janela não está no modo instalado. A caixa explica a instalação; não abre automaticamente. Em navegadores que oferecem `beforeinstallprompt`, “Instalar agora” usa esse evento somente após clique. A decisão pertence ao navegador/usuário. No iPhone/iPad, orientar Safari → Compartilhar → Adicionar à Tela de Início. Outros navegadores podem oferecer a instalação pelo menu ou barra de endereço. Em navegadores internos de outros aplicativos, abrir o site diretamente no navegador. Não há confirmação fictícia: o evento appinstalled ou display-mode identifica a instalação nesta sessão. Se o navegador não informar a instalação, o atalho de ajuda pode continuar disponível.

Manifesto com URLs relativas, id/start_url/scope `/`, display standalone e ícones PNG 192/512, maskable 512 e Apple 180. Arte derivada do símbolo existente em public/brand, sem redesenho. Reprodução dos arquivos de imagem e offline: `python3 scripts/generate-pwa-assets.py` (Pillow apenas para gerar os assets, não em produção).

Cada origem é independente: instale/divulgue preferencialmente https://mais.astroscomunicacaodigital.com. A instalação pelo Lovable usa essa origem e permanece uma contingência separada. Instalar no Lovable não transforma o ícone em um app da VPS. Atualizar a imagem da VPS continua sendo manual após validar no Lovable. Login pode ser solicitado no contexto instalado, conforme o navegador. URLs de recuperação de senha e preferência de domínio continuam seguindo a configuração já existente.

## Rede, cache e atualizações

`public/astros-sw.js` armazena exclusivamente `/pwa/offline.html`, genérico e autocontido, no Cache Storage `astros-mais-pwa-offline-v1`. A página offline incorpora o ícone e CSS, sem scripts externos, dados de conta, parâmetros da URL ou formulários.

Não são armazenados pelo PWA: páginas autenticadas, login, tokens, saldos, respostas do Supabase/API, pagamentos, pedidos, contatos, código da aplicação ou arquivos de fornecedores. O worker só intercepta navegações GET da mesma origem, usando rede sem cache HTTP e fallback genérico em falha de transporte. Respostas HTTP de erro permanecem erros. Mutações, chamadas de servidor/API, recursos e outras origens passam diretamente pelo navegador. Sem filas, background sync, reenvio automático ou recarregamento forçado. O cache em memória da interface e o cache HTTP normal de assets públicos continuam sob as regras existentes; não constituem modo offline de serviços.

Uma tela já aberta avisa quando o navegador informa ausência de conexão. O usuário deve conferir o histórico ao reconectar antes de repetir uma operação. “Tentar novamente” na tela offline recarrega a página atual, não refaz compras ou solicitações. Não há transações offline nem garantia de detectar toda falha de internet pelo evento online/offline.

Uma versão nova do worker pode assumir o controle sem recarregar páginas; como ele não guarda código ou respostas da aplicação, não prende o painel numa versão antiga. Mudança de layout/código continua dependendo da publicação normal de cada hospedagem. Ao alterar o HTML offline, incrementar o sufixo da constante de cache no worker. Atualização usa updateViaCache:none e headers de revalidação para worker/config/manifesto em Nitro (Lovable e VPS).

## Desativar com segurança

1. Alterar apenas `public/pwa/config.json` para `{"enabled":false}`.
2. Publicar no Lovable e, quando desejado, atualizar também a imagem da VPS. Cada hospedagem precisa receber o arquivo; não há configuração remota compartilhada no banco.
3. Preservar `/astros-sw.js`, o leitor de configuração e as rotas públicas de controle no deploy de desativação. Não apagar simplesmente o worker nem voltar apenas a uma imagem anterior ao PWA: browsers com registro existente precisam receber a desativação.

A interface lê a configuração sem cache ao abrir, ao retornar ao foco/reconectar e a cada cinco minutos visível. Ao receber false, remove seu link de manifesto, oculta a instalação, solicita a desativação do worker próprio e remove somente caches com o prefixo reservado `astros-mais-pwa-`. O worker também verifica a configuração em segundo plano durante navegações, sem atrasá-las. Não apaga cookies, localStorage, dados de sessão, outras aplicações ou registros de outros workers. Configuração indisponível oculta a promoção de instalação, sem remover silenciosamente um worker já instalado ou interferir no painel.

Dispositivos precisam voltar à internet/visitar a origem para receber a desativação. Abas já controladas podem manter o worker até uma nova navegação, mas ele deixa de fornecer o fallback após receber o desligamento. Não é possível remover remotamente o ícone instalado; o usuário pode removê-lo nas opções do dispositivo. O navegador pode continuar oferecendo seu próprio atalho de tela inicial mesmo com a promoção desativada. O painel segue funcionando no navegador com a mesma conta e dados.

Reativar: enabled:true e publicar novamente em cada hospedagem desejada. Não exige SQL, chave nova, alterações de saldo ou Edge Function.

## Validação local

Testes cobrem cache restrito à página pública, não interceptação de APIs/mutações, erros HTTP preservados, fallback offline, validação da configuração, isolamento de workers/caches na desativação, estado de instalação, gesto explícito e limpeza de eventos. O teste de navegador utiliza o build Node de produção local, sem contas reais, pagamentos, mensagens ou chamadas a fornecedores. Confere manifesto/headers, registro do worker, cache, instalação guiada em oito dimensões, navegação offline, reconexão e configuração false com preservação de um cache de outra aplicação. Não equivale a instalar fisicamente no Android/iOS, validar Apple Safari ou aprovação em lojas. Testar a instalação física no domínio publicado após o deploy.

Verificação de implementação em 20/10/2026: builds Lovable/Cloudflare e VPS/Node concluídos; TypeScript aprovado; 19 testes específicos de PWA e suíte completa aprovados. O navegador confirmou os headers de controle, manifesto sem erros, worker ativo, um único arquivo público no cache próprio, diálogo entre 320 e 1440 px (incluindo 667×375), fallback offline, reconexão e desativação mantendo cache alheio. A VPS não foi publicada automaticamente.

Para repetir a conferência de navegador: instalar Playwright/Chromium no ambiente de desenvolvimento, gerar o build Node com `ASTROS_DEPLOY_TARGET=vps npm run build` e executar `node scripts/check-pwa-browser.cjs`. `ASTROS_CHROMIUM_PATH` permite informar o executável; `ASTROS_PLAYWRIGHT_MODULE` permite informar o módulo. O teste inicia somente um servidor local em 127.0.0.1:4183 e restaura a configuração do build em finally. Capturas técnicas ficam em /tmp/astros-pwa-review (ou ASTROS_PWA_REVIEW_DIR). Não executá-lo sobre um servidor de produção.
