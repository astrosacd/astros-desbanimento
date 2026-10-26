import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getActivities, markActivities } from "./actions";
import "./style.css";
function useActivities(userId: string) {
  return useQuery({
    queryKey: ["personal-activities", userId],
    queryFn: () => getActivities(),
    enabled: !!userId,
    retry: false,
    staleTime: 30000,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
}
export function ActivityCount({ userId }: { userId: string }) {
  const q = useActivities(userId);
  const count = q.data?.installed ? q.data.data.rows.filter((r) => !r.read).length : 0;
  return count ? (
    <span className="workspace-count" aria-label={`${count} atividades recentes não lidas`}>
      {count}
    </span>
  ) : null;
}
export function ActivityFeed({ userId, onNavigate }: { userId: string; onNavigate?: () => void }) {
  const q = useActivities(userId),
    cache = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function mark(keys: string[]) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await markActivities({ data: { keys } });
      await cache.invalidateQueries({ queryKey: ["personal-activities", userId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível marcar como lida.");
    } finally {
      setBusy(false);
    }
  }
  if (q.isPending) return <p role="status">Consultando atividades…</p>;
  if (q.isError)
    return (
      <div>
        <p role="alert">Não foi possível consultar suas atividades.</p>
        <Button variant="outline" onClick={() => void q.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  if (!q.data?.installed)
    return (
      <p>
        As atividades pessoais ainda não foram disponibilizadas. Os comunicados continuam
        disponíveis na outra aba.
      </p>
    );
  const rows = q.data.data.rows;
  const unread = rows.filter((r) => !r.read);
  return (
    <div>
      <div className="workspace-top">
        <p className="workspace-muted">
          Até 50 atividades dos últimos 30 dias. Consulte o histórico de cada módulo para os
          detalhes.
        </p>
        <Button
          variant="outline"
          disabled={busy || !unread.length}
          onClick={() => void mark(unread.map((r) => r.key))}
        >
          Marcar exibidas como lidas
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!rows.length && <p>Nenhuma atividade recente para mostrar.</p>}
      {rows.map((r) => (
        <article className="workspace-record" data-unread={!r.read} key={r.key}>
          <h3 className="font-semibold">{r.title}</h3>
          <time className="workspace-muted" dateTime={r.date}>
            {new Date(r.date).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}
          </time>
          <div className="workspace-actions">
            <Button asChild variant="outline">
              <Link to={r.target} onClick={onNavigate}>
                Ver histórico
              </Link>
            </Button>
            {!r.read && (
              <Button variant="ghost" disabled={busy} onClick={() => void mark([r.key])}>
                Marcar como lida
              </Button>
            )}
            {r.read && <span className="workspace-muted">Lida</span>}
          </div>
        </article>
      ))}
    </div>
  );
}
