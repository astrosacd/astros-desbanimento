import { createServerOnlyFn } from '@tanstack/react-start';
import { createOpenAI } from '@ai-sdk/openai';
import { APICallError, streamText } from 'ai';

// Transport only. The calling server function must authorize with requireAdmin
// before dynamically importing this module. This does not create an endpoint.
type AssistantMessage = { role: 'system' | 'user'; content: string };
const MODEL = 'openai/gpt-6-luna';
const OUTPUT_TOKENS = 1000;

// Adapted from the official gateway run-ID helper: state is request-local.
function createLovableAiGatewayRunIdFetch() {
  let runId: string | undefined;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (runId && !headers.has('X-Lovable-AIG-Run-ID')) {
      headers.set('X-Lovable-AIG-Run-ID', runId);
    }
    const response = await fetch(input, { ...init, headers });
    runId ??= response.headers.get('X-Lovable-AIG-Run-ID')?.trim() || undefined;
    return response;
  };
}

function friendlyFailure(error: unknown, apiKey: string): Error {
  if (APICallError.isInstance(error)) {
    let message: unknown;
    try {
      const body = JSON.parse(error.responseBody ?? '{}');
      message = body.message ?? body.error?.message;
    } catch { /* Never expose raw response bodies, requests or credentials. */ }
    const safeMessage = typeof message === 'string' && message.trim()
      && !message.includes(apiKey)
      && !/bearer\s|api[-_ ]?key|authorization|\b(?:sb_|sk-)|https?:\/\//i.test(message)
      ? message.trim().slice(0, 500) : undefined;
    if (error.statusCode === 402) {
      return new Error(safeMessage ?? 'Os créditos de IA do Lovable estão indisponíveis. Verifique os créditos do workspace.');
    }
    if (error.statusCode === 429) {
      return new Error(safeMessage ?? 'O limite temporário de IA foi atingido. Aguarde antes de tentar novamente.');
    }
    if (error.statusCode === 403) {
      return new Error(safeMessage ?? 'O acesso à IA está bloqueado. Um administrador deve verificar as permissões do workspace.');
    }
    if (error.statusCode === 401) return new Error('A integração de IA do Lovable precisa de configuração.');
    if (error.statusCode === 404) return new Error('O modelo ou serviço de IA configurado está indisponível.');
    return new Error(safeMessage ?? 'Não foi possível concluir a chamada de IA. Tente novamente mais tarde.');
  }
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
    return new Error('A chamada de IA foi interrompida ou excedeu o tempo disponível. Nenhuma repetição automática foi realizada.');
  }
  return new Error('Não foi possível concluir a chamada de IA. Tente novamente mais tarde.');
}

const completeOnServer = createServerOnlyFn(async (messages: AssistantMessage[]): Promise<string> => {
  const apiKey = process.env['LOVABLE_API_KEY'];
  if (!apiKey) throw new Error('A integração de IA do Lovable ainda não está configurada.');
  if (!Array.isArray(messages) || !messages.length || messages.some(message =>
    !message || !['system', 'user'].includes(message.role)
    || typeof message.content !== 'string' || !message.content.trim(),
  ) || !messages.some(message => message.role === 'user')) {
    throw new Error('Informe mensagens válidas e pelo menos uma mensagem do usuário.');
  }

  // Official Responses SDK setup, isolated per call; no credential serialization.
  const provider = createOpenAI({
    baseURL: 'https://ai.gateway.lovable.dev/v1',
    apiKey,
    headers: { 'Lovable-API-Key': apiKey, 'X-Lovable-AIG-SDK': 'vercel-ai-sdk' },
    fetch: createLovableAiGatewayRunIdFetch(),
  });
  const result = streamText({
    model: provider.responses(MODEL),
    instructions: messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n'),
    messages: messages.filter(message => message.role === 'user'),
    maxOutputTokens: OUTPUT_TOKENS,
    maxRetries: 0,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: 'low',
        reasoningSummary: 'auto',
        store: false,
        include: ['reasoning.encrypted_content'],
      },
    },
  });
  let text = '';
  let refused = false;
  try {
    // Consume streaming events even for this final-string interface, including
    // errors before the first text. No retries, artificial deadlines or tools.
    for await (const part of result.fullStream) {
      if (part.type === 'error') throw part.error;
      if (part.type === 'text-delta') text += part.text;
      if (part.type === 'finish' && part.finishReason === 'content-filter') refused = true;
    }
  } catch (error) {
    throw friendlyFailure(error, apiKey);
  }
  if (refused) throw new Error('O provedor de IA recusou esta solicitação.');
  if (!text.trim()) throw new Error('A IA não retornou uma resposta de texto.');
  if (text.includes(apiKey)) throw new Error('A resposta de IA foi bloqueada por segurança.');
  return text.trim();
});

export async function completeAssistant(messages: Array<{ role: 'system' | 'user'; content: string }>): Promise<string> {
  return completeOnServer(messages);
}