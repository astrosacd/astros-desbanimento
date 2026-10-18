import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Download, MapPin, Phone, RefreshCw, Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  prospectHistory,
  prospectLeadStatus,
  prospectRequests,
  prospectAdminRequests,
  prospectStatus,
} from "./actions";
import {
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
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["prospect-requests", adminId || userId, page],
    queryFn: () =>
      adminId ? prospectAdminRequests({ data: { page } }) : prospectRequests({ data: { page } }),
    retry: false,
    refetchInterval: 10000,
  });
  const rows: ProspectRequest[] = q.data?.requests ?? [];
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
                    : row.state === "processing"
                      ? "Em andamento"
                      : "Não concluída"}
                </span>
                <p>
                  {row.delivered} de {row.quantity} leads ·{" "}
                  <strong>{money(row.charged_cents)}</strong>
                </p>
                {row.state === "failed" && <small>Nenhum valor debitado nesta busca.</small>}
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
                        : row.diagnostic === "expired"
                          ? "Prazo de processamento encerrado"
                          : "Verificação não concluída"}
                  </small>
                )}
              </div>
              {row.state==='processing'&&!adminId&&<ProspectCheck id={row.id} onDone={()=>q.refetch()}/>}
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
  });
  const leads: Lead[] = q.data?.leads ?? [];
  async function change(id: string, status: string) {
    setBusy(id);
    setError("");
    try {
      await prospectLeadStatus({ data: { id, status: status as keyof typeof stageLabels } });
      await cache.invalidateQueries({ queryKey: ["prospect-leads", userId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível atualizar.");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="prospect-card">
      <header className="prospect-section-heading">
        <div>
          <h2>Meus leads</h2>
          <p>Empresas já entregues à sua conta. Organize seu acompanhamento.</p>
        </div>
        <Button variant="outline" disabled={!leads.length} onClick={() => exportLeads(leads)}>
          <Download size={16} />
          Exportar esta página
        </Button>
      </header>
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
        <Button type="submit">Pesquisar</Button>
      </form>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {q.isPending ? (
        <p role="status">Consultando leads…</p>
      ) : q.isError ? (
        <p role="alert" className="error-text">
          {q.error.message}
        </p>
      ) : !leads.length ? (
        <p className="prospect-empty">Nenhum lead encontrado para esses filtros.</p>
      ) : (
        <div className="prospect-lead-grid">
          {leads.map((lead) => (
            <article className="prospect-lead" key={lead.id}>
              <div className="prospect-lead-title">
                <h3>{lead.snapshot.name}</h3>
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
              {lead.snapshot.siteSummary && <details className="prospect-site-details">
                <summary>Conteúdo e contatos do site</summary>
                {lead.snapshot.siteTitle && <p><strong>{lead.snapshot.siteTitle}</strong></p>}
                <p className="break-words">{lead.snapshot.siteSummary}</p>
                {!!lead.snapshot.siteEmails?.length && <p className="break-all">E-mails publicados: {lead.snapshot.siteEmails.join(" · ")}</p>}
                <p>Trecho extraído da página, sem confirmação de vínculo ou validade dos contatos.</p>
              </details>}
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

function ProspectCheck({id,onDone}:{id:string;onDone:()=>unknown}){const cache=useQueryClient();const [busy,setBusy]=useState(false),[message,setMessage]=useState('');async function check(){setBusy(true);setMessage('');try{const r=await prospectStatus({data:{requestId:id}}) as ProspectRequest;setMessage(r.state==='processing'?'A busca ainda está em andamento.':r.state==='completed'?`${r.delivered} leads entregues. Valor debitado: ${money(r.charged_cents)}.`:'Busca encerrada sem débito.');await onDone();await Promise.all([cache.invalidateQueries({queryKey:['prospect-leads']}),cache.invalidateQueries({queryKey:['wallet']}),cache.invalidateQueries({queryKey:['prospect-wallet']})]);}catch(e){setMessage(e instanceof Error?e.message:'Não foi possível confirmar.');}finally{setBusy(false);}}return <div><Button variant="outline" disabled={busy} onClick={check}>{busy?'Verificando…':'Verificar busca'}</Button>{message&&<p role="status">{message}</p>}</div>;}
