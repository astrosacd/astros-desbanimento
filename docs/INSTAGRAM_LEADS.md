# Instagram — complemento opcional dos leads

Primeira versão: consulta explícita de **perfil já publicado nos links de um lead da própria conta**, Maps ou CNPJ. Não é busca por segmento, descoberta por nome, lista de seguidores nem importação em massa. Não precisa digitar @. Perfis ausentes ou links de posts/reels não viram perfis por suposição. Havendo mais de um link, o cliente seleciona um dos perfis publicados; o vínculo não é certificado.

## Comportamento e custos

- Desligado na primeira instalação; reaplicar o SQL preserva ativação e limites já salvos. Administração em Prospecção → Instagram, independente de habilitar buscas Maps.
- Mesma chave privada SerpApi, `engine=instagram_profile`, parâmetros fixos. Documentação consultada: https://serpapi.com/instagram-profile-api em 25/10/2026. A documentação não garante e-mail/telefone ou lista de seguidores. Dados de perfil privado são recusados.
- Projeção limitada: nome, @, bio, links HTTPS, contagem de seguidores/seguidos, flags profissional/verificado e data. E-mails e possíveis telefones são identificados **somente no texto da bio**, sem validação de titularidade ou WhatsApp. Não busca contatos ocultos, importa mídia, executa conteúdo nem envia mensagens.
- O painel não cobra adicionalmente do cliente nesta versão. A consulta pode consumir a cota paga do administrador na SerpApi; não foi criado preço ou débito na carteira. Cobrança futura exige implementação financeira própria, não basta alterar texto.
- Só o clique Consulta informações inicia o trabalho. Abrir detalhes, atualizar resultado, voltar ao lead e abrir a configuração não consultam Instagram. A leitura da cota Account API existente pode ser atualizada antes da reserva.
- Uma tentativa por conta/origem/lead/perfil em 24 horas, inclusive falhas. Repetição da referência ou outro UUID no mesmo período recupera o registro; nunca repete a chamada ao fornecedor. Uma resposta incerta pode ficar em conferência e aparecer não confirmada após dois minutos; não há worker de reenvio. Se perder o resultado antes de salvá-lo, não se reconstrói a resposta nem se promete resultado recuperável. Após 24 horas pode haver nova tentativa explícita.
- Limites iniciais: 20 consultas/dia para aplicação, 5/conta/dia, reserva mínima 10 consultas para Maps. Dia de Fortaleza. Uma consulta Instagram em andamento por vez (janela de dois minutos). Os números são escolhas conservadoras desta implementação, não cotas prometidas do fornecedor.
- Mesma trava de capacidade das buscas Maps. Ambas contabilizam as reservas Instagram nos limites mensal, horário e teto global diário. Instagram recusa nova consulta enquanto Maps tiver pedido ativo/na fila, quando faltar cota sincronizada ou quando atingir a reserva configurada. Não bloqueia entregas em cache. Uso externo da mesma conta SerpApi entre sincronizações continua não sendo instantaneamente conhecido.
- Pausa da função ou restrição do módulo impede novas consultas; resultados salvos continuam acessíveis ao dono. Não muda saldo, etapa, snapshot original, contatos, cron, configuração CNPJ, preço Maps ou outras integrações.
- Resultados ficam em tabela própria por proprietário e lead. Não são mesclados no snapshot nem no CSV atual. A seção explica a fonte e data. Não se anunciam dados que a consulta não retorna.

## Instalação em produção — uma etapa por vez

Publicar código não executa SQL nem atualiza Edge Functions. Não ativar o recurso automaticamente.

1. **SQL primeiro, desligado.** Supabase → SQL Editor → New query: copiar integralmente `supabase/migrations/20261025_prospect_instagram.sql` e executar. Depende das instalações atuais de Prospecção, CNPJ, fila/capacidade e controle de módulos. Cria tabelas privadas e RPCs e altera somente as três contagens de reservas na função existente `astros_prospect_claim`, para incluir o novo consumidor na mesma cota. Não reinstalar scripts antigos da fila depois deste patch, pois sobrescreveriam essas contagens. Execução transacional; falha reverte o patch. Nenhum cliente é debitado.
2. **Função existente.** Abrir `astros-prospecting`, substituir o código completo por `supabase/astros-prospecting.deploy.ts` regenerado e fazer Deploy. Preservar secrets, configuração JWT vigente e cron; não criar função ou cron novos. Sem SQL, apenas as novas leituras retornam não instalado; Maps/CNPJ mantêm os caminhos atuais.
3. **Frontend no Lovable.** Publicar e conferir as buscas existentes e Prospecção → Instagram desligado. Novos controles são isolados; falha de leitura do complemento não impede os detalhes do lead. Preparar imagem da VPS somente após conferência.
4. **VPS.** Após validação, trocar apenas a imagem do painel pela versão construída do commit aprovado. Preservar ambiente e demais configurações.
5. **Ativação controlada pelo proprietário.** Conferir a cota SerpApi, os limites e a reserva, então habilitar explicitamente. Testar um lead com link conhecido, conferir perfil e informações, horário e consumo. Atualizar/reabrir deve só ler o resultado salvo. Lead sem Instagram mantém as informações existentes. Uma tentativa real consome consulta do fornecedor; testes locais não a substituem.

Contingência: desmarcar **Liberar consulta adicional ao Instagram**, salvar e manter SQL/função instalados; não apagar as reservas ou restaurar manualmente contagens da cota. O painel anterior pode ser utilizado mantendo o patch aditivo de capacidade. Não remover tabela referenciada pela função Maps. Histórico e saldo permanecem intactos.

## Verificações

`npx vitest run src/features/prospecting` cobre módulos atuais, adapter, rotas administrativas, privacidade da projeção, ausência de consultas automáticas e referências estáveis. `scripts/check-prospecting-instagram.cjs` executa as verificações existentes da fila/cobrança Maps com o patch instalado e reaplicado, mais propriedade, bloqueios, reserva, prioridade, não repetição, contagem compartilhada, preservação de snapshot/carteira e privilégios. Requer PGlite externo via `ASTROS_PGLITE_MODULE`.

`python3 scripts/generate-prospecting-deploy.py` regenera a função única. Tipos e builds Lovable/VPS devem passar. Nenhum teste dispara consulta real ou modifica produção. Não se afirma validação em dispositivos reais nem disponibilidade do plano SerpApi com base nos testes sintéticos.
