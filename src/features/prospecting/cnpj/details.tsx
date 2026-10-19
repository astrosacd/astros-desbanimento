import {cnpjRejection, cnpjMissingRequest} from "./errors";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cnpjRefresh, cnpjStatus } from "../actions";
import type { Lead } from "../types";
export function displayCnpj(v?: string) {
  const n = (v || "").replace(/\D/g, "");
  return n.length === 14
    ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
    : v || "Não informado";
}
export function displayCnpjDate(v?: string) {
  if (!v) return "Não informado";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return v;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if (!m) return v;
  const [, y, month, d] = m;
  const t = new Date(`${y}-${month}-${d}T12:00:00Z`);
  return Number.isFinite(t.getTime()) && t.toISOString().startsWith(`${y}-${month}-${d}`)
    ? `${d}/${month}/${y}`
    : v;
}
export function displayCnpjMoney(v?: string) {
  if (!v) return "Não informado";
  const normalized = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return v;
  const n = Number(normalized);
  return Number.isFinite(n)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
    : v;
}
const choice = (v?: boolean | null) => (v === true ? "Sim" : v === false ? "Não" : "Não informado");
export function CnpjDetails({
  lead,
  onUpdated,
}: {
  lead: Lead;
  onUpdated?: (snapshot: Lead["snapshot"]) => void;
}) {
  const s = lead.snapshot;
  const fields = [
    ["CNPJ", displayCnpj(s.cnpj)],
    ["Razão social", s.legalName],
    ["Nome fantasia", s.tradeName],
    ["Situação cadastral", s.registrationStatus],
    ["Data da situação", displayCnpjDate(s.registrationDate)],
    ["Motivo da situação", s.registrationReason],
    ["Abertura", displayCnpjDate(s.openedAt)],
    ["Matriz ou filial", s.branch],
    ["Porte", s.size],
    ["Capital social informado", displayCnpjMoney(s.capitalSocial)],
    ["Natureza jurídica", s.legalNature],
    ["Atividade principal", [s.activityCode, s.activity].filter(Boolean).join(" · ")],
    ["Optante pelo MEI", choice(s.mei)],
    ["Opção pelo MEI", displayCnpjDate(s.meiSince)],
    ["Optante pelo Simples", choice(s.simples)],
    ["Opção pelo Simples", displayCnpjDate(s.simplesSince)],
  ];
  return (
    <section className="prospect-cnpj-record" aria-label="Cadastro da empresa">
      <header>
        <h4>Identificação e situação cadastral</h4>
        <p>
          Informações disponíveis na fonte consultada. Campos ausentes não são preenchidos por
          suposição.
        </p>
      </header>
      <dl className="prospect-cnpj-data">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || "Não informado"}</dd>
          </div>
        ))}
      </dl>
      {!!s.secondaryActivities?.length && (
        <div className="prospect-cnpj-activities">
          <h4>Atividades secundárias</h4>
          <ul>
            {s.secondaryActivities.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="prospect-help">
        {s.providerUpdatedAt
          ? `Atualização informada pela fonte: ${displayCnpjDate(s.providerUpdatedAt)}. `
          : ""}
        {s.collectedAt || s.checkedAt ? `Dados recebidos em ${displayCnpjDate(s.collectedAt || s.checkedAt)}.` : "Data de coleta não informada."}
      </p>
      <CnpjRefreshButton key={lead.id} lead={lead} onUpdated={onUpdated} />
    </section>
  );
}
function CnpjRefreshButton({
  lead,
  onUpdated,
}: {
  lead: Lead;
  onUpdated?: ((snapshot: Lead["snapshot"]) => void) | undefined;
}) {
  const [confirm, setConfirm] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false),
    cache = useQueryClient();
  async function run() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setConfirm(false);
    setMessage("");
    const id = pending || crypto.randomUUID();
    setPending(id);
    try {
      const r = await (pending
        ? cnpjStatus({ data: { requestId: id } })
        : cnpjRefresh({ data: { requestId: id, leadId: lead.id } }));
      if (r.state === "processing") {
        setMessage("Atualização em confirmação. Verifique esta mesma tentativa.");
      } else {
        setPending(null);
        if (r.state === "completed" && r.leadSnapshot) onUpdated?.(r.leadSnapshot);
        setMessage(
          r.state === "completed"
            ? "Dados cadastrais atualizados. Nenhum valor foi descontado da carteira."
            : "Não foi possível atualizar agora. Os dados anteriores foram preservados e nenhum valor foi descontado.",
        );
        await Promise.all(
          ["prospect-leads", "cnpj-history", "cnpj-admin-history"].map((k) =>
            cache.invalidateQueries({ queryKey: [k] }),
          ),
        );
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : "";
      const rejection = cnpjRejection(error);
      if (rejection || error === "Consulta CNPJ não encontrada") setPending(null);
      setMessage(rejection || (error === "Consulta CNPJ não encontrada" ? cnpjMissingRequest : "Não foi possível confirmar a atualização. Verifique esta tentativa antes de enviar outra."));
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <div className="prospect-cnpj-refresh">
      <div>
        <strong>Dados cadastrais</strong>
        <p>
          Atualize este contato sem comprar o mesmo lead novamente. A consulta respeita os limites
          disponíveis.
        </p>
      </div>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => (pending ? void run() : setConfirm(true))}
      >
        {busy ? "Atualizando…" : pending ? "Verificar atualização" : "Atualizar dados cadastrais"}
      </Button>
      {message && <p role="status">{message}</p>}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar os dados deste contato?</DialogTitle>
            <DialogDescription>
              A nova consulta atualiza este cadastro, preserva sua etapa no CRM e não desconta saldo
              da carteira. Nenhuma mensagem será enviada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Voltar
            </Button>
            <Button disabled={busy} onClick={() => void run()}>
              Confirmar atualização cadastral
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
