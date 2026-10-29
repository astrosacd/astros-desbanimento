import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AdminPanels } from "../admin/panels";
import { catalog, configSchema, type Config, type Research } from "./model";
import {
  digitalAdminAccessByEmail,
  digitalAdminConfig,
  digitalAdminHistory,
  digitalAdminRefresh,
  digitalAdminSave,
  digitalAdminStatus,
  digitalAdminUsage,
} from "./actions";
import { date, money, Pager, ResearchDetails, states } from "./page";
import "./style.css";
export function DigitalResearchAdmin({ adminId }: { adminId: string }) {
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [detail, setDetail] = useState<Research | null>(null);
  const qc = useQueryClient();
  const config = useQuery({
    queryKey: ["digital-admin-config", adminId],
    queryFn: () => digitalAdminConfig(),
    retry: false,
  });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["digital-admin-config", adminId] }),
      qc.invalidateQueries({ queryKey: ["digital-admin-history", adminId] }),
      qc.invalidateQueries({ queryKey: ["digital-admin-usage", adminId] }),
    ]);
  };
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível confirmar a operação.");
    } finally {
      setBusy(false);
    }
  }
  if (config.isPending) return <p role="status">Conferindo Pesquisa digital…</p>;
  if (config.isError)
    return (
      <p role="alert">
        {config.error instanceof Error
          ? config.error.message
          : "Não foi possível carregar a configuração."}{" "}
        <Button variant="outline" onClick={() => void config.refetch()}>
          Tentar novamente
        </Button>
      </p>
    );
  if (!config.data.installed)
    return (
      <section className="admin-welcome">
        <h2>Pesquisa digital em preparação</h2>
        <p>
          O upgrade está disponível no código. Instale o SQL e a função próprios deste módulo antes
          de configurar a Apify. Os serviços atuais continuam com suas configurações.
        </p>
      </section>
    );
  return (
    <div className="digital-research">
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
      <AdminPanels
        label="Gestão de Pesquisa digital"
        items={[
          {
            id: "config",
            label: "Ferramentas e preços",
            description: "Disponibilidade e integração",
            content: (
              <Settings
                key={config.data.version}
                config={config.data}
                busy={busy}
                onSave={(data) =>
                  void act(async () => {
                    await digitalAdminSave({ data });
                    setMessage("Configuração salva.");
                    await refresh();
                  })
                }
              />
            ),
          },
          {
            id: "runs",
            label: "Execuções",
            description: "Pesquisas e conferências",
            content: (
              <Runs
                adminId={adminId}
                busy={busy}
                open={(row) =>
                  void act(async () =>
                    setDetail(await digitalAdminStatus({ data: { id: row.id } })),
                  )
                }
              />
            ),
          },
          {
            id: "usage",
            label: "Consumo e acesso",
            description: "Limites e contas",
            content: (
              <Usage
                adminId={adminId}
                busy={busy}
                onAccess={(email, enabled) =>
                  void act(async () => {
                    await digitalAdminAccessByEmail({ data: { email, enabled } });
                    setMessage(
                      enabled
                        ? "Acesso individual liberado. A pausa global e o modo piloto continuam prevalecendo."
                        : "Novas pesquisas bloqueadas para esta conta. Histórico preservado.",
                    );
                    await refresh();
                  })
                }
              />
            ),
          },
        ]}
      />
      {detail && (
        <ResearchDetails
          row={detail}
          busy={busy}
          error={error}
          onClose={() => setDetail(null)}
          onRefresh={() =>
            void act(async () => {
              setDetail(await digitalAdminRefresh({ data: { id: detail.id } }));
              await refresh();
            })
          }
        />
      )}
    </div>
  );
}
function Settings({
  config,
  busy,
  onSave,
}: {
  config: Config;
  busy: boolean;
  onSave: (v: ReturnType<typeof configSchema.parse>) => void;
}) {
  const [form, setForm] = useState(() => ({
      version: config.version,
      enabled: config.enabled,
      pilot: config.pilot ?? true,
      dailyRequests: config.dailyRequests ?? 3,
      dailyUsdCents: config.dailyUsdCents ?? 100,
      concurrency: config.concurrency ?? 1,
      apiKey: "",
      tools: structuredClone(config.tools),
    })),
    [error, setError] = useState("");
  const updateTool = (
    id: (typeof catalog)[number]["id"],
    patch: Partial<Config["tools"][typeof id]>,
  ) => setForm((f) => ({ ...f, tools: { ...f.tools, [id]: { ...f.tools[id], ...patch } } }));
  function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const parsed = configSchema.safeParse(form);
    if (
      !parsed.success ||
      catalog.some((t) => form.tools[t.id].enabled && form.tools[t.id].unitCents < 1)
    ) {
      setError(
        "Confira os preços e limites. Ferramentas ativas precisam ter preço maior que zero.",
      );
      return;
    }
    onSave(parsed.data);
  }
  return (
    <form className="digital-admin-form" onSubmit={submit}>
      <p className="digital-notice">
        Instalação inicial desativada. Use o modo piloto para validar com uma conta administradora
        antes de liberar aos clientes. Uma execução pode gerar custos na Apify.
      </p>
      {error && (
        <p role="alert" className="digital-error">
          {error}
        </p>
      )}
      <label>
        <span>
          <input
            type="checkbox"
            checked={form.enabled}
            disabled={busy}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Permitir novas pesquisas
        </span>
      </label>
      <label>
        <span>
          <input
            type="checkbox"
            checked={form.pilot}
            disabled={busy}
            onChange={(e) => setForm({ ...form, pilot: e.target.checked })}
          />
          Modo piloto: somente administradores podem pesquisar
        </span>
      </label>
      <label>
        Chave Apify {config.hasKey ? "· já configurada" : ""}
        <input
          className="field"
          type="password"
          value={form.apiKey}
          maxLength={200}
          autoComplete="new-password"
          disabled={busy}
          onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          placeholder="Deixe vazio para manter a chave atual"
        />
      </label>
      <div className="digital-admin-grid">
        <label>
          Pesquisas por conta/dia
          <input
            className="field"
            type="number"
            min={1}
            max={50}
            value={form.dailyRequests}
            disabled={busy}
            onChange={(e) => setForm({ ...form, dailyRequests: Number(e.target.value) })}
          />
        </label>
        <label>
          Orçamento diário reservado (centavos de US$)
          <input
            className="field"
            type="number"
            min={1}
            max={5000}
            value={form.dailyUsdCents}
            disabled={busy}
            onChange={(e) => setForm({ ...form, dailyUsdCents: Number(e.target.value) })}
          />
        </label>
        <label>
          Máximo de pesquisas simultâneas
          <input
            className="field"
            type="number"
            min={1}
            max={5}
            value={form.concurrency}
            disabled={busy}
            onChange={(e) => setForm({ ...form, concurrency: Number(e.target.value) })}
          />
        </label>
      </div>
      <p className="digital-help">
        100 centavos de US$ = US$ 1,00. O orçamento considera a soma dos limites reservados pelas
        pesquisas iniciadas no dia em Fortaleza; não é o saldo da Apify nem a fatura real.
        Armazenamento e leituras da plataforma podem gerar consumo adicional.
      </p>
      {catalog.map((t) => {
        const v = form.tools[t.id];
        return (
          <fieldset key={t.id} disabled={busy}>
            <legend>{t.title}</legend>
            <label>
              <span>
                <input
                  type="checkbox"
                  checked={v.enabled}
                  onChange={(e) => updateTool(t.id, { enabled: e.target.checked })}
                />
                Disponibilizar ferramenta
              </span>
            </label>
            <div className="digital-admin-grid">
              <label>
                Preço por perfil (centavos de R$)
                <input
                  type="number"
                  className="field"
                  min={0}
                  max={10000}
                  value={v.unitCents}
                  onChange={(e) => updateTool(t.id, { unitCents: Number(e.target.value) })}
                />
              </label>
              <label>
                Máximo de perfis por pesquisa
                <input
                  type="number"
                  className="field"
                  min={1}
                  max={t.max}
                  value={v.maxQuantity}
                  onChange={(e) => updateTool(t.id, { maxQuantity: Number(e.target.value) })}
                />
              </label>
              <label>
                Limite por execução (centavos de US$)
                <input
                  type="number"
                  className="field"
                  min={1}
                  max={500}
                  value={v.maxUsdCents}
                  onChange={(e) => updateTool(t.id, { maxUsdCents: Number(e.target.value) })}
                />
              </label>
            </div>
            <p className="digital-help">
              Cobrança ao cliente: {money(v.unitCents)} por perfil entregue nesta pesquisa, mesmo
              sem contato. Sem enriquecimentos pagos adicionais automáticos.
            </p>
          </fieldset>
        );
      })}
      <Button type="submit" disabled={busy}>
        Salvar configuração
      </Button>
    </form>
  );
}
function Runs({
  adminId,
  busy,
  open,
}: {
  adminId: string;
  busy: boolean;
  open: (v: Research) => void;
}) {
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["digital-admin-history", adminId, page],
    queryFn: () => digitalAdminHistory({ data: { page } }),
    retry: false,
  });
  return (
    <section>
      <div className="digital-section-heading">
        <div>
          <h2>Execuções e conferências</h2>
          <p>
            Atualizar o andamento consulta a mesma execução. Tentativas incertas nunca são
            reenviadas automaticamente.
          </p>
        </div>
        <Button variant="outline" onClick={() => void q.refetch()}>
          Atualizar lista
        </Button>
      </div>
      {q.isPending ? (
        <p>Carregando…</p>
      ) : q.isError ? (
        <p role="alert">Não foi possível carregar as execuções.</p>
      ) : !q.data.rows.length ? (
        <p className="digital-empty">Nenhuma execução nesta página.</p>
      ) : (
        <div className="digital-history">
          {q.data.rows.slice(0, 20).map((r) => (
            <button
              key={r.id}
              className="digital-history-row"
              disabled={busy}
              onClick={() => open(r)}
            >
              <div>
                <strong>{catalog.find((t) => t.id === r.tool)?.title}</strong>
                <span>{r.query}</span>
                <small>
                  {r.id} · {date(r.created_at)}
                </small>
              </div>
              <span className="digital-state" data-state={r.state}>
                {states[r.state]}
              </span>
            </button>
          ))}
        </div>
      )}
      <Pager page={page} more={(q.data?.rows.length ?? 0) > 20} onChange={setPage} />
    </section>
  );
}
function Usage({
  adminId,
  busy,
  onAccess,
}: {
  adminId: string;
  busy: boolean;
  onAccess: (email: string, enabled: boolean) => void;
}) {
  const [email, setEmail] = useState(""),
    [enabled, setEnabled] = useState(false);
  const q = useQuery({
    queryKey: ["digital-admin-usage", adminId],
    queryFn: () => digitalAdminUsage(),
    retry: false,
  });
  return (
    <section>
      <div className="digital-section-heading">
        <div>
          <h2>Consumo e limites</h2>
          <p>Valores deste módulo, sem somar consumo da carteira a recebimentos de recarga.</p>
        </div>
        <Button variant="outline" onClick={() => void q.refetch()}>
          Atualizar
        </Button>
      </div>
      {q.isPending ? (
        <p>Carregando…</p>
      ) : q.isError ? (
        <p role="alert">Não foi possível carregar o consumo.</p>
      ) : (
        <div className="digital-admin-stats">
          <div>
            <strong>US$ {(q.data.reservedUsdCents / 100).toFixed(2)}</strong>
            <span>Limites reservados hoje · não é custo real</span>
          </div>
          <div>
            <strong>{q.data.pending}</strong>
            <span>Pesquisas pendentes</span>
          </div>
          <div>
            <strong>{q.data.review}</strong>
            <span>Precisam de conferência</span>
          </div>
          <div>
            <strong>{money(q.data.reservedCents)}</strong>
            <span>Reservas na carteira</span>
          </div>
          <div>
            <strong>{money(q.data.chargedCents)}</strong>
            <span>Cobranças finais · todo o período</span>
          </div>
          <div>
            <strong>{q.data.delivered}</strong>
            <span>Perfis entregues · todo o período</span>
          </div>
        </div>
      )}
      <form
        className="digital-form"
        onSubmit={(e) => {
          e.preventDefault();
          onAccess(email, enabled);
        }}
      >
        <h2>Acesso por conta</h2>
        <p>
          Esta restrição vale somente para novas pesquisas digitais. Não altera Maps, CNPJ ou outros
          serviços.
        </p>
        <label>
          E-mail exato da conta
          <input
            className="field"
            type="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={busy}
          />
        </label>
        <label>
          <span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={busy}
            />
            Permitir novas pesquisas para esta conta
          </span>
        </label>
        <Button disabled={busy}>Salvar acesso individual</Button>
      </form>
    </section>
  );
}
