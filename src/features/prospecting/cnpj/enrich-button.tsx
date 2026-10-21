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
import { cnpjEnrich, cnpjStatus } from "../actions";
import { money, type Lead } from "../types";
import { useCnpjQuota, CnpjQuotaNotice } from "./quota";
import { cnpjRejection, cnpjMissingRequest } from "./errors";

export function CnpjEnrichButton({
  lead,
  userId,
  onUpdated,
}: {
  lead: Lead;
  userId: string;
  onUpdated?: ((snapshot: Lead["snapshot"]) => void) | undefined;
}) {
  const { query, blocked } = useCnpjQuota(userId),
    cache = useQueryClient();
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [completed, setCompleted] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false),
    config = query.data;
  if (lead.snapshot.enriched || completed)
    return (
      <p role="status" className="prospect-help">
        {message ||
          "Enriquecimento já realizado para este contato. Os dados anteriores foram preservados."}
      </p>
    );
  if (!config?.enabled || !config.enrichEnabled) return null;
  async function run() {
    if (lock.current || (!pending && blocked)) return;
    lock.current = true;
    setBusy(true);
    setConfirm(false);
    setMessage("");
    const id = pending || crypto.randomUUID();
    setPending(id);
    try {
      const r = await (pending
        ? cnpjStatus({ data: { requestId: id } })
        : cnpjEnrich({
            data: { requestId: id, leadId: lead.id, expectedUnitCents: config!.enrichCents },
          }));
      if (r.state === "processing")
        setMessage(
          "Consulta em confirmação. Verifique esta mesma tentativa antes de iniciar outra.",
        );
      else {
        setPending(null);
        if (r.state === "completed") {
          setCompleted(true);
          setMessage(
            `Enriquecimento concluído. Débito: ${money(r.charged_cents)}. Os dados anteriores foram preservados.`,
          );
          if (r.leadSnapshot) onUpdated?.(r.leadSnapshot);
        } else
          setMessage(
            "Não foi possível concluir o enriquecimento. Nenhum valor foi descontado e os dados anteriores foram preservados.",
          );
        void Promise.allSettled(
          [
            "prospect-leads",
            "prospect-board",
            "wallet",
            "prospect-wallet",
            "cnpj-history",
            "cnpj-admin-history",
            "cnpj-config",
          ].map((k) => cache.invalidateQueries({ queryKey: [k] })),
        );
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : "",
        rejection = cnpjRejection(error);
      if (rejection || error === "Consulta CNPJ não encontrada") setPending(null);
      setMessage(
        rejection ||
          (error === "Consulta CNPJ não encontrada"
            ? cnpjMissingRequest
            : "Não foi possível confirmar a consulta. Verifique esta tentativa antes de enviar outra."),
      );
    } finally {
      lock.current = false;
      setBusy(false);
      void query.refetch();
    }
  }
  return (
    <div className="prospect-cnpj-enrich">
      <div>
        <strong>Enriquecer dados</strong>
        <p>
          Consulte informações cadastrais complementares por {money(config.enrichCents)}. Os dados
          atuais são preservados; não há garantia de novos contatos.
        </p>
      </div>
      <CnpjQuotaNotice userId={userId} />
      <Button
        variant="outline"
        disabled={busy || (!pending && blocked)}
        onClick={() => (pending ? void run() : setConfirm(true))}
      >
        {busy ? "Consultando…" : pending ? "Verificar enriquecimento" : "Enriquecer dados"}
      </Button>
      {message && <p role="status">{message}</p>}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enriquecer os dados desta empresa?</DialogTitle>
            <DialogDescription>
              A consulta custa {money(config.enrichCents)} da carteira quando recebida e salva,
              mesmo se não trouxer informações novas. Se houver falha ou limite atingido, não haverá
              débito. Nenhuma mensagem será enviada.
            </DialogDescription>
          </DialogHeader>
          <p className="prospect-help">
            A consulta complementar respeita o limite de 3 consultas por minuto da ReceitaWS para a
            aplicação.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Voltar
            </Button>
            <Button disabled={busy || blocked} onClick={() => void run()}>
              Confirmar enriquecimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
