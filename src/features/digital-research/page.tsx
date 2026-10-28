import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Users,
  FolderHeart,
  History,
  ArrowRight,
  Download,
  ExternalLink,
  RefreshCw,
  Bookmark,
  Trash2,
  Instagram,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { BalanceSummary } from "../payments/balance-summary";
import { catalog, type Profile, type Research, type Tool } from "./model";
import {
  digitalCollections,
  digitalConfig,
  digitalHistory,
  digitalRefresh,
  digitalSave,
  digitalStart,
  digitalStatus,
  digitalUnsave,
} from "./actions";
import { csv, criteria } from "../../../supabase/functions/astros-digital-research/core";
import "./style.css";
export const money = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n / 100);
export const date = (v: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Fortaleza",
  }).format(new Date(v));
export const states = {
  dispatching: "Confirmando envio",
  running: "Em andamento",
  completed: "Concluída",
  review: "Em conferência",
  rejected: "Não iniciada · saldo devolvido",
};
export function download(rows: Profile[]) {
  const url = URL.createObjectURL(new Blob([csv(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "pesquisa-digital.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ProfileCard({ row, action }: { row: Profile; action?: React.ReactNode }) {
  return (
    <article className="digital-profile">
      <div className="digital-profile-title">
        <span className="digital-avatar">
          {(row.name || row.username).slice(0, 2).toUpperCase()}
        </span>
        <div>
          <h3>{row.name || row.username}</h3>
          <a href={row.url} target="_blank" rel="noreferrer">
            @{row.username} <ExternalLink size={13} />
          </a>
        </div>
      </div>
      {row.biography && <p className="digital-bio">{row.biography}</p>}
      <dl className="digital-metrics">
        <div>
          <dt>Seguidores</dt>
          <dd>{row.followers?.toLocaleString("pt-BR") ?? "Não informado"}</dd>
        </div>
        <div>
          <dt>Publicações</dt>
          <dd>{row.posts?.toLocaleString("pt-BR") ?? "Não informado"}</dd>
        </div>
      </dl>
      <div className="digital-contact">
        {row.website && (
          <a href={row.website} target="_blank" rel="noreferrer">
            Visitar site <ExternalLink size={13} />
          </a>
        )}
        {row.email && <p>E-mail público: {row.email}</p>}
        {row.phone && <p>Telefone público: {row.phone}</p>}
        {!row.email && !row.phone && <p>Contato não informado neste resultado.</p>}
        {row.private && <span>Perfil privado · informações limitadas</span>}
      </div>
      {action}
    </article>
  );
}
export function ResearchDetails({
  row,
  onClose,
  onRefresh,
  onSave,
  busy,
  error,
}: {
  row: Research;
  onClose: () => void;
  onRefresh: () => void;
  onSave?: (p: Profile) => void;
  busy: boolean;
  error?: string;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="digital-overlay" />
        <Dialog.Content className="digital-dialog">
          <div className="digital-section-heading">
            <div>
              <Dialog.Title>{catalog.find((t) => t.id === row.tool)?.title}</Dialog.Title>
              <Dialog.Description>
                {row.query} · {states[row.state]}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="outline">Fechar</Button>
            </Dialog.Close>
          </div>
          {error && (
            <p role="alert" className="digital-error">
              {error}
            </p>
          )}
          <p className="digital-help">Referência: {row.id}</p>
          <div className="digital-actions">
            <span>
              Reserva: {money(row.reserved_cents)} · Cobrança final:{" "}
              {row.state === "completed" || row.state === "rejected"
                ? money(row.charged_cents)
                : "Aguardando conclusão"}
            </span>
            {!["completed", "rejected"].includes(row.state) && (
              <Button variant="outline" disabled={busy} onClick={onRefresh}>
                <RefreshCw size={16} />
                Conferir andamento
              </Button>
            )}
            {row.rows && row.rows.length > 0 && (
              <Button variant="outline" onClick={() => download(row.rows!)}>
                <Download size={16} />
                Exportar CSV
              </Button>
            )}
          </div>
          {["review", "dispatching"].includes(row.state) && (
            <p className="digital-notice">
              Estamos conferindo esta tentativa. Não inicie outra para repetir o envio. A reserva
              permanece protegida até a confirmação.
            </p>
          )}
          {row.state === "completed" && !row.rows?.length && (
            <p className="digital-empty">
              Pesquisa concluída sem resultados. A reserva foi devolvida.
            </p>
          )}
          <div className="digital-results">
            {row.rows?.map((p) => (
              <ProfileCard
                key={p.username}
                row={p}
                action={
                  onSave && (
                    <Button variant="outline" disabled={busy} onClick={() => onSave(p)}>
                      <Bookmark size={16} />
                      Salvar em coleção
                    </Button>
                  )
                }
              />
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function DigitalResearchPage({ userId }: { userId: string }) {
  const qc = useQueryClient(),
    lock = useRef(false);
  const [tab, setTab] = useState<"tools" | "history" | "collections">("tools"),
    [tool, setTool] = useState<Tool | null>(null),
    [query, setQuery] = useState(""),
    [quantity, setQuantity] = useState(10),
    [page, setPage] = useState(0),
    [savedPage, setSavedPage] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [confirm, setConfirm] = useState(false),
    [detail, setDetail] = useState<Research | null>(null),
    [saving, setSaving] = useState<Profile | null>(null),
    [collection, setCollection] = useState("Minha coleção");
  const [attempt, setAttempt] = useState<Parameters<typeof digitalStart>[0]["data"] | null>(null);
  const config = useQuery({
    queryKey: ["digital-config", userId],
    queryFn: () => digitalConfig(),
    retry: false,
  });
  const history = useQuery({
    queryKey: ["digital-history", userId, page],
    queryFn: () => digitalHistory({ data: { page } }),
    enabled: tab === "history",
    retry: false,
  });
  const saved = useQuery({
    queryKey: ["digital-saved", userId, savedPage],
    queryFn: () => digitalCollections({ data: { page: savedPage } }),
    enabled: tab === "collections",
    retry: false,
  });
  const selected = catalog.find((t) => t.id === tool),
    settings = tool ? config.data?.tools[tool] : null;
  const amount =
    tool === "instagram_profile"
      ? [
          ...new Set(
            query
              .split(/[\s,;]+/)
              .filter(Boolean)
              .map((s) => s.toLowerCase()),
          ),
        ].length
      : quantity;
  const ready = !!(
    config.data?.installed &&
    config.data.enabled &&
    settings?.enabled &&
    settings.unitCents > 0
  );
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível confirmar a operação.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function invalidate() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["digital-history", userId] }),
      qc.invalidateQueries({ queryKey: ["digital-saved", userId] }),
      qc.invalidateQueries({ queryKey: ["wallet", userId] }),
    ]);
  }
  async function start() {
    await run(async () => {
      if (!tool || !settings || !config.data) return;
      const data = attempt ?? {
        requestId: crypto.randomUUID(),
        tool,
        query,
        quantity: amount,
        unitCents: settings.unitCents,
        version: config.data.version,
      };
      setAttempt(data);
      setConfirm(false);
      let row: Research;
      try {
        row = await digitalStart({ data });
      } catch (e) {
        const refused = [
          "Confira o preço novamente.",
          "Novas pesquisas estão indisponíveis para esta conta.",
          "Quantidade inválida.",
          "Limite diário de pesquisas atingido.",
          "Capacidade ocupada. Tente mais tarde.",
          "Limite diário do fornecedor atingido.",
          "Saldo insuficiente. Faça uma recarga.",
        ];
        if (e instanceof Error && refused.includes(e.message)) {
          setAttempt(null);
          await config.refetch();
        }
        throw e;
      }
      setDetail(row);
      setTab("history");
      setAttempt(null);
      await invalidate();
    });
  }
  const refresh = () =>
    void run(async () => {
      if (detail) {
        setDetail(await digitalRefresh({ data: { id: detail.id } }));
        await invalidate();
      }
    });
  async function open(row: Research) {
    await run(async () => {
      setDetail(await digitalStatus({ data: { id: row.id } }));
      if (attempt?.requestId === row.id) setAttempt(null);
    });
  }
  function prepare(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!ready || !tool || !amount || amount > (settings?.maxQuantity ?? 0)) return;
    try {
      criteria(tool, query, amount);
      setConfirm(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confira os dados da pesquisa.");
    }
  }
  return (
    <div className="digital-research">
      <header className="digital-heading">
        <span className="eyebrow">ASTROS / PESQUISA DIGITAL</span>
        <h1>Encontre. Confira. Organize.</h1>
        <p>Pesquise perfis e guarde as informações úteis para o seu trabalho.</p>
      </header>
      <BalanceSummary />
      <nav className="digital-tabs" aria-label="Pesquisa digital">
        {[
          { id: "tools" as const, title: "Ferramentas", Icon: Search },
          { id: "history" as const, title: "Minhas pesquisas", Icon: History },
          { id: "collections" as const, title: "Coleções", Icon: FolderHeart },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => {
              setTab(t.id);
              setError("");
            }}
          >
            <t.Icon size={18} />
            {t.title}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="digital-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="digital-success">
          {message}
        </p>
      )}
      {tab === "tools" && (
        <>
          <div className="digital-section-heading">
            <div>
              <h2>Perfis e contatos</h2>
              <p>Escolha uma ferramenta para começar.</p>
            </div>
            <span className="digital-network">
              <Instagram size={16} />
              Instagram
            </span>
          </div>
          {config.isPending ? (
            <p role="status">Conferindo disponibilidade…</p>
          ) : config.isError ? (
            <p role="alert" className="digital-error">
              Não foi possível conferir a disponibilidade.{" "}
              <button onClick={() => void config.refetch()}>Tentar novamente</button>
            </p>
          ) : (
            !config.data?.enabled && (
              <p className="digital-notice">
                As ferramentas estão em preparação ou temporariamente indisponíveis para sua conta.
                Suas pesquisas e coleções continuam acessíveis.
              </p>
            )
          )}
          <div className="digital-tools">
            {catalog.map((t) => {
              const s = config.data?.tools[t.id],
                active = config.data?.enabled && s?.enabled;
              return (
                <article key={t.id} className="digital-tool">
                  <span className="digital-tool-icon">
                    <Users size={22} />
                  </span>
                  <span className="digital-kicker">INSTAGRAM</span>
                  <h3>{t.title}</h3>
                  <p>{t.description}</p>
                  <div className="digital-tool-bottom">
                    <span>
                      {active ? `${money(s.unitCents)} por perfil entregue` : "Em preparação"}
                    </span>
                    <Button
                      variant="outline"
                      disabled={!active || busy || !!attempt}
                      onClick={() => {
                        setTool(t.id);
                        setQuery("");
                        setQuantity(Math.min(10, s?.maxQuantity ?? 10));
                        setError("");
                      }}
                    >
                      {tool === t.id ? "Selecionada" : "Usar ferramenta"}
                      <ArrowRight size={15} />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
          {selected && (
            <form className="digital-form" onSubmit={prepare}>
              <div className="digital-section-heading">
                <div>
                  <h2>{selected.title}</h2>
                  <p>{selected.description}</p>
                </div>
              </div>
              <label>
                {selected.input}
                <textarea
                  className="field"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={selected.placeholder}
                  maxLength={500}
                  required
                  disabled={busy || !!attempt}
                />
              </label>
              {tool !== "instagram_profile" ? (
                <label>
                  Máximo de resultados
                  <input
                    type="number"
                    className="field"
                    min={1}
                    max={settings?.maxQuantity ?? selected.max}
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    required
                    disabled={busy || !!attempt}
                  />
                </label>
              ) : (
                <p>
                  {amount} perfil(is) informado(s). Máximo: {settings?.maxQuantity ?? 10}.
                </p>
              )}
              <p className="digital-help">
                Reserva máxima: <strong>{money(amount * (settings?.unitCents ?? 0))}</strong>. A
                cobrança final considera os perfis entregues nesta pesquisa; contatos podem estar
                ausentes. O restante da reserva é devolvido após a conclusão confirmada.
              </p>
              <Button
                disabled={
                  !ready || busy || !!attempt || amount < 1 || amount > (settings?.maxQuantity ?? 0)
                }
              >
                Conferir e continuar
              </Button>
            </form>
          )}
          {attempt && (
            <div className="digital-notice">
              <p>Uma tentativa aguarda confirmação. Referência: {attempt.requestId}.</p>
              <Button variant="outline" disabled={busy} onClick={() => void start()}>
                Conferir a mesma tentativa
              </Button>
              <Button variant="outline" onClick={() => setTab("history")}>
                Ver minhas pesquisas
              </Button>
            </div>
          )}
        </>
      )}
      {tab === "history" && (
        <section>
          <div className="digital-section-heading">
            <div>
              <h2>Minhas pesquisas</h2>
              <p>Consulte o andamento e abra os resultados das suas consultas.</p>
            </div>
            <Button
              variant="outline"
              disabled={history.isFetching}
              onClick={() => void history.refetch()}
            >
              <RefreshCw size={16} />
              Atualizar lista
            </Button>
          </div>
          {history.isPending ? (
            <p role="status">Carregando pesquisas…</p>
          ) : history.isError ? (
            <p role="alert">Não foi possível carregar suas pesquisas. Tente atualizar a lista.</p>
          ) : !history.data.rows.length ? (
            <p className="digital-empty">Você ainda não tem pesquisas nesta página.</p>
          ) : (
            <div className="digital-history">
              {history.data.rows.slice(0, 20).map((row) => (
                <button
                  className="digital-history-row"
                  key={row.id}
                  disabled={busy}
                  onClick={() => void open(row)}
                >
                  <div>
                    <strong>{catalog.find((t) => t.id === row.tool)?.title}</strong>
                    <span>{row.query}</span>
                    <small>{date(row.created_at)}</small>
                  </div>
                  <div>
                    <span className="digital-state" data-state={row.state}>
                      {states[row.state]}
                    </span>
                    <small>{row.delivered} resultado(s)</small>
                    <strong>
                      {["completed", "rejected"].includes(row.state)
                        ? money(row.charged_cents)
                        : `Reserva ${money(row.reserved_cents)}`}
                    </strong>
                  </div>
                  <ArrowRight size={18} />
                </button>
              ))}
            </div>
          )}
          <Pager page={page} more={(history.data?.rows.length ?? 0) > 20} onChange={setPage} />
        </section>
      )}
      {tab === "collections" && (
        <section>
          <div className="digital-section-heading">
            <div>
              <h2>Coleções</h2>
              <p>
                Seus perfis selecionados, organizados pelo nome da coleção. Salvar não gera uma nova
                consulta.
              </p>
            </div>
          </div>
          {saved.isPending ? (
            <p role="status">Carregando coleções…</p>
          ) : saved.isError ? (
            <p role="alert">
              Não foi possível carregar as coleções.{" "}
              <button onClick={() => void saved.refetch()}>Tentar novamente</button>
            </p>
          ) : !saved.data.rows.length ? (
            <p className="digital-empty">
              Salve perfis dos resultados para criar sua primeira coleção.
            </p>
          ) : (
            <div className="digital-results">
              {saved.data.rows.slice(0, 20).map((r) => (
                <div key={r.id}>
                  <p className="digital-collection-label">{r.collection}</p>
                  <ProfileCard
                    row={r.profile}
                    action={
                      <div className="digital-actions">
                        <Button variant="outline" onClick={() => download([r.profile])}>
                          <Download size={15} />
                          CSV
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await digitalUnsave({ data: { id: r.id } });
                              setMessage(
                                "Item removido da coleção. O resultado da pesquisa foi preservado.",
                              );
                              await invalidate();
                            })
                          }
                        >
                          <Trash2 size={15} />
                          Remover da coleção
                        </Button>
                      </div>
                    }
                  />
                </div>
              ))}
            </div>
          )}
          <Pager
            page={savedPage}
            more={(saved.data?.rows.length ?? 0) > 20}
            onChange={setSavedPage}
          />
        </section>
      )}
      {confirm && (
        <Dialog.Root
          open
          onOpenChange={(v) => {
            if (!busy) setConfirm(v);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="digital-overlay" />
            <Dialog.Content className="digital-dialog digital-small">
              <Dialog.Title>Confirmar pesquisa</Dialog.Title>
              <Dialog.Description>
                {selected?.title} · até {amount} perfil(is).
              </Dialog.Description>
              <p>
                Será reservado até <strong>{money(amount * (settings?.unitCents ?? 0))}</strong> da
                sua carteira. O valor final será proporcional aos perfis entregues, mesmo quando não
                houver telefone ou e-mail.
              </p>
              <p>
                O resultado pode conter menos perfis que o solicitado. Atualizar o andamento não
                inicia uma nova pesquisa.
              </p>
              <div className="digital-actions">
                <Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>
                  Voltar
                </Button>
                <Button disabled={busy} onClick={() => void start()}>
                  Confirmar e pesquisar
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
      {detail && (
        <ResearchDetails
          row={detail}
          busy={busy}
          error={error}
          onClose={() => setDetail(null)}
          onRefresh={refresh}
          onSave={(p) => {
            setSaving(p);
            setCollection("Minha coleção");
          }}
        />
      )}
      {saving && detail && (
        <Dialog.Root
          open
          onOpenChange={(v) => {
            if (!v && !busy) setSaving(null);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="digital-overlay" />
            <Dialog.Content className="digital-dialog digital-small">
              <Dialog.Title>Salvar @{saving.username}</Dialog.Title>
              {error && (
                <p role="alert" className="digital-error">
                  {error}
                </p>
              )}
              <Dialog.Description>
                Escolha uma coleção para organizar este perfil.
              </Dialog.Description>
              <label>
                Nome da coleção
                <input
                  className="field"
                  maxLength={80}
                  value={collection}
                  onChange={(e) => setCollection(e.target.value)}
                />
              </label>
              <div className="digital-actions">
                <Button variant="outline" disabled={busy} onClick={() => setSaving(null)}>
                  Cancelar
                </Button>
                <Button
                  disabled={busy || !collection.trim()}
                  onClick={() =>
                    void run(async () => {
                      await digitalSave({
                        data: {
                          requestId: detail.id,
                          username: saving.username,
                          collection: collection.trim(),
                        },
                      });
                      setSaving(null);
                      setMessage("Perfil salvo na coleção.");
                      await invalidate();
                    })
                  }
                >
                  Salvar perfil
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  );
}
export function Pager({
  page,
  more,
  onChange,
}: {
  page: number;
  more: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <nav className="digital-pager" aria-label="Paginação">
      <Button variant="outline" disabled={!page} onClick={() => onChange(page - 1)}>
        Anterior
      </Button>
      <span>Página {page + 1}</span>
      <Button variant="outline" disabled={!more} onClick={() => onChange(page + 1)}>
        Próxima
      </Button>
    </nav>
  );
}
