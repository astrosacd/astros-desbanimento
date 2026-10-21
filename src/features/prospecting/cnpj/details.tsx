import { CnpjEnrichButton } from "./enrich-button";
import type { Lead } from "../types";
export function displayCnpj(v?: string) {
  const n = (v || "").replace(/\D/g, "");
  return n.length === 14
    ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
    : v || "Não informado";
}
export function displayCnpjDate(v?: string) {
  if (!v) return "Não informado";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return v;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if (!m) return v;
  const [, y, month, d] = m;
  const t = new Date(`${y}-${month}-${d}T12:00:00Z`);
  return Number.isFinite(t.getTime()) && t.toISOString().startsWith(`${y}-${month}-${d}`)
    ? `${d}/${month}/${y}`
    : v;
}
export function displayCnpjMoney(v?: string) {
  if (!v) return "Não informado";
  const normalized = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return v;
  const n = Number(normalized);
  return Number.isFinite(n)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
    : v;
}
const choice = (v?: boolean | null) => (v === true ? "Sim" : v === false ? "Não" : "Não informado");
export function CnpjDetails({
  lead,
  userId,
  onUpdated,
  readOnly = false,
}: {
  userId: string;
  readOnly?: boolean;
  lead: Lead;
  onUpdated?: (snapshot: Lead["snapshot"]) => void;
}) {
  const s = lead.snapshot;
  const fields = [
    ["CNPJ", displayCnpj(s.cnpj)],
    ["Razão social", s.legalName],
    ["Nome fantasia", s.tradeName],
    ["Situação cadastral", s.registrationStatus],
    ["Data da situação", displayCnpjDate(s.registrationDate)],
    ["Motivo da situação", s.registrationReason],
    ["Abertura", displayCnpjDate(s.openedAt)],
    ["Matriz ou filial", s.branch],
    ["Porte", s.size],
    ["Capital social informado", displayCnpjMoney(s.capitalSocial)],
    ["Natureza jurídica", s.legalNature],
    ["Atividade principal", [s.activityCode, s.activity].filter(Boolean).join(" · ")],
    ["Optante pelo MEI", choice(s.mei)],
    ["Opção pelo MEI", displayCnpjDate(s.meiSince)],
    ["Optante pelo Simples", choice(s.simples)],
    ["Opção pelo Simples", displayCnpjDate(s.simplesSince)],
  ];
  return (
    <section className="prospect-cnpj-record" aria-label="Cadastro da empresa">
      <header>
        <h4>Identificação e situação cadastral</h4>
        <p>
          Informações disponíveis na fonte consultada. Campos ausentes não são preenchidos por
          suposição.
        </p>
      </header>
      <dl className="prospect-cnpj-data">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || "Não informado"}</dd>
          </div>
        ))}
      </dl>
      {!!s.secondaryActivities?.length && (
        <div className="prospect-cnpj-activities">
          <h4>Atividades secundárias</h4>
          <ul>
            {s.secondaryActivities.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="prospect-help">
        {s.providerUpdatedAt
          ? `Atualização informada pela fonte: ${displayCnpjDate(s.providerUpdatedAt)}. `
          : ""}
        {s.collectedAt || s.checkedAt
          ? `Dados recebidos em ${displayCnpjDate(s.collectedAt || s.checkedAt)}.`
          : "Data de coleta não informada."}
      </p>
      {s.enrichment && (
        <section
          className="prospect-cnpj-complement"
          aria-label={readOnly ? "Dados complementares da ReceitaWS" : "Dados complementares"}
        >
          <h4>Dados complementares{readOnly ? " · ReceitaWS" : ""}</h4>
          <p className="prospect-help">
            Consultados em {displayCnpjDate(s.enrichment.queriedAt)}.{" "}
            {s.enrichment.providerUpdatedAt &&
              `Atualização da fonte: ${displayCnpjDate(s.enrichment.providerUpdatedAt)}.`}{" "}
            As informações anteriores foram preservadas.
          </p>
          {!!s.enrichment.addedFields.length && (
            <p>
              Campos preenchidos:{" "}
              {s.enrichment.addedFields.map((k) => enrichmentLabels[k] || k).join(", ")}.
            </p>
          )}
          {!s.enrichment.hasNewData && <p>A consulta não trouxe informações adicionais.</p>}
          {!!s.enrichment.differences.length && (
            <>
              <p>Valores diferentes informados pela fonte complementar:</p>
              <dl className="prospect-cnpj-data">
                {s.enrichment.differences.map(({ field, value }) => (
                  <div key={field}>
                    <dt>{enrichmentLabels[field] || field}</dt>
                    <dd>
                      {Array.isArray(value)
                        ? value.join("; ")
                        : typeof value === "boolean"
                          ? choice(value)
                          : field === "capitalSocial"
                            ? displayCnpjMoney(value)
                            : /Date|Since|openedAt/.test(field)
                              ? displayCnpjDate(value)
                              : value}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </section>
      )}
      {!readOnly && (
        <CnpjEnrichButton key={lead.id} userId={userId} lead={lead} onUpdated={onUpdated} />
      )}
    </section>
  );
}
const enrichmentLabels: Record<string, string> = {
  legalName: "Razão social",
  tradeName: "Nome fantasia",
  address: "Endereço",
  city: "Município",
  region: "UF",
  phone: "Telefone",
  activity: "Atividade principal",
  activityCode: "CNAE",
  size: "Porte",
  registrationStatus: "Situação cadastral",
  registrationDate: "Data da situação",
  registrationReason: "Motivo da situação",
  openedAt: "Abertura",
  capitalSocial: "Capital social",
  legalNature: "Natureza jurídica",
  secondaryActivities: "Atividades secundárias",
  branch: "Matriz ou filial",
  mei: "MEI",
  simples: "Simples Nacional",
  meiSince: "Opção pelo MEI",
  simplesSince: "Opção pelo Simples",
};
