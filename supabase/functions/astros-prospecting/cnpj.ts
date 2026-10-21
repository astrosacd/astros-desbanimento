// Fixed provider endpoints; no customer-supplied URL, key, actor or balance.
type Obj = Record<string, any>;
type Db = (path: string, method?: string, body?: unknown) => Promise<any>;
const cnpjText = (v: unknown, max = 200) =>
  typeof v === "string"
    ? v
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim()
        .slice(0, max)
    : "";
export function validCnpj(value: unknown) {
  const v = typeof value === "string" ? value.replace(/[.\/-]/g, "").trim() : "";
  if (!/^\d{14}$/.test(v) || /^(\d)\1+$/.test(v)) return false;
  for (const size of [12, 13]) {
    let sum = 0,
      weight = size - 7;
    for (let i = 0; i < size; i++) {
      sum += Number(v[i]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (digit !== Number(v[size])) return false;
  }
  return true;
}
export function cnpjCriteria(v: Obj) {
  const mode = v.mode === "lookup" ? "lookup" : v.mode === "search" ? "search" : "";
  if (mode === "lookup") {
    const cnpj = cnpjText(v.cnpj, 30).replace(/[.\/-]/g, "");
    if (!validCnpj(cnpj)) throw Error("Informe um CNPJ numérico válido.");
    return { mode, cnpj };
  }
  const uf = cnpjText(v.uf, 2).toUpperCase(),
    city = cnpjText(v.city, 80).normalize("NFC").toLowerCase().replace(/\s+/g, " "),
    cnae = cnpjText(v.cnae, 20).replace(/[.\/-]/g, ""),
    term = cnpjText(v.term, 80);
  if (
    !mode ||
    ![
      "AC",
      "AL",
      "AP",
      "AM",
      "BA",
      "CE",
      "DF",
      "ES",
      "GO",
      "MA",
      "MT",
      "MS",
      "MG",
      "PA",
      "PB",
      "PR",
      "PE",
      "PI",
      "RJ",
      "RN",
      "RS",
      "RO",
      "RR",
      "SC",
      "SP",
      "SE",
      "TO",
    ].includes(uf) ||
    city.length < 2 ||
    (cnae && !/^\d{7}$/.test(cnae))
  )
    throw Error("Confira o estado, a cidade e o CNAE.");
  const size = cnpjText(v.size, 2),
    status = cnpjText(v.status, 12),
    from = cnpjText(v.from, 10),
    until = cnpjText(v.until, 10);
  if (
    (size && !["01", "03", "05"].includes(size)) ||
    (status && !["ATIVA", "BAIXADA", "INAPTA", "SUSPENSA", "NULA"].includes(status)) ||
    [from, until].some((d) => d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) ||
    (from && until && from > until)
  )
    throw Error("Filtros CNPJ inválidos");
  return { mode, uf, city, cnae, term, size, status, from, until };
}
export function casaBody(c: Obj, page: number) {
  return {
    uf: [c.uf],
    municipio: [c.city],
    ...(c.cnae ? { codigo_atividade_principal: [c.cnae] } : {}),
    ...(c.term
      ? {
          busca_textual: [
            { texto: [c.term], tipo_busca: "exata", razao_social: true, nome_fantasia: true },
          ],
        }
      : {}),
    ...(c.size ? { porte_empresa: { codigos: [c.size] } } : {}),
    ...(c.status ? { situacao_cadastral: [c.status] } : {}),
    ...(c.from || c.until
      ? {
          data_abertura: {
            ...(c.from ? { inicio: c.from } : {}),
            ...(c.until ? { fim: c.until } : {}),
          },
        }
      : {}),
    limite: 20,
    pagina: page,
  };
}
const cnpjValue = (v: unknown, max = 200) =>
  typeof v === "number" && Number.isFinite(v) ? String(v) : cnpjText(v, max);
const cnpjDescription = (v: any) =>
  typeof v === "string" ? cnpjText(v) : cnpjText(v?.descricao || v?.text || v?.nome);
const cnpjActivity = (v: any) =>
  typeof v === "string"
    ? cnpjText(v, 500)
    : [cnpjValue(v?.codigo || v?.code, 20), cnpjDescription(v)].filter(Boolean).join(" · ");
const cnpjBoolean = (v: any) =>
  typeof v === "boolean"
    ? v
    : typeof v === "string" && /^(sim|não|nao|true|false)$/i.test(v)
      ? /^(sim|true)$/i.test(v)
      : null;
export function companySnapshot(r: Obj, receita = false) {
  // Some full responses wrap the business fields. Only merge an object for the same CNPJ.
  if (!receita && r.completo && typeof r.completo === "object" && !Array.isArray(r.completo)) {
    const full = r.completo;
    if (full.cnpj && String(full.cnpj).replace(/\D/g, "") !== String(r.cnpj).replace(/\D/g, ""))
      return null;
    r = { ...r, ...full, cnpj: r.cnpj };
  }
  const cnpj = cnpjText(r.cnpj, 30).replace(/\D/g, "");
  if (!validCnpj(cnpj)) return null;
  const address = receita ? r : r.endereco || r,
    legalName = cnpjText(receita ? r.nome : r.razao_social),
    tradeName = cnpjText(receita ? r.fantasia : r.nome_fantasia),
    name = tradeName || legalName;
  if (!name) return null;
  const now = new Date().toISOString();
  const list = (v: any): any[] => (Array.isArray(v) ? v.slice(0, 30) : v == null ? [] : [v]);
  // Read business contact fields only. Never recurse into partners, documents or addresses.
  const contactRoots = [r, ...list(r.contato), ...list(r.contatos)].filter(
    (v) => v && typeof v === "object" && !Array.isArray(v),
  );
  const phoneValues: string[] = [];
  const emailValues: string[] = [];
  function readPhone(value: any, ddd: unknown = "", depth = 0) {
    if (depth > 3) return;
    if (Array.isArray(value)) {
      value.slice(0, 30).forEach((v) => readPhone(v, ddd, depth + 1));
      return;
    }
    if (value && typeof value === "object") {
      const prefix = value.ddd ?? value.codigo_ddd ?? ddd;
      for (const key of ["numero", "telefone", "numero_telefone", "valor", "telefones"])
        if (value[key] != null) readPhone(value[key], prefix, depth + 1);
      return;
    }
    // Restrict accepted characters: metadata and arbitrary document strings are not phones.
    for (const part of cnpjValue(value, 200).split(/[;,/]/)) {
      if (!/^[+\d().\s-]+$/.test(part)) continue;
      let digits = part.replace(/\D/g, "");
      const prefix = cnpjValue(ddd, 3).replace(/\D/g, "");
      if (/^\d{8,9}$/.test(digits) && /^\d{2}$/.test(prefix)) digits = prefix + digits;
      if (/^\d{10,13}$/.test(digits)) phoneValues.push(digits);
    }
  }
  function readEmail(value: any, depth = 0) {
    if (depth > 3) return;
    if (Array.isArray(value)) {
      value.slice(0, 30).forEach((v) => readEmail(v, depth + 1));
      return;
    }
    if (value && typeof value === "object") {
      for (const key of ["email", "endereco", "valor", "emails"])
        if (value[key] != null) readEmail(value[key], depth + 1);
      return;
    }
    for (const part of cnpjText(value, 500).split(/[;,]/)) {
      const email = part.trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) emailValues.push(email);
    }
  }
  for (const root of contactRoots) {
    for (const key of ["telefone", "telefones", "telefone_comercial", "contato_telefonico"])
      readPhone(root[key], root.ddd);
    for (const n of [1, 2]) {
      readPhone(root["telefone_" + n], root["ddd_" + n] ?? root.ddd);
      readPhone(root["telefone" + n], root["ddd" + n] ?? root.ddd);
    }
    for (const key of ["email", "emails", "correio_eletronico", "contato_email"])
      readEmail(root[key]);
  }
  const phones = [...new Set(phoneValues)].slice(0, 5);
  const emails = [...new Set(emailValues)].slice(0, 5);
  const contacts = [
    ...phones.map((phone: string) => ({
      kind: "phone",
      label: "Telefone cadastrado",
      value: phone,
      url: "tel:" + phone,
      source: "cnpj",
    })),
    ...emails.map((email: string) => ({
      kind: "email",
      label: "E-mail cadastrado",
      value: email,
      url: "mailto:" + email,
      source: "cnpj",
    })),
  ];
  const activity = receita
    ? r.atividade_principal?.[0]
    : r.atividade_principal ||
      r.cnae_principal || {
        codigo: r.codigo_atividade_principal,
        descricao: r.descricao_atividade_principal,
      };
  const status = r.situacao_cadastral;
  const secondary = list(r.atividades_secundarias || r.atividade_secundaria || r.cnaes_secundarios)
    .map(cnpjActivity)
    .filter(Boolean)
    .slice(0, 100);
  const mei = r.mei ?? r.simei;
  const simples = r.simples ?? r.simples_nacional;

  return {
    id: "cnpj:" + cnpj,
    source: "cnpj",
    cnpj,
    name,
    legalName,
    tradeName,
    address: [
      address.tipo_logradouro,
      address.logradouro,
      address.numero,
      address.complemento,
      address.bairro,
      address.municipio,
      address.uf,
      address.cep,
    ]
      .map((v) => cnpjText(v, 100))
      .filter(Boolean)
      .join(", ")
      .slice(0, 500),
    city: cnpjText(address.municipio, 80),
    region: cnpjText(address.uf, 2),
    phone: phones[0] || "",
    contacts,
    website: "",
    websiteStatus: "unknown",
    websiteReason: "O site não é verificado na pesquisa por CNPJ.",
    checkedAt: now,
    collectedAt: now,
    rating: null,
    reviews: null,
    mapsUrl: "",
    activity: cnpjText(
      typeof activity === "string"
        ? activity
        : activity?.descricao || activity?.text || r.descricao_atividade_principal,
    ),
    activityCode: cnpjValue(activity?.codigo || activity?.code || r.codigo_atividade_principal, 20),
    size: cnpjDescription(receita ? r.porte : r.porte_empresa),
    registrationStatus: cnpjText(
      receita
        ? r.situacao
        : typeof status === "string"
          ? status
          : cnpjDescription(status?.situacao_cadastral) ||
            status?.descricao ||
            status?.situacao ||
            status?.situacao_atual ||
            status?.texto,
    ),
    registrationDate: cnpjText(status?.data || r.data_situacao_cadastral || r.data_situacao, 40),
    registrationReason: cnpjDescription(status?.motivo || r.motivo_situacao_cadastral),
    legalNature: [
      cnpjValue(r.codigo_natureza_juridica || r.natureza_juridica?.codigo, 20),
      cnpjDescription(r.descricao_natureza_juridica || r.natureza_juridica),
    ]
      .filter(Boolean)
      .join(" · "),
    secondaryActivities: secondary,
    branch: cnpjDescription(receita ? r.tipo : r.matriz_filial),
    mei: cnpjBoolean(typeof mei === "object" ? mei?.optante : mei),
    simples: cnpjBoolean(typeof simples === "object" ? simples?.optante : simples),
    meiSince: cnpjText(mei?.data_opcao || mei?.data_inicio, 40),
    simplesSince: cnpjText(simples?.data_opcao || simples?.data_inicio, 40),
    providerUpdatedAt: cnpjText(r.atualizado_em || r.ultima_atualizacao || r.atualizado, 40),
    dataVersion: 4,
    openedAt: cnpjText(receita ? r.abertura : r.data_abertura, 20),
    capitalSocial:
      typeof r.capital_social === "number" && Number.isFinite(r.capital_social)
        ? String(r.capital_social)
        : cnpjText(r.capital_social, 40),
    enriched: receita,
  };
}
// Merge only projected business fields. Existing values (including false/zero) remain authoritative.
export function mergeCnpjEnrichment(original: Obj, extra: Obj) {
  if (!original?.cnpj || original.cnpj !== extra.cnpj) throw Error("CNPJ_invalid");
  const merged: Obj = { ...original };
  const fields = [
    "legalName",
    "tradeName",
    "address",
    "city",
    "region",
    "phone",
    "activity",
    "activityCode",
    "size",
    "registrationStatus",
    "registrationDate",
    "registrationReason",
    "openedAt",
    "capitalSocial",
    "legalNature",
    "secondaryActivities",
    "branch",
    "mei",
    "simples",
    "meiSince",
    "simplesSince",
  ];
  const missing = (v: any) => v == null || v === "" || v === "-" || (Array.isArray(v) && !v.length);
  const compare = (key: string, v: any) => {
    if (typeof v !== "string") return JSON.stringify(v);
    if (["phone", "activityCode"].includes(key)) return v.replace(/\D/g, "");
    if (["openedAt", "registrationDate", "meiSince", "simplesSince"].includes(key)) {
      const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return m ? `${m[3]}-${m[2]}-${m[1]}` : v.slice(0, 10);
    }
    return v.trim().toLocaleLowerCase("pt-BR");
  };
  const addedFields: string[] = [],
    differences: Obj[] = [];
  for (const field of fields) {
    if (missing(extra[field])) continue;
    if (missing(original[field])) {
      merged[field] = extra[field];
      addedFields.push(field);
    } else if (compare(field, original[field]) !== compare(field, extra[field]))
      differences.push({ field, value: extra[field] });
  }
  const contacts = [...(original.contacts || [])];
  for (const contact of extra.contacts || []) {
    if (!["phone", "email"].includes(contact.kind) || !contact.url) continue;
    const key = (c: Obj) =>
      c.kind +
      ":" +
      (c.kind === "phone" ? String(c.value).replace(/\D/g, "") : String(c.value).toLowerCase());
    if (contacts.some((c) => key(c) === key(contact))) continue;
    contacts.push({
      ...contact,
      label:
        contact.kind === "phone"
          ? "Telefone complementar (ReceitaWS)"
          : "E-mail complementar (ReceitaWS)",
    });
  }
  merged.contacts = contacts.slice(0, 20);
  merged.enriched = true;
  merged.enrichment = {
    source: "receitaws",
    queriedAt: new Date().toISOString(),
    providerUpdatedAt: extra.providerUpdatedAt || "",
    addedFields,
    differences,
    hasNewData: !!(
      addedFields.length ||
      differences.length ||
      contacts.length > (original.contacts || []).length
    ),
  };
  return merged;
}
async function provider(url: string, options: RequestInit) {
  const r = await fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(20000) });
  if (!r.ok) {
    const code =
      (
        {
          400: "request",
          401: "auth",
          402: "billing",
          403: "forbidden",
          404: "not_found",
          429: "rate",
        } as Record<number, string>
      )[r.status] || (r.status >= 500 ? "outage" : "http");
    throw Error("CNPJ_" + code);
  }
  const reader = r.body?.getReader();
  if (!reader) throw Error("CNPJ_invalid");
  let size = 0,
    result = "";
  const decoder = new TextDecoder();
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > 2 * 1024 * 1024) {
      await reader.cancel();
      throw Error("CNPJ_invalid");
    }
    result += decoder.decode(chunk.value, { stream: true });
  }
  result += decoder.decode();
  let v: Obj;
  try {
    v = JSON.parse(result);
  } catch {
    throw Error("CNPJ_invalid");
  }
  if (!v || typeof v !== "object" || v.error || v.status === "ERROR") throw Error("CNPJ_invalid");
  return v as Obj;
}
const integer = (v: unknown, max = 10000) => {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 || v > max)
    throw Error("Configuração CNPJ inválida");
  return v;
};
export function cnpjCreditBalance(value: Obj) {
  if (
    typeof value.saldo_total !== "number" ||
    !Number.isFinite(value.saldo_total) ||
    value.saldo_total < 0 ||
    !value.saldos ||
    typeof value.saldos !== "object" ||
    Array.isArray(value.saldos) ||
    Object.keys(value.saldos).length > 200
  )
    throw Error("CNPJ_invalid");
  const date = (v: unknown) =>
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(v) &&
    v.length <= 64 &&
    Number.isFinite(Date.parse(v))
      ? v
      : null;
  return {
    total: value.saldo_total,
    lots: Object.entries(value.saldos).map(([id, raw]) => {
      const lot = raw && typeof raw === "object" ? (raw as Obj) : {};
      return {
        id: cnpjText(id, 100),
        value:
          typeof lot.valor === "number" && Number.isFinite(lot.valor) && lot.valor >= 0
            ? lot.valor
            : null,
        createdAt: date(lot.criado_em),
        expiresAt: date(lot.expira_em),
      };
    }),
    fetchedAt: new Date().toISOString(),
  };
}
export async function handleCnpj(action: string, data: Obj, actor: Obj, db: Db) {
  if (action === "cnpj-config" || action === "admin-cnpj-config")
    return db("rpc/astros_cnpj_config", "POST", {
      actor: actor.id,
      administrator: action.startsWith("admin-"),
    });
  if (action === "admin-cnpj-balance") {
    if (actor.tipo_usuario !== "admin") throw Error("Acesso administrativo necessário.");
    const key = (await db("astros_cnpj_private?id=eq.true&select=api_key"))[0]?.api_key;
    if (!key) throw Error("Configure a chave CNPJ antes de consultar o saldo.");
    try {
      return cnpjCreditBalance(
        await provider("https://api.casadosdados.com.br/v5/saldo", {
          method: "GET",
          headers: { "api-key": key, Accept: "application/json" },
        }),
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      throw Error(
        (
          {
            CNPJ_auth: "A credencial foi recusada pela Casa dos Dados. Confira a chave cadastrada.",
            CNPJ_forbidden:
              "A Casa dos Dados não autorizou a consulta de saldo. Confira as permissões.",
            CNPJ_rate:
              "A Casa dos Dados limitou as consultas de saldo. Aguarde antes de atualizar.",
            CNPJ_invalid: "A Casa dos Dados retornou um saldo em formato não reconhecido.",
          } as Record<string, string>
        )[code] ||
          "Não foi possível atualizar o saldo da Casa dos Dados. Tente novamente mais tarde.",
      );
    }
  }
  if (action === "admin-cnpj-base" || action === "admin-cnpj-deliveries") {
    if (actor.tipo_usuario !== "admin") throw Error("Acesso administrativo necessário.");
    const search = cnpjText(data.search, 80),
      email = cnpjText(data.email, 254).toLowerCase();
    const query = cnpjText(data.queryId, 64),
      request = cnpjText(data.requestId, 36);
    if (
      request &&
      !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(request)
    )
      throw Error("Referência CNPJ inválida");
    return db("rpc/astros_cnpj_admin_audit", "POST", {
      actor: actor.id,
      view_mode: action === "admin-cnpj-base" ? "businesses" : "deliveries",
      search_text: search,
      account_email: email,
      query_key: query,
      request_key: request || null,
      page_number: integer(data.page ?? 0),
    });
  }
  if (action === "admin-cnpj-save") {
    const settings = {
      enabled: data.enabled === true,
      unitCents: integer(data.unitCents),
      enrichEnabled: data.enrichEnabled === true,
      enrichCents: integer(data.enrichCents),
      dailyRequests: integer(data.dailyRequests, 100),
      dailyCalls: integer(data.dailyCalls),
      minuteCalls: integer(data.minuteCalls, 100),
      cacheDays: integer(data.cacheDays, 30),
    };
    if (
      Object.entries(settings).some(
        ([k, v]) =>
          ["dailyRequests", "dailyCalls", "minuteCalls", "cacheDays"].includes(k) && Number(v) < 1,
      ) ||
      typeof data.apiKey !== "string" ||
      data.apiKey.length > 500 ||
      /[\u0000-\u001f\u007f]/.test(data.apiKey)
    )
      throw Error("Configuração CNPJ inválida");
    await db("rpc/astros_cnpj_save", "POST", {
      actor: actor.id,
      settings,
      new_key: data.apiKey.trim(),
    });
    return { saved: true };
  }
  if (action === "cnpj-history" || action === "admin-cnpj-history") {
    const p = new URLSearchParams({
      select: action.startsWith("admin-")
        ? "id,query_id,operation,criteria,state,quantity,delivered,charged_cents,created_at,user_id,diagnostic,painel_de_desbanimento(nome,email)"
        : "id,operation,criteria,state,quantity,delivered,charged_cents,created_at,diagnostic",
      order: "created_at.desc,id.desc",
      limit: "21",
      offset: String(integer(data.page ?? 0) * 20),
    });
    if (!action.startsWith("admin-")) p.set("user_id", "eq." + actor.id);
    const rows = await db("astros_cnpj_requests?" + p);
    return {
      requests: rows.slice(0, 20).map((row: Obj) =>
        action.startsWith("admin-")
          ? row
          : (({ diagnostic, ...safe }) => ({
              ...safe,
              failureReason:
                diagnostic === "balance"
                  ? "balance"
                  : row.state === "failed"
                    ? "unavailable"
                    : null,
            }))(row),
      ),
      hasMore: rows.length > 20,
    };
  }
  if (!["cnpj-search", "cnpj-enrich", "cnpj-status", "cnpj-refresh"].includes(action))
    throw Error("Operação CNPJ indisponível");
  if (
    typeof data.requestId !== "string" ||
    !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(data.requestId)
  )
    throw Error("Referência CNPJ inválida");
  if (action === "cnpj-status") {
    const result = await db("rpc/astros_cnpj_status", "POST", {
      actor: actor.id,
      request_id: data.requestId,
    });
    if (
      result.state === "completed" &&
      (result.criteria?.refreshLeadId || result.criteria?.leadId)
    ) {
      const row = (
        await db(
          "astros_cnpj_deliveries?id=eq." +
            encodeURIComponent(result.criteria.refreshLeadId || result.criteria.leadId) +
            "&user_id=eq." +
            actor.id +
            "&select=snapshot&limit=1",
        )
      )[0];
      return { ...result, leadSnapshot: row?.snapshot };
    }
    return result;
  }
  let input: Obj, op: string, wanted: number, original: Obj | undefined;
  if (action === "cnpj-enrich" || action === "cnpj-refresh") {
    if (
      typeof data.leadId !== "string" ||
      !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(data.leadId)
    )
      throw Error("Lead CNPJ não encontrado");
    const row = (
      await db(
        "astros_cnpj_deliveries?id=eq." +
          encodeURIComponent(data.leadId) +
          "&user_id=eq." +
          actor.id +
          "&select=cnpj,snapshot&limit=1",
      )
    )[0];
    if (!row) throw Error("Lead CNPJ não encontrado");
    input =
      action === "cnpj-refresh"
        ? { mode: "lookup", refreshLeadId: data.leadId, cnpj: row.cnpj }
        : { leadId: data.leadId, cnpj: row.cnpj };
    original = row.snapshot;
    op = action === "cnpj-refresh" ? "lookup" : "enrich";
    wanted = 1;
  } else {
    input = cnpjCriteria(data);
    op = input.mode;
    wanted = op === "lookup" ? 1 : integer(data.quantity, 20);
    if (!wanted) throw Error("Informe de 1 a 20 empresas.");
  }
  const job = await db("rpc/astros_cnpj_begin", "POST", {
    actor: actor.id,
    request_id: data.requestId,
    op,
    input,
    wanted,
    expected_unit: action === "cnpj-refresh" ? 0 : integer(data.expectedUnitCents),
  });
  if (!job.run)
    return original && job.request.state === "completed"
      ? { ...job.request, leadSnapshot: original }
      : job.request;
  let rows: Obj[] = [],
    hasNext = false;
  if (job.fetch) {
    try {
      if (op === "enrich") {
        const v = await provider("https://www.receitaws.com.br/v1/cnpj/" + input.cnpj, {
          headers: { Accept: "application/json" },
        });
        const enriched = companySnapshot(v, true);
        if (!enriched || enriched.cnpj !== input.cnpj) throw Error("CNPJ_invalid");
        rows = [mergeCnpjEnrichment(original!, enriched)];
      } else {
        const key = (await db("astros_cnpj_private?id=eq.true&select=api_key"))[0]?.api_key;
        if (!key) throw Error("CNPJ_invalid");
        const v = await provider(
          "https://api.casadosdados.com.br/" +
            (op === "lookup"
              ? "v4/cnpj/" + input.cnpj
              : "v5/cnpj/pesquisa?tipo_resultado=completo"),
          {
            method: op === "lookup" ? "GET" : "POST",
            headers: {
              "api-key": key,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            ...(op === "search" ? { body: JSON.stringify(casaBody(input, job.page)) } : {}),
          },
        );
        const found = op === "lookup" ? [v] : v.cnpjs;
        if (!Array.isArray(found)) throw Error("CNPJ_invalid");
        if (found.length > 20) throw Error("CNPJ_invalid");
        if (
          op === "search" &&
          found.some((r: Obj) => {
            const full = r?.completo && typeof r.completo === "object" ? r.completo : r;
            return (
              !full ||
              ![
                "endereco",
                "data_abertura",
                "capital_social",
                "contato",
                "contato_telefonico",
                "telefone",
              ].some((k) => Object.prototype.hasOwnProperty.call(full, k))
            );
          })
        )
          throw Error("CNPJ_invalid");
        rows = found.map((r) => companySnapshot(r)).filter(Boolean) as Obj[];
        if (rows.length !== found.length) throw Error("CNPJ_invalid");
        rows = rows.filter((r, i, a) => a.findIndex((v) => v.cnpj === r.cnpj) === i);
        if (op === "lookup" && (!rows[0] || rows[0].cnpj !== input.cnpj))
          throw Error("CNPJ_invalid");
        hasNext =
          op === "search" &&
          (typeof v.total === "number" ? job.page * 20 < v.total : found.length === 20);
      }
    } catch (error) {
      const code = error instanceof Error ? error.message.replace(/^CNPJ_/, "") : "";
      const diagnostic = [
        "auth",
        "billing",
        "forbidden",
        "request",
        "not_found",
        "rate",
        "outage",
        "http",
        "invalid",
      ].includes(code)
        ? code
        : error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
          ? "timeout"
          : "connection";
      return db("rpc/astros_cnpj_finish", "POST", {
        actor: actor.id,
        request_id: data.requestId,
        failure: diagnostic,
      });
    }
  }
  const result = await db("rpc/astros_cnpj_finish", "POST", {
    actor: actor.id,
    request_id: data.requestId,
    rows_input: rows,
    has_next: hasNext,
  });
  if (original && result.state === "completed") {
    const updated = (
      await db(
        "astros_cnpj_deliveries?id=eq." +
          encodeURIComponent(data.leadId) +
          "&user_id=eq." +
          actor.id +
          "&select=snapshot&limit=1",
      )
    )[0];
    return { ...result, leadSnapshot: updated?.snapshot };
  }
  return result;
}
