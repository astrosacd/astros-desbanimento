import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getStatement } from "./actions";
import { localDay, statementSchema, statementCsv } from "./model";
import "./style.css";
export function StatementExport() {
  const [until, setUntil] = useState(() => localDay()),
    [from, setFrom] = useState(() => localDay().slice(0, 7) + "-01"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function download() {
    if (lock.current) return;
    setMessage("");
    const d = statementSchema.safeParse({ from, until });
    if (!d.success) {
      setMessage(d.error.issues[0]?.message || "Confira o período.");
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const result = await getStatement({ data: d.data });
      if (!alive.current) return;
      if (!result.rows.length) {
        setMessage("Nenhuma movimentação neste período.");
        return;
      }
      const blob = new Blob([statementCsv(result)], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `extrato-astros-${d.data.from}-${d.data.until}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        `${result.rows.length} movimentações exportadas. O extrato não inclui pagamentos ainda sem movimentação de saldo.`,
      );
    } catch (e) {
      if (alive.current) setMessage(e instanceof Error ? e.message : "Não foi possível exportar.");
    } finally {
      if (alive.current) setBusy(false);
      lock.current = false;
    }
  }
  return (
    <section className="workspace-card">
      <h2>Exportar extrato da carteira</h2>
      <p className="workspace-muted">
        Baixe suas movimentações em CSV para abrir no Excel. Período de até 366 dias, com até 5.000
        registros por arquivo. Datas no horário de Brasília.
      </p>
      <div className="workspace-grid">
        <label>
          Data inicial
          <input
            type="date"
            className="field"
            value={from}
            disabled={busy}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Data final
          <input
            type="date"
            className="field"
            value={until}
            disabled={busy}
            onChange={(e) => setUntil(e.target.value)}
          />
        </label>
      </div>
      <div className="workspace-actions">
        <Button disabled={busy} onClick={() => void download()}>
          {busy ? "Preparando extrato…" : "Baixar extrato CSV"}
        </Button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
