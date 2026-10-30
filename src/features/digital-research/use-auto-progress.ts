import { useEffect, useRef, useState } from "react";
import type { Research } from "./model";
export type AutoProgress = "waiting" | "checking" | "paused";
const INTERVAL = 15_000;
const MAX_CHECKS = 20;
/** Checks only an existing running request. Never starts/replays a research. */
export function useAutoProgress({
  scope,
  row,
  enabled,
  blocked,
  check,
  receive,
}: {
  scope: string;
  row: Research | null | undefined;
  enabled: boolean;
  blocked: boolean;
  check: (id: string) => Promise<Research>;
  receive: (row: Research) => void | Promise<void>;
}): AutoProgress {
  const callbacks = useRef({ check, receive, blocked });
  callbacks.current = { check, receive, blocked };
  const attempts = useRef(new Map<string, number>());
  const stopped = useRef(new Set<string>());
  const inFlight = useRef(false);
  const [status, setStatus] = useState<{ key: string; value: AutoProgress }>({
    key: "",
    value: "waiting",
  });
  const id = row?.state === "running" ? row.id : null;
  const key = `${scope}:${id ?? ""}`;
  useEffect(() => {
    if (!enabled || !id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = (value: AutoProgress) => {
      if (!cancelled) setStatus({ key, value });
    };
    const schedule = () => {
      clearTimeout(timer);
      if (cancelled || document.visibilityState === "hidden") return;
      if (stopped.current.has(key) || (attempts.current.get(key) ?? 0) >= MAX_CHECKS) {
        update("paused");
        return;
      }
      update("waiting");
      timer = setTimeout(() => void tick(), INTERVAL);
    };
    const tick = async () => {
      if (cancelled || document.visibilityState === "hidden") return;
      if (inFlight.current || callbacks.current.blocked) {
        schedule();
        return;
      }
      inFlight.current = true;
      attempts.current.set(key, (attempts.current.get(key) ?? 0) + 1);
      update("checking");
      let terminal = false;
      try {
        const result = await callbacks.current.check(id);
        if (cancelled) return;
        if (result.id !== id) throw Error("Referência divergente.");
        terminal = result.state !== "running";
        await callbacks.current.receive(result);
      } catch {
        if (!cancelled) {
          stopped.current.add(key);
          update("paused");
        }
      } finally {
        inFlight.current = false;
        if (!cancelled && !terminal && !stopped.current.has(key)) schedule();
      }
    };
    const visibility = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "hidden") schedule();
    };
    document.addEventListener("visibilitychange", visibility);
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [key, id, enabled]);
  return status.key === key ? status.value : "waiting";
}
export const autoProgressText = (status: AutoProgress) =>
  status === "paused"
    ? "A atualização automática foi pausada. Use Conferir andamento para tentar novamente. Sua pesquisa não será reenviada."
    : status === "checking"
      ? "Conferindo o andamento automaticamente…"
      : "Atualização automática a cada 15 segundos enquanto esta tela estiver visível. Você também pode usar Conferir andamento.";
