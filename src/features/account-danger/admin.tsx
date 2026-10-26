import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { deletionAccess, previewDeletion, executeDeletion } from "./actions";
import type { DeletionPreview } from "./model";
import "./style.css";
const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
export function AccountDanger({
  adminId,
  clientId,
  email,
  role,
  onDeleted,
  onBusy,
}: {
  adminId: string;
  clientId: string;
  email: string;
  role?: string | undefined;
  onDeleted: () => void;
  onBusy: (value: boolean) => void;
}) {
  const permission = useQuery({
    queryKey: ["deletion-owner", adminId],
    queryFn: () => deletionAccess(),
    retry: false,
    staleTime: 0,
  });
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [balance, setBalance] = useState(false);
  const [external, setExternal] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function pending(value: boolean) {
    setBusy(value);
    onBusy(value);
  }
  async function inspect() {
    pending(true);
    setError("");
    setPreview(null);
    setTyped("");
    setPassword("");
    setBalance(false);
    setExternal(false);
    setUncertain(false);
    try {
      const p = await previewDeletion({ data: { clientId } });
      if (alive.current) setPreview(p);
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Não foi possível conferir a conta.");
    } finally {
      if (alive.current) pending(false);
    }
  }
  async function remove(e: FormEvent) {
    e.preventDefault();
    if (!preview || busy) return;
    pending(true);
    setError("");
    setUncertain(true);
    const submittedPassword = password;
    setPassword("");
    try {
      await executeDeletion({
        data: {
          clientId,
          previewId: preview.previewId,
          email: typed,
          password: submittedPassword,
          acknowledgeBalance: balance,
          acknowledgeExternal: true,
        },
      });
      if (alive.current) {
        setConfirm(false);
        onDeleted();
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "Resultado não confirmado. Confira novamente com a mesma referência.",
        );
    } finally {
      if (alive.current) pending(false);
    }
  }
  if (role !== "cliente" || clientId === adminId)
    return <p className="notice mt-5">A exclusão protege administradores e sua própria conta.</p>;
  if (permission.isPending) return <p role="status">Verificando permissão…</p>;
  if (permission.isError || !permission.data?.allowed)
    return (
      <p className="notice mt-5">
        A exclusão permanente é restrita ao proprietário autorizado e depende da instalação do SQL.
      </p>
    );
  const ready = !!preview && !preview.blockers.length;
  return (
    <section className="account-danger" aria-label="Zona de perigo">
      <div className="danger-heading">
        <AlertTriangle aria-hidden="true" />
        <div>
          <h4>Excluir conta permanentemente</h4>
          <p>
            Remove o login, saldo e registros próprios no banco do painel. Esta ação não pode ser
            desfeita pelo painel.
          </p>
        </div>
      </div>
      <p>
        Não transfere saldo ou histórico e não gera reembolso. Números no Baserow e registros no
        Mercado Pago, Chatwoot e fornecedores são tratados separadamente. Cópias de segurança
        externas não são apagadas.
      </p>
      <Button variant="outline" disabled={busy} onClick={inspect}>
        {busy ? "Conferindo…" : "Conferir conta antes de excluir"}
      </Button>
      {preview && (
        <div className="danger-preview">
          <strong className="break-all">
            {preview.name} · {preview.email}
          </strong>
          <p>
            Saldo atual: <strong>{money(preview.balanceCents)}</strong>
          </p>
          <p>A conferência vale por 10 minutos. Alterações nos registros exigem uma nova prévia.</p>
          {preview.blockers.length > 0 ? (
            <div role="alert">
              <h5>Resolva estas pendências antes de excluir</h5>
              <ul>
                {preview.blockers.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-success">
              Nenhuma pendência foi encontrada nas verificações do painel.
            </p>
          )}
          <details>
            <summary>
              Registros que serão removidos ({preview.records.reduce((sum, r) => sum + r.count, 0)})
            </summary>
            <ul>
              {preview.records.map((r) => (
                <li key={r.table}>
                  <span>{r.table}</span>
                  <strong>{r.count}</strong>
                </li>
              ))}
            </ul>
          </details>
          {ready && (
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setConfirm(true);
                setError("");
              }}
            >
              <Trash2 size={16} />
              Continuar com a exclusão
            </Button>
          )}
        </div>
      )}
      {error && !confirm && <p role="alert">{error}</p>}
      <AlertDialog
        open={confirm}
        onOpenChange={(open) => {
          if (!busy) {
            setConfirm(open);
            setPassword("");
          }
        }}
      >
        <AlertDialogContent>
          <form onSubmit={remove} className="danger-confirm">
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir esta conta definitivamente?</AlertDialogTitle>
              <AlertDialogDescription>
                O login e os registros próprios de {email} serão apagados. Não há transferência
                automática nem reembolso.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {preview && preview.balanceCents > 0 && (
              <label className="danger-check">
                <input
                  type="checkbox"
                  checked={balance}
                  disabled={busy || uncertain}
                  onChange={(e) => setBalance(e.target.checked)}
                />
                <span>
                  Já resolvi o destino dos {money(preview.balanceCents)}. Entendo que o saldo desta
                  conta será apagado.
                </span>
              </label>
            )}
            <label className="danger-check">
              <input
                type="checkbox"
                checked={external}
                disabled={busy || uncertain}
                onChange={(e) => setExternal(e.target.checked)}
              />
              <span>
                Conferi os vínculos externos, incluindo Baserow. Sei que esta ação apaga somente os
                dados do banco do painel e o login do Supabase.
              </span>
            </label>
            <label>
              Digite exatamente o e-mail da conta
              <input
                className="field"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                disabled={busy || uncertain}
                required
              />
            </label>
            <label>
              Sua senha de proprietário
              <input
                className="field"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                required
                maxLength={256}
              />
            </label>
            {error && <p role="alert">{error}</p>}
            {uncertain && !busy && (
              <p>
                Se a resposta falhou, mantenha esta referência e confirme novamente com sua senha.
                Uma exclusão já concluída não será repetida.
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Fechar</AlertDialogCancel>
              <Button
                variant="destructive"
                type="submit"
                disabled={
                  busy ||
                  typed !== preview?.email ||
                  !password ||
                  !external ||
                  ((preview?.balanceCents ?? 0) > 0 && !balance)
                }
              >
                {busy
                  ? "Excluindo e verificando…"
                  : uncertain
                    ? "Conferir mesma exclusão"
                    : "Excluir permanentemente"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
