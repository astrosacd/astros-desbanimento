# Avaliações no Google — complemento dos leads Maps

Consulta opcional e inicialmente desligada, restrita aos leads Google Maps da própria conta. CNPJ não monta o componente e a Edge/SQL recusam essa origem. Não descobre empresas por nome nem executa busca Maps para completar um registro CNPJ. Leads antigos sem identificador `pid:` compatível mostram indisponibilidade desse complemento, preservando o restante.

## Fluxo

1. Cliente abre detalhes de um lead Maps. Só lê configuração e resultado salvo; sem chamada a fornecedor.
2. Clique explícito **Consultar avaliações** reserva uma referência única no banco, antes de uma chamada `engine=google_maps_reviews`, `place_id` derivado do snapshot do dono, `sort_by=newestFirst`, `num=10`, `hl=pt-br`.
3. Salva separadamente uma amostra de até dez avaliações Google da primeira página, sem buscar páginas seguintes. Pode retornar menos ou nenhuma. Mostra nota geral/total quando informados, trecho da avaliação, data e resposta da empresa quando retornados, links seguros e data da consulta. Não é diagnóstico, histórico completo, resumo por IA ou análise de sentimentos. Não exige nem publica nome/foto/documento do avaliador ou seu perfil de contribuidor. Links e resultados são dados, nunca instruções executáveis.
4. Reabrir e **Atualizar avaliações salvas** leem o banco. Nova consulta explícita só após 24 horas da tentativa no mesmo lead/conta. Não há cobrança na carteira nesta versão; chamadas podem consumir cota SerpApi do administrador.

A API documenta Place ID, limite de até 20 resultados por página, ordenação e paginação: https://serpapi.com/google-maps-reviews-api (consultada em 25/10/2026). Esta integração deliberadamente solicita apenas dez e não pagina. Resposta sem estrutura confirmada fica não concluída, nunca lista vazia inventada. Uma amostra válida sem avaliações é indicada como tal. Dados guardados não substituem nota, contatos, cadastro original, etapa ou CSV existente do lead. Sem conexão a funções financeiras, pagamentos ou notificações externas.

## Capacidade e segurança

Mesma chave privada SerpApi e mesma trava `astros_prospect_capacity` usada por Maps/Instagram. Reservas de **todos os três consumidores** entram nas contagens de restante/horário/teto global. O SQL substitui apenas essas contagens no claim Maps; no begin Instagram, acrescenta avaliações à contagem e à janela de exclusão mútua dos complementos. Configurações já salvas não são sobrescritas.

Avaliações começam com 5 tentativas/dia na aplicação, 2 por cliente/dia e reserva de 10 consultas restantes para Maps, editáveis no admin → Prospecção → Avaliações. Dia de Fortaleza. Tentativas malsucedidas também contam. Fila Maps tem prioridade; avaliação ou Instagram em processamento impede iniciar o outro complemento por até dois minutos. Faltando sincronização/capacidade/reserva, bloqueia antes do fornecedor e apresenta mensagem pública. Não usa disponibilidade do navegador como autorização.

UUID e resultado têm dono; cliente não escolhe Place ID. Autenticação real confirmada, banimento e senha temporária seguem as verificações atuais. Admin é conferido no servidor, Edge e SQL. Tabelas privadas/RLS e RPCs somente service_role. Controle de módulos bloqueia novas consultas; pausa mantém leituras já aceitas. Cadastro original e carteira não são alterados. Reaplicação preserva configuração, históricos e resultados.

Resultado incerto não é repetido: consultar mesma referência ou novo UUID na janela de 24h recupera o pedido. Sem retorno salvo após dois minutos, leitura informa falha de confirmação. Se a resposta se perdeu antes da persistência, não há reconstrução ou reenvio automático. Uma nova tentativa explícita após 24h é possível e pode consumir nova cota. Uso externo da mesma conta SerpApi entre sincronizações não é instantaneamente conhecido.

## Instalação em produção, uma etapa por vez

1. **SQL:** executar integralmente `supabase/migrations/20261025_prospect_reviews.sql`. Depende de Prospecção/fila, Instagram e controle de módulos já instalados. Inicia desligado; não ativa/cria cron ou altera pagamentos. Transação reverte em caso de erro. Não reinstalar scripts antigos de fila ou Instagram por cima, pois sobrescreveriam a contagem dos três consumidores.
2. **Edge existente:** substituir todo o conteúdo de `astros-prospecting` por `supabase/astros-prospecting.deploy.ts` regenerado e fazer Deploy. Preservar secrets, JWT vigente e cron. Falta de SQL afeta somente o complemento opcional, sem interromper Maps/CNPJ.
3. **Lovable:** publicar a interface; conferir as buscas e a nova configuração desligada.
4. **VPS:** após conferência, atualizar somente a imagem do painel com o commit construído aprovado; preservar ambiente e demais serviços.
5. **Ativar/testar pelo proprietário:** salvar limites conservadores e habilitar. Fazer uma consulta em lead Maps conhecido, conferir origem/datas/amostra, contador SerpApi e reabertura sem consulta adicional. Verificar que CNPJ não apresenta nem chama avaliações. Testes locais não comprovam coleta real, a conta SerpApi, nem todos os dispositivos.

Contingência: desmarcar **Liberar consulta de avaliações** e salvar. Manter as tabelas e o patch de cota; não apagar reservas ou restaurar migrações antigas. Pode voltar a imagem anterior mantendo SQL aditivo. Pausa só impede novas consultas, não apaga resultados ou modifica pedidos/carteiras.

## Verificação local

- `npx vitest run src/features/prospecting`: regressões atuais, adapter/projeção, autoria, UI sem disparo ao abrir, exclusão CNPJ e controles.
- `ASTROS_PGLITE_MODULE=/caminho/pglite node scripts/check-prospecting-reviews.cjs`: executa a regressão existente da fila/cobrança Maps com ambos complementos instalados e a migração reaplicada, mais propriedade, bloqueios, limites, prioridade, contagem cruzada, preservação de saldo/snapshot e privilégios.
- TypeScript, `npm run build:dev` e `ASTROS_DEPLOY_TARGET=vps npm run build`.
- Regeneração: `python3 scripts/generate-prospecting-deploy.py`. Nenhuma chamada real ao fornecedor nos testes.
