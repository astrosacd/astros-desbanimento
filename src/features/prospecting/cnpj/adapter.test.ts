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
it('reads nested cadastral contacts and alternative status formats without personal partner documents',()=>{
 const r=companySnapshot({cnpj:'11222333000181',razao_social:'Empresa exemplo',situacao_cadastral:{descricao:'ATIVA',data:'2023-12-17T00:00:00Z',motivo:'SEM MOTIVO'},contato:{email:['EMPRESA@EXAMPLE.TEST'],telefone:[{ddd:'85',numero:'933334444'}]},atividade_principal:{codigo:'5819100',descricao:'Atividade exemplo'},atividades_secundarias:[{codigo:'1821100',descricao:'Outra atividade'}],codigo_natureza_juridica:'2135',descricao_natureza_juridica:'Empresário (Individual)',matriz_filial:'MATRIZ',mei:{optante:true,data_opcao:'2023-12-17'},simples:{optante:false},quadro_societario:[{documento:'do-not-store',nome:'do-not-store'}]})!;
 expect(r.registrationStatus).toBe('ATIVA');expect(r.registrationDate).toBe('2023-12-17T00:00:00Z');expect(r.contacts.map(c=>c.value)).toEqual(['85933334444','empresa@example.test']);expect(r.secondaryActivities).toEqual(['1821100 · Outra atividade']);expect(r.legalNature).toBe('2135 · Empresário (Individual)');expect(r.mei).toBe(true);expect(r.simples).toBe(false);expect(JSON.stringify(r)).not.toContain('do-not-store');
 expect(companySnapshot({cnpj:'11222333000181',razao_social:'Empresa',situacao_cadastral:'ATIVA'})!.registrationStatus).toBe('ATIVA');
});
it('refresh derives the owned CNPJ and always reserves zero wallet debit',async()=>{
 const db=vi.fn(async(path:string,_method?:string,body?:any)=>{if(path.startsWith('astros_cnpj_deliveries'))return [{cnpj:'11222333000181',snapshot:{source:'cnpj',name:'Empresa'}}];if(path.includes('astros_cnpj_begin')){expect(body.expected_unit).toBe(0);expect(body.input).toEqual({mode:'lookup',cnpj:'11222333000181',refreshLeadId:id});return {run:false,request:{state:'completed',charged_cents:0}};}throw Error(path);});
 const r=await handleCnpj('cnpj-refresh',{requestId:id,leadId:id,expectedUnitCents:999},{id:'owner'},db);expect(r.charged_cents).toBe(0);expect(r.leadSnapshot.name).toBe('Empresa');
});
it('projects real credit totals and lot dates without currency conversion, invented limits or raw data',async()=>{
 const {cnpjCreditBalance}=await import('../../../../supabase/functions/astros-prospecting/cnpj');
 const r=cnpjCreditBalance({saldo_total:200,saldos:{trial:{valor:200,criado_em:'2026-10-19T12:00:00Z',expira_em:'2026-10-26T12:00:00Z'},extra:{valor:null,criado_em:null,expira_em:'invalid'}},api_key:'do-not-return',plan:'not-a-documented-field'});
 expect(r.total).toBe(200);expect(r.lots[0]).toEqual({id:'trial',value:200,createdAt:'2026-10-19T12:00:00Z',expiresAt:'2026-10-26T12:00:00Z'});expect(r.lots[1]).toEqual({id:'extra',value:null,createdAt:null,expiresAt:null});expect(JSON.stringify(r)).not.toMatch(/do-not-return|plan|hour|payment/);expect(()=>cnpjCreditBalance({saldo_total:'200',saldos:{}})).toThrow();expect(cnpjCreditBalance({saldo_total:0,saldos:{}}).total).toBe(0);
});
it('fetches credit balance from the fixed read-only endpoint without returning the private key',async()=>{
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({saldo_total:200,saldos:{trial:{valor:200,criado_em:'2026-10-19',expira_em:'2026-10-26'}}})));vi.stubGlobal('fetch',fetch);
 const db=vi.fn().mockResolvedValue([{api_key:'never-return-key'}]);const r=await handleCnpj('admin-cnpj-balance',{}, {id:'admin',tipo_usuario:'admin'},db);expect(r.total).toBe(200);expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][0]).toBe('https://api.casadosdados.com.br/v5/saldo');expect(fetch.mock.calls[0][1].method).toBe('GET');expect(JSON.stringify(r)).not.toContain('never-return-key');expect(db).toHaveBeenCalledTimes(1);
});
it('rejects client balance reads before retrieving provider credentials',async()=>{const db=vi.fn();await expect(handleCnpj('admin-cnpj-balance',{}, {id:'client',tipo_usuario:'cliente'},db)).rejects.toThrow('Acesso administrativo');expect(db).not.toHaveBeenCalled();});
it('reads bounded business contact arrays, pairs DDD once and excludes partner contacts',()=>{
 const r=companySnapshot({cnpj:'11222333000181',razao_social:'Empresa',contatos:[{telefones:[{ddd:85,numero_telefone:933334444},{ddd:85,numero:'85933334444'}],emails:[{endereco:'EMPRESA@example.test'}]}],situacao_cadastral:{situacao_cadastral:{descricao:'ATIVA'}},quadro_societario:[{telefone:'11999999999',email:'partner@example.test'}]})!;
 expect(r.phone).toBe('85933334444');expect(r.contacts.map(c=>c.value)).toEqual(['85933334444','empresa@example.test']);expect(r.registrationStatus).toBe('ATIVA');expect(JSON.stringify(r)).not.toMatch(/partner|11999999999/);
});
