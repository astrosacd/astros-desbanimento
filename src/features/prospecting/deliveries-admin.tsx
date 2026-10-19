import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, Search, UserRound, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { prospectAdminDeliveries } from "./actions";
import { LeadContacts } from "./contacts";
import { accountCount } from "./account-display";
import { money, siteLabels, stageLabels, type Lead } from "./types";
export type DeliveryScope = {
  requestId?: string;
  queryId: string;
  businessId: string;
  label: string;
  email: string;
};
type Delivery = {
  id: string;
  createdAt: string;
  stage: keyof typeof stageLabels;
  client: { id: string; name: string; email: string };
  request: {
    id: string;
    state: string;
    unitCents: number;
    quantity: number;
    delivered: number;
    chargedCents: number;
    niche: string;
    city: string;
    region: string;
    country: string;
  };
  snapshot: Lead["snapshot"];
};
type Report = {
  summary: { deliveries: number; accounts: number; businesses: number; requests: number };
  deliveries: Delivery[];
  hasMore: boolean;
  asOf: string;
};
const when = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })
    : "Não informado";
function web(value: string | null | undefined) {
  try {
    const url = new URL(value || "");
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function ProspectDeliveriesAdmin({
  adminId,
  scope,
  onBack,
  backLabel = "Voltar à base",
}: {
  adminId: string;
  scope: DeliveryScope;
  onBack: () => void;
  backLabel?: string;
}) {
  const [email, setEmail] = useState(scope.email),
    [company, setCompany] = useState(""),
    [requestId, setRequestId] = useState(scope.requestId || ""),
    [filters, setFilters] = useState({
      email: scope.email,
      company: "",
      requestId: scope.requestId || "",
    }),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<Delivery | null>(null),
    [error, setError] = useState("");
  const query = useQuery({
    queryKey: [
      "prospect-admin-deliveries",
      adminId,
      scope.queryId,
      scope.businessId,
      filters,
      page,
    ],
    queryFn: async () =>
      (await prospectAdminDeliveries({
        data: { ...filters, queryId: scope.queryId, businessId: scope.businessId, page },
      })) as Report,
    retry: false,
  });
  function apply(e: FormEvent) {
    e.preventDefault();
    const ref = requestId.trim();
    if (
      ref &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ref)
    ) {
      setError("Informe uma referência de busca válida ou deixe o campo vazio.");
      return;
    }
    setError("");
    setPage(0);
    setFilters({ email: email.trim(), company: company.trim(), requestId: ref });
  }
  const report = query.data;
  return (
    <section className="prospect-card">
      <header className="prospect-section-heading">
        <div>
          <span className="eyebrow">RASTREABILIDADE DAS ENTREGAS</span>
          <h2>Entregas por cliente</h2>
          <p>
            Confira quem recebeu cada empresa, quando recebeu e os dados entregues naquela ocasião.
          </p>
        </div>
        <div className="prospect-delivery-actions">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft size={15} /> {backLabel}
          </Button>
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={15} /> Atualizar entregas
          </Button>
        </div>
      </header>
      {(scope.queryId || scope.businessId) && (
        <div className="prospect-notice">
          <strong>Filtro de origem: {scope.label}</strong>
          <p>
            {scope.businessId
              ? "Exibindo os destinatários desta empresa em todas as buscas."
              : "Exibindo as entregas vinculadas a esta pesquisa."}{" "}
            Volte à base para consultar outra origem ou todas as entregas.
          </p>
        </div>
      )}
      <form className="prospect-history-filters prospect-delivery-filters" onSubmit={apply}>
        <label>
          E-mail do destinatário
          <input
            type="email"
            className="field"
            value={email}
            maxLength={254}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Todos os clientes"
          />
        </label>
        <label>
          Empresa entregue
          <input
            className="field"
            value={company}
            maxLength={80}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Nome da empresa no lead"
          />
        </label>
        <label>
          Referência da busca (opcional)
          <input
            className="field"
            value={requestId}
            maxLength={36}
            onChange={(e) => setRequestId(e.target.value)}
            placeholder="UUID da busca"
          />
        </label>
        <Button type="submit" disabled={query.isFetching}>
          <Search size={15} /> Pesquisar entregas
        </Button>
      </form>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {query.isPending ? (
        <p role="status">Conferindo destinatários e empresas entregues…</p>
      ) : query.isError ? (
        <div role="alert" className="prospect-notice">
          <strong>Não foi possível consultar as entregas.</strong>
          <p>
            Confira a instalação do SQL de detalhamento e a atualização da função
            astros-prospecting.
          </p>
          <p>{query.error.message}</p>
        </div>
      ) : (
        report && (
          <>
            <div className="prospect-base-totals" aria-label="Totais das entregas filtradas">
              {[
                ["Leads entregues", report.summary.deliveries],
                ["Clientes destinatários", report.summary.accounts],
                ["Empresas diferentes", report.summary.businesses],
                ["Buscas relacionadas", report.summary.requests],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <span>{label}</span>
                  <strong>{accountCount(value)}</strong>
                </div>
              ))}
            </div>
            <p className="prospect-help">
              Totais conforme os filtros acima, considerando todo o histórico. Horários de
              Fortaleza. Leitura em {when(report.asOf)}.
            </p>
            {!report.deliveries.length ? (
              <p className="prospect-empty">Nenhuma entrega encontrada para esses filtros.</p>
            ) : (
              <div className="prospect-delivery-list">
                {report.deliveries.map((delivery) => (
                  <article key={delivery.id}>
                    <div className="prospect-delivery-recipient">
                      <UserRound size={18} />
                      <div>
                        <small>DESTINATÁRIO</small>
                        <h3>{delivery.client.name || "Nome não informado"}</h3>
                        <p>{delivery.client.email || "E-mail não informado"}</p>
                        <span>Entregue em {when(delivery.createdAt)}</span>
                      </div>
                    </div>
                    <div className="prospect-delivery-company">
                      <Building2 size={18} />
                      <div>
                        <small>EMPRESA ENTREGUE</small>
                        <h3>{delivery.snapshot.name || "Nome não informado"}</h3>
                        <p>{delivery.snapshot.phone || "Telefone não informado"}</p>
                        <span>
                          {delivery.request.niche} · {delivery.request.city}
                          {delivery.request.region ? ", " + delivery.request.region : ""} ·{" "}
                          {delivery.request.country}
                        </span>
                      </div>
                    </div>
                    <footer>
                      <span className="prospect-badge">
                        Etapa: {stageLabels[delivery.stage] || "Não informada"}
                      </span>
                      <span>
                        Valor por lead: <strong>{money(delivery.request.unitCents)}</strong>
                      </span>
                      <Button variant="outline" onClick={() => setSelected(delivery)}>
                        Ver dados entregues
                      </Button>
                    </footer>
                  </article>
                ))}
              </div>
            )}
            <div className="list-pagination">
              <Button
                variant="outline"
                disabled={!page || query.isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <span>Página {page + 1}</span>
              <Button
                variant="outline"
                disabled={!report.hasMore || query.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </>
        )
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-w-3xl prospect-delivery-details">
          <DialogHeader>
            <DialogTitle>Dados entregues ao cliente</DialogTitle>
            <DialogDescription>
              Registro da entrega original. Atualizações posteriores na base não substituem estas
              informações.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <div className="prospect-delivery-detail-grid">
                <section>
                  <h3>Quem recebeu</h3>
                  <p>
                    <strong>{selected.client.name}</strong>
                  </p>
                  <p>{selected.client.email}</p>
                  <p>Entrega: {when(selected.createdAt)}</p>
                  <p>Etapa atual: {stageLabels[selected.stage] || "Não informada"}</p>
                </section>
                <section>
                  <h3>Busca relacionada</h3>
                  <p>
                    {selected.request.niche} · {selected.request.city}
                    {selected.request.region ? ", " + selected.request.region : ""} ·{" "}
                    {selected.request.country}
                  </p>
                  <p>
                    {selected.request.delivered} de {selected.request.quantity} leads entregues
                  </p>
                  <p>Total da busca: {money(selected.request.chargedCents)}</p>
                  <small>Valor por lead desta busca: {money(selected.request.unitCents)}</small>
                </section>
              </div>
              <section className="prospect-delivery-original">
                <h3>{selected.snapshot.name || "Empresa sem nome informado"}</h3>
                <p>{selected.snapshot.address || "Endereço não informado"}</p>
                <p>Telefone informado: {selected.snapshot.phone || "Não informado"}</p>
                <p>
                  {siteLabels[selected.snapshot.websiteStatus] || "Situação do site não informada"}
                </p>
                {selected.snapshot.website && (
                  <p>
                    {web(selected.snapshot.website) ? (
                      <a
                        href={web(selected.snapshot.website)!}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {selected.snapshot.website}
                      </a>
                    ) : (
                      selected.snapshot.website
                    )}
                  </p>
                )}
                {selected.snapshot.mapsUrl && web(selected.snapshot.mapsUrl) && (
                  <a
                    href={web(selected.snapshot.mapsUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ver empresa no Google Maps
                  </a>
                )}
                {selected.snapshot.rating != null && (
                  <p>
                    Avaliação: {selected.snapshot.rating.toLocaleString("pt-BR")} ·{" "}
                    {selected.snapshot.reviews ?? "Não informado"} avaliações
                  </p>
                )}
                <p>
                  {selected.snapshot.websiteReason || "Sem observação de verificação registrada."}
                </p>
                <small>
                  Verificação do site: {when(selected.snapshot.checkedAt)} · Coleta:{" "}
                  {when(selected.snapshot.collectedAt)}
                </small>
                {selected.snapshot.siteTitle && <h4>{selected.snapshot.siteTitle}</h4>}
                {selected.snapshot.siteSummary && <p>{selected.snapshot.siteSummary}</p>}
                <LeadContacts snapshot={selected.snapshot} />
              </section>
              <details className="prospect-site-details">
                <summary>Referências para consulta</summary>
                <p>
                  Busca: <code>{selected.request.id}</code>
                </p>
                <p>
                  Entrega: <code>{selected.id}</code>
                </p>
              </details>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
