import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { getStatusAdmin, saveStatus } from "./actions";
import {
  labels,
  phases,
  brasiliaInput,
  fromBrasiliaInput,
  MONITOR_HEALTH_URL,
  saveSchema,
  STATUS_URL,
  type Save,
} from "./model";
import { Button } from "@/components/ui/button";
import { StatusBoard } from "./public";
const diagnostics: Record<string, string> = {
  ok: "Verificação concluída",
  unreachable: "Não foi possível consultar a conexão",
  configuration_missing: "Configuração ou credencial ausente",
  worker_stale: "Worker sem confirmação recente",
  paused: "Serviço pausado na configuração",
  capacity_unavailable: "Fornecedor sem saldo ou capacidade disponível",
  invalid_response: "Resposta técnica não reconhecida",
};
const bridgeDiagnostics: Record<string, string> = {
  waiting: "Aguardando primeira sincronização.",
  ok: "Sincronização concluída.",
  api_unavailable: "Não foi possível comunicar com o Better Stack.",
  api_rejected:
    "O Better Stack não autorizou ou não aceitou a atualização. Confira o token e a configuração.",
  configuration_missing: "O token do Better Stack ainda não está disponível na função.",
  mapping_mismatch: "Confira os sete nomes dos serviços e o endereço da página no Better Stack.",
  awaiting_confirmation:
    "Uma publicação ficou sem confirmação. O sistema está consultando o Better Stack para evitar duplicação.",
  invalid_response: "O Better Stack retornou uma resposta não reconhecida.",
};
export function StatusAdmin({ adminId }: { adminId: string }) {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["status-admin", adminId],
    queryFn: () => getStatusAdmin(),
    refetchInterval: 60000,
  });
  const [key, setKey] = useState<Save["key"]>("panel");
  const [status, setStatus] = useState("maintenance");
  const [message, setMessage] = useState("");
  const [hours, setHours] = useState("2");
  const [phase, setPhase] = useState<keyof typeof phases>("investigating");
  const [impact, setImpact] = useState("");
  const [nextUpdate, setNextUpdate] = useState("");
  const [scheduled, setScheduled] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const enhanced = query.data?.settings.some((s) => s.notice_phase !== undefined) ?? false;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function save(automatic = false) {
    setBusy(true);
    setNotice("");
    try {
      const start = scheduled && !automatic ? fromBrasiliaInput(startsAt) : null;
      const end = scheduled && !automatic ? fromBrasiliaInput(endsAt) : null;
      const next = automatic ? null : fromBrasiliaInput(nextUpdate);
      if (
        !automatic &&
        scheduled &&
        (status !== "maintenance" ||
          !start ||
          !end ||
          Date.parse(start) <= Date.now() ||
          Date.parse(end) <= Date.parse(start))
      )
        throw Error(
          "Informe uma manutenção com início futuro e término depois do início, em horário de Brasília.",
        );
      if (!automatic && phase === "resolved" && status !== "operational")
        throw Error("Para encerrar o incidente, selecione Operacional.");
      if (
        next &&
        (Date.parse(next) <= Date.now() || (start && Date.parse(next) < Date.parse(start)))
      )
        throw Error("A próxima atualização precisa ser futura e não pode anteceder a manutenção.");
      const data = saveSchema.parse({
        key,
        status: automatic ? null : status,
        message: automatic ? "" : message,
        expires: automatic
          ? null
          : scheduled
            ? end
            : !hours
              ? null
              : new Date(Date.now() + Number(hours) * 3600000).toISOString(),
        ...(enhanced
          ? {
              details: {
                phase: automatic ? "investigating" : phase,
                impact: automatic ? "" : impact,
                nextUpdate: automatic || phase === "resolved" ? null : next,
                startsAt: start,
              },
            }
          : {}),
      });
      await saveStatus({ data });
      await cache.invalidateQueries({ queryKey: ["status-admin", adminId] });
      setNotice(
        automatic
          ? "Monitoramento automático retomado."
          : "Aviso salvo. A publicação no Better Stack será confirmada pela sincronização.",
      );
    } catch (e) {
      setNotice(
        e && typeof e === "object" && "issues" in e
          ? "Confira os campos. O aviso precisa ter pelo menos 5 caracteres e respeitar os limites indicados."
          : e instanceof Error
            ? e.message
            : "Não foi possível salvar.",
      );
    } finally {
      setBusy(false);
    }
  }
  const setting = query.data?.settings.find((s) => s.key === key);
  const hydrated = useRef<string | null>(null);
  useEffect(() => {
    if (!setting || hydrated.current === key) return;
    hydrated.current = key;
    setStatus(setting.manual ?? "maintenance");
    setMessage(setting.message);
    setPhase(setting.notice_phase ?? "investigating");
    setImpact(setting.impact ?? "");
    setNextUpdate(brasiliaInput(setting.next_update));
    const future = !!setting.starts_at && Date.parse(setting.starts_at) > Date.now();
    setScheduled(future);
    setStartsAt(future ? brasiliaInput(setting.starts_at) : "");
    setEndsAt(future ? brasiliaInput(setting.expires_at) : "");
  }, [key, setting]);
  return (
    <div className="status-admin">
      <section className="admin-welcome">
        <h2>Status dos serviços</h2>
        <p>
          Monitoramento automático e avisos públicos da equipe. Estes controles apenas comunicam o
          status; não alteram operações, preços ou carteiras.
        </p>
        <a
          href={STATUS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 mt-4 text-primary"
        >
          Abrir página pública <ExternalLink size={16} />
        </a>
        <p className="mt-2 text-sm">
          Guarde o endereço público: ele fica no Better Stack, separado da VPS do painel.
        </p>
      </section>
      {query.isError ? (
        <p role="alert">{query.error.message}</p>
      ) : query.isPending ? (
        <p>Consultando monitoramento…</p>
      ) : (
        <>
          <section className="status-admin-diagnostic" aria-label="Integração com Better Stack">
            <h3 className="font-semibold">Página pública no Better Stack</h3>
            {query.data.bridge ? (
              <>
                <p>
                  {bridgeDiagnostics[query.data.bridge.diagnostic] ??
                    "Sincronização sem confirmação."}
                </p>
                <p>
                  Última confirmação de todos os serviços:{" "}
                  {query.data.bridge.lastSuccess
                    ? new Date(query.data.bridge.lastSuccess).toLocaleString("pt-BR", {
                        timeZone: "America/Fortaleza",
                      })
                    : "Aguardando"}
                </p>
                {query.data.bridge.lastSuccess &&
                  Date.now() - Date.parse(query.data.bridge.lastSuccess) > 600000 && (
                    <p role="status">
                      A confirmação da sincronização está desatualizada. Confira os diagnósticos
                      abaixo.
                    </p>
                  )}
                {query.data.bridge.items
                  .filter((i) => i.diagnostic !== "ok")
                  .map((i) => (
                    <p key={i.key}>
                      <strong>
                        {query.data.settings.find((s) => s.key === i.key)?.label ?? i.key}:
                      </strong>{" "}
                      {bridgeDiagnostics[i.diagnostic] ?? "Sem confirmação"}
                    </p>
                  ))}
              </>
            ) : (
              <p>
                A integração com o Better Stack ainda precisa do SQL e da atualização da função
                astros-status.
              </p>
            )}
            <p>
              Os avisos salvos aqui são repassados na próxima verificação, normalmente em até 2
              minutos. Sem confirmação técnica é enviado como instabilidade, com explicação no
              histórico.
            </p>
          </section>
          <form
            className="status-admin-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <h3>Publicar um aviso manual</h3>
            <p>
              O aviso tem prioridade sobre a verificação automática. Uma manutenção global do módulo
              tem prioridade sobre ambos. Cada serviço tem um aviso por vez: salvar substitui o
              aviso ou agendamento anterior.
            </p>
            <label>
              Serviço
              <select
                value={key}
                onChange={(e) => {
                  hydrated.current = null;
                  setKey(e.target.value as Save["key"]);
                  setNotice("");
                }}
              >
                {query.data.settings.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status público
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  if (e.target.value !== "maintenance") setScheduled(false);
                  if (e.target.value === "operational") setPhase("resolved");
                  else if (phase === "resolved") setPhase("investigating");
                }}
              >
                {(["maintenance", "degraded", "unavailable", "operational"] as const).map((s) => (
                  <option value={s} key={s}>
                    {labels[s]}
                  </option>
                ))}
              </select>
            </label>
            <p className="status-field-help">
              Indisponível aparece em vermelho. Instabilidade indica funcionamento parcial. Em
              manutenção usa o indicador próprio do Better Stack e não bloqueia compras no painel.
              Operacional manual também substitui o resultado automático até expirar; use Voltar ao
              automático para retomar as verificações como fonte pública.
            </p>
            {enhanced && (
              <>
                <label>
                  Andamento do incidente
                  <select
                    value={phase}
                    onChange={(e) => {
                      const value = e.target.value as keyof typeof phases;
                      setPhase(value);
                      if (value === "resolved") {
                        setStatus("operational");
                        setScheduled(false);
                        setNextUpdate("");
                      }
                    }}
                  >
                    {Object.entries(phases).map(([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Impacto para o cliente
                  <textarea
                    value={impact}
                    onChange={(e) => setImpact(e.target.value)}
                    maxLength={300}
                    rows={2}
                    placeholder="Explique o que está afetado e o que continua disponível, somente se estiver confirmado."
                  />
                </label>
                <label>
                  Próxima atualização — horário de Brasília (opcional)
                  <input
                    type="datetime-local"
                    value={nextUpdate}
                    disabled={phase === "resolved"}
                    onChange={(e) => setNextUpdate(e.target.value)}
                  />
                </label>
                <p className="status-field-help">
                  É o próximo comunicado da equipe, não uma previsão de solução. Se o prazo passar,
                  ficará indicado que uma atualização é aguardada.
                </p>
              </>
            )}
            <label>
              Mensagem para os clientes
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                placeholder="Estamos realizando uma manutenção. Acompanhe as atualizações por aqui."
                required={status !== "operational"}
                rows={3}
              />
            </label>
            {enhanced && status === "maintenance" && (
              <label className="status-checkbox">
                <input
                  type="checkbox"
                  checked={scheduled}
                  onChange={(e) => setScheduled(e.target.checked)}
                />
                Agendar para uma data futura
              </label>
            )}
            {scheduled && enhanced ? (
              <div className="status-date-grid">
                <label>
                  Início da manutenção — Brasília
                  <input
                    type="datetime-local"
                    required
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </label>
                <label>
                  Término previsto — Brasília
                  <input
                    type="datetime-local"
                    required
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </label>
                <p>
                  O agendamento comunica a manutenção. O status muda durante a janela e retorna ao
                  automático ao terminar; operações não são pausadas por este aviso. Uma falha em
                  andamento tem prioridade sobre a publicação antecipada.
                </p>
              </div>
            ) : (
              <label>
                Voltar ao automático após
                <select value={hours} onChange={(e) => setHours(e.target.value)}>
                  <option value="0.1666666667">10 minutos (teste)</option>
                  <option value="1">1 hora</option>
                  <option value="2">2 horas</option>
                  <option value="4">4 horas</option>
                  <option value="24">24 horas</option>
                  <option value="">Até eu remover o aviso</option>
                </select>
              </label>
            )}
            <div className="flex flex-wrap gap-3">
              <Button disabled={busy} type="submit">
                {busy ? "Salvando…" : "Publicar aviso"}
              </Button>
              <Button
                disabled={busy}
                type="button"
                variant="outline"
                onClick={() => void save(true)}
              >
                Voltar ao automático
              </Button>
            </div>
            {notice && <p role="status">{notice}</p>}
            <div className="status-admin-diagnostic">
              <strong>Diagnóstico privado do serviço selecionado</strong>
              <p>{diagnostics[setting?.diagnostic ?? ""] ?? "Aguardando primeira verificação."}</p>
              <p>
                Aviso salvo:{" "}
                {setting?.manual
                  ? labels[setting.manual] +
                    (setting.starts_at && Date.parse(setting.starts_at) > Date.now()
                      ? " (agendado)"
                      : "") +
                    (setting.expires_at && Date.parse(setting.expires_at) < Date.now()
                      ? " (expirado)"
                      : "")
                  : "Automático"}
                {setting?.expires_at
                  ? ` · até ${new Date(setting.expires_at).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}`
                  : ""}
              </p>
              {setting?.message && <p>{setting.message}</p>}
              <small>
                O monitor verifica automaticamente a cada 2 minutos; resultados com mais de 10
                minutos perdem a confirmação.
              </small>
            </div>
          </form>
          <section className="status-admin-diagnostic" aria-label="Proteção do monitoramento">
            <h3>Alerta se o monitoramento parar</h3>
            <p>
              Cadastre no Better Stack um monitor HTTP externo que espere código 200 neste endereço.
              Ele retorna 503 se as verificações ou a sincronização ficarem sem confirmação por mais
              de 10 minutos. Uma falha nos serviços não derruba este teste se o monitor continuar
              verificando e publicando.
            </p>
            <code className="status-monitor-url">{MONITOR_HEALTH_URL}</code>
            <p>
              O alerta só fica ativo após cadastrar o monitor e configurar os destinatários no
              Better Stack. Não depende da VPS do painel.
            </p>
          </section>
          <div className="status-admin-preview">
            <h3>Prévia local do monitoramento</h3>
            <StatusBoard snapshot={query.data.public} />
          </div>
        </>
      )}
    </div>
  );
}
