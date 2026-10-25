import { useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import { ArrowUpRight, Clock3, RefreshCw, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSubmissionHistory } from "../submissions/actions";
import { smsHistory } from "../sms/actions";
import { socialHistory } from "../social/actions";
import { prospectRequests, cnpjHistory } from "../prospecting/actions";
import { getWallet } from "../payments/actions";
import { smsStates } from "../sms/types";
import { states as socialStates } from "../social/types";

type Area = "desbanimento" | "sms" | "social" | "prospecting";
export type RecentOrder = {
  id: string;
  area: Area;
  title: string;
  state: string;
  label: string;
  date: string;
  to: "/solicitacoes" | "/ativacoes-sms" | "/redes-sociais" | "/prospeccao";
};
const names = {
  desbanimento: "Desbanimento",
  sms: "Ativações SMS",
  social: "Redes sociais",
  prospecting: "Prospecção",
};
const submissionLabels: Record<string, string> = {
  completed: "Envio concluído",
  processing: "Em processamento",
  review: "Em conferência",
  failed: "Envio não concluído",
};
const prospectLabels: Record<string, string> = {
  completed: "Busca concluída",
  processing: "Em processamento",
  queued: "Na fila",
  failed: "Não concluída",
};
const money = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function recentOrders(groups: RecentOrder[][], area = "all") {
  return groups
    .flat()
    .filter((r) => area === "all" || r.area === area)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || a.id.localeCompare(b.id))
    .slice(0, 8);
}
const requestRows = (result: any, source: string): RecentOrder[] =>
  (result.requests ?? [])
    .slice(0, 3)
    .map((r: any) => ({
      id: r.id,
      area: "prospecting",
      title: `${source} · ${r.criteria?.niche || (r.operation === "enrich" ? "Enriquecimento de empresa" : "Consulta de empresas")}`,
      state: r.state,
      label: prospectLabels[r.state] || "Situação em atualização",
      date: r.created_at,
      to: "/prospeccao",
    }));
export function RecentActivity() {
  const { client } = useRouteContext({ from: "__root__" });
  const [area, setArea] = useState("all");
  const sources = useQueries({
    queries: [
      {
        queryKey: ["home-orders", client?.id, "desbanimento"],
        queryFn: async (): Promise<RecentOrder[]> =>
          (await getSubmissionHistory())
            .slice(0, 3)
            .map((r) => ({
              id: r.id,
              area: "desbanimento",
              title: "Solicitação de desbanimento",
              state: r.state,
              label: submissionLabels[r.state] || "Situação em atualização",
              date: r.created_at,
              to: "/solicitacoes",
            })),
      },
      {
        queryKey: ["home-orders", client?.id, "sms"],
        queryFn: async (): Promise<RecentOrder[]> =>
          (
            await smsHistory({
              data: { page: 0, search: "", state: "all", from: "", until: "", email: "" },
            })
          ).orders
            .slice(0, 3)
            .map((r: any) => ({
              id: r.id,
              area: "sms",
              title: r.service,
              state: r.state,
              label: smsStates[r.state as keyof typeof smsStates] || "Situação em atualização",
              date: r.createdAt,
              to: "/ativacoes-sms",
            })),
      },
      {
        queryKey: ["home-orders", client?.id, "social"],
        queryFn: async (): Promise<RecentOrder[]> =>
          (await socialHistory({ data: { page: 0, search: "", state: "all", email: "" } })).orders
            .slice(0, 3)
            .map((r: any) => ({
              id: r.id,
              area: "social",
              title: r.title,
              state: r.state,
              label:
                socialStates[r.state as keyof typeof socialStates] || "Situação em atualização",
              date: r.createdAt,
              to: "/redes-sociais",
            })),
      },
      {
        queryKey: ["home-orders", client?.id, "maps"],
        queryFn: async () => requestRows(await prospectRequests({ data: { page: 0 } }), "Maps"),
      },
      {
        queryKey: ["home-orders", client?.id, "cnpj"],
        queryFn: async () => requestRows(await cnpjHistory({ data: { page: 0 } }), "CNPJ"),
      },
    ].map((q) => ({
      ...q,
      enabled: !!client?.id,
      retry: false,
      staleTime: 30000,
      refetchInterval: 60000,
      refetchIntervalInBackground: false,
    })),
  });
  const wallet = useQuery({
    queryKey: ["wallet", client?.id],
    queryFn: () => getWallet(),
    enabled: !!client?.id,
    retry: false,
    refetchInterval: 15000,
  });
  const rows = recentOrders(
    sources.map((q) => q.data ?? []),
    area,
  );
  const selected = sources.filter(
    (_, i) =>
      area === "all" || ["desbanimento", "sms", "social", "prospecting", "prospecting"][i] === area,
  );
  const loading = selected.some((q) => q.isPending),
    errors = selected.filter((q) => q.isError).length;
  return (
    <div className="home-recent-grid">
      <section className="home-recent-card" aria-labelledby="home-orders-title">
        <div className="home-section-top">
          <div>
            <span className="home-section-icon">
              <Clock3 size={18} />
            </span>
            <h2 id="home-orders-title">Seus pedidos recentes</h2>
            <p>Últimos registros por área. Abra o módulo para acompanhar os detalhes.</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="Atualizar pedidos recentes"
            disabled={sources.some((q) => q.isFetching)}
            onClick={() => sources.forEach((q) => void q.refetch())}
          >
            <RefreshCw size={17} />
          </Button>
        </div>
        <label className="home-area-filter">
          Filtrar por área
          <select className="field" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="all">Todas as áreas</option>
            {Object.entries(names).map(([k, n]) => (
              <option value={k} key={k}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {loading && (
          <p className="home-feed-message" role="status">
            Consultando pedidos…
          </p>
        )}
        {errors > 0 && (
          <p className="home-feed-message" role="status">
            Parte do histórico não pôde ser consultada. Abra o módulo correspondente ou tente
            atualizar.
          </p>
        )}
        {!loading && !rows.length && (
          <div className="home-feed-empty">
            <ReceiptText size={24} />
            <strong>
              {errors
                ? "Histórico temporariamente indisponível"
                : "Seus próximos pedidos aparecem aqui"}
            </strong>
            <p>
              {errors
                ? "Os serviços continuam acessíveis pelos atalhos acima."
                : "Escolha um serviço acima para começar."}
            </p>
          </div>
        )}
        <ul className="home-order-list">
          {rows.map((r) => (
            <li key={r.area + r.id}>
              <span className="home-order-marker" data-area={r.area} />
              <div>
                <small>{names[r.area]}</small>
                <strong>{r.title}</strong>
                <time dateTime={r.date}>
                  {new Date(r.date).toLocaleString("pt-BR", {
                    timeZone: "America/Fortaleza",
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </time>
              </div>
              <span className="home-order-state" data-state={r.state}>
                {r.label}
              </span>
              <Link to={r.to} aria-label={`Acompanhar ${r.title}`} className="home-order-open">
                Abrir
                <ArrowUpRight size={15} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section
        className="home-recent-card home-wallet-activity"
        aria-labelledby="home-activity-title"
      >
        <div className="home-section-top">
          <div>
            <span className="home-section-icon">
              <ReceiptText size={18} />
            </span>
            <h2 id="home-activity-title">Atividade da carteira</h2>
            <p>Últimas movimentações do seu saldo.</p>
          </div>
        </div>
        {wallet.isPending ? (
          <p role="status" className="home-feed-message">
            Consultando movimentações…
          </p>
        ) : wallet.isError ? (
          <p role="status" className="home-feed-message">
            Não foi possível consultar as movimentações.
          </p>
        ) : !wallet.data?.movements.length ? (
          <div className="home-feed-empty">
            <ReceiptText size={24} />
            <strong>Nenhuma movimentação recente</strong>
            <p>Créditos e utilização do saldo aparecerão aqui.</p>
          </div>
        ) : (
          <ul className="home-movement-list">
            {wallet.data.movements.slice(0, 5).map((m) => (
              <li key={m.id}>
                <div>
                  <strong>
                    {m.reference?.startsWith("affiliate-refund:")
                      ? "Comissão estornada"
                      : m.reference?.startsWith("affiliate:")
                        ? "Comissão de indicação"
                        : m.kind === "debit"
                          ? "Saldo utilizado"
                          : m.kind === "reversal"
                            ? "Estorno de saldo"
                            : "Crédito na carteira"}
                  </strong>
                  <time dateTime={m.created_at}>
                    {new Date(m.created_at).toLocaleString("pt-BR", {
                      timeZone: "America/Fortaleza",
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </time>
                </div>
                <span data-positive={m.amount_cents > 0}>
                  {m.amount_cents > 0 ? "+" : ""}
                  {money(m.amount_cents)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link to="/carteira" className="home-wallet-link">
          Ver carteira completa
          <ArrowUpRight size={16} />
        </Link>
      </section>
    </div>
  );
}
