# Endereço principal compartilhado

## Ativação — executar nesta ordem
1. SQL Editor: supabase/migrations/20261014_panel_address.sql. Cria apenas configuração específica deste painel; preserva o destino Lovable inicialmente. Não muda configurações globais de Auth/SMTP.
2. Auth → URL Configuration: adicionar às Redirect URLs os endereços exatos https://desbanimento.astroscomunicacaodigital.com/login e https://desbanimento.astroscomunicacaodigital.com/reset-password; preservar as entradas atuais do Lovable e outros aplicativos. Não trocar Site URL global.
3. Atualizar a função existente astros-auth-email com supabase/astros-auth-email-endereco-principal.ts. Manter secrets atuais e Verify JWT OFF, pois exige seu segredo interno. Não criar segunda função nem divulgar secrets. A partir disso ASTROS_APP_URL antigo deixa de definir e-mails; destino vem da tabela, sem fallback em erro.
4. Atualizar astros-payments com supabase/astros-payments-cartao-no-painel.ts, mantendo suas configurações anteriores. Só novos checkouts por link usam endereço compartilhado; Pix, cartão embutido, webhooks, crédito e reconciliação preservados.
5. Publicar Lovable. GitHub Actions deve concluir a imagem nova; atualizar somente image/ASTROS_IMAGE da stack VPS para esse SHA, preservando variáveis privadas.
6. Admin → Configurações → Endereço principal do painel → Domínio da Astros → Salvar. Conferir persistência após atualizar a tela nos dois domínios.
7. Teste controlado de recuperação e confirmação: e-mail chega e retorna ao domínio da Astros, nova senha funciona em ambas as hospedagens. Conferir limites de e-mail existentes antes de repetir testes.

## Contingência
Entre pelo endereço https://desbanimento-de-numeros.lovable.app/admin, selecione Acesso de contingência e salve. Novos e-mails/retornos de pagamentos por link usam esse endereço. Depois pode escalar somente astros-painel_painel para 0. Para voltar, reative 1 réplica, confira HTTPS e selecione Domínio da Astros no admin.
E-mails, QR/pagamentos e preferências já criados mantêm seus links; não é possível reescrever mensagens entregues. Não há failover automático, redirecionamento forçado do acesso alternativo ou alteração DNS.

## Segurança e limites
Tabela protegida por RLS; leitura de administração somente admin. RPC exige astros_is_admin e registra updated_by/updated_at. A UI e SQL aceitam somente os dois origins HTTPS completos, sem caminhos, query, credenciais ou domínios arbitrários. Funções mail/payment verificam novamente o valor. Nenhum redirect vem do corpo enviado pelo cliente, evitando phishing. Configuração indisponível interrompe geração de links; nunca troca destino silenciosamente.
Links internos relativos continuam na hospedagem que a pessoa está usando para preservar acesso alternativo. A configuração determina novos links externos de confirmação, recuperação, imagens do e-mail e retornos de checkouts por link. Não muda URL da API Supabase nem webhook Mercado Pago, DNS, certificados ou infraestrutura externa.
Não altera contas, roles, senhas nem saldos. Este guia documenta instalação; ativação e testes em produção devem ser confirmados pelo operador.
