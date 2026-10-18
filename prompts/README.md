# Prompts da Lyra — copiar e colar

Esta pasta é a referência dos dois prompts principais de atendimento da Astros. Os arquivos `.txt` contêm somente o texto para colar, sem instruções de instalação misturadas ao prompt.

## Qual arquivo usar?

| Atendimento | Prompt completo | Nó do n8n / campo |
|---|---|---|
| Agência: WhatsApp geral da Astros, comercial e identificação de suporte do Astros Mais | [Lyra — Agência](lyra-agencia.txt) · [Abrir texto puro](https://github.com/astrosacd/astros-desbanimento/raw/refs/heads/main/prompts/lyra-agencia.txt) | `Lyra orquestradora` → **System Message** |
| Suporte exclusivo dentro do painel Astros Mais | [Lyra — Astros Mais](lyra-astros-mais.txt) · [Abrir texto puro](https://github.com/astrosacd/astros-desbanimento/raw/refs/heads/main/prompts/lyra-astros-mais.txt) | `Lyra orquestradora - Astros Mais` → **System Message** |

## Atualizar no n8n

1. Abra o arquivo do atendimento desejado, na branch **main**.
2. Use **Copy raw file**, no canto superior do arquivo no GitHub, ou abra **Raw** e copie todo o texto.
3. No fluxo correspondente do n8n, abra o nó indicado na tabela. Substitua todo o conteúdo de **System Message** pelo texto copiado.
4. Preserve as ferramentas, conexões e memória já configuradas. Salve e publique/ative a versão do fluxo conforme sua instalação do n8n.
5. Teste uma conversa do canal correto antes de considerar o agente atualizado.

O sinal `=` que aparece antes do texto no JSON exportado pelo n8n é um marcador de expressão, não parte da mensagem da Lyra. Os arquivos já vêm sem esse marcador. No prompt geral, preserve a expressão de data `{{ $now.toUTC(-180) }}` e o modo de expressão do campo existente; confira a prévia de avaliação no n8n.

## Como pedir uma mudança

- “Atualiza no GitHub o prompt da Lyra da agência para …”
- “Atualiza no GitHub o prompt da Lyra do Astros Mais para …”
- “Atualiza os dois prompts para …”

Após a mudança, copie novamente **o arquivo completo**, não apenas o trecho alterado. O link da branch main permanece o mesmo. A aba **History** de cada arquivo mostra as versões anteriores.

**Atualizar o GitHub não atualiza automaticamente o n8n.** Estes arquivos não são importados pelo painel, não alteram o banco e não dependem de publicar o Lovable ou trocar a imagem da VPS. Não é necessário executar SQL para copiar um prompt.

## Dependências existentes

| Prompt | Subagentes mencionados |
|---|---|
| Agência | `Subagente_Atendimento_Humano`, `Subagente_Agendamento`, `Subagente_Produtos_Vendas`, `Subagente_Audio` |
| Astros Mais | `Subagente_Atendimento_Humano_astros_mais`, `Subagente_Audio_astros_mais` |

São nomes das ferramentas/subagentes já conectados no n8n; o texto sozinho não cria essas conexões. O suporte do painel faz triagem e encaminhamento, sem consulta ao Supabase nem alterações de conta ou saldo. O suporte que chega pelo WhatsApp geral utiliza o subagente humano geral, sem enviar o cliente de volta ao chat do painel.

Esta pasta contém os dois prompts de **orquestração**. Os prompts internos dos subagentes, descrições das tools, credenciais e parâmetros operacionais permanecem nos fluxos existentes e não são substituídos ao colar estes arquivos.

## Origem e manutenção

Versão inicial arquivada em **18/10/2026**, extraída das últimas versões enviadas e aprovadas em **17/10/2026**. Os textos foram preservados integralmente, removendo somente o marcador inicial `=` da exportação. Não foi feita leitura do n8n em produção para confirmar se houve edição posterior.

Ao solicitar um ajuste, o arquivo da branch main é a base de edição. Preserve os nomes exatos dos subagentes, a separação comercial/suporte, a regra de encaminhamento e os limites de consulta. Nunca inclua credenciais, tokens ou dados de conversas reais nos prompts. Registre mudanças relevantes neste guia e mantenha os arquivos `.txt` prontos para copiar.
