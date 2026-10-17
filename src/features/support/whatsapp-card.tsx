import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { getSupportWhatsapp } from "./actions";
import { whatsappSettingsSchema } from "./whatsapp";
export function WhatsappSupportCard() {
  const query = useQuery({
    queryKey: ["support-whatsapp"],
    queryFn: () => getSupportWhatsapp(),
    retry: false,
    refetchInterval: 30000,
  });
  const parsed = whatsappSettingsSchema.safeParse(query.data);
  if (!parsed.success || !parsed.data.enabled) return null;
  return (
    <section className="form-section support-whatsapp">
      <div className="support-heading">
        <span className="support-icon support-whatsapp-icon">
          <MessageCircle size={24} />
        </span>
        <div>
          <span className="support-caption">OUTRO CANAL</span>
          <h2>Atendimento pelo WhatsApp</h2>
        </div>
      </div>
      <p className="support-channel-description">
        Prefere conversar pelo WhatsApp ou não conseguiu abrir o chat? Escolha um contato da nossa
        equipe.
      </p>
      <div className="support-whatsapp-links">
        {parsed.data.links.map((link) => (
          <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={18} />
            <span>{link.label}</span>
            <ArrowUpRight size={17} />
          </a>
        ))}
      </div>
      <div className="support-whatsapp-note">
        <strong>Ao iniciar a conversa</strong>
        <p>Informe que precisa de suporte do Astros Mais e conte o que aconteceu.</p>
      </div>
      <p className="support-external-note">
        Você será direcionado ao WhatsApp para enviar sua mensagem.
      </p>
    </section>
  );
}
