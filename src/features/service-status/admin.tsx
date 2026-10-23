import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { getStatusAdmin, saveStatus } from "./actions";
import { labels, saveSchema, STATUS_URL, type Save } from "./model";
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
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function save(automatic = false) {
    setBusy(true);
    setNotice("");
    try {
      const data = saveSchema.parse({
        key,
        status: automatic ? null : status,
        message: automatic ? "" : message,
        expires:
          automatic || !hours ? null : new Date(Date.now() + Number(hours) * 3600000).toISOString(),
      });
      await saveStatus({ data });
      await cache.invalidateQueries({ queryKey: ["status-admin", adminId] });
      setNotice(
        automatic
          ? "Monitoramento automático retomado."
          : "Aviso salvo. A publicação no Better Stack será confirmada pela sincronização.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  const setting = query.data?.settings.find((s) => s.key === key);
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
              tem prioridade sobre ambos.
            </p>
            <label>
              Serviço
              <select
                value={key}
                onChange={(e) => {
                  const selected = query.data.settings.find((s) => s.key === e.target.value);
                  setKey(e.target.value as Save["key"]);
                  setStatus(selected?.manual ?? "maintenance");
                  setMessage(selected?.message ?? "");
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
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {(["maintenance", "degraded", "unavailable", "operational"] as const).map((s) => (
                  <option value={s} key={s}>
                    {labels[s]}
                  </option>
                ))}
              </select>
            </label>
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
            <label>
              Voltar ao automático após
              <select value={hours} onChange={(e) => setHours(e.target.value)}>
                <option value="1">1 hora</option>
                <option value="2">2 horas</option>
                <option value="4">4 horas</option>
                <option value="24">24 horas</option>
                <option value="">Até eu remover o aviso</option>
              </select>
            </label>
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
                    (setting.expires_at && Date.parse(setting.expires_at) < Date.now()
                      ? " (expirado)"
                      : "")
                  : "Automático"}
                {setting?.expires_at
                  ? ` · até ${new Date(setting.expires_at).toLocaleString("pt-BR")}`
                  : ""}
              </p>
              {setting?.message && <p>{setting.message}</p>}
              <small>
                O monitor verifica automaticamente a cada 2 minutos; resultados com mais de 10
                minutos perdem a confirmação.
              </small>
            </div>
          </form>
          <div className="status-admin-preview">
            <h3>Prévia local do monitoramento</h3>
            <StatusBoard snapshot={query.data.public} />
          </div>
        </>
      )}
    </div>
  );
}
