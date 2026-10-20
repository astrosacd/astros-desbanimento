import { useState } from "react";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Lead } from "./types";

export function leadMessage(lead: Lead["snapshot"]) {
  if (lead.source === "cnpj") return `Olá! Gostaria de conversar com a equipe da empresa ${lead.name} sobre uma proposta para o negócio. Com quem posso falar sobre esse assunto?`;
  return `Olá! Encontrei a empresa ${lead.name} no Google e gostaria de conversar sobre uma proposta para o negócio. Com quem posso falar sobre esse assunto?`;
}
export function whatsappLink(phone: string, message: string) {
  const raw = phone.trim();
  // Explicit international prefix is preserved; only unprefixed Brazilian formats use BR.
  const parsed = parsePhoneNumberFromString(raw.startsWith("00") ? "+" + raw.slice(2) : raw, "BR");
  if (!parsed?.isValid()) return null;
  return `https://wa.me/${parsed.number.slice(1)}?text=${encodeURIComponent(message)}`;
}
export function LeadOutreach({ lead }: { lead: Lead }) {
  const [message, setMessage] = useState(() => leadMessage(lead.snapshot));
  const [feedback, setFeedback] = useState("");
  const link = whatsappLink(lead.snapshot.phone || "", message);
  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setFeedback("Mensagem copiada!");
    } catch {
      setFeedback("Não foi possível copiar. Selecione o texto acima e copie manualmente.");
    }
  }
  if (!lead.snapshot.phone?.trim()) return null;
  return (
    <details className="prospect-outreach">
      <summary><MessageCircle size={16} /> Preparar abordagem</summary>
      <div className="prospect-outreach-body">
        <label htmlFor={`approach-${lead.id}`}>Mensagem para {lead.snapshot.name}</label>
        <p>Adapte a sugestão com sua apresentação e o que você oferece.</p>
        <textarea id={`approach-${lead.id}`} className="field" rows={5} maxLength={4000} value={message} onChange={e => { setMessage(e.target.value); setFeedback(""); }} />
        <div className="prospect-outreach-actions">
          {link && message.trim() ? <Button asChild><a href={link} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} /> Conversar no WhatsApp</a></Button> : <p>{lead.snapshot.phone ? "Confira o formato do telefone antes de abrir o WhatsApp." : "Este lead não possui telefone informado."}</p>}
          <Button type="button" variant="outline" disabled={!message.trim()} onClick={() => void copy()}><Copy size={15} /> Copiar mensagem</Button>
        </div>
        <p role="status" aria-live="polite">{feedback}</p>
        <small>A mensagem será preenchida no WhatsApp. Você revisa e confirma o envio por lá. O telefone informado pode não ter WhatsApp. A etapa do contato permanece sob seu controle.</small>
      </div>
    </details>
  );
}
