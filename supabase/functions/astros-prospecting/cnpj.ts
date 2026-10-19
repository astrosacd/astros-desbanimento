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
export function companySnapshot(r: Obj, receita = false) {
  const cnpj = cnpjText(r.cnpj, 30).replace(/\D/g, "");
  if (!validCnpj(cnpj)) return null;
  const address = receita ? r : r.endereco || {},
    legalName = cnpjText(receita ? r.nome : r.razao_social),
    tradeName = cnpjText(receita ? r.fantasia : r.nome_fantasia),
    name = tradeName || legalName;
  if (!name) return null;
  const now = new Date().toISOString(),
    phones = (
      Array.isArray(r.telefones) ? r.telefones : typeof r.telefone === "string" ? [r.telefone] : []
    )
      .flatMap((v: unknown) => {
        const raw =
          typeof v === "string"
            ? v
            : v && typeof v === "object"
              ? String((v as Obj).ddd || "") +
                String((v as Obj).numero || (v as Obj).telefone || "")
              : "";
        return raw
          .split(/[\/;,]/)
          .map((p) => p.replace(/\D/g, ""))
          .filter((p) => /^\d{10,13}$/.test(p));
      })
      .slice(0, 4);
  const emails = (Array.isArray(r.emails) ? r.emails : typeof r.email === "string" ? [r.email] : [])
    .map((v: unknown) =>
      cnpjText(
        typeof v === "string" ? v : v && typeof v === "object" ? (v as Obj).email : "",
        254,
      ).toLowerCase(),
    )
    .filter((v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
    .slice(0, 5);
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
  const activity = receita ? r.atividade_principal?.[0] : r.atividade_principal || r.cnae_principal;
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
    activityCode: cnpjText(activity?.codigo || activity?.code || r.codigo_atividade_principal, 20),
    size: cnpjText(receita ? r.porte : r.porte_empresa?.descricao),
    registrationStatus: cnpjText(receita ? r.situacao : r.situacao_cadastral?.situacao_cadastral),
    openedAt: cnpjText(receita ? r.abertura : r.data_abertura, 20),
    capitalSocial:
      typeof r.capital_social === "number" && Number.isFinite(r.capital_social)
        ? String(r.capital_social)
        : cnpjText(r.capital_social, 40),
    enriched: receita,
  };
}
async function provider(url: string, options: RequestInit) {
  const r = await fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw Error("CNPJ_PROVIDER");
  const reader = r.body?.getReader();
  if (!reader) throw Error("CNPJ_PROVIDER");
  let size = 0,
    result = "";
  const decoder = new TextDecoder();
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > 2 * 1024 * 1024) {
      await reader.cancel();
      throw Error("CNPJ_PROVIDER");
    }
    result += decoder.decode(chunk.value, { stream: true });
  }
  result += decoder.decode();
  const v = JSON.parse(result);
  if (!v || typeof v !== "object" || v.error || v.status === "ERROR") throw Error("CNPJ_PROVIDER");
  return v as Obj;
}
const integer = (v: unknown, max = 10000) => {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 || v > max)
    throw Error("Configuração CNPJ inválida");
  return v;
};
export async function handleCnpj(action: string, data: Obj, actor: Obj, db: Db) {
  if (action === "cnpj-config" || action === "admin-cnpj-config")
    return db("rpc/astros_cnpj_config", "POST", {
      actor: actor.id,
      administrator: action.startsWith("admin-"),
    });
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
        ? "id,operation,criteria,state,quantity,delivered,charged_cents,created_at,user_id,diagnostic,painel_de_desbanimento(nome,email)"
        : "id,operation,criteria,state,quantity,delivered,charged_cents,created_at",
      order: "created_at.desc,id.desc",
      limit: "21",
      offset: String(integer(data.page ?? 0) * 20),
    });
    if (!action.startsWith("admin-")) p.set("user_id", "eq." + actor.id);
    const rows = await db("astros_cnpj_requests?" + p);
    return { requests: rows.slice(0, 20), hasMore: rows.length > 20 };
  }
  if (!["cnpj-search", "cnpj-enrich", "cnpj-status"].includes(action))
    throw Error("Operação CNPJ indisponível");
  if (
    typeof data.requestId !== "string" ||
    !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(data.requestId)
  )
    throw Error("Referência CNPJ inválida");
  if (action === "cnpj-status")
    return db("rpc/astros_cnpj_status", "POST", { actor: actor.id, request_id: data.requestId });
  let input: Obj, op: string, wanted: number, original: Obj | undefined;
  if (action === "cnpj-enrich") {
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
    input = { leadId: data.leadId, cnpj: row.cnpj };
    original = row.snapshot;
    op = "enrich";
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
    expected_unit: integer(data.expectedUnitCents),
  });
  if (!job.run) return job.request;
  let rows: Obj[] = [],
    hasNext = false;
  if (job.fetch) {
    try {
      if (op === "enrich") {
        const v = await provider("https://www.receitaws.com.br/v1/cnpj/" + input.cnpj, {
          headers: { Accept: "application/json" },
        });
        const enriched = companySnapshot(v, true);
        if (!enriched || enriched.cnpj !== input.cnpj) throw Error("CNPJ_PROVIDER");
        rows = [
          {
            ...original,
            ...enriched,
            phone: enriched.phone || original?.phone || "",
            contacts: [...(enriched.contacts || []), ...(original?.contacts || [])]
              .filter((c, i, a) => a.findIndex((v) => v.url === c.url) === i)
              .slice(0, 20),
          },
        ];
      } else {
        const key = (await db("astros_cnpj_private?id=eq.true&select=api_key"))[0]?.api_key;
        if (!key) throw Error("CNPJ_PROVIDER");
        const v = await provider(
          "https://api.casadosdados.com.br/" +
            (op === "lookup" ? "v4/cnpj/" + input.cnpj : "v5/cnpj/pesquisa"),
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
        if (!Array.isArray(found)) throw Error("CNPJ_PROVIDER");
        if (found.length > 20) throw Error("CNPJ_PROVIDER");
        rows = found.map((r) => companySnapshot(r)).filter(Boolean) as Obj[];
        if (rows.length !== found.length) throw Error("CNPJ_PROVIDER");
        rows = rows.filter((r, i, a) => a.findIndex((v) => v.cnpj === r.cnpj) === i);
        if (op === "lookup" && (!rows[0] || rows[0].cnpj !== input.cnpj))
          throw Error("CNPJ_PROVIDER");
        hasNext =
          op === "search" &&
          (typeof v.total === "number" ? job.page * 20 < v.total : found.length === 20);
      }
    } catch {
      return db("rpc/astros_cnpj_finish", "POST", {
        actor: actor.id,
        request_id: data.requestId,
        failure: "provider",
      });
    }
  }
  return db("rpc/astros_cnpj_finish", "POST", {
    actor: actor.id,
    request_id: data.requestId,
    rows_input: rows,
    has_next: hasNext,
  });
}
