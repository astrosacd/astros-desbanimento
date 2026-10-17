import { z } from "zod";
export const diagnosticModules = ["all", "api", "sms", "social", "desban", "payment"] as const;
export const reportedErrorInput = z
  .object({
    module: z.enum(diagnosticModules).default("all"),
    screen: z.string().trim().max(120).default(""),
    reference: z.string().trim().max(100).default(""),
    message: z.string().trim().max(3000).default(""),
  })
  .strict();
export const diagnosticResult = z.object({
  version: z.literal(1),
  generatedAt: z.string().max(50),
  scope: z.enum(["period", "reference_all_dates"]),
  total: z.number().int().nonnegative(),
  byModule: z.record(z.enum(diagnosticModules), z.number().int().nonnegative()),
  matchedRecords: z.number().int().nonnegative(),
  records: z
    .array(
      z.object({
        module: z.enum(diagnosticModules),
        created_at: z.string().max(50),
        updated_at: z.string().max(50),
        email: z.string().max(254).nullable(),
        reference_id: z.string().max(100),
        service_ref: z.string().max(100).nullable(),
        title: z.string().max(160),
        state: z.string().regex(/^[a-z_]{1,40}$/),
        amount_cents: z.number().int(),
        refund_cents: z.number().int().nullable(),
      }),
    )
    .max(10),
  events: z
    .array(
      z.object({
        module: z.enum(diagnosticModules),
        occurred_at: z.string().max(50),
        email: z.string().max(254).nullable(),
        reference_id: z.string().max(100),
        service_ref: z.string().max(100).nullable(),
        category: z.string().regex(/^[A-Za-z0-9_]{1,70}$/),
        state: z.string().regex(/^[a-z_]{1,40}$/),
        http_status: z.number().int().min(100).max(599).nullable(),
        amount_cents: z.number().int().nullable(),
        refund_cents: z.number().int().nullable(),
      }),
    )
    .max(12),
  health: z
    .array(
      z
        .object({
          module: z.enum(diagnosticModules),
          enabled: z.boolean().nullable(),
          workerAt: z.string().max(50).nullable(),
          workerFresh: z.boolean().nullable(),
          catalogAt: z.string().max(50).nullable().optional(),
          catalogFailed: z.boolean().optional(),
          liveMode: z.boolean().optional(),
        })
        .nullable(),
    )
    .max(4),
  coverage: z.object({
    operationalRecords: z.literal(true),
    providerRawPayloads: z.literal(false),
    platformRuntimeLogs: z.literal(false),
    browserConsole: z.literal(false),
    sourceCode: z.literal(false),
  }),
  limitations: z.array(z.string().max(500)).max(10),
});
export const diagnosticGuide = {
  BALANCE_ERROR:
    "O fornecedor recusou por saldo na tentativa registrada. Não confundir saldo do fornecedor com a carteira do cliente.",
  SUPPLIER_BALANCE_INSUFFICIENT:
    "Tentativa bloqueada antes de enviar ao fornecedor por saldo externo insuficiente.",
  OUT_OF_STOCK: "Estoque indisponível na compra; uma consulta anterior não reserva estoque.",
  AUTH_ERROR:
    "Falha de autenticação no fornecedor. Oriente conferir a configuração no admin, sem pedir a chave na conversa.",
  PARAMETER_ERROR:
    "Confira serviço, país e opções aceitas pelo fornecedor. Não sugira repetir uma compra com resultado incerto.",
  RATE_LIMITED:
    "Limite temporário do fornecedor. Uma espera pode ser necessária; não executar nem repetir automaticamente.",
  TRANSPORT_UNCONFIRMED:
    "Resultado da compra não confirmado. Conferir conciliação; timeout não prova falha nem autoriza estorno/reenvio.",
  RESPONSE_UNCONFIRMED:
    "Resposta do fornecedor não validada. Verificar conciliação e referência, sem deduzir resultado financeiro.",
  RECONCILIATION_REVIEW:
    "Solicitação precisa de revisão da conciliação. Não recomendar recriar, reembolsar ou reenviar sem prova do resultado.",
  reference_mismatch:
    "A referência pode já pertencer a outra solicitação. Use um UUID novo para uma intenção nova e o mesmo UUID ao consultar/repetir a mesma intenção.",
  value_changed:
    "A cotação mudou. Consultar o valor novamente antes de confirmar, preservando a referência da intenção correta.",
  PAYMENT_NOT_APPROVED:
    "Pagamento não aprovado/encerrado não comprova bug nem crédito na carteira; conferir status e histórico.",
  "V-CONEXAO":
    "Falha anterior à resposta HTTP do áudio; saldo do fornecedor de serviços não explica este erro. Não confirmar causa sem evidência.",
  "V-TEMPO":
    "A geração de voz excedeu o tempo de espera. A resposta escrita deve continuar disponível.",
  "V-REDIR":
    "O áudio respondeu com redirecionamento e a chamada foi bloqueada para proteger credenciais.",
  N06: "Falha de conexão ou validação no serviço de consulta de números. Não significa que o cliente não possui números.",
  N10: "O endereço do serviço de números redirecionou a consulta. Conferir a URL configurada, sem expor tokens.",
};
