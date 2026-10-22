import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowUpRight, RefreshCw, ShieldCheck } from "lucide-react";
import { ENDPOINT, labels, snapshotSchema, visibleSnapshot, overall, type Snapshot } from "./model";
import "./status.css";
const time = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("pt-BR", {
        timeZone: "America/Fortaleza",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }) + " (Brasília)"
    : "Aguardando primeira verificação";
export function StatusBoard({ snapshot }: { snapshot: Snapshot }) {
  const data = visibleSnapshot(snapshot);
  const status = overall(data);
  const titles = {
    operational: "Todos os serviços operacionais",
    degraded: "Alguns serviços apresentam instabilidade",
    unavailable: "Há serviços indisponíveis",
    maintenance: "Manutenção em andamento",
    unknown: "Aguardando confirmação dos serviços",
  };
  return (
    <>
      <section className={"status-hero status-" + status}>
        <div className="status-eyebrow">
          <span className="status-dot" />
          DISPONIBILIDADE AGORA
        </div>
        <h1>{titles[status]}</h1>
        <p>Acompanhe a disponibilidade técnica da Astros Mais e os avisos da nossa equipe.</p>
        <small>Atualização do monitor: {time(data.generatedAt)}</small>
      </section>
      <section className="status-services" aria-labelledby="services-title">
        <div className="status-section-heading">
          <h2 id="services-title">Nossos serviços</h2>
          <span>Verificação a cada 2 minutos</span>
        </div>
        {data.components.map((c) => (
          <article className="status-service" key={c.key}>
            <div>
              <h3>{c.label}</h3>
              {c.message && <p>{c.message}</p>}
              <small>
                {c.source === "module"
                  ? "Manutenção global configurada no painel"
                  : c.source === "manual"
                    ? "Aviso da equipe"
                    : `Verificado: ${time(c.checkedAt)}`}
              </small>
            </div>
            <span className={"status-pill status-" + c.status}>
              <span className="status-dot" />
              {labels[c.status]}
            </span>
          </article>
        ))}
      </section>
      <section className="status-history">
        <div className="status-section-heading">
          <h2>Atualizações recentes</h2>
          <span>Últimos 30 dias</span>
        </div>
        {data.events.length ? (
          data.events.map((e) => (
            <article key={e.id}>
              <span
                className={"status-dot status-" + (e.status === "automatic" ? "unknown" : e.status)}
              />
              <div>
                <small>
                  {time(e.createdAt)} ·{" "}
                  {e.source === "manual" ? "Equipe Astros" : "Monitor automático"}
                </small>
                <h3>
                  {e.component} · {labels[e.status]}
                </h3>
                <p>{e.message}</p>
              </div>
            </article>
          ))
        ) : (
          <p className="status-empty">Ainda não há atualizações registradas neste período.</p>
        )}
      </section>
    </>
  );
}
export function PublicStatus() {
  const query = useQuery({
    queryKey: ["public-service-status"],
    queryFn: async () => {
      const response = await fetch(ENDPOINT, {
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw Error("Status indisponível");
      return snapshotSchema.parse(await response.json());
    },
    refetchInterval: 60000,
    retry: 1,
    staleTime: 0,
  });
  return (
    <div className="status-page">
      <header className="status-header">
        <a href="https://mais.astroscomunicacaodigital.com" className="status-brand">
          <Activity size={26} />
          <span>
            astros<span>mais</span>
            <small>Status dos serviços</small>
          </span>
        </a>
        <a href="https://mais.astroscomunicacaodigital.com">
          Acessar painel
          <ArrowUpRight size={16} />
        </a>
      </header>
      <main>
        {query.isError ? (
          <section className="status-hero status-unknown" role="alert">
            <h1>Não foi possível confirmar o status agora</h1>
            <p>
              O monitor não respondeu. Isso não confirma uma falha nos serviços. Tente novamente em
              instantes.
            </p>
            <button onClick={() => query.refetch()}>
              <RefreshCw size={16} />
              Tentar novamente
            </button>
          </section>
        ) : query.data ? (
          <StatusBoard snapshot={query.data} />
        ) : (
          <section className="status-hero" aria-live="polite">
            <h1>Consultando os serviços…</h1>
            <p>Aguarde a confirmação do monitor.</p>
          </section>
        )}
        <aside className="status-note">
          <ShieldCheck size={19} />
          <p>
            As verificações consultam conexões, configuração e disponibilidade técnica. Elas não
            realizam compras, envios ou testes de cobrança. A disponibilidade de números e ofertas
            pode variar.
          </p>
        </aside>
      </main>
      <footer>
        Astros Mais · Transparência para você acompanhar.
        <span>Horários de Brasília · Atualização automática a cada minuto</span>
      </footer>
    </div>
  );
}
