import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const search = z
  .object({
    requestId: z.string().uuid(),
    niche: z.string().trim().min(2).max(80),
    country: z.string().length(2),
    city: z.string().trim().min(2).max(80),
    region: z.string().trim().max(80),
    filter: z.enum(["all", "missing", "social", "online", "offline", "unknown"]),
    quantity: z.number().int().min(1).max(20),
    expectedUnitCents: z.number().int().min(0).max(10000),
  })
  .strict();
export const prospectConfig = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./server")).prospectCall("config"),
);
export const prospectSearch = createServerFn({ method: "POST" })
  .inputValidator(search)
  .handler(async ({ data }) => (await import("./server")).prospectCall("search", data));
export const prospectStatus = createServerFn({ method: "POST" })
  .inputValidator(z.object({ requestId: z.string().uuid() }).strict())
  .handler(async ({ data }) => (await import("./server")).prospectCall("request-status", data));
export const prospectHistory = createServerFn({ method: "POST" })
  .inputValidator(
    z
      .object({
        page: z.number().int().min(0).max(10000),
        search: z.string().trim().max(80),
        status: z.enum(["all", "new", "contacted", "negotiating", "won", "discarded"]),
        source: z.enum(["all","maps","cnpj"]).optional(),
      })
      .strict(),
  )
  .handler(async ({ data }) => (await import("./server")).prospectCall("history", data));
export const prospectLeadStatus = createServerFn({ method: "POST" })
  .inputValidator(
    z
      .object({
        id: z.string().uuid(),
        source: z.enum(["maps","cnpj"]).optional(),
        status: z.enum(["new", "contacted", "negotiating", "won", "discarded"]),
      })
      .strict(),
  )
  .handler(async ({ data }) => (await import("./server")).prospectCall("lead-status", data));
export const prospectRequests = createServerFn({ method: "POST" })
  .inputValidator(z.object({ page: z.number().int().min(0).max(10000) }).strict())
  .handler(async ({ data }) => (await import("./server")).prospectCall("requests", data));
export const prospectAdminConfig = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./server")).prospectCall("admin-config", {}, true),
);
export const prospectAdminSave = createServerFn({ method: "POST" })
  .inputValidator(
    z
      .object({
        enabled: z.boolean(),
        unitCents: z.number().int().min(0).max(10000),
        cacheDays: z.number().int().min(1).max(30),
        dailyRequests: z.number().int().min(1).max(100),
        dailyCalls: z.number().int().min(0).max(1000000),
        apiKey: z.string().trim().max(200),
      })
      .strict(),
  )
  .handler(async ({ data }) => (await import("./server")).prospectCall("admin-save", data, true));
export const prospectAdminAccount = createServerFn({ method: "POST" })
 .inputValidator(z.object({force:z.boolean().default(false)}).strict())
 .handler(async ({data})=>(await import("./server")).prospectCall("admin-account",data,true));
export const prospectAdminRequests = createServerFn({ method: "POST" })
  .inputValidator(z.object({ page: z.number().int().min(0).max(10000) }).strict())
  .handler(async ({ data }) =>
    (await import("./server")).prospectCall("admin-requests", data, true),
  );

export const prospectAdminBase = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    search: z.string().trim().max(80),
    email: z.string().trim().max(254).refine(v => v === "" || z.string().email().safeParse(v).success, "Informe um e-mail válido."),
    queryId: z.string().max(64),
    page: z.number().int().min(0).max(10000),
    businessPage: z.number().int().min(0).max(10000),
  }).strict())
  .handler(async ({data}) => (await import("./server")).prospectCall("admin-base", data, true));

export const prospectCities = createServerFn({ method: "POST" })
 .inputValidator(z.object({state:z.string().regex(/^[A-Z]{2}$/)}).strict())
 .handler(async({data})=>(await import("./server")).prospectCall("cities",data));

export const prospectDailyQuota = createServerFn({ method: "GET" })
 .handler(async()=>(await import("./server")).prospectCall("daily-quota"));

export const prospectAdminDeliveries = createServerFn({ method: "POST" })
 .inputValidator(z.object({email:z.string().trim().max(254).refine(v=>!v||z.string().email().safeParse(v).success,"Informe um e-mail válido."),company:z.string().trim().max(80),queryId:z.string().max(64),businessId:z.string().max(250),requestId:z.string().refine(v=>!v||z.string().uuid().safeParse(v).success,"Informe uma referência de busca válida."),page:z.number().int().min(0).max(10000)}).strict())
 .handler(async({data})=>(await import("./server")).prospectCall("admin-deliveries",data,true));

export const prospectLeadSummary = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./server")).prospectCall("lead-summary"),
);

export const cnpjConfig = createServerFn({method:"GET"}).handler(async()=>(await import("./server")).prospectCall("cnpj-config"));
export const cnpjAdminConfig = createServerFn({method:"GET"}).handler(async()=>(await import("./server")).prospectCall("admin-cnpj-config",{},true));
export const cnpjAdminSave = createServerFn({method:"POST"}).inputValidator(z.object({enabled:z.boolean(),unitCents:z.number().int().min(0).max(10000),enrichEnabled:z.boolean(),enrichCents:z.number().int().min(0).max(10000),dailyRequests:z.number().int().min(1).max(100),dailyCalls:z.number().int().min(1).max(10000),minuteCalls:z.number().int().min(1).max(100),cacheDays:z.number().int().min(1).max(30),apiKey:z.string().max(500)}).strict()).handler(async({data})=>(await import("./server")).prospectCall("admin-cnpj-save",data,true));
export const cnpjSearch = createServerFn({method:"POST"}).inputValidator(z.object({requestId:z.string().uuid(),mode:z.enum(["search","lookup"]),cnpj:z.string().max(30).optional(),uf:z.string().max(2).optional(),city:z.string().max(80).optional(),cnae:z.string().max(20).optional(),term:z.string().max(80).optional(),size:z.string().max(2).optional(),status:z.string().max(12).optional(),from:z.string().max(10).optional(),until:z.string().max(10).optional(),quantity:z.number().int().min(1).max(20),expectedUnitCents:z.number().int().min(0).max(10000)}).strict()).handler(async({data})=>(await import("./server")).prospectCall("cnpj-search",data));
export const cnpjStatus = createServerFn({method:"POST"}).inputValidator(z.object({requestId:z.string().uuid()}).strict()).handler(async({data})=>(await import("./server")).prospectCall("cnpj-status",data));
export const cnpjEnrich = createServerFn({method:"POST"}).inputValidator(z.object({requestId:z.string().uuid(),leadId:z.string().uuid(),expectedUnitCents:z.number().int().min(0).max(10000)}).strict()).handler(async({data})=>(await import("./server")).prospectCall("cnpj-enrich",data));
export const cnpjHistory = createServerFn({method:"POST"}).inputValidator(z.object({page:z.number().int().min(0).max(10000)}).strict()).handler(async({data})=>(await import("./server")).prospectCall("cnpj-history",data));
export const cnpjAdminHistory = createServerFn({method:"POST"}).inputValidator(z.object({page:z.number().int().min(0).max(10000)}).strict()).handler(async({data})=>(await import("./server")).prospectCall("admin-cnpj-history",data,true));

export const cnpjRefresh = createServerFn({method:"POST"}).inputValidator(z.object({requestId:z.string().uuid(),leadId:z.string().uuid()}).strict()).handler(async({data})=>(await import("./server")).prospectCall("cnpj-refresh",data));
