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
import { useAutoProgress } from "./use-auto-progress";
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
  const automatic = useAutoProgress({
    scope: `admin:${adminId}`,
    row: detail,
    enabled: !!detail,
    blocked: busy,
    check: (id) => digitalAdminRefresh({ data: { id } }),
    receive: async (row) => {
      setDetail((current) => (current?.id === row.id ? row : current));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["digital-admin-history", adminId] }),
        qc.invalidateQueries({ queryKey: ["digital-admin-usage", adminId] }),
      ]);
    },
  });
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
                saveError={error}
                message={message}
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
                check={(row) =>
                  void act(async () => {
                    setDetail(row);
                    setDetail(await digitalAdminRefresh({ data: { id: row.id } }));
                    await refresh();
                  })
                }
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
                feedbackError={error}
                feedbackMessage={message}
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
          autoProgress={automatic}
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
export function Settings({
  config,
  busy,
  onSave,
  saveError,
  message,
}: {
  config: Config;
  busy: boolean;
  saveError: string;
  message: string;
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
      const invalid = catalog.filter(
        (t) => form.tools[t.id].enabled && form.tools[t.id].unitCents < 1,
      );
      setError(
        invalid.length
          ? `Defina preço maior que zero para: ${invalid.map((t) => t.title).join(", ")}. O valor é em centavos de reais.`
          : "Confira os limites: use números inteiros dentro dos intervalos indicados em cada campo.",
      );
      return;
    }
    onSave(parsed.data);
  }
  return (
    <form className="digital-admin-form" onSubmit={submit}>
      <p className="digital-notice">
        Configure em três etapas: acesso e integração, limites da plataforma e ferramentas com seus
        preços. O preço em reais é cobrado na carteira do cliente; os limites em dólares controlam a
        integração com a Apify. Uma pesquisa pode consumir créditos da sua conta Apify.
      </p>
      <fieldset disabled={busy}>
        <legend>1. Acesso e integração</legend>
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
          <small className="digital-field-help">
            Chave geral do módulo. Desmarcar pausa novos pedidos de todas as contas; histórico e
            conferência das pesquisas existentes continuam disponíveis.
          </small>
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
          <small className="digital-field-help">
            Mantenha marcado durante os testes. Mesmo uma conta liberada individualmente não
            pesquisa se for cliente e o piloto estiver ativo.
          </small>
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
          <small className="digital-field-help">
            Token privado da sua conta Apify. Deixe vazio para preservar a chave salva. Troca de
            chave fica bloqueada enquanto houver pesquisas pendentes ou em conferência.
          </small>
        </label>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>2. Limites da plataforma</legend>
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
            <small className="digital-field-help">
              De 1 a 50. Quantas novas pesquisas cada conta pode iniciar por dia, somando todas as
              ferramentas. Ex.: 3 permite três pesquisas, não três perfis. Dia pelo horário de
              Fortaleza.
            </small>
          </label>
          <label>
            Teto diário da plataforma (centavos de US$)
            <input
              className="field"
              type="number"
              min={1}
              max={5000}
              value={form.dailyUsdCents}
              disabled={busy}
              onChange={(e) => setForm({ ...form, dailyUsdCents: Number(e.target.value) })}
            />
            <small className="digital-field-help">
              De 1 a 5.000. Valor atual: US$ {(form.dailyUsdCents / 100).toFixed(2)}. Compartilhado
              por todas as contas e ferramentas; não é um teto por cliente nem o saldo da Apify.
            </small>
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
            <small className="digital-field-help">
              De 1 a 5. Quantas pesquisas podem ficar pendentes ao mesmo tempo em toda a plataforma.
              Cada conta também precisa resolver sua pesquisa anterior antes de iniciar outra.
            </small>
          </label>
        </div>
        <p className="digital-help">
          100 centavos de US$ = US$ 1,00. O orçamento considera a soma dos limites reservados pelas
          pesquisas iniciadas no dia em Fortaleza; não é o saldo da Apify nem a fatura real. Ex.:
          teto 100 e limite de 20 por execução permitem até cinco reservas de 20 no dia, mesmo que
          as execuções custem menos. Conclusão ou devolução da carteira não libera esse teto diário.
          Armazenamento e leituras da plataforma podem gerar consumo adicional.
        </p>
      </fieldset>
      <div className="digital-section-heading">
        <div>
          <h2>3. Ferramentas e preços de venda</h2>
          <p>
            Configure cada ferramenta separadamente. Os valores não são convertidos automaticamente
            entre real e dólar.
          </p>
        </div>
      </div>
      {catalog.map((t) => {
        const v = form.tools[t.id];
        return (
          <fieldset key={t.id} disabled={busy}>
            <legend>{t.title}</legend>
            <p className="digital-help">{t.description}</p>
            <label>
              <span>
                <input
                  type="checkbox"
                  checked={v.enabled}
                  onChange={(e) => updateTool(t.id, { enabled: e.target.checked })}
                />
                Disponibilizar ferramenta
              </span>
              <small className="digital-field-help">
                Libera esta opção para contas elegíveis quando o módulo estiver ativo. Precisa de
                preço maior que zero.
              </small>
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
                <small className="digital-field-help">
                  De 0 a 10.000; ferramenta ativa exige pelo menos 1. Ex.: 1 = R$ 0,01; 100 = R$
                  1,00 por perfil entregue, mesmo sem contato. Preço atual: {money(v.unitCents)}.
                </small>
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
                <small className="digital-field-help">
                  De 1 a {t.max}. Máximo que o cliente pode pedir nesta ferramenta em uma pesquisa;
                  não garante essa quantidade de resultados.
                </small>
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
                <small className="digital-field-help">
                  De 1 a 500. Ex.: 20 = US$ 0,20. Limite enviado à Apify para esta execução e valor
                  somado ao teto diário. Não é preço de venda nem garantia do custo total da conta
                  Apify.
                </small>
              </label>
            </div>
            <p className="digital-help">
              Cobrança ao cliente: {money(v.unitCents)} por perfil entregue nesta pesquisa, mesmo
              sem contato. Reserva máxima com {v.maxQuantity} perfis:{" "}
              {money(v.unitCents * v.maxQuantity)}. O restante é devolvido quando a conclusão é
              confirmada. Sem consultas extras automáticas.
            </p>
          </fieldset>
        );
      })}
      <div className="digital-save-feedback" aria-busy={busy}>
        {(error || saveError) && (
          <p role="alert" className="digital-error">
            {error || saveError}
          </p>
        )}
        {!error && !saveError && message && (
          <p role="status" className="digital-success">
            {message}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Salvando…" : "Salvar configuração"}
        </Button>
      </div>
    </form>
  );
}
function Runs({
  adminId,
  busy,
  open,
  check,
}: {
  adminId: string;
  busy: boolean;
  open: (v: Research) => void;
  check: (v: Research) => void;
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
            <div className="digital-history-entry" key={r.id}>
              <button className="digital-history-row" disabled={busy} onClick={() => open(r)}>
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
              {!["completed", "rejected"].includes(r.state) && (
                <div className="digital-history-check">
                  <span>Último estado registrado. Confira a execução original.</span>
                  <Button variant="outline" disabled={busy} onClick={() => check(r)}>
                    Conferir andamento
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Pager page={page} more={(q.data?.rows.length ?? 0) > 20} onChange={setPage} />
    </section>
  );
}
export function Usage({
  adminId,
  busy,
  onAccess,
  feedbackError,
  feedbackMessage,
}: {
  adminId: string;
  busy: boolean;
  feedbackError: string;
  feedbackMessage: string;
  onAccess: (email: string, enabled: boolean) => void;
}) {
  const [email, setEmail] = useState(""),
    [accessAction, setAccessAction] = useState<"" | "allow" | "block">("");
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
            <span>Limites acumulados hoje · não é gasto real</span>
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
          if (accessAction) onAccess(email, accessAction === "allow");
        }}
      >
        <h2>Bloquear ou reabilitar um cliente</h2>
        <p>
          Esta opção é uma exceção individual. Use quando quiser impedir apenas um cliente de fazer
          novas pesquisas digitais, sem afetar os demais.
        </p>
        <p className="digital-notice">
          Exemplo: para bloquear o cliente joao@exemplo.com, informe esse e-mail, escolha Bloquear
          novas pesquisas e salve. Para desfazer o bloqueio, informe o mesmo e-mail e escolha
          Reabilitar novas pesquisas.
        </p>
        <p>
          Não precisa cadastrar todos os clientes aqui. Quem não tem bloqueio segue as regras
          gerais. Reabilitar não ignora a pausa do módulo, o modo piloto nem os limites. Histórico e
          pesquisas já iniciadas permanecem acessíveis; outros módulos não são afetados.
        </p>
        <label>
          E-mail do cliente cadastrado
          <input
            className="field"
            type="email"
            maxLength={254}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setAccessAction("");
            }}
            required
            disabled={busy}
          />
          <small className="digital-field-help">
            Digite o e-mail completo usado pelo cliente para entrar no painel.
          </small>
        </label>
        <label>
          O que deseja fazer com este cliente?
          <select
            className="field"
            required
            disabled={busy}
            value={accessAction}
            onChange={(e) => setAccessAction(e.target.value as "" | "allow" | "block")}
          >
            <option value="">Selecione uma ação</option>
            <option value="block">Bloquear novas pesquisas</option>
            <option value="allow">Reabilitar novas pesquisas</option>
          </select>
          <small className="digital-field-help">
            Nenhuma alteração acontece até você escolher a ação e salvar. Este formulário não
            consulta a situação atual do e-mail.
          </small>
        </label>
        {feedbackError && (
          <p role="alert" className="digital-error">
            {feedbackError}
          </p>
        )}
        {!feedbackError && feedbackMessage && (
          <p role="status" className="digital-success">
            {feedbackMessage}
          </p>
        )}
        <Button disabled={busy || !accessAction || !email.trim()}>
          {busy ? "Salvando…" : "Aplicar ao cliente"}
        </Button>
      </form>
    </section>
  );
}
