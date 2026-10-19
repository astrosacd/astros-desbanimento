import { ProspectDeliveriesAdmin, type DeliveryScope } from "./deliveries-admin";
import { LeadContacts } from "./contacts";
import { LeadOutreach } from "./outreach";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Download, MapPin, Phone, RefreshCw, Globe2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  prospectLeadSummary,
  prospectHistory,
  prospectLeadStatus,
  prospectRequests,
  prospectAdminRequests,
  prospectStatus,
} from "./actions";
import {
  failureLabels,
  queueLabels,
  stageLabels,
  siteLabels,
  exportLeads,
  money,
  type Lead,
  type ProspectRequest,
} from "./types";
export function ProspectRequests({
  adminId,
  userId,
}: {
  adminId?: string | undefined;
  userId?: string | undefined;
}) {
  const [deliveryScope, setDeliveryScope] = useState<DeliveryScope | null>(null);
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["prospect-requests", adminId || userId, page],
    queryFn: () =>
      adminId ? prospectAdminRequests({ data: { page } }) : prospectRequests({ data: { page } }),
    retry: false,
    refetchInterval: deliveryScope ? false : 10000,
  });
  const rows: ProspectRequest[] = q.data?.requests ?? [];
  if (adminId && deliveryScope)
    return (
      <ProspectDeliveriesAdmin
        adminId={adminId}
        scope={deliveryScope}
        backLabel="Voltar às buscas"
        onBack={() => setDeliveryScope(null)}
      />
    );
  return (
    <section className="prospect-card">
      <header className="prospect-section-heading">
        <div>
          <h2>Histórico de buscas</h2>
          <p>Quantidade solicitada, leads entregues e valor debitado.</p>
        </div>
        <Button variant="outline" disabled={q.isFetching} onClick={() => q.refetch()}>
          <RefreshCw size={16} />
          Atualizar
        </Button>
      </header>
      {q.isPending ? (
        <p role="status">Consultando buscas…</p>
      ) : q.isError ? (
        <p role="alert" className="error-text">
          {q.error.message}
        </p>
      ) : !rows.length ? (
        <p className="prospect-empty">Nenhuma busca registrada.</p>
      ) : (
        <div className="prospect-request-list">
          {rows.map((row) => (
            <article key={row.id}>
              <div>
                <strong>{row.criteria?.niche || "Busca de empresas"}</strong>
                <p>
                  {row.criteria?.city} · {row.criteria?.country}
                </p>
                {adminId && (
                  <p className="break-all">
                    {row.painel_de_desbanimento?.nome} · {row.painel_de_desbanimento?.email}
                  </p>
                )}
                <small>{new Date(row.created_at).toLocaleString("pt-BR")}</small>
              </div>
              <div>
                <span className="prospect-badge">
                  {row.state === "completed"
                    ? "Concluída"
                    : row.state === "queued"
                      ? "Na fila"
                      : row.state === "processing"
                        ? "Em andamento"
                        : "Não concluída"}
                </span>
                <p>
                  {row.delivered} de {row.quantity} leads ·{" "}
                  <strong>{money(row.charged_cents)}</strong>
                </p>
                {row.state === "queued" && (
                  <p>
                    {queueLabels[row.queue_reason || "capacity"] || queueLabels["capacity"]} Nenhum
                    valor foi debitado enquanto aguarda.
                  </p>
                )}
                {row.state === "failed" && (
                  <small>
                    {failureLabels[row.failureReason || "unavailable"] ||
                      failureLabels["unavailable"]}
                  </small>
                )}
                {row.state === "completed" && row.delivered === 0 && (
                  <small>Nenhum lead novo entregue nesta tentativa.</small>
                )}
                {adminId && row.diagnostic && (
                  <small>
                    Diagnóstico:{" "}
                    {row.diagnostic === "provider"
                      ? "Consulta ao fornecedor não confirmada"
                      : row.diagnostic === "balance"
                        ? "Saldo insuficiente ao concluir"
                        : row.diagnostic === "quota"
                          ? "Cota de pesquisas do fornecedor esgotada"
                          : row.diagnostic === "paused"
                            ? "Novas buscas pausadas"
                            : row.diagnostic === "account"
                              ? "Conta não disponível"
                              : row.diagnostic === "uncertain"
                                ? "Consulta interrompida; não foi repetida"
                                : row.diagnostic === "expired"
                                  ? "Prazo de processamento encerrado"
                                  : "Verificação não concluída"}
                  </small>
                )}
              </div>
              {["queued", "processing"].includes(row.state) && !adminId && (
                <ProspectCheck id={row.id} onDone={() => q.refetch()} />
              )}
              {adminId && row.delivered > 0 && (
                <Button
                  variant="outline"
                  onClick={() =>
                    setDeliveryScope({
                      queryId: "",
                      businessId: "",
                      requestId: row.id,
                      label: "Busca selecionada",
                      email: row.painel_de_desbanimento?.email || "",
                    })
                  }
                >
                  Ver leads desta busca
                </Button>
              )}
              <details>
                <summary>Referência</summary>
                <code>{row.id}</code>
              </details>
            </article>
          ))}
        </div>
      )}
      <div className="list-pagination">
        <Button
          variant="outline"
          disabled={!page || q.isFetching}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </Button>
        <span>Página {page + 1}</span>
        <Button
          variant="outline"
          disabled={!q.data?.hasMore || q.isFetching}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </Button>
      </div>
    </section>
  );
}
export function ProspectHistory({ userId }: { userId: string }) {
  const cache = useQueryClient();
  const [view, setView] = useState<"cards" | "board">("cards");
  const [inspected, setInspected] = useState<Lead | null>(null);
  const saving = useRef(false);
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(0),
    [search, setSearch] = useState(""),
    [applied, setApplied] = useState(""),
    [status, setStatus] = useState("all"),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const q = useQuery({
    queryKey: ["prospect-leads", userId, page, applied, status],
    queryFn: () => prospectHistory({ data: { page, search: applied, status: status as "all" } }),
    retry: false,
    enabled: view === "cards",
  });
  const leads: Lead[] = q.data?.leads ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedOwner,setSelectedOwner] = useState(userId);
  const selected = selectedOwner !== userId ? undefined :
    (view === "cards" ? leads.find((lead) => lead.id === selectedId) : undefined) ||
    (inspected?.id === selectedId ? inspected : undefined);
  async function change(id: string, status: string) {
    if (saving.current) return;
    saving.current = true;
    setNotice("");
    setBusy(id);
    setError("");
    try {
      await prospectLeadStatus({ data: { id, status: status as keyof typeof stageLabels } });
      setInspected((current) =>
        current?.id === id ? { ...current, status: status as keyof typeof stageLabels } : current,
      );
      setNotice(`Etapa atualizada para ${stageLabels[status as keyof typeof stageLabels]}.`);
      await cache.invalidateQueries({ queryKey: ["prospect-leads", userId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível atualizar.");
    } finally {
      saving.current = false;
      setBusy("");
    }
  }
  function renderCard(lead: Lead, drag?: (lead: Lead | null) => void) {
    return (
      <article className={`prospect-lead-compact prospect-stage-${lead.status}`} key={lead.id}>
        {drag && (
          <button
            type="button"
            className="prospect-drag-handle"
            draggable={!busy}
            disabled={!!busy}
            aria-label={`Arrastar ${lead.snapshot.name}`}
            title="Arraste para outra etapa ou use Mover para"
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", lead.id);
              drag(lead);
            }}
            onDragEnd={() => drag(null)}
          >
            ⠿ <span>Arrastar</span>
          </button>
        )}
        <button
          type="button"
          className="prospect-lead-open"
          aria-label={`Ver detalhes de ${lead.snapshot.name}`}
          onClick={() => {
            setSelectedOwner(userId);
            setSelectedId(lead.id);
            setInspected(lead);
            setError("");
          }}
        >
          <span className="prospect-stage-pill">{stageLabels[lead.status]}</span>
          <h3>{lead.snapshot.name}</h3>
          <span className="prospect-lead-compact-address">
            <MapPin size={14} aria-hidden="true" />
            <span>{lead.snapshot.address || "Endereço não informado"}</span>
          </span>
          <span className="prospect-lead-compact-phone">
            <Phone size={14} aria-hidden="true" />
            {lead.snapshot.phone || "Telefone não informado"}
          </span>
          <span className="prospect-lead-compact-footer">
            <span>{siteLabels[lead.snapshot.websiteStatus]}</span>
            <strong>
              Ver detalhes <ArrowUpRight size={14} aria-hidden="true" />
            </strong>
          </span>
        </button>
        <label className="prospect-quick-stage">
          Mover para
          <select
            className="field"
            aria-label={`Etapa de ${lead.snapshot.name}`}
            value={lead.status}
            disabled={!!busy}
            onChange={(e) => void change(lead.id, e.target.value)}
          >
            {Object.entries(stageLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </article>
    );
  }
  return (
    <section className="prospect-card">
      <header className="prospect-section-heading">
        <div>
          <h2>Meus leads</h2>
          <p>Empresas já entregues à sua conta. Organize seu acompanhamento.</p>
        </div>
        {view === "cards" && (
          <Button variant="outline" disabled={!leads.length} onClick={() => exportLeads(leads)}>
            <Download size={16} />
            Exportar esta página
          </Button>
        )}
      </header>
      <ProspectLeadSummary userId={userId} />
      <div className="prospect-crm-toolbar" role="group" aria-label="Visualização dos leads">
        <Button
          variant={view === "cards" ? "default" : "outline"}
          aria-pressed={view === "cards"}
          onClick={() => setView("cards")}
        >
          Cartões
        </Button>
        <Button
          variant={view === "board" ? "default" : "outline"}
          aria-pressed={view === "board"}
          onClick={() => setView("board")}
        >
          Quadro de etapas
        </Button>
      </div>
      <form
        className="prospect-history-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setApplied(search.trim());
        }}
      >
        <label>
          Pesquisar empresa
          <input
            className="field"
            value={search}
            maxLength={80}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome da empresa"
          />
        </label>
        {view === "cards" && (
          <label>
            Etapa
            <select
              className="field"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
            >
              <option value="all">Todas</option>
              {Object.entries(stageLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button type="submit">Pesquisar</Button>
      </form>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="prospect-stage-legend" aria-label="Legenda das etapas do contato">
        {Object.entries(stageLabels).map(([key, label]) => (
          <span className={`prospect-stage-${key}`} key={key}>
            <i aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
      {notice && (
        <p role="status" className="prospect-crm-notice">
          {notice}
        </p>
      )}
      {view === "board" ? (
        <ProspectBoard
          userId={userId}
          search={applied}
          busy={busy}
          change={change}
          renderCard={renderCard}
        />
      ) : q.isPending ? (
        <p role="status">Consultando leads…</p>
      ) : q.isError ? (
        <p role="alert" className="error-text">
          {q.error.message}
        </p>
      ) : !leads.length ? (
        <p className="prospect-empty">Nenhum lead encontrado para esses filtros.</p>
      ) : (
        <div className="prospect-lead-grid">{leads.map((lead) => renderCard(lead))}</div>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent className="prospect-lead-dialog">
          <DialogHeader>
            <DialogTitle>{selected?.snapshot.name}</DialogTitle>
            <DialogDescription>
              Dados da empresa, contatos publicados e acompanhamento da prospecção.
            </DialogDescription>
          </DialogHeader>
          {selected &&
            ((lead: Lead) => (
              <div className="prospect-lead prospect-lead-detail">
                <div className="prospect-lead-title">
                  <span className={`prospect-stage-pill prospect-stage-${lead.status}`}>
                    {stageLabels[lead.status]}
                  </span>
                  {lead.snapshot.rating !== null && (
                    <span>
                      ★ {lead.snapshot.rating.toLocaleString("pt-BR")}
                      <small>{lead.snapshot.reviews ?? 0} avaliações</small>
                    </span>
                  )}
                </div>
                <span className={`prospect-site prospect-site-${lead.snapshot.websiteStatus}`}>
                  {siteLabels[lead.snapshot.websiteStatus]}
                </span>
                <p className="prospect-address">
                  <MapPin size={15} />
                  {lead.snapshot.address || "Endereço não informado"}
                </p>
                <div className="prospect-lead-links">
                  {lead.snapshot.phone && (
                    <a href={"tel:" + lead.snapshot.phone.replace(/[^+0-9]/g, "")}>
                      <Phone size={15} />
                      {lead.snapshot.phone}
                    </a>
                  )}
                  {lead.snapshot.website && (
                    <a href={lead.snapshot.website} target="_blank" rel="noopener noreferrer">
                      <Globe2 size={15} />
                      Abrir endereço informado
                      <ArrowUpRight size={13} />
                    </a>
                  )}
                  <a href={lead.snapshot.mapsUrl} target="_blank" rel="noopener noreferrer">
                    Ver no Google Maps
                    <ArrowUpRight size={14} />
                  </a>
                </div>
                <details className="prospect-site-details">
                  <summary>Sobre a verificação do site</summary>
                  <p>{lead.snapshot.websiteReason}</p>
                  <p>
                    Verificado em {new Date(lead.snapshot.checkedAt).toLocaleString("pt-BR")}. A
                    situação pode mudar.
                  </p>
                </details>
                {lead.snapshot.siteSummary && (
                  <details className="prospect-site-details">
                    <summary>Conteúdo e contatos do site</summary>
                    {lead.snapshot.siteTitle && (
                      <p>
                        <strong>{lead.snapshot.siteTitle}</strong>
                      </p>
                    )}
                    <p className="break-words">{lead.snapshot.siteSummary}</p>
                    {!!lead.snapshot.siteEmails?.length && (
                      <p className="break-all">
                        E-mails publicados: {lead.snapshot.siteEmails.join(" · ")}
                      </p>
                    )}
                    <p>
                      Trecho extraído da página, sem confirmação de vínculo ou validade dos
                      contatos.
                    </p>
                  </details>
                )}
                <LeadContacts snapshot={lead.snapshot} />
                <LeadOutreach lead={lead} />
                <label className="prospect-lead-stage">
                  Etapa do contato
                  <select
                    className="field"
                    value={lead.status}
                    disabled={!!busy}
                    onChange={(e) => change(lead.id, e.target.value)}
                  >
                    {Object.entries(stageLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                {error && (
                  <p role="alert" className="error-text">
                    {error}
                  </p>
                )}
                {busy === lead.id && <p role="status">Salvando etapa…</p>}
              </div>
            ))(selected)}
        </DialogContent>
      </Dialog>
      {view === "cards" && (
        <div className="list-pagination">
          <Button
            variant="outline"
            disabled={!page || q.isFetching}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          <span>Página {page + 1}</span>
          <Button
            variant="outline"
            disabled={!q.data?.hasMore || q.isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
    </section>
  );
}

function ProspectCheck({ id, onDone }: { id: string; onDone: () => unknown }) {
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function check() {
    setBusy(true);
    setMessage("");
    try {
      const r = (await prospectStatus({ data: { requestId: id } })) as ProspectRequest;
      setMessage(
        r.state === "queued"
          ? "A busca continua na fila, sem débito."
          : r.state === "processing"
            ? "A busca ainda está em andamento."
            : r.state === "completed"
              ? `${r.delivered} leads entregues. Valor debitado: ${money(r.charged_cents)}.`
              : "Busca encerrada sem débito.",
      );
      await onDone();
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["prospect-leads"] }),
        cache.invalidateQueries({ queryKey: ["wallet"] }),
        cache.invalidateQueries({ queryKey: ["prospect-wallet"] }),
      ]);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível confirmar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <Button variant="outline" disabled={busy} onClick={check}>
        {busy ? "Verificando…" : "Verificar busca"}
      </Button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}

function ProspectBoard({
  userId,
  search,
  busy,
  change,
  renderCard,
}: {
  userId: string;
  search: string;
  busy: string;
  change: (id: string, status: string) => Promise<void>;
  renderCard: (lead: Lead, drag?: (lead: Lead | null) => void) => React.ReactNode;
}) {
  const [dragged, setDragged] = useState<Lead | null>(null);
  const board = useRef<HTMLDivElement>(null);
  function scrollColumns(direction: number) {
    const element = board.current;
    if (!element) return;
    const column = element.querySelector<HTMLElement>(".prospect-board-column");
    element.scrollBy({ left: direction * ((column?.getBoundingClientRect().width || 250) + 14), behavior: "auto" });
  }
  return (
    <div className="prospect-board-section">
      <p className="prospect-board-help">
        Arraste pela alça para mudar de etapa ou use “Mover para” em cada cartão. Em telas menores,
        use as setas ou deslize o quadro para ver as colunas. Cada coluna tem sua própria paginação.
      </p>
      <div className="prospect-board-navigation" role="group" aria-label="Navegar pelas etapas">
        <span>Novo → Contatado → Em negociação → Fechado → Descartado</span>
        <div>
          <Button variant="outline" aria-label="Ver etapas anteriores" onClick={() => scrollColumns(-1)}><ChevronLeft size={17} /> Anteriores</Button>
          <Button variant="outline" aria-label="Ver próximas etapas" onClick={() => scrollColumns(1)}>Próximas <ChevronRight size={17} /></Button>
        </div>
      </div>
      <div
        ref={board}
        className="prospect-board"
        aria-label="Quadro de acompanhamento"
        role="region"
        tabIndex={0}
      >
        {Object.entries(stageLabels).map(([stage, label]) => (
          <ProspectBoardColumn
            key={userId + search + stage}
            {...{ userId, search, busy, change, renderCard, dragged, setDragged }}
            stage={stage as keyof typeof stageLabels}
            label={label}
          />
        ))}
      </div>
    </div>
  );
}
function ProspectBoardColumn({
  userId,
  search,
  busy,
  change,
  renderCard,
  dragged,
  setDragged,
  stage,
  label,
}: {
  userId: string;
  search: string;
  busy: string;
  stage: keyof typeof stageLabels;
  label: string;
  change: (id: string, status: string) => Promise<void>;
  renderCard: (lead: Lead, drag?: (lead: Lead | null) => void) => React.ReactNode;
  dragged: Lead | null;
  setDragged: (lead: Lead | null) => void;
}) {
  const [page, setPage] = useState(0);
  const [over, setOver] = useState(false);
  const q = useQuery({
    queryKey: ["prospect-leads", userId, "board", search, stage, page],
    queryFn: () => prospectHistory({ data: { page, search, status: stage } }),
    retry: false,
  });
  const leads: Lead[] = q.data?.leads ?? [];
  return (
    <section
      className={`prospect-board-column prospect-stage-${stage}${over ? " prospect-board-over" : ""}`}
      aria-label={`Etapa ${label}`}
      onDragOver={(e) => {
        if (dragged && !busy) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (
          dragged &&
          !busy &&
          dragged.status !== stage &&
          e.dataTransfer.getData("text/plain") === dragged.id
        )
          void change(dragged.id, stage);
        setDragged(null);
      }}
    >
      <header>
        <h3>{label}</h3>
        <span>
          {leads.length}
          {q.data?.hasMore ? "+" : ""} nesta página
        </span>
      </header>
      <div className="prospect-board-cards">
        {q.isPending ? (
          <p role="status">Carregando…</p>
        ) : q.isError ? (
          <div role="alert">
            <p>Não foi possível carregar esta etapa.</p>
            <Button variant="outline" onClick={() => void q.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : leads.length ? (
          leads.map((lead) => renderCard(lead, setDragged))
        ) : (
          <p className="prospect-board-empty">Nenhum lead nesta página.</p>
        )}
      </div>
      <footer>
        <Button
          variant="outline"
          disabled={!page || q.isFetching || !!busy}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </Button>
        <span>Pág. {page + 1}</span>
        <Button
          variant="outline"
          disabled={!q.data?.hasMore || q.isFetching || !!busy}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </Button>
      </footer>
    </section>
  );
}

function ProspectLeadSummary({ userId }: { userId: string }) {
  const q = useQuery({ queryKey: ["prospect-leads", userId, "summary"], queryFn: () => prospectLeadSummary(), retry: false });
  const counts = q.data as ({total:number} & Record<keyof typeof stageLabels,number>) | undefined;
  if(q.isPending) return <p role="status" className="prospect-help">Conferindo o total de leads…</p>;
  if(q.isError || !counts || ![counts.total,...Object.keys(stageLabels).map(stage=>counts[stage as keyof typeof stageLabels])].every(n=>Number.isSafeInteger(n)&&n>=0)) return <div className="prospect-summary-error" role="alert"><p>Não foi possível carregar as quantidades de leads.</p><Button variant="outline" onClick={()=>void q.refetch()}>Atualizar quantidades</Button></div>;
  return <section className="prospect-lead-summary" aria-label="Quantidades de todos os seus leads">
    <p>Total da sua conta, incluindo todas as páginas e etapas. Os filtros abaixo não alteram este resumo.</p>
    <dl>
      <div className="prospect-summary-total"><dt>Total de leads</dt><dd>{counts.total.toLocaleString("pt-BR")}</dd></div>
      {Object.entries(stageLabels).map(([stage,label])=><div key={stage} className={`prospect-stage-${stage}`}><dt>{label}</dt><dd>{counts[stage as keyof typeof stageLabels].toLocaleString("pt-BR")}</dd></div>)}
    </dl>
  </section>;
}
