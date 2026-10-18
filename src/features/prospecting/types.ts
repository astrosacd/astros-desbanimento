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
    name: string;
    address: string;
    phone: string;
    website: string;
    websiteStatus: keyof typeof siteLabels;
    websiteReason: string;
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
  state: "processing" | "completed" | "failed";
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
    ],
    ...leads.map((l) => [
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
