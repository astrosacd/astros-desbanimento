import { useEffect, useState } from "react";
import { Search, FileSearch, Globe, ListChecks } from "lucide-react";

const activities = [
  { icon: Search, title: "Procurando empresas", detail: "Buscamos contatos que correspondam ao nicho e à região escolhidos." },
  { icon: FileSearch, title: "Lendo informações disponíveis", detail: "A pesquisa reúne os dados públicos disponíveis sobre as empresas." },
  { icon: Globe, title: "Verificando os sites informados", detail: "Quando há um endereço de site, verificamos o que é possível confirmar." },
  { icon: ListChecks, title: "Preparando seus leads", detail: "Os resultados são organizados, respeitando os contatos que você já recebeu." },
];

const cnpjActivities = [
  { icon: Search, title: "Consultando empresas por CNPJ", detail: "A pesquisa considera o CNPJ ou os filtros que você informou." },
  { icon: FileSearch, title: "Lendo dados cadastrais disponíveis", detail: "Reunimos as informações empresariais retornadas na consulta." },
  { icon: ListChecks, title: "Organizando os contatos", detail: "Telefone, e-mail e outros dados são apresentados quando disponíveis, sem inventar informações." },
  { icon: ListChecks, title: "Preparando seus resultados", detail: "Organizamos as empresas para você acompanhar e preparar sua abordagem." },
];

/** Explanatory activity carousel, never a server progress indicator. */
export function SearchActivity({ requestId, source = "maps" }: { requestId: string; source?: "maps" | "cnpj" }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    setActive(0);
    const timer = window.setInterval(() => setActive((value) => (value + 1) % activities.length), 5000);
    return () => window.clearInterval(timer);
  }, [requestId]);
  const items = source === "cnpj" ? cnpjActivities : activities;
  const item = items[active]!;
  const Icon = item.icon;
  return (
    <section className="prospect-activity" aria-label="Atividades da pesquisa">
      <small>Enquanto sua busca é processada</small>
      <div className="prospect-activity-current" aria-live="off">
        <Icon size={22} aria-hidden="true" />
        <div><strong>{item.title}</strong><p>{item.detail}</p></div>
      </div>
      <div className="prospect-activity-dots" aria-hidden="true">
        {items.map((activity, index) => <span key={activity.title} data-active={index === active} />)}
      </div>
      <small>Estas mensagens explicam a pesquisa; não indicam etapas concluídas. O resultado aparece automaticamente ao finalizar.</small>
    </section>
  );
}
