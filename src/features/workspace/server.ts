import { getCookie, setResponseHeader } from "@tanstack/react-start/server";
import { request } from "../admin/auth.server";
import {
  leadKeySchema,
  followupSchema,
  statementSchema,
  noteResult,
  agendaResult,
  activityResult,
  statementResult,
} from "./model";
import { z } from "zod";
export async function workspaceRpc(name: string, payload: unknown) {
  setResponseHeader("Cache-Control", "private, no-store");
  const token = getCookie("astros_client_session");
  if (!token) throw Error("Sua sessão expirou. Entre novamente.");
  const auth = await request("/auth/v1/user", token);
  if (!auth.ok) throw Error("Sua sessão expirou. Entre novamente.");
  const user = await auth.json();
  if (!user.id || !user.email_confirmed_at) throw Error("Confirme seu e-mail antes de continuar.");
  const r = await request("/rest/v1/rpc/" + name, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const error = await r.json().catch(() => ({}));
    if (r.status === 404 && error.code === "PGRST202") return { installed: false as const };
    const safe = [
      "Lead não encontrado na sua conta",
      "Esta anotação foi alterada em outra aba. Recarregue antes de salvar",
      "O período tem mais de 5.000 movimentações. Selecione um período menor",
      "Escolha um período de até 366 dias",
    ];
    throw Error(
      safe.includes(error.message)
        ? error.message
        : "Não foi possível concluir. Atualize e tente novamente.",
    );
  }
  return { installed: true as const, data: r.status === 204 ? null : await r.json() };
}
export async function readFollowup(input: unknown) {
  const d = leadKeySchema.parse(input);
  const r = await workspaceRpc("astros_followup_read", {
    source_name: d.source,
    delivery_id: d.leadId,
  });
  return r.installed ? { installed: true as const, data: noteResult.parse(r.data) } : r;
}
export async function saveFollowup(input: unknown) {
  const d = followupSchema.parse(input);
  const r = await workspaceRpc("astros_followup_save", {
    source_name: d.source,
    delivery_id: d.leadId,
    note_text: d.note,
    due_date: d.dueOn,
    completed: d.done,
    expected_version: d.version,
  });
  if (!r.installed) throw Error("O acompanhamento ainda não foi disponibilizado.");
  return noteResult.parse(r.data);
}
export async function agenda(input: unknown) {
  const d = z.enum(["today", "overdue", "week"]).parse(input);
  const r = await workspaceRpc("astros_followup_agenda", { period_name: d });
  return r.installed ? { installed: true as const, data: agendaResult.parse(r.data) } : r;
}
export async function activities() {
  const r = await workspaceRpc("astros_activity_list", {});
  return r.installed ? { installed: true as const, data: activityResult.parse(r.data) } : r;
}
export async function markActivities(input: unknown) {
  const keys = z.array(z.string().max(100)).max(50).parse(input);
  const r = await workspaceRpc("astros_activity_mark", { event_keys: keys });
  if (!r.installed) throw Error("As notificações ainda não foram disponibilizadas.");
  return { success: true };
}
export async function statement(input: unknown) {
  const d = statementSchema.parse(input);
  const r = await workspaceRpc("astros_wallet_statement", { from_day: d.from, until_day: d.until });
  if (!r.installed) throw Error("A exportação do extrato ainda não foi disponibilizada.");
  return statementResult.parse(r.data);
}
