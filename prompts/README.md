# Prompts da Lyra — copiar e colar

Esta pasta guarda o bloco de suporte para a Lyra da agência, o prompt completo do suporte exclusivo Astros Mais e o prompt geral da agência como referência. Os arquivos `.txt` contêm somente o texto para colar, sem instruções de instalação misturadas ao prompt.

## Qual arquivo usar?

| Atendimento | Arquivo para copiar | Onde colar no n8n |
|---|---|---|
| Agência: atualizar somente o suporte Astros Mais | [Bloco suporte Astros Mais](lyra-agencia-suporte-astros-mais.txt) · [Texto puro](https://github.com/astrosacd/astros-desbanimento/raw/refs/heads/main/prompts/lyra-agencia-suporte-astros-mais.txt) | `Lyra orquestradora` → **System Message**, substituindo somente o bloco `<suporte_astros_mais>` |
| Suporte exclusivo do painel | [Lyra — Astros Mais](lyra-astros-mais.txt) · [Texto puro](https://github.com/astrosacd/astros-desbanimento/raw/refs/heads/main/prompts/lyra-astros-mais.txt) | `Lyra orquestradora - Astros Mais` → **System Message** completo |
| Agência: referência do prompt geral | [Prompt completo da agência](lyra-agencia.txt) | Consulta/backup de referência; não é necessário substituir o prompt inteiro para atualizar o suporte |

## Atualizar somente o suporte na Lyra da agência

1. Abra [lyra-agencia-suporte-astros-mais.txt](lyra-agencia-suporte-astros-mais.txt), na branch **main**, e use **Copy raw file** ou **Raw** para copiar todo o arquivo.
2. No n8n, abra `Lyra orquestradora` → **System Message**.
3. Localize o trecho que começa em `<suporte_astros_mais>` e termina em `</suporte_astros_mais>`. Selecione esse trecho inteiro, incluindo as duas tags, e substitua pelo texto copiado.
4. Preserve todo o restante do prompt. Não cole o arquivo como substituto do System Message inteiro e não deixe dois blocos de suporte repetidos.
5. Se essa for a primeira instalação e o bloco ainda não existir, insira-o uma única vez **antes de `<delegação_para_subagentes>`**.
6. Salve e publique/ative a versão do fluxo conforme sua instalação do n8n. Teste uma conversa de suporte pelo WhatsApp geral.

## Atualizar a Lyra exclusiva do Astros Mais

1. Abra [lyra-astros-mais.txt](lyra-astros-mais.txt), na branch **main**, e copie o conteúdo com **Copy raw file** ou **Raw**.
2. Abra `Lyra orquestradora - Astros Mais` → **System Message** e substitua o texto completo.
3. Preserve ferramentas, conexões e memória. Salve e publique/ative o fluxo e teste pelo chat do painel.

Os arquivos não incluem o marcador inicial `=` do JSON exportado pelo n8n. Ao substituir somente o bloco da agência, mantenha o modo de expressão e a expressão de data existentes no restante do System Message; não há necessidade de editá-los.

## Como pedir uma mudança

- “Atualiza no GitHub o prompt da Lyra da agência para …”
- “Atualiza no GitHub o prompt da Lyra do Astros Mais para …”
- “Atualiza os dois prompts para …”

Para ajustes do suporte na agência, copie **o arquivo do bloco completo** e substitua apenas o bloco correspondente. Para a Lyra exclusiva do painel, copie o prompt completo. O link da branch main permanece o mesmo. A aba **History** de cada arquivo mostra as versões anteriores.

**Atualizar o GitHub não atualiza automaticamente o n8n.** Estes arquivos não são importados pelo painel, não alteram o banco e não dependem de publicar o Lovable ou trocar a imagem da VPS. Não é necessário executar SQL para copiar um prompt.

## Dependências existentes

| Prompt | Subagentes mencionados |
|---|---|
| Agência | `Subagente_Atendimento_Humano`, `Subagente_Agendamento`, `Subagente_Produtos_Vendas`, `Subagente_Audio` |
| Astros Mais | `Subagente_Atendimento_Humano_astros_mais`, `Subagente_Audio_astros_mais` |

São nomes das ferramentas/subagentes já conectados no n8n; o texto sozinho não cria essas conexões. O suporte do painel faz triagem e encaminhamento, sem consulta ao Supabase nem alterações de conta ou saldo. O suporte que chega pelo WhatsApp geral utiliza o subagente humano geral, sem enviar o cliente de volta ao chat do painel.

Esta pasta contém o bloco de suporte da agência e os dois prompts completos de **orquestração**. Os prompts internos dos subagentes, descrições das tools, credenciais e parâmetros operacionais permanecem nos fluxos existentes e não são substituídos ao colar estes arquivos.

## Origem e manutenção

Versão inicial arquivada em **18/10/2026**, extraída das últimas versões enviadas e aprovadas em **17/10/2026**. Os textos foram preservados integralmente, removendo somente o marcador inicial `=` da exportação. Não foi feita leitura do n8n em produção para confirmar se houve edição posterior.

Ao solicitar um ajuste, o arquivo da branch main é a base de edição. Preserve os nomes exatos dos subagentes, a separação comercial/suporte, a regra de encaminhamento e os limites de consulta. Nunca inclua credenciais, tokens ou dados de conversas reais nos prompts. Registre mudanças relevantes neste guia e mantenha os arquivos `.txt` prontos para copiar.

### Bloco de suporte separado — 18/10/2026
O arquivo `lyra-agencia-suporte-astros-mais.txt` foi extraído sem alteração de conteúdo do prompt completo aprovado. Ele é a referência para futuras mudanças restritas ao suporte na agência. Ao atualizar esse bloco, mantenha o mesmo trecho sincronizado em `lyra-agencia.txt`, preservando integralmente o restante do prompt geral. O prompt completo arquivado é referência, não leitura automática do agente em produção.

### Prospecção de Empresas — 25/10/2026
Os dois atendimentos passam a reconhecer Google Maps e Empresas por CNPJ, Meus leads, histórico, etapas, exportação da página atual e enriquecimento opcional. As orientações preservam o encaminhamento humano, a separação comercial/suporte, a confirmação de condições e os limites dos contatos disponíveis, sem prometer decisor ou disparo automático. O bloco da agência permanece sincronizado no prompt geral. Para aplicar, siga os passos acima no n8n; esta alteração não exige SQL, funções, Lovable ou imagem da VPS.

### Revisão dos quatro módulos e recursos compartilhados — 25/10/2026
Os prompts de suporte do painel e da agência agora explicam Desbanimento, Ativações SMS, Redes sociais, Prospecção (Maps/CNPJ), carteira, afiliação, acesso, manutenção e status. Condições variáveis permanecem na tela, sem fixar preços, comissão ou prazos. Cancelamento solicitado não equivale a conclusão; status geral não comprova pedido individual. Afiliação é direta, sem saque, com estorno confirmado e compensação de ajustes; não atribuir todo déficit à afiliação.

Validado o bloco sincronizado da agência, a preservação integral do restante do prompt geral e dos nomes dos subagentes. Não foi feita leitura nem publicação no n8n em produção. Para instalar, substituir o System Message completo apenas na Lyra exclusiva do painel e somente `<suporte_astros_mais>...</suporte_astros_mais>` na agência, conforme os passos deste guia. Não exige SQL, Edge Functions, publicação Lovable ou troca da imagem da VPS.

Conferência após copiar, sem pagamentos ou compras: perguntar como acompanhar um desbanimento, um SMS expirado, cancelamento/reposição social, enriquecimento CNPJ, recarga já paga, comissão/ajuste pendente e status durante manutenção. Verificar respostas curtas e encaminhamento humano nos problemas reais, preservando exatamente a mensagem retornada. Pedidos comerciais no WhatsApp geral continuam com Produtos/Vendas; suporte do painel não aciona esses subagentes.
