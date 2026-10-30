import { z } from "zod";
export const toolSchema = z.enum(["instagram_search", "instagram_profile", "instagram_followers"]);
export type Tool = z.infer<typeof toolSchema>;
export const catalog = [
  {
    id: "instagram_search" as const,
    title: "Buscar perfis",
    description: "Encontre perfis a partir de uma palavra-chave ou expressão.",
    input: "Palavra-chave",
    placeholder: "Ex.: odontologia Fortaleza",
    max: 50,
  },
  {
    id: "instagram_profile" as const,
    title: "Consultar perfis e contatos públicos",
    description:
      "Consulte biografia, site, métricas e contatos quando publicados. Não garante e-mail ou telefone.",
    input: "Perfis do Instagram (até 10)",
    placeholder: "@perfil ou URL do perfil; separe por espaço",
    max: 10,
  },
  {
    id: "instagram_followers" as const,
    title: "Extrair seguidores",
    description:
      "Obtenha uma lista de usuários que seguem um perfil público. Não inclui automaticamente os contatos.",
    input: "Perfil público do Instagram",
    placeholder: "@perfil ou URL do perfil",
    max: 100,
  },
];
export const startSchema = z
  .object({
    requestId: z.string().uuid(),
    tool: toolSchema,
    query: z.string().trim().min(1).max(500),
    quantity: z.number().int().min(1).max(100),
    version: z.number().int().positive(),
    unitCents: z.number().int().min(1).max(10000),
  })
  .strict();
export const idSchema = z.object({ id: z.string().uuid() }).strict();
export const pageSchema = z
  .object({ page: z.number().int().min(0).max(10000).default(0) })
  .strict();
export const collectionSchema = z
  .object({
    requestId: z.string().uuid(),
    username: z.string().min(1).max(30),
    collection: z.string().trim().min(1).max(80),
  })
  .strict();
export type ToolSettings = {
  enabled: boolean;
  unitCents: number;
  maxQuantity: number;
  maxUsdCents: number;
};
export type Config = {
  installed: boolean;
  enabled: boolean;
  version: number;
  tools: Record<Tool, ToolSettings>;
  dailyRequests?: number;
  dailyUsdCents?: number;
  concurrency?: number;
  hasKey?: boolean;
  pilot?: boolean;
};
export type Profile = {
  username: string;
  name: string;
  url: string;
  biography: string;
  website: string;
  email: string;
  phone: string;
  followers: number | null;
  following: number | null;
  posts: number | null;
  private: boolean;
  verified: boolean;
};
export type Research = {
  id: string;
  tool: Tool;
  query: string;
  quantity: number;
  state: "dispatching" | "running" | "completed" | "review" | "rejected";
  reserved_cents: number;
  charged_cents: number;
  delivered: number;
  created_at: string;
  rows?: Profile[];
  user_id?: string;
};
export type Saved = { id: string; collection: string; profile: Profile; created_at: string };
export const toolSettings = z
  .object({
    enabled: z.boolean(),
    unitCents: z.number().int().min(0).max(10000),
    maxQuantity: z.number().int().min(1).max(100),
    maxUsdCents: z.number().int().min(1).max(500),
  })
  .strict();
export const configSchema = z
  .object({
    version: z.number().int().positive(),
    enabled: z.boolean(),
    pilot: z.boolean(),
    dailyRequests: z.number().int().min(1).max(50),
    dailyUsdCents: z.number().int().min(1).max(5000),
    concurrency: z.number().int().min(1).max(5),
    apiKey: z.string().trim().max(200).default(""),
    tools: z
      .object({
        instagram_search: toolSettings,
        instagram_profile: toolSettings,
        instagram_followers: toolSettings,
      })
      .strict(),
  })
  .strict();
export const accessSchema = z.object({ userId: z.string().uuid(), enabled: z.boolean() }).strict();

// Translate presentation only; keep the original error for refusal/recovery decisions.
export function clientMessage(message: string): string {
  const messages: Record<string, string> = {
    "Limite diário do fornecedor atingido.":
      "O limite de novas pesquisas da plataforma para hoje foi atingido. Tente em outro dia ou fale com o suporte.",
    "Limite diário de pesquisas atingido.":
      "Você atingiu seu limite de pesquisas de hoje. Tente em outro dia.",
    "Capacidade ocupada. Tente mais tarde.":
      "Há pesquisas em andamento. Aguarde e tente novamente mais tarde.",
    "Confira a pesquisa anterior antes de iniciar outra.":
      "Você tem uma pesquisa aguardando conclusão. Abra Minhas pesquisas e confira o andamento antes de iniciar outra.",
  };
  return messages[message] ?? message;
}
