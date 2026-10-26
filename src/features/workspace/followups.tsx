import { useState, useRef, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { followupRead, followupSave, getAgenda } from "./actions";
import { followupSchema, type Followup } from "./model";
import "./style.css";
type Target = { leadId: string; source: "maps" | "cnpj"; name: string; userId: string };
export function LeadFollowup(props: Target) {
  const q = useQuery({
    queryKey: ["lead-followup", props.userId, props.source, props.leadId],
    queryFn: () => followupRead({ data: { leadId: props.leadId, source: props.source } }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (q.isPending)
    return (
      <p role="status" className="workspace-muted">
        Consultando anotações…
      </p>
    );
  if (q.isError)
    return (
      <p role="alert">
        Não foi possível consultar suas anotações.{" "}
        <Button variant="outline" onClick={() => void q.refetch()}>
          Tentar novamente
        </Button>
      </p>
    );
  if (!q.data?.installed)
    return <p className="workspace-muted">Anotações e retornos ainda não estão disponíveis.</p>;
  return (
    <FollowupEditor
      key={props.userId + props.source + props.leadId}
      {...props}
      initial={q.data.data}
    />
  );
}
function FollowupEditor({ initial, ...props }: Target & { initial: Followup }) {
  const cache = useQueryClient();
  const [note, setNote] = useState(initial.note),
    [dueOn, setDue] = useState(initial.dueOn || ""),
    [done, setDone] = useState(initial.done),
    [version, setVersion] = useState(initial.version),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [conflict, setConflict] = useState(false);
  const lock = useRef(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    setMessage("");
    const r = followupSchema.safeParse({
      leadId: props.leadId,
      source: props.source,
      note,
      dueOn: dueOn || null,
      done,
      version,
    });
    if (!r.success) {
      setMessage(r.error.issues[0]?.message || "Confira os campos.");
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const saved = await followupSave({ data: r.data });
      setVersion(saved.version);
      setMessage("Acompanhamento salvo.");
      setConflict(false);
      cache.setQueryData(["lead-followup", props.userId, props.source, props.leadId], {
        installed: true,
        data: saved,
      });
      void cache.invalidateQueries({ queryKey: ["followup-agenda", props.userId] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível salvar.";
      setMessage(msg);
      setConflict(msg.includes("outra aba"));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function reload() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const r = await followupRead({ data: { leadId: props.leadId, source: props.source } });
      if (!r.installed) throw Error("Acompanhamento indisponível.");
      setNote(r.data.note);
      setDue(r.data.dueOn || "");
      setDone(r.data.done);
      setVersion(r.data.version);
      setConflict(false);
      setMessage("Versão atual carregada.");
    } catch {
      setMessage("Não foi possível recarregar.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <section className="workspace-card">
      <h3>Anotações e próximo contato</h3>
      <p className="workspace-muted">
        Registre sua conversa e marque quando pretende retornar. Este lembrete fica no painel.
      </p>
      <form onSubmit={save}>
        <fieldset disabled={busy} className="workspace-grid">
          <label className="workspace-wide">
            Sua anotação
            <textarea
              className="field"
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex.: pediu uma proposta; retornar na sexta-feira."
            />
          </label>
          <label>
            Data de retorno
            <input
              className="field"
              type="date"
              min="2020-01-01"
              max="2100-12-31"
              value={dueOn}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
          <label className="workspace-check">
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
            Retorno concluído
          </label>
        </fieldset>
        <p className="workspace-muted">
          {note.length}/2000 caracteres · Data no horário de Brasília.
        </p>
        <div className="workspace-actions">
          <Button type="submit" disabled={busy || conflict}>
            {busy ? "Salvando…" : "Salvar acompanhamento"}
          </Button>
          {conflict && (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void reload()}>
              Recarregar anotação salva
            </Button>
          )}
        </div>
        {message && <p role="status">{message}</p>}
      </form>
    </section>
  );
}
export function FollowupAgenda({ userId }: { userId: string }) {
  const [period, setPeriod] = useState<"today" | "overdue" | "week">("today");
  const q = useQuery({
    queryKey: ["followup-agenda", userId, period],
    queryFn: () => getAgenda({ data: { period } }),
    retry: false,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
  return (
    <section className="workspace-card">
      <div className="workspace-top">
        <div>
          <h2>Contatos para hoje e próximos retornos</h2>
          <p className="workspace-muted">
            Seus lembretes do Google Maps e CNPJ, no horário de Brasília.
          </p>
        </div>
        <Button variant="outline" disabled={q.isFetching} onClick={() => void q.refetch()}>
          Atualizar retornos
        </Button>
      </div>
      <label className="block mt-4 text-sm">
        Mostrar
        <select
          className="field mt-2"
          value={period}
          onChange={(e) => setPeriod(e.target.value as typeof period)}
        >
          <option value="today">Hoje</option>
          <option value="overdue">Atrasados</option>
          <option value="week">Próximos 7 dias</option>
        </select>
      </label>
      {q.isPending ? (
        <p role="status">Consultando retornos…</p>
      ) : q.isError ? (
        <p role="alert">Não foi possível consultar seus retornos. Tente atualizar.</p>
      ) : !q.data?.installed ? (
        <p>Acompanhamento ainda não disponível.</p>
      ) : (
        <>
          <p className="workspace-muted">
            {q.data.data.total} retornos encontrados
            {q.data.data.total > 100 ? " · Exibindo os 100 primeiros." : ""}.
          </p>
          {q.data.data.rows.length === 0 && (
            <p>Nenhum retorno pendente neste período. Abra um lead em Meus leads para agendar.</p>
          )}
          {q.data.data.rows.map((r) => (
            <details className="workspace-record" key={r.source + r.id}>
              <summary>
                {r.name} · {(r.dueOn || "").split("-").reverse().join("/")}
              </summary>
              <p className="workspace-muted">{r.source === "maps" ? "Google Maps" : "CNPJ"}</p>
              <LeadFollowup userId={userId} leadId={r.id} source={r.source} name={r.name} />
            </details>
          ))}
        </>
      )}
    </section>
  );
}
