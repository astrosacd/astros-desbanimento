import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  TriangleAlert,
  Clock3,
  Server,
  LockKeyhole,
  MessageSquare,
  Share2,
  Search,
  Building2,
} from "lucide-react";
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
  const normal = data.components.filter((c) => c.status === "operational").length;
  const attention = data.components.filter(
    (c) => c.status === "degraded" || c.status === "unavailable",
  ).length;
  const maintenance = data.components.filter((c) => c.status === "maintenance").length;
  const confirmed =
    data.components
      .map((c) => c.checkedAt)
      .filter((v): v is string => !!v && Number.isFinite(Date.parse(v)))
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  const icons: Record<string, typeof Activity> = {
    panel: Server,
    auth: LockKeyhole,
    desbanimento: ShieldCheck,
    sms: MessageSquare,
    social: Share2,
    prospect_maps: Search,
    prospect_cnpj: Building2,
  };
  const descriptions: Record<string, string> = {
    panel: "Acesso à plataforma",
    auth: "Login e autenticação",
    desbanimento: "Solicitações e acompanhamento",
    sms: "Números e recebimento de códigos",
    social: "Serviços e acompanhamento de pedidos",
    prospect_maps: "Busca de empresas no Google Maps",
    prospect_cnpj: "Consulta e prospecção por CNPJ",
  };
  const StatusIcon =
    status === "operational" ? CheckCircle2 : status === "unknown" ? Clock3 : TriangleAlert;
  return (
    <>
      <section className={"status-hero status-" + status}>
        <div className="status-hero-icon">
          <StatusIcon size={30} />
        </div>
        <div className="status-eyebrow">
          <span className="status-dot" />
          DISPONIBILIDADE AGORA
        </div>
        <h1>{titles[status]}</h1>
        <p>Acompanhe a disponibilidade técnica da Astros Mais e os avisos da nossa equipe.</p>
        <div className="status-hero-meta">
          <span>
            <Clock3 size={14} />
            Última verificação: {time(confirmed)}
          </span>
          <span>
            <RefreshCw size={14} />
            Monitoramento automático
          </span>
        </div>
        <div className="status-summary" aria-label="Resumo dos serviços">
          <div>
            <strong>
              {normal}
              <small> / {data.components.length}</small>
            </strong>
            <span>Operacionais</span>
          </div>
          <div>
            <strong>{attention}</strong>
            <span>Precisam de atenção</span>
          </div>
          <div>
            <strong>{maintenance}</strong>
            <span>Em manutenção</span>
          </div>
        </div>
      </section>
      <section className="status-services" aria-labelledby="services-title">
        <div className="status-section-heading">
          <div>
            <span className="status-kicker">VISÃO GERAL</span>
            <h2 id="services-title">Disponibilidade dos serviços</h2>
          </div>
          <span>Verificação a cada 2 minutos</span>
        </div>
        <div className="status-service-grid">
          {data.components.map((c) => {
            const Icon = icons[c.key] ?? Activity;
            return (
              <article className="status-service" key={c.key}>
                <div className="status-service-heading">
                  <span className="status-service-icon">
                    <Icon size={20} />
                  </span>
                  <div>
                    <h3>{c.label}</h3>
                    <span className="status-service-description">{descriptions[c.key]}</span>
                  </div>
                </div>
                <div className="status-service-detail">
                  {c.message && <p>{c.message}</p>}
                  {c.scheduled && (
                    <p>
                      <strong>Manutenção programada</strong>
                      <br />
                      {c.scheduled.message}
                    </p>
                  )}
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
            );
          })}
        </div>
      </section>
      <section className="status-history">
        <div className="status-section-heading">
          <div>
            <span className="status-kicker">ACOMPANHAMENTO</span>
            <h2>Atualizações recentes</h2>
          </div>
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
          <img src="/brand/astros-symbol.png" alt="" width="38" height="38" />
          <span>
            Astros <span>Mais</span>
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
          <div>
            <strong>Informação para você acompanhar com confiança</strong>
            <p>
              Esta página acompanha a disponibilidade técnica dos nossos serviços. A disponibilidade
              de números e ofertas pode variar. Acompanhe por aqui os avisos e as atualizações da
              equipe.
            </p>
          </div>
        </aside>
      </main>
      <footer>
        Astros Mais · Transparência para você acompanhar.
        <span>Horários de Brasília · Atualização automática a cada minuto</span>
      </footer>
    </div>
  );
}
