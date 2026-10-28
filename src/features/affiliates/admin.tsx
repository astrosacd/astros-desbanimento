import {AdminPanels} from '../admin/panels';
import { useState, useEffect, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  getAffiliateSettings,
  saveAffiliateSettings,
  saveAffiliateAccount,
  getAdminAffiliation,
  runAffiliates,
} from "./actions";
import { decimalUnits, affiliateRules, percent } from "./validation";
import { AffiliatePanel } from "./client";
import "./style.css";
export function AffiliateAdmin({ adminId }: { adminId: string }) {
  const q = useQuery({
    queryKey: ["affiliate-settings", adminId],
    queryFn: () => getAffiliateSettings(),
    retry: false,
  });
  const [enabled, setEnabled] = useState(false),
    [rate, setRate] = useState(""),
    [minimum, setMinimum] = useState(""),
    [maximum, setMaximum] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (q.data) {
      setEnabled(q.data.enabled);
      setRate(String(q.data.rateBps / 100));
      setMinimum(String(q.data.minimumCents / 100));
      setMaximum(String(q.data.maximumCents / 100));
    }
  }, [q.data]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = affiliateRules.parse({
        enabled,
        rateBps: decimalUnits(rate),
        minimumCents: decimalUnits(minimum),
        maximumCents: decimalUnits(maximum),
      });
      await saveAffiliateSettings({ data });
      await q.refetch();
      setMessage("Regras salvas. Recargas anteriores mantêm as condições já registradas.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function run() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await runAffiliates();
      await q.refetch();
      setMessage(
        `Conferência concluída: ${result.processed} processada(s), ${result.failed} falha(s). A fila pode precisar de mais execuções.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível executar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="affiliate-page">
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      <AdminPanels label="Áreas da afiliação" items={[
        {id:'rules',label:'Regras de comissão',description:'Comissão global e elegibilidade',content:(<section className="form-section">
        <h2>Programa de afiliação</h2>
        <p className="affiliate-muted">
          Comissões de indicação direta, creditadas na carteira. Sem saque. A porcentagem individual
          é definida em Gestão de contas → Afiliação.
        </p>
        {q.isPending ? (
          <p role="status">Consultando regras…</p>
        ) : q.isError ? (
          <p role="alert">{q.error.message}</p>
        ) : (
          <form onSubmit={save}>
            <fieldset disabled={busy} className="affiliate-form">
              <label className="affiliate-toggle">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                Ativar novas indicações e comissões
              </label>
              <label>
                Comissão global (%)
                <input
                  className="field"
                  inputMode="decimal"
                  required
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
                <small>De 0 a 100%. Zero não gera comissão.</small>
              </label>
              <label>
                Recarga mínima elegível (R$)
                <input
                  className="field"
                  inputMode="decimal"
                  required
                  value={minimum}
                  onChange={(e) => setMinimum(e.target.value)}
                />
                <small>
                  Zero inclui qualquer recarga aceita pela plataforma. Não altera o mínimo de
                  pagamento da carteira.
                </small>
              </label>
              <label>
                Recarga máxima elegível (R$)
                <input
                  className="field"
                  inputMode="decimal"
                  required
                  value={maximum}
                  onChange={(e) => setMaximum(e.target.value)}
                />
                <small>
                  Zero significa sem teto adicional. Acima de um máximo definido, a recarga não gera
                  comissão.
                </small>
              </label>
              <Button type="submit">{busy ? "Aguarde…" : "Salvar regras"}</Button>
            </fieldset>
          </form>
        )}
      </section>)},
        {id:'processing',label:'Conferência',description:'Rotina e registros pendentes',content:(<section className="form-section">
        <h2>Conferência automática</h2>
        <p className="affiliate-muted">
          A recarga usa o fluxo atual. A rotina confere o crédito real e processa a comissão
          separadamente, com registro único. Pausar impede novas operações elegíveis e adia créditos
          pendentes; estornos de comissões já concedidas continuam.
        </p>
        <dl className="affiliate-rules">
          <div>
            <dt>Última execução</dt>
            <dd>
              {q.data?.workerAt
                ? new Date(q.data.workerAt).toLocaleString("pt-BR", {
                    timeZone: "America/Fortaleza",
                  })
                : "Ainda não registrada"}
            </dd>
          </div>
          <div>
            <dt>Recargas pendentes de conferência</dt>
            <dd>{q.data?.pendingCount ?? "—"}</dd>
          </div>
          <div>
            <dt>Registros com erro</dt>
            <dd>{q.data?.errorCount ?? "—"}</dd>
          </div>
        </dl>
        <Button variant="outline" disabled={busy || !q.data} onClick={run}>
          Executar conferência agora
        </Button>
        <Button
          className="ml-2"
          variant="outline"
          disabled={busy || q.isFetching}
          onClick={() => q.refetch()}
        >
          Atualizar
        </Button>
      </section>)},
      ]}/>
    </div>
  );
}
export function AffiliateAccountAdmin({ userId, adminId }: { userId: string; adminId: string }) {
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ["affiliate-rate", adminId, userId],
    queryFn: () => getAdminAffiliation({ data: { userId, page: 1 } }),
    retry: false,
  });
  const [custom, setCustom] = useState(false),
    [rate, setRate] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (q.data) {
      setCustom(q.data.customRateBps !== null);
      setRate(String((q.data.customRateBps ?? q.data.globalRateBps) / 100));
    }
  }, [q.data]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await saveAffiliateAccount({
        data: { userId, customRateBps: custom ? decimalUnits(rate) : null },
      });
      await q.refetch();
      await client.invalidateQueries({ queryKey: ["affiliation", "admin", userId] });
      setMessage("Comissão individual atualizada para novas recargas.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="affiliate-page mt-5">
      <section className="form-section">
        <h2>Comissão desta conta</h2>
        {q.isPending ? (
          <p>Consultando…</p>
        ) : q.isError ? (
          <p role="alert">{q.error.message}</p>
        ) : (
          <form onSubmit={save}>
            <fieldset disabled={busy} className="affiliate-form">
              <p>
                Taxa global atual: <strong>{percent(q.data?.globalRateBps || 0)}</strong>
              </p>
              <label className="affiliate-toggle">
                <input
                  type="checkbox"
                  checked={custom}
                  onChange={(e) => setCustom(e.target.checked)}
                />
                Usar porcentagem exclusiva para este afiliado
              </label>
              {custom && (
                <label>
                  Comissão individual (%)
                  <input
                    className="field"
                    inputMode="decimal"
                    required
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                  />
                  <small>
                    0% desativa ganhos desta conta em novas recargas. Desmarcar restaura a taxa
                    global.
                  </small>
                </label>
              )}
              <Button type="submit">Salvar comissão da conta</Button>
            </fieldset>
          </form>
        )}
        {message && <p role="status">{message}</p>}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </section>
      <AffiliatePanel userId={userId} admin />
    </div>
  );
}
