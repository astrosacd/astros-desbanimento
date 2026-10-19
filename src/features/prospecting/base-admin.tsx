import { ProspectDeliveriesAdmin, type DeliveryScope } from "./deliveries-admin";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, RefreshCw, Search, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prospectAdminBase } from "./actions";
import { accountCount } from "./account-display";
import { siteLabels } from "./types";

type BaseQuery = {
  id: string;
  niche: string;
  city: string;
  region: string;
  country: string;
  saved: number;
  fresh: number;
  deliveries: number;
  neverDelivered: number;
  accountDelivered: number | null;
  accountAvailable: number | null;
  lastSeen: string | null;
};
type Business = {
  id: string;
  name: string;
  phone: string | null;
  website: string | null;
  websiteStatus: string;
  lastSeen: string;
  fresh: boolean;
  deliveries: number;
  deliveredToAccount: boolean | null;
};
type BaseReport = {
  totals: { businesses: number; queries: number; deliveries: number; accounts: number };
  queries: BaseQuery[];
  queryCount: number;
  queryHasMore: boolean;
  businesses: Business[];
  businessCount: number;
  businessHasMore: boolean;
  target: { id: string; name: string; email: string } | null;
  targetRequested: boolean;
  cacheDays: number;
  asOf: string;
};
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })
    : "Sem coleta salva";
export function ProspectBaseAdmin({ adminId }: { adminId: string }) {
  const [deliveryScope, setDeliveryScope] = useState<DeliveryScope | null>(null);
  const [search, setSearch] = useState(""),
    [email, setEmail] = useState(""),
    [filters, setFilters] = useState({ search: "", email: "" }),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<BaseQuery | null>(null),
    [businessPage, setBusinessPage] = useState(0);
  const query = useQuery({
    queryKey: ["prospect-admin-base", adminId, filters, page, selected?.id, businessPage],
    queryFn: async () =>
      (await prospectAdminBase({
        data: { ...filters, page, queryId: selected?.id || "", businessPage },
      })) as BaseReport,
    retry: false,
  });
  const report = query.data;
  function apply(e: FormEvent) {
    e.preventDefault();
    setFilters({ search: search.trim(), email: email.trim() });
    setPage(0);
    setSelected(null);
    setBusinessPage(0);
  }
  if (deliveryScope)
    return (
      <ProspectDeliveriesAdmin
        adminId={adminId}
        scope={deliveryScope}
        onBack={() => setDeliveryScope(null)}
      />
    );
  return (
    <section className="prospect-card prospect-base-admin">
      <header className="prospect-section-heading">
        <div>
          <span className="eyebrow">CONTROLE DA BASE</span>
          <h2>Base de empresas</h2>
          <p>
            Consulte as empresas salvas, acompanhe as entregas e confira o que cada cliente já
            recebeu.
          </p>
        </div>
        <div className="prospect-base-actions">
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={16} /> Atualizar base
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setDeliveryScope({
                queryId: "",
                businessId: "",
                label: "Todas as entregas",
                email: filters.email,
              })
            }
          >
            Ver entregas por cliente
          </Button>
        </div>
      </header>
      {query.isPending ? (
        <p role="status">Conferindo empresas e entregas…</p>
      ) : query.isError ? (
        <div className="prospect-notice" role="alert">
          <strong>Não foi possível consultar a base.</strong>
          <p>
            Confira a instalação do SQL de visão administrativa e a atualização da função
            astros-prospecting. Nenhum número foi estimado.
          </p>
          <p>{query.error.message}</p>
        </div>
      ) : (
        report && (
          <>
            <div className="prospect-base-totals" aria-label="Totais de toda a aplicação">
              {[
                ["Empresas únicas salvas", report.totals.businesses],
                ["Pesquisas registradas", report.totals.queries],
                ["Entregas para contas", report.totals.deliveries],
                ["Contas que receberam leads", report.totals.accounts],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <span>{label}</span>
                  <strong>{accountCount(value)}</strong>
                </div>
              ))}
            </div>
            <div className="prospect-base-meta">
              <span>Visão geral da aplicação · Os filtros abaixo não alteram estes totais.</span>
              <span>Atualizado em {date(report.asOf)}</span>
            </div>
            <div className="prospect-base-filter-heading">
              <h3>Localizar pesquisas</h3>
              <p>
                Busque pelo nicho ou local. Informe uma conta para conferir suas entregas e a
                disponibilidade individual.
              </p>
            </div>
            <form className="prospect-history-filters prospect-base-filters" onSubmit={apply}>
              <label>
                Nicho ou localização
                <input
                  className="field"
                  value={search}
                  maxLength={80}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Ex.: dentistas ou Fortaleza"
                />
              </label>
              <label>
                E-mail da conta (opcional)
                <input
                  type="email"
                  className="field"
                  value={email}
                  maxLength={254}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-mail completo do cliente"
                />
              </label>
              <Button type="submit" disabled={query.isFetching}>
                <Search size={15} /> Consultar base
              </Button>
              {(filters.search || filters.email) && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setSearch("");
                    setEmail("");
                    setFilters({ search: "", email: "" });
                    setPage(0);
                    setSelected(null);
                    setBusinessPage(0);
                  }}
                >
                  Limpar filtros
                </Button>
              )}
            </form>
            {report.targetRequested && (
              <div className="prospect-notice" role="status">
                {report.target ? (
                  <>
                    <strong>Conta em análise: {report.target.name || report.target.email}</strong>
                    <p>
                      {report.target.email}. Os indicadores por conta consideram todo o histórico de
                      entregas desta conta, inclusive de outras pesquisas.
                    </p>
                  </>
                ) : (
                  <p>
                    Não foi possível identificar uma única conta com esse e-mail. Confira o endereço
                    completo. Nenhuma disponibilidade individual foi calculada.
                  </p>
                )}
              </div>
            )}
            <div className="prospect-section-heading prospect-base-results-heading">
              <div>
                <h3>{selected ? "Empresas desta pesquisa" : "Pesquisas e resultados salvos"}</h3>
                <p>
                  {selected
                    ? `${selected.niche} · ${selected.city}${selected.region ? ", " + selected.region : ""} · ${selected.country}`
                    : `${accountCount(report.queryCount)} pesquisas encontradas. Selecione uma para ver as empresas.`}
                </p>
              </div>
              {selected && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelected(null);
                    setBusinessPage(0);
                  }}
                >
                  <ArrowLeft size={15} /> Voltar às pesquisas
                </Button>
              )}
            </div>
            {!selected ? (
              <>
                {!report.queries.length ? (
                  <p className="prospect-empty">Nenhuma pesquisa encontrada para esse filtro.</p>
                ) : (
                  <div className="prospect-base-queries">
                    {report.queries.map((q) => (
                      <article key={q.id}>
                        <header>
                          <div>
                            <h4>{q.niche}</h4>
                            <p>
                              {q.city}
                              {q.region ? ", " + q.region : ""} · {q.country}
                            </p>
                          </div>
                          <Database size={19} />
                        </header>
                        <dl className="prospect-base-metrics">
                          <div>
                            <dt>Empresas salvas</dt>
                            <dd>{accountCount(q.saved)}</dd>
                          </div>
                          <div>
                            <dt>Dentro da validade</dt>
                            <dd>{accountCount(q.fresh)}</dd>
                          </div>
                          <div>
                            <dt>Entregas nesta pesquisa</dt>
                            <dd>{accountCount(q.deliveries)}</dd>
                          </div>
                          <div>
                            <dt>Sem entrega a nenhuma conta</dt>
                            <dd>{accountCount(q.neverDelivered)}</dd>
                          </div>
                        </dl>
                        {report.target && (
                          <dl className="prospect-base-account">
                            <div>
                              <dt>Já entregues à conta</dt>
                              <dd>{accountCount(q.accountDelivered)}</dd>
                            </div>
                            <div>
                              <dt>Válidas e ainda não entregues à conta</dt>
                              <dd>{accountCount(q.accountAvailable)}</dd>
                            </div>
                          </dl>
                        )}
                        <p className="prospect-help">Última coleta salva: {date(q.lastSeen)}</p>
                        <footer className="prospect-base-query-actions">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setSelected(q);
                              setBusinessPage(0);
                            }}
                          >
                            Ver empresas salvas
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() =>
                              setDeliveryScope({
                                queryId: q.id,
                                businessId: "",
                                label: q.niche + " · " + q.city,
                                email: filters.email,
                              })
                            }
                          >
                            Ver entregas desta pesquisa
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
                    disabled={!report.queryHasMore || query.isFetching}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="prospect-help">
                  {accountCount(report.businessCount)} empresas salvas nesta pesquisa. Validade
                  configurada: {report.cacheDays} dias. Dados vencidos continuam registrados, mas
                  não contam como disponíveis para reaproveitamento imediato.
                </p>
                {!report.businesses.length ? (
                  <p className="prospect-empty">Nenhuma empresa salva nesta pesquisa.</p>
                ) : (
                  <div className="prospect-base-businesses">
                    {report.businesses.map((b) => (
                      <article key={b.id}>
                        <div>
                          <h4>{b.name || "Empresa sem nome informado"}</h4>
                          {b.phone && <p>{b.phone}</p>}
                          <p className="break-words">{b.website || "Site não informado"}</p>
                          <small>
                            {siteLabels[b.websiteStatus as keyof typeof siteLabels] ||
                              "Não informado"}{" "}
                            · Coleta: {date(b.lastSeen)}
                          </small>
                        </div>
                        <div>
                          <span className="prospect-badge">
                            {b.fresh ? "Dentro da validade" : "Dados vencidos"}
                          </span>
                          <p>Entregue a {accountCount(b.deliveries)} conta(s)</p>
                          <Button
                            variant="outline"
                            onClick={() =>
                              setDeliveryScope({
                                queryId: "",
                                businessId: b.id,
                                label: b.name,
                                email: filters.email,
                              })
                            }
                          >
                            Ver destinatários desta empresa
                          </Button>
                          {report.target && (
                            <strong className="prospect-base-account-state">
                              {b.deliveredToAccount
                                ? "Já entregue à conta selecionada"
                                : b.fresh
                                  ? "Ainda não entregue à conta selecionada"
                                  : "Não entregue; precisa atualizar a coleta"}
                            </strong>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                <div className="list-pagination">
                  <Button
                    variant="outline"
                    disabled={!businessPage || query.isFetching}
                    onClick={() => setBusinessPage((p) => p - 1)}
                  >
                    Anterior
                  </Button>
                  <span>Página {businessPage + 1}</span>
                  <Button
                    variant="outline"
                    disabled={!report.businessHasMore || query.isFetching}
                    onClick={() => setBusinessPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </>
            )}
            <details className="prospect-site-details">
              <summary>Como interpretar estes números</summary>
              <p>
                Esta consulta não consome SerpApi. Uma empresa pode gerar entregas para contas
                diferentes; por isso, entregas não devem ser subtraídas do total de empresas. A base
                mostra empresas únicas efetivamente salvas e o histórico de entregas. Não é o total
                bruto originalmente retornado pelo fornecedor: respostas repetidas, sem
                identificação válida ou descartadas não são reconstruídas como novos resultados. Uma
                empresa pode aparecer em mais de uma pesquisa; os totais por pesquisa não devem ser
                somados como empresas únicas da aplicação. Os números por conta representam dados
                dentro da validade ainda não entregues, sem prometer uma nova entrega antes da
                consulta do sistema.
              </p>
            </details>
          </>
        )
      )}
    </section>
  );
}
