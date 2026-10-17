# WhatsApp na Central de suporte

Aplicar `supabase/migrations/20261017_support_whatsapp.sql` no SQL Editor. A migração é reaplicável e não altera o chat, as credenciais, as contas ou a carteira. Contatos iniciais fornecidos pelo proprietário, desativados até confirmação no admin.

Em **Admin → Central de suporte → WhatsApp do suporte**, editar até dois links e seus nomes, ativar a exibição e salvar. Botão Testar link abre o endereço para conferência, sem envio de mensagem. Links aceitos: HTTPS wa.me/message/<código> e wa.me/<DDI+número>. Links curtos conservam o texto configurado no WhatsApp, sem tentativa de acrescentar mensagem.

Cliente vê os contatos em /suporte, independentemente de chat habilitado, erro no widget ou preenchimento de telefone. Não enviar dados de conta/pedido/códigos no link. Cliente redige/confere a mensagem no WhatsApp. Leitura exige sessão confirmada; escrita exige requireAdmin no servidor e astros_is_admin no RPC. Nenhuma permissão de escrita direta no cadastro. Sem SQL, chat permanece funcional e o admin recebe orientação de ativação. Não requer deploy de Edge Function. Atualização de VPS permanece manual.

## Organização da Central do cliente
Chat em destaque com identificação da conta no mesmo cartão; WhatsApp em canal separado; atalhos de carteira, desbanimento, SMS e redes sociais abaixo. Colunas adaptam-se à largura disponível do conteúdo, incluindo sidebar. Verificação local em 320, 375, 768, 1024 e 1440 px, com dois contatos, erro no chat e WhatsApp desativado. Nenhuma alteração de credenciais ou regra de atendimento.
