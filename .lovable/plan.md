# Diagnóstico da voz ASTRA (V-CONEXAO)

## O que foi verificado
- O projeto tem acesso a modelos de voz no catálogo autenticado (`workspace_models: included`). As opções incluem `google/gemini-3.1-flash-tts-preview` (atual, padrão), `google/gemini-2.5-flash-tts` e `openai/gpt-4o-mini-tts`. Este último está **marcado como obsoleto**, mas continua disponível. Todos funcionam com retenção zero.
- Fiz uma chamada direta "Olá" com a chave existente e o mesmo corpo do código (`openai/gpt-4o-mini-tts`, `onyx`, `mp3`): **HTTP 200, audio/mpeg, 23 KB, 0,79 s**, e os primeiros bytes são um MP3 válido (`FF F3`).
- Conclusão: o endpoint `/v1/audio/speech` está liberado e funciona para este projeto. O problema não é falta de crédito, permissão ou chave.

## Causa provável (no código, não no serviço)
Em `voice-transport.server.ts`, o `fetch` usa `redirect: "error"`. O servidor publicado roda no Cloudflare Workers (workerd), que só aceita `"follow"` ou `"manual"`. Com `"error"`, o `fetch` lança um TypeError antes de qualquer requisição de rede. O `.catch` transforma isso em V-CONEXAO. Isso explica a falha com qualquer modelo ou formato, já que a opção é a mesma nas duas versões. Os testes locais não pegam o problema porque o `fetch` é simulado.

Isso não foi confirmado nos logs do servidor publicado. A primeira etapa da correção confirma a causa.

## Correção proposta (somente após aprovação)
1. Ver nos logs do servidor publicado se aparece o erro "Invalid redirect value".
2. Trocar para `redirect: "manual"` e tratar qualquer resposta 3xx como V-REDIR. Isso mantém a proteção contra redirecionamento.
3. Registrar no servidor só o nome da exceção (`error.name`), sem a mensagem nem a chave, para evitar novos diagnósticos às cegas.
4. Atualizar o teste para exigir `redirect: "manual"`.
5. Opcional, só se você pedir: trocar o modelo obsoleto por `google/gemini-3.1-flash-tts-preview`. Isso usa outro formato de chamada (`contents`/`generationConfig`, voz como `Charon`, retorno WAV).

Nada será publicado, e nenhum dado, credencial ou configuração será alterado.
