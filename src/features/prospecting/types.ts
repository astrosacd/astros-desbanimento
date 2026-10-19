export const siteLabels = {
  all: "Todas as situações",
  missing: "Sem site informado",
  social: "Apenas rede social / links",
  online: "Site acessível",
  offline: "Possível problema no site",
  unknown: "Verificação inconclusiva",
};
export const stageLabels = {
  new: "Novo",
  contacted: "Contatado",
  negotiating: "Em negociação",
  won: "Fechado",
  discarded: "Descartado",
};
export type ProspectConfig = {
  enabled: boolean;
  unitCents: number;
  maxQuantity: number;
  cacheDays?: number;
  dailyRequests?: number;
  dailyCalls?: number;
  hasKey?: boolean;
};
export type Lead = {
  id: string;
  status: keyof typeof stageLabels;
  created_at: string;
  request_id: string;
  snapshot: {
    id: string;
    source?: "cnpj" | "maps";
    registrationDate?:string; registrationReason?:string; legalNature?:string; secondaryActivities?:string[]; branch?:string; mei?:boolean|null; simples?:boolean|null; meiSince?:string; simplesSince?:string; providerUpdatedAt?:string; dataVersion?:number;
    cnpj?: string; legalName?:string; tradeName?:string; activity?:string; activityCode?:string; size?:string; registrationStatus?:string; openedAt?:string; capitalSocial?:string; enriched?:boolean;
    name: string;
    address: string;
    phone: string;
    website: string;
    websiteStatus: keyof typeof siteLabels;
    websiteReason: string;
    contacts?: {kind:string;label:string;value:string;url:string;source:"site"|"maps"|"cnpj"}[];
    siteTitle?: string;
    siteSummary?: string;
    siteEmails?: string[];
    siteReadAt?: string;
    checkedAt: string;
    collectedAt: string;
    rating: number | null;
    reviews: number | null;
    mapsUrl: string;
  };
};
export type ProspectRequest = {
  id: string;
  quantity: number;
  unit_cents: number;
  state: "queued" | "processing" | "completed" | "failed";
  failureReason?: string;
  queue_reason?: string;
  next_attempt_at?: string;
  delivered: number;
  charged_cents: number;
  created_at: string;
  criteria?: { niche: string; city: string; country: string };
  diagnostic?: string;
  painel_de_desbanimento?: { nome: string; email: string };
};
export const money = (n: number) =>
  (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function exportLeads(leads: Lead[]) {
  const escape = (s: unknown) => {
    const text = String(s ?? "");
    return '"' + (/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replaceAll('"', '""') + '"';
  };
  const rows = [
    [
      "Origem",
      "CNPJ",
      "Nome",
      "Telefone",
      "Endereço",
      "Site",
      "Situação do site",
      "Verificado em",
      "Google Maps",
      "Etapa",
      "E-mails publicados no site",
      "Resumo do site",
      "Outros contatos publicados",
    ],
    ...leads.map((l) => [
      l.snapshot.source === "cnpj" ? "CNPJ" : "Google Maps",
      l.snapshot.cnpj || "",
      l.snapshot.name,
      l.snapshot.phone,
      l.snapshot.address,
      l.snapshot.website,
      siteLabels[l.snapshot.websiteStatus],
      l.snapshot.checkedAt,
      l.snapshot.mapsUrl,
      stageLabels[l.status],
      (l.snapshot.siteEmails ?? []).join("; "),
      l.snapshot.siteSummary ?? "",
      (l.snapshot.contacts ?? []).map(c=>`${c.label}: ${c.value} (${c.source === "cnpj" ? "cadastro CNPJ" : c.source === "site" ? "site da empresa" : "Google Maps"})`).join("; "),
    ]),
  ];
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + rows.map((r) => r.map(escape).join(";")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "astros-mais-leads.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const queueLabels:Record<string,string>={hourly:"Aguardando capacidade de pesquisa. A busca continuará automaticamente.",daily:"Aguardando a renovação do limite diário definido pela equipe.",shared:"Aguardando uma coleta em andamento para aproveitar os resultados.",checking:"Conferindo a disponibilidade do serviço de pesquisa.",capacity:"Sua busca está na fila e será processada automaticamente."};

export const failureLabels:Record<string,string>={capacity:"Novas pesquisas estão temporariamente indisponíveis. Nenhum valor foi debitado. Tente novamente mais tarde.",balance:"O saldo ficou insuficiente antes da entrega. Nenhum valor foi debitado. Faça uma recarga antes de uma nova busca.",expired:"O prazo de processamento encerrou. Nenhum valor foi debitado.",paused:"Novas buscas foram pausadas pela equipe. Nenhum valor foi debitado.",unavailable:"Não foi possível concluir a pesquisa. Nenhum valor foi debitado."};
