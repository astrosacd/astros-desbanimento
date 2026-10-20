import { useEffect, useState } from "react";
import { Search, FileSearch, Globe, ListChecks } from "lucide-react";

const activities = [
  { icon: Search, title: "Procurando empresas", detail: "Buscamos contatos que correspondam ao nicho e à região escolhidos." },
  { icon: FileSearch, title: "Lendo informações disponíveis", detail: "A pesquisa reúne os dados públicos disponíveis sobre as empresas." },
  { icon: Globe, title: "Verificando os sites informados", detail: "Quando há um endereço de site, verificamos o que é possível confirmar." },
  { icon: ListChecks, title: "Preparando seus leads", detail: "Os resultados são organizados, respeitando os contatos que você já recebeu." },
];

/** Explanatory activity carousel, never a server progress indicator. */
export function SearchActivity({ requestId }: { requestId: string }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    setActive(0);
    const timer = window.setInterval(() => setActive((value) => (value + 1) % activities.length), 5000);
    return () => window.clearInterval(timer);
  }, [requestId]);
  const item = activities[active]!;
  const Icon = item.icon;
  return (
    <section className="prospect-activity" aria-label="Atividades da pesquisa">
      <small>Enquanto sua busca é processada</small>
      <div className="prospect-activity-current" aria-live="off">
        <Icon size={22} aria-hidden="true" />
        <div><strong>{item.title}</strong><p>{item.detail}</p></div>
      </div>
      <div className="prospect-activity-dots" aria-hidden="true">
        {activities.map((activity, index) => <span key={activity.title} data-active={index === active} />)}
      </div>
      <small>Estas mensagens explicam a pesquisa; não indicam etapas concluídas. O resultado aparece automaticamente ao finalizar.</small>
    </section>
  );
}
