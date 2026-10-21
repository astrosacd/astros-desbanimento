import { CnpjAudit } from "./audit";
import { SearchActivity } from "../search-activity";
import { LoaderCircle } from "lucide-react";
import {useCnpjQuota,CnpjQuotaNotice} from "./quota";
import {cnpjRejection, cnpjMissingRequest} from "./errors";
import {displayCnpj} from "./details";
import { SmsOptionPicker } from "../../sms/option-picker";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  cnpjConfig,
  cnpjSearch,
  cnpjStatus,
  cnpjHistory,
  cnpjAdminConfig,
  cnpjAdminSave,
  cnpjAdminHistory,
} from "../actions";
import { brazilStates } from "../../../../supabase/functions/astros-prospecting/geography";
import { money } from "../types";
type Config = {
  installed?: boolean;
  enabled: boolean;
  unitCents: number;
  enrichEnabled: boolean;
  enrichCents: number;
  dailyRequests: number;
  dailyCalls: number;
  minuteCalls: number;
  cacheDays: number;
  hasKey: boolean;
};
type Operation = {
  id: string;
  operation: string;
  criteria: Record<string, string>;
  state: string;
  quantity: number;
  delivered: number;
  charged_cents: number;
  created_at: string;
  diagnostic?: string;
  failureReason?: string;
  painel_de_desbanimento?: { nome: string; email: string };
};
export function cnpjDiagnosticLabel(code: string) {
  const labels: Record<string, string> = {
    balance: "Saldo insuficiente na carteira do cliente",
    expired: "Prazo de confirmação encerrado",
    auth: "Credencial recusada pelo fornecedor (HTTP 401). Confira a chave cadastrada.",
    billing: "Fornecedor recusou por cobrança (HTTP 402). Confira créditos e plano.",
    forbidden:
      "Recurso não autorizado pelo fornecedor (HTTP 403). Confira permissões e plano; isso não confirma falta de saldo.",
    request: "Requisição recusada pelo fornecedor (HTTP 400). Confira a integração e os filtros.",
    not_found: "Consulta ou recurso não encontrado no fornecedor (HTTP 404).",
    rate: "Limite de chamadas do fornecedor atingido (HTTP 429).",
    outage: "Falha no servidor do fornecedor (HTTP 5xx).",
    http: "Fornecedor retornou um erro HTTP não classificado.",
    invalid: "A resposta do fornecedor não corresponde ao formato esperado.",
    timeout: "Tempo de resposta do fornecedor excedido.",
    connection: "Não foi possível estabelecer ou concluir a conexão com o fornecedor.",
    provider: "Fornecedor ou resposta indisponível. Registro antigo sem diagnóstico detalhado.",
  };
  return labels[code] || "Motivo técnico não identificado.";
}
function useRefresh() {
  const cache = useQueryClient();
  return () =>
    Promise.all(
      ["prospect-leads", "wallet", "prospect-wallet", "cnpj-history", "cnpj-admin-history", "cnpj-config"].map(
        (key) => cache.invalidateQueries({ queryKey: [key] }),
      ),
    );
}
export function CnpjPanel({ userId,onHistory,onLeads,blocked=false }: { blocked?:boolean;userId: string;onHistory?:()=>void;onLeads?:()=>void }) {
  const {query:config,blocked:quotaBlocked} = useCnpjQuota(userId);
  const dailyBlocked=quotaBlocked||blocked;
  const c = config.data as Config | undefined;
  const history = useQuery({
    queryKey: ["cnpj-history", userId, 0],
    queryFn: () => cnpjHistory({ data: { page: 0 } }),
    enabled: c?.installed === true,
    retry: false,
    refetchInterval: 15000,
  });
  const [mode, setMode] = useState<"search" | "lookup">("search"),
    [form, setForm] = useState({
      cnpj: "",
      uf: "",
      city: "",
      cnae: "",
      term: "",
      size: "",
      status: "ATIVA",
      from: "",
      until: "",
    }),
    [quantity, setQuantity] = useState(8),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [result, setResult] = useState<Operation | null>(null),
    [error, setError] = useState("");
  const lock = useRef(false),
    refresh = useRefresh();
  useEffect(() => {
    if (pending || busy || result) return;
    const active = (history.data?.requests as Operation[] | undefined)?.find(
      (r) => r.state === "processing",
    );
    if (active) setPending(active.id);
  }, [history.data, pending, busy, result]);
  async function check() {
    if (!pending || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const r = (await cnpjStatus({ data: { requestId: pending } })) as Operation;
      setResult(r);
      if (r.state !== "processing") {
        setPending(null);
        await refresh();
      }
      setError("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Não foi possível consultar.";
      setError(message === "Consulta CNPJ não encontrada" ? cnpjMissingRequest : message);
      if (message === "Consulta CNPJ não encontrada") setPending(null);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => void check(), 8000);
    return () => clearInterval(t);
  }, [pending]);
  async function run() {
    if (lock.current || pending || dailyBlocked || !c?.enabled) return;
    lock.current = true;
    setBusy(true);
    setConfirm(false);
    setError("");
    setResult(null);
    const id = crypto.randomUUID();
    setPending(id);
    try {
      const r = (await cnpjSearch({
        data: {
          ...form,
          mode,
          quantity: mode === "lookup" ? 1 : quantity,
          expectedUnitCents: c.unitCents,
          requestId: id,
        },
      })) as Operation;
      setResult(r);
      if (r.state !== "processing") setPending(null);
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Confira esta mesma consulta antes de tentar outra.";
      const rejection = cnpjRejection(message);
      if (rejection) setPending(null);
      setError(rejection || "Não foi possível confirmar a consulta. Verifique esta mesma tentativa antes de enviar outra.");
    } finally {
      setBusy(false);
      lock.current = false;
      void config.refetch();
    }
  }
  const update = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value, ...(key === "uf" ? { city: "" } : {}) }));
  return (
    <section className="prospect-card">
      <header className="prospect-section-heading">
        <div>
          <span className="eyebrow">PROSPECÇÃO / CNPJ</span>
          <h2>Encontre empresas por cadastro</h2>
          <p>
            Pesquise empresas brasileiras por filtros ou consulte um CNPJ específico. Os dados
            disponíveis são cadastrais e não confirmam contato direto com o proprietário.
          </p>
        </div>
      </header>
      {config.isPending ? (
        <p role="status">Carregando modalidade…</p>
      ) : config.isError ? (
        <div role="alert">
          <p>Não foi possível carregar a modalidade CNPJ.</p>
          <Button variant="outline" onClick={() => void config.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : !c?.enabled ? (
        <div className="prospect-notice">
          <strong>Pesquisa por CNPJ ainda não disponível</strong>
          <p>
            A modalidade aguarda liberação pela administração. A busca do Google Maps continua
            disponível.
          </p>
        </div>
      ) : (
        <>
          <div className="prospect-crm-toolbar" role="group" aria-label="Tipo de consulta CNPJ">
            <Button
              variant={mode === "search" ? "default" : "outline"}
              disabled={busy || !!pending}
              onClick={() => setMode("search")}
            >
              Pesquisar por filtros
            </Button>
            <Button
              variant={mode === "lookup" ? "default" : "outline"}
              disabled={busy || !!pending}
              onClick={() => setMode("lookup")}
            >
              Consultar um CNPJ
            </Button>
          </div>
          <CnpjQuotaNotice userId={userId}/>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (mode === "search" && !form.uf) return;
              if (!dailyBlocked) setConfirm(true);
            }}
          >
            <fieldset
              className="prospect-form"
              disabled={busy || !!pending || dailyBlocked || history.isPending || history.isError}
            >
              {mode === "lookup" ? (
                <label className="prospect-full">
                  CNPJ numérico (14 dígitos)
                  <input
                    className="field"
                    value={form.cnpj}
                    inputMode="numeric"
                    maxLength={18}
                    pattern="[0-9./-]{14,18}"
                    required
                    onChange={(e) => update("cnpj", e.target.value)}
                  />
                </label>
              ) : (
                <>
                  <div className="prospect-full prospect-form-divider prospect-step-heading"><span>01 / LOCALIZAÇÃO</span><h3>Onde estão as empresas?</h3><p>Escolha o estado e informe o município da pesquisa.</p></div>
                  <SmsOptionPicker
                    id="cnpj-state"
                    label="Estado"
                    placeholder="Selecione o estado"
                    value={form.uf}
                    options={brazilStates.map((state) => ({
                      id: state.id,
                      name: `${state.name} (${state.id})`,
                    }))}
                    onChange={(value) => update("uf", value)}
                    disabled={busy || !!pending}
                  />
                  <label>
                    Cidade
                    <input
                      className="field"
                      required
                      minLength={2}
                      maxLength={80}
                      value={form.city}
                      onChange={(e) => update("city", e.target.value)}
                      placeholder="Ex.: Fortaleza"
                    />
                  </label>
                  <div className="prospect-full prospect-form-divider prospect-step-heading"><span>02 / PERFIL DA EMPRESA</span><h3>Refine os resultados</h3><p>Os filtros abaixo são opcionais. Use apenas os que fizerem sentido para sua busca.</p></div>
                  <label>
                    CNAE principal (opcional)
                    <input
                      className="field"
                      inputMode="numeric"
                      pattern="[0-9./-]{7,10}"
                      maxLength={10}
                      value={form.cnae}
                      onChange={(e) => update("cnae", e.target.value)}
                      placeholder="Ex.: 8630504"
                    />
                    <small>Informe o código da atividade; não o nome do negócio.</small>
                  </label>
                  <label>
                    Nome exato da empresa (opcional)
                    <input
                      className="field"
                      maxLength={80}
                      value={form.term}
                      onChange={(e) => update("term", e.target.value)}
                    />
                  </label>
                  <label>
                    Porte
                    <select
                      className="field"
                      value={form.size}
                      onChange={(e) => update("size", e.target.value)}
                    >
                      <option value="">Todos</option>
                      <option value="01">Microempresa</option>
                      <option value="03">Empresa de pequeno porte</option>
                      <option value="05">Demais</option>
                    </select>
                  </label>
                  <label>
                    Situação cadastral
                    <select
                      className="field"
                      value={form.status}
                      onChange={(e) => update("status", e.target.value)}
                    >
                      <option value="">Todas</option>
                      {["ATIVA", "BAIXADA", "INAPTA", "SUSPENSA", "NULA"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Abertura a partir de
                    <input
                      type="date"
                      className="field"
                      value={form.from}
                      onChange={(e) => update("from", e.target.value)}
                    />
                  </label>
                  <label>
                    Abertura até
                    <input
                      type="date"
                      className="field"
                      min={form.from}
                      value={form.until}
                      onChange={(e) => update("until", e.target.value)}
                    />
                  </label>
                  <div className="prospect-full prospect-form-divider prospect-step-heading"><span>03 / ENTREGA</span><h3>Defina quantos contatos deseja</h3><p>Confira o valor máximo antes de confirmar.</p></div>
                  <label>
                    Quantidade de empresas
                    <input
                      type="number"
                      className="field"
                      min={1}
                      max={20}
                      step={1}
                      required
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                    />
                    <small>De 1 a 20 novas empresas por consulta.</small>
                  </label>
                </>
              )}
            </fieldset>
            <div className="prospect-search-total">
              <div>
                <span>{money(c.unitCents)} por novo lead entregue</span>
                <strong>Até {money(c.unitCents * (mode === "lookup" ? 1 : quantity))}</strong>
                <small>Sem nova cobrança por CNPJ já entregue à sua conta nesta modalidade.</small>
              </div>
              <Button
                type="submit"
                disabled={
                  busy ||
                  !!pending ||
                  dailyBlocked ||
                  history.isPending ||
                  history.isError ||
                  (mode === "search" && !form.uf)
                }
              >
                Conferir consulta CNPJ
              </Button>
            </div>
          </form>
          {history.isError && (
            <div role="alert" className="prospect-notice">
              <p>Não foi possível conferir suas consultas anteriores.</p>
              <Button variant="outline" onClick={() => void history.refetch()}>
                Verificar consultas
              </Button>
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="error-text mt-4">
          {error}
        </p>
      )}
      {error === "Saldo insuficiente. Faça uma recarga" && (
        <Button asChild variant="outline">
          <a href="/carteira">Ir para carteira e recargas</a>
        </Button>
      )}
      {pending && (
        <div className="prospect-search-progress" aria-busy="true">
          <div className="prospect-search-progress-heading" role="status">
            <span className="prospect-search-progress-icon" aria-hidden="true"><LoaderCircle size={25} /></span>
            <div>
              <strong>Confirmando consulta CNPJ…</strong>
              <span>Estamos preparando seus resultados. A tela atualiza automaticamente.</span>
            </div>
          </div>
          {!error && <SearchActivity requestId={pending} source="cnpj" />}
          <p>
            Acompanhamos esta mesma tentativa automaticamente. Não envie novamente. A cobrança
            acontece junto com a entrega; sem entrega, não há débito.
          </p>
          <Button variant="outline" disabled={busy} onClick={() => void check()}>
            Verificar consulta CNPJ
          </Button>
        </div>
      )}
      {result && result.state !== "processing" && (
        <div className="prospect-notice" role="status">
          <strong>
            {result.state === "completed"
              ? `${result.delivered} novos leads entregues`
              : result.failureReason === "balance"
                ? "Saldo insuficiente na carteira"
                : "Não foi possível concluir sua consulta agora"}
          </strong>
          <p>
            {result.state === "completed"
              ? `Valor debitado: ${money(result.charged_cents)}. Consulte os contatos em Meus leads. Se não houver novos resultados, amplie os filtros.`
              : result.failureReason === "balance"
                ? "Seu saldo ficou insuficiente para concluir a entrega. Nenhum valor foi descontado. Faça uma recarga para uma nova consulta."
                : "Nenhum valor foi descontado da sua carteira. Tente novamente mais tarde."}
          </p>
          {result.state === "completed" && onLeads && <div className="cnpj-result-actions"><Button type="button" onClick={onLeads}>Ver meus leads</Button><span>Abra os contatos no quadro de etapas para organizar sua abordagem.</span></div>}
        </div>
      )}
      {result?.state === "failed" && result.failureReason === "balance" && (
        <Button asChild variant="outline">
          <a href="/carteira">Ir para carteira e recargas</a>
        </Button>
      )}
      {c?.installed && onHistory && <div className="prospect-history-shortcut"><div><strong>Acompanhe suas consultas</strong><p>Buscas CNPJ, atualizações e valores estão no Histórico de buscas.</p></div><Button variant="outline" onClick={onHistory}>Ver histórico CNPJ</Button></div>}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar consulta CNPJ?</DialogTitle>
            <DialogDescription>
              Os resultados entregues entram em Meus leads, com origem CNPJ.
            </DialogDescription>
          </DialogHeader>
          <dl className="prospect-confirm">
            <div>
              <dt>Quantidade máxima</dt>
              <dd>{mode === "lookup" ? 1 : quantity}</dd>
            </div>
            <div>
              <dt>Máximo a descontar da carteira</dt>
              <dd>{money((c?.unitCents || 0) * (mode === "lookup" ? 1 : quantity))}</dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            O débito é proporcional aos novos leads entregues. Esta consulta não envia mensagens.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Voltar
            </Button>
            <Button disabled={busy || !!pending || dailyBlocked} onClick={() => void run()}>
              Confirmar consulta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
export function CnpjOperations({ userId, admin = false }: { userId: string; admin?: boolean }) {
  const [audit, setAudit] = useState<{id:string;view:"businesses"|"deliveries"}|null>(null);
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: [admin ? "cnpj-admin-history" : "cnpj-history", userId, page],
    queryFn: () => (admin ? cnpjAdminHistory({ data: { page } }) : cnpjHistory({ data: { page } })),
    retry: false,
    refetchInterval: query => ((query.state.data?.requests || []) as Operation[]).some(row=>row.state === "processing") ? 10000 : false,
  });
  const rows = (q.data?.requests || []) as Operation[];
  return (
    <section className="cnpj-history">
      <header className="prospect-section-heading">
        <div>
          <h3>Histórico de consultas CNPJ</h3>
          <p>Pesquisas, consultas diretas e dados complementares.</p>
        </div>
        <Button variant="outline" onClick={() => void q.refetch()}>
          Atualizar consultas
        </Button>
      </header>
      {q.isPending ? (
        <p role="status">Consultando histórico…</p>
      ) : q.isError ? (
        <p role="alert">Não foi possível carregar as consultas CNPJ.</p>
      ) : !rows.length ? (
        <p className="prospect-empty">Nenhuma consulta CNPJ registrada.</p>
      ) : (
        <div className="prospect-request-list">
          {rows.map((r) => (
            <article key={r.id} data-operation-state={r.state}>
              <div>
                <strong>
                  {r.criteria["refreshLeadId"] ? "Atualização cadastral" : r.operation === "enrich"
                    ? "Dados complementares"
                    : r.operation === "lookup"
                      ? "Consulta por CNPJ"
                      : "Pesquisa por filtros"}
                </strong>
                <p>
                  {r.criteria["cnpj"] ? displayCnpj(r.criteria["cnpj"]) : [r.criteria["city"], r.criteria["uf"]].filter(Boolean).join(" · ")}
                </p>
                {admin && (
                  <p>
                    {r.painel_de_desbanimento?.nome} · {r.painel_de_desbanimento?.email}
                  </p>
                )}
                <small>{new Date(r.created_at).toLocaleString("pt-BR")}</small>
              </div>
              <div>
                <span className="prospect-badge">
                  {r.state === "completed"
                    ? "Concluída"
                    : r.state === "processing"
                      ? "Em andamento"
                      : "Não concluída"}
                </span>
                <p>
                  {r.criteria["refreshLeadId"] ? `Atualização cadastral · ${money(r.charged_cents)}` : r.operation === "enrich" ? `Dados complementares · ${money(r.charged_cents)}` : `${r.delivered} novos leads · ${money(r.charged_cents)}`}
                </p>
                {!admin && r.state === "failed" && (
                  <p>
                    {r.failureReason === "balance"
                      ? "Saldo insuficiente na carteira. Nenhum valor foi descontado."
                      : "Não foi possível concluir a consulta. Nenhum valor foi descontado. Tente novamente mais tarde."}
                  </p>
                )}
                {admin && r.diagnostic && (
                  <small>Motivo: {cnpjDiagnosticLabel(r.diagnostic)}</small>
                )}
              </div>
              {admin && !r.criteria["refreshLeadId"] && r.operation !== "enrich" && <div className="cnpj-audit-actions">
                <Button variant="outline" onClick={()=>setAudit({id:r.id,view:"businesses"})}>Ver empresas desta pesquisa</Button>
                <Button variant="outline" onClick={()=>setAudit({id:r.id,view:"deliveries"})}>Ver entregas desta pesquisa</Button>
              </div>}
              <details>
                <summary>Referência</summary>
                <code>{r.id}</code>
              </details>
            </article>
          ))}
        </div>
      )}
      {admin && <Dialog open={!!audit} onOpenChange={open=>{if(!open)setAudit(null);}}><DialogContent className="cnpj-audit-dialog"><DialogHeader><DialogTitle>Empresas e entregas CNPJ</DialogTitle><DialogDescription>Consulta da pesquisa selecionada, sem consumir créditos do fornecedor.</DialogDescription></DialogHeader>{audit&&<CnpjAudit key={audit.id+audit.view} adminId={userId} requestId={audit.id} initialView={audit.view}/>}</DialogContent></Dialog>}
      {(rows.length > 0 || page > 0) && <div className="list-pagination">
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
      </div>}
    </section>
  );
}
export function CnpjAdmin({ adminId,onHistory }: { adminId: string;onHistory?:()=>void }) {
  const q = useQuery({
    queryKey: ["cnpj-admin-config", adminId],
    queryFn: () => cnpjAdminConfig(),
    retry: false,
  });
  const [form, setForm] = useState<Config | null>(null),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const cache = useQueryClient();
  useEffect(() => {
    if (q.data) setForm(q.data as Config);
  }, [q.data]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await cnpjAdminSave({
        data: {
          enabled: form.enabled,
          unitCents: form.unitCents,
          enrichEnabled: form.enrichEnabled,
          enrichCents: form.enrichCents,
          dailyRequests: form.dailyRequests,
          dailyCalls: form.dailyCalls,
          minuteCalls: form.minuteCalls,
          cacheDays: form.cacheDays,
          apiKey: key,
        },
      });
      setKey("");
      setMessage("Configurações CNPJ salvas.");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["cnpj-admin-config"] }),
        cache.invalidateQueries({ queryKey: ["cnpj-config"] }),
        cache.invalidateQueries({ queryKey: ["cnpj-provider-balance"] }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="prospect-card">
      <header className="prospect-section-heading">
        <div>
          <span className="eyebrow">PROSPECÇÃO / CNPJ</span>
          <h2>Configuração de empresas por CNPJ</h2>
          <p>Modalidade independente do Google Maps, usando a mesma carteira e CRM.</p>
        </div>
      </header>
      {q.isPending ? (
        <p role="status">Carregando configuração…</p>
      ) : q.isError || !form ? (
        <div role="alert">
          <p>A configuração CNPJ não está disponível. Confira a ativação do SQL e da função.</p>
          <Button variant="outline" onClick={() => void q.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <form onSubmit={save} className="prospect-admin-form">
          <div className="prospect-full prospect-form-divider prospect-step-heading"><span>01 / ACESSO</span><h3>Disponibilidade e integração</h3><p>Controle a liberação da modalidade e mantenha a credencial privada.</p></div>
          <label className="prospect-checkbox prospect-full">
            <input
              type="checkbox"
              checked={form.enabled}
              disabled={busy}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            Liberar pesquisa por CNPJ aos clientes
          </label>
          <label className="prospect-full">
            Chave da Casa dos Dados
            <input
              type="password"
              className="field"
              autoComplete="new-password"
              value={key}
              maxLength={500}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                form.hasKey
                  ? "Chave já configurada; deixe vazio para manter"
                  : "Informe a chave privada"
              }
            />
            <small>A chave fica apenas no servidor. Não é exibida novamente.</small>
          </label>
          <div className="prospect-full prospect-form-divider prospect-step-heading"><span>02 / PREÇOS E CONSULTA COMPLEMENTAR</span><h3>Valores para o cliente</h3><p>Preços em reais, descontados da carteira conforme a operação confirmada.</p></div>
          {[
            ["unitCents", "Preço por novo lead CNPJ (R$)"],
            ["enrichCents", "Preço da consulta complementar (R$)"],
          ].map(([field, label]) => (
            <label key={field}>
              {label}
              <input
                type="number"
                className="field"
                min={0}
                max={100}
                step="0.01"
                required
                value={(form[field as "unitCents" | "enrichCents"] / 100).toString()}
                onChange={(e) =>
                  setForm({ ...form, [String(field)]: Math.round(Number(e.target.value) * 100) })
                }
              />
            </label>
          ))}
          <label className="prospect-checkbox prospect-full">
            <input
              type="checkbox"
              checked={form.enrichEnabled}
              onChange={(e) => setForm({ ...form, enrichEnabled: e.target.checked })}
            />
            Permitir enriquecimento pela ReceitaWS pública
          </label>
          <p className="prospect-help prospect-full">
            Confirme com o fornecedor a autorização para oferecer este recurso pago. A ReceitaWS consulta dados cadastrais em cache. Nesta integração pública, o
            limite local é de 3 consultas por minuto para toda a aplicação. Não confirma telefone do
            proprietário e não altera a busca Google Maps.
          </p>
          <div className="prospect-full prospect-form-divider prospect-step-heading"><span>03 / CONTROLE DE CONSUMO</span><h3>Limites e validade</h3><p>Separe o limite individual dos limites globais da aplicação.</p></div>
          {[
            ["dailyRequests", "Consultas CNPJ por conta por dia", 100],
            ["dailyCalls", "Máximo de chamadas CNPJ aos fornecedores por dia (aplicação)", 10000],
            ["minuteCalls", "Máximo de chamadas à Casa dos Dados por minuto (aplicação)", 100],
            ["cacheDays", "Validade da base CNPJ (dias)", 30],
          ].map(([field, label, max]) => (
            <label key={String(field)}>
              {label}
              <input
                className="field"
                type="number"
                required
                min={1}
                max={Number(max)}
                value={Number(form[field as keyof Config])}
                onChange={(e) => setForm({ ...form, [String(field)]: Number(e.target.value) })}
              />
            </label>
          ))}
          <p className="prospect-help prospect-full">
            Estes são limites internos de proteção. Ajuste conforme seu plano do fornecedor. O preço
            é por lead entregue; uma consulta sem novos leads não debita a carteira. O fornecedor
            pode cobrar suas pesquisas independentemente da quantidade entregue.
          </p>
          <div className="prospect-full prospect-save-bar">
            <span>As alterações passam a valer para novas consultas.</span>
            <div>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            {message && <p role="status">{message}</p>}
            <Button disabled={busy} type="submit">
              {busy ? "Salvando…" : "Salvar configuração CNPJ"}
            </Button>
            </div>
          </div>
        </form>
      )}
      {q.data && onHistory && <div className="prospect-history-shortcut"><div><strong>Consultas e diagnósticos</strong><p>Acompanhe os clientes e os motivos de falha no histórico da prospecção.</p></div><Button variant="outline" onClick={onHistory}>Ver consultas CNPJ</Button></div>}
    </section>
  );
}
export {CnpjEnrichButton} from "./enrich-button";
