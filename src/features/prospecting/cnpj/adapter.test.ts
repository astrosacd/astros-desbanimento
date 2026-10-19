import { afterEach, expect, it, vi } from "vitest";
import {
  validCnpj,
  cnpjCriteria,
  casaBody,
  companySnapshot,
  handleCnpj,
} from "../../../../supabase/functions/astros-prospecting/cnpj";
afterEach(() => vi.unstubAllGlobals());
const id = "00000000-0000-4000-8000-000000000010";
const input = {
  mode: "search",
  uf: "ce",
  city: " Fortaleza ",
  cnae: "8630-5/04",
  status: "ATIVA",
  quantity: 1,
  requestId: id,
  expectedUnitCents: 50,
};
it("validates numeric CNPJ check digits, rejects arbitrary and repeated digits", () => {
  expect(validCnpj("11.222.333/0001-81")).toBe(true);
  expect(validCnpj("11111111111111")).toBe(false);
  expect(validCnpj("11222333000180")).toBe(false);
  expect(validCnpj("AB222333000181")).toBe(false);
});
it("uses documented Casa filter names without inventing partner or personal search", () => {
  const c = cnpjCriteria(input);
  expect(c).toMatchObject({ uf: "CE", city: "fortaleza", cnae: "8630504" });
  expect(casaBody(c, 2)).toEqual({
    uf: ["CE"],
    municipio: ["fortaleza"],
    codigo_atividade_principal: ["8630504"],
    situacao_cadastral: ["ATIVA"],
    limite: 20,
    pagina: 2,
  });
  expect(() => cnpjCriteria({ ...input, uf: "XX" })).toThrow();
  expect(() => cnpjCriteria({ ...input, cnae: "dentistas" })).toThrow();
});
it("projects business fields only and never labels a cadastral phone as confirmed WhatsApp", () => {
  const r = companySnapshot({
    cnpj: "11222333000181",
    razao_social: "Empresa",
    telefone: "8533334444",
    email: "empresa@example.test",
    quadro_societario: [{ cpf: "private", nome: "partner" }],
    endereco: { municipio: "Fortaleza", uf: "CE" },
  })!;
  expect(r.source).toBe("cnpj");
  expect(r.contacts.map((c) => c.kind)).toEqual(["phone", "email"]);
  expect(JSON.stringify(r)).not.toMatch(/private|partner|quadro_societario|whatsapp/i);
});
it("does not dispatch a replayed or cached request", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const db = vi
    .fn()
    .mockResolvedValue({ run: false, request: { id, state: "completed", charged_cents: 50 } });
  expect(await handleCnpj("cnpj-search", input, { id: "owner" }, db)).toMatchObject({
    state: "completed",
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(db.mock.calls[0][2].actor).toBe("owner");
});
it("uses a fixed endpoint, refuses redirects and fails without charge on malformed provider data", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ cnpjs: [{ cnpj: "bad", razao_social: "bad" }] })),
    );
  vi.stubGlobal("fetch", fetch);
  const db = vi.fn(async (path: string, _method?: string, body?: any) => {
    if (path.includes("begin")) return { run: true, fetch: true, page: 1 };
    if (path.startsWith("astros_cnpj_private")) return [{ api_key: "private" }];
    if (path.includes("finish")) return { state: "failed", charged_cents: 0, ...body };
    throw Error(path);
  });
  const r = await handleCnpj("cnpj-search", input, { id: "owner" }, db);
  expect(r.charged_cents).toBe(0);
  expect(r.failure).toBe("invalid");
  expect(fetch.mock.calls[0][0]).toBe("https://api.casadosdados.com.br/v5/cnpj/pesquisa");
  expect(fetch.mock.calls[0][1].redirect).toBe("error");
});
it("derives enrichment CNPJ from the owned record rather than caller supplied CNPJ", async () => {
  const db = vi.fn(async (path: string) => {
    if (path.startsWith("astros_cnpj_deliveries")) {
      expect(path).toContain("user_id=eq.owner");
      return [];
    }
    throw Error("not expected");
  });
  await expect(
    handleCnpj(
      "cnpj-enrich",
      { requestId: id, leadId: id, cnpj: "11222333000181", expectedUnitCents: 25 },
      { id: "owner" },
      db,
    ),
  ).rejects.toThrow("Lead CNPJ não encontrado");
});

it.each([[401,"auth"],[402,"billing"],[403,"forbidden"],[429,"rate"],[503,"outage"]])("records only a safe category for HTTP %s",async(status,code)=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("secret raw provider body",{status})));
 const db=vi.fn(async(path:string,_method?:string,body?:any)=>{if(path.includes("begin"))return {run:true,fetch:true,page:1};if(path.startsWith("astros_cnpj_private"))return [{api_key:"private-key"}];if(path.includes("finish"))return {state:"failed",charged_cents:0,...body};throw Error(path);});
 const r=await handleCnpj("cnpj-search",input,{id:"owner"},db);expect(r.failure).toBe(code);expect(JSON.stringify(r)).not.toMatch(/secret|private-key/);
});
it("does not expose technical diagnostics in customer history",async()=>{
 const db=vi.fn().mockResolvedValue([{id,state:"failed",diagnostic:"auth",charged_cents:0}]);
 const r=await handleCnpj("cnpj-history",{page:0},{id:"owner"},db);expect(r.requests[0]).not.toHaveProperty("diagnostic");expect(r.requests[0].failureReason).toBe("unavailable");
});
