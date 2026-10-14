# Troca do domínio para Astros Mais

Novo principal: https://mais.astroscomunicacaodigital.com. Acesso alternativo Lovable preservado. Não troca bancos, identidade Auth, saldos nem endpoints da API; nova sessão ao mudar de hostname.

## Ordem de ativação
1. Executar supabase/migrations/20261014_astros_mais_address.sql. Apenas amplia a lista fechada de endereços; não altera o endereço salvo. Em nova instalação, executar após 20261014_panel_address.sql, não reexecutar o SQL antigo depois.
2. Adicionar https://mais.astroscomunicacaodigital.com/login e https://mais.astroscomunicacaodigital.com/reset-password às Redirect URLs do Supabase, preservando entradas atuais; não alterar Site URL global.
3. Atualizar as funções existentes astros-auth-email (supabase/astros-auth-email-endereco-principal.ts) e astros-payments (supabase/astros-payments-cartao-no-painel.ts), mantendo seus secrets e Verify JWT atuais. Lista permite Mais, contingência e endereço anterior para transição.
4. GitHub Actions precisa concluir imagem com sucesso. Publicar Lovable e atualizar somente image na stack astros-painel para o mesmo commit. Alterar a label traefik.http.routers.astros-painel.rule para Host(`mais.astroscomunicacaodigital.com`). Preservar redes, tokens, limites e demais labels.
5. Confirmar DNS CNAME mais → vps1.astroscomunicacaodigital.com e HTTPS antes de trocar o endereço principal. Login, saldo e números devem conferir nos dois ambientes.
6. Admin → Configurações → Endereço principal → Astros Mais — principal → Salvar. Conferir persistência. Testar recuperação de senha: novo e-mail deve retornar para Mais.

## Efeitos
Links de e-mail e checkouts já enviados não mudam. Se o DNS antigo foi renomeado/removido, esses links podem falhar; solicitar novo e-mail após salvar Mais. Endereço anterior permanece permitido durante transição, mas isso não reativa DNS ou rota Traefik.
Contingência: entrar no Lovable e salvar Acesso de contingência antes de desativar a stack. Não precisa atualizar funções para alternar entre os endereços já permitidos.
O código e stack preparados não executam mudanças na VPS ou banco automaticamente. Atualizações na Atomicat, textos comerciais e links distribuídos devem apontar para o novo principal também.
