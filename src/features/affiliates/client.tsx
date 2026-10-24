import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouteContext, Link } from "@tanstack/react-router";
import { Copy, Users, Gift, RefreshCw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeading } from "../panel/heading";
import { getAffiliation, getAdminAffiliation } from "./actions";
import { money, percent, type AffiliateOverview } from "./validation";
import "./style.css";
export function AffiliateHistory({ data }: { data: AffiliateOverview }) {
  return (
    <section className="form-section affiliate-history">
      <h2>Histórico de comissões e ajustes</h2>
      <p className="affiliate-muted">
        Ganhos viram saldo de uso. Um reembolso confirmado da recarga indicada pode reverter a
        comissão; devolução de um serviço à carteira não é reembolso da recarga.
      </p>
      {data.events.length ? (
        <ul>
          {data.events.map((e) => (
            <li key={e.id}>
              <div className="affiliate-event-title">
                <strong>
                  {e.kind === "commission"
                    ? "Comissão adicionada à carteira"
                    : e.kind === "refund"
                      ? "Comissão estornada — reembolso confirmado"
                      : "Ajuste compensado com crédito na carteira"}
                </strong>
                <span>
                  {e.kind === "commission" ? "+" : e.kind === "refund" ? "−" : ""}
                  {money(e.amountCents)}
                </span>
              </div>
              <p>
                {e.kind === "commission"
                  ? `${e.referredLabel}: recarga confirmada de ${money(e.rechargeCents || 0)}, com comissão de ${percent(e.rateBps || 0)}.`
                  : e.kind === "refund"
                    ? `${e.referredLabel}: a recarga de ${money(e.rechargeCents || 0)} teve ${money(e.refundedCents || 0)} reembolsados/contestados de forma confirmada. A comissão foi revertida proporcionalmente.`
                    : `${money(e.amountCents)} de um novo crédito foram utilizados para compensar ajuste pendente. Não houve cobrança adicional.`}
              </p>
              {e.kind === "refund" && e.afterCents < 0 && (
                <p>
                  Ajuste pendente após este lançamento: <strong>{money(-e.afterCents)}</strong>. Os
                  próximos créditos compensam essa diferença.
                </p>
              )}
              <small>
                {new Date(e.createdAt).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })} ·
                Brasília
              </small>
              <details>
                <summary>Referência para conferência</summary>
                <p>{e.orderId || e.id}</p>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="affiliate-empty">Suas comissões e eventuais ajustes aparecerão aqui.</p>
      )}
    </section>
  );
}
export function AffiliatePanel({ userId, admin = false }: { userId: string; admin?: boolean }) {
  const [page, setPage] = useState(1),
    [message, setMessage] = useState("");
  const q = useQuery({
    queryKey: ["affiliation", admin ? "admin" : "client", userId, page],
    queryFn: () =>
      admin ? getAdminAffiliation({ data: { userId, page } }) : getAffiliation({ data: { page } }),
    retry: false,
  });
  const d = q.data,
    link = d ? `${d.origin}/cadastro?ref=${d.code}` : "";
  if (q.isPending) return <p role="status">Consultando afiliação…</p>;
  if (q.isError)
    return (
      <section className="form-section">
        <p role="alert">{q.error.message}</p>
        <Button variant="outline" onClick={() => q.refetch()}>
          Tentar novamente
        </Button>
      </section>
    );
  if (!d) return null;
  return (
    <div className="affiliate-page">
      {!admin && (
        <PageHeading
          title="Indique e ganhe saldo"
          subtitle="Compartilhe o Astros Mais e acompanhe as comissões das suas indicações diretas."
        />
      )}
      <section className="form-section affiliate-link-card">
        <div className="affiliate-card-heading">
          <Gift />
          <div>
            <h2>Seu link de indicação</h2>
            <p>Quem criar uma nova conta por este link ficará vinculado à sua indicação.</p>
          </div>
        </div>
        <div className="affiliate-copy">
          <input className="field" aria-label="Link de indicação" readOnly value={link} />
          <Button
            disabled={!d.enabled}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setMessage("Link copiado.");
              } catch {
                setMessage("Selecione o endereço acima e copie o link.");
              }
            }}
          >
            <Copy size={16} />
            Copiar link
          </Button>
        </div>
        {message && <p role="status">{message}</p>}
        <div className="affiliate-rules">
          <div>
            <span>Comissão atual</span>
            <strong>{percent(d.rateBps)}</strong>
          </div>
          <div>
            <span>Recarga mínima elegível</span>
            <strong>{d.minimumCents ? money(d.minimumCents) : "Qualquer recarga permitida"}</strong>
          </div>
          <div>
            <span>Recarga máxima elegível</span>
            <strong>{d.maximumCents ? money(d.maximumCents) : "Sem teto adicional"}</strong>
          </div>
        </div>
        {!d.enabled && (
          <p className="notice">
            O programa está pausado. Novas indicações e recargas não geram novas comissões; o
            histórico e os estornos continuam disponíveis.
          </p>
        )}
        <p className="affiliate-muted">
          A indica B; B indica C. A recebe pelas recargas de B, e B pelas de C. As regras são
          registradas em cada nova recarga; alterações de taxa não recalculam operações anteriores.
        </p>
      </section>
      <section className="affiliate-metrics" aria-label="Resumo da afiliação">
        {[
          { label: "Cadastros indicados", value: String(d.referrals) },
          { label: "Indicados com comissão", value: String(d.payingReferrals) },
          { label: "Comissões recebidas", value: money(d.earnedCents) },
          { label: "Comissões estornadas", value: money(d.reversedCents) },
        ].map((v) => (
          <article key={v.label}>
            <span>{v.label}</span>
            <strong>{v.value}</strong>
          </article>
        ))}
      </section>
      <section className="form-section affiliate-wallet">
        <div>
          <h2>Saldo disponível na carteira</h2>
          <strong>{money(d.availableCents)}</strong>
          <p className="affiliate-muted">
            As comissões entram no mesmo saldo usado nos serviços. Não há saque.
          </p>
        </div>
        {!admin && (
          <Button asChild variant="outline">
            <Link to="/carteira">
              Ver carteira
              <ArrowRight size={16} />
            </Link>
          </Button>
        )}
        {d.adjustmentCents > 0 && (
          <p className="notice affiliate-adjustment">
            <strong>Ajuste de saldo pendente: {money(d.adjustmentCents)}</strong>
            <br />
            Os próximos créditos serão usados primeiro para compensar essa diferença. Consulte os
            lançamentos abaixo para entender a origem.
          </p>
        )}
      </section>
      {d.pendingCount > 0 && (
        <p className="notice">
          Há {d.pendingCount} recarga(s) aguardando pagamento ou processamento da comissão. A rotina
          automática normalmente executa a cada minuto; em caso de atraso, o histórico será
          atualizado após a conferência.
        </p>
      )}
      <AffiliateHistory data={d} />
      <div className="affiliate-pagination">
        <Button
          variant="outline"
          disabled={page === 1 || q.isFetching}
          onClick={() => setPage((n) => n - 1)}
        >
          Anterior
        </Button>
        <span>Página {page}</span>
        <Button
          variant="outline"
          disabled={!d.hasMore || q.isFetching}
          onClick={() => setPage((n) => n + 1)}
        >
          Próxima
        </Button>
        <Button variant="outline" disabled={q.isFetching} onClick={() => q.refetch()}>
          <RefreshCw size={16} />
          Atualizar
        </Button>
      </div>
    </div>
  );
}
export function AffiliationPage() {
  const { client } = useRouteContext({ from: "__root__" });
  return client ? <AffiliatePanel userId={client.id} /> : null;
}
