import { CheckCircle2, CircleX, Clock3, RotateCw, ShieldCheck } from 'lucide-react';
const statuses = [
 { name: 'Desbanimento OK', description: 'O processo foi concluído com resultado de desbanimento.', Icon: CheckCircle2, color: 'text-emerald-400', background: 'bg-emerald-400/10' },
 { name: 'Em análise pela Meta', description: 'A solicitação está sendo analisada pela Meta. A Astros acompanha o andamento.', Icon: Clock3, color: 'text-slate-300', background: 'bg-slate-400/10' },
 { name: 'Análise negada', description: 'A solicitação não foi aprovada nesta etapa. A Astros acompanha o prazo de 7 dias para dar continuidade ao processo.', Icon: CircleX, color: 'text-red-400', background: 'bg-red-400/10' },
 { name: 'Reedesbanimento', description: 'A solicitação foi enviada novamente. A Astros acompanha essa nova etapa do processo.', Icon: RotateCw, color: 'text-blue-400', background: 'bg-blue-400/10' },
];
export function StatusGuide() {
 return <section className="table-section p-4 sm:p-6 mt-7" aria-labelledby="status-guide-title">
  <h2 id="status-guide-title" className="text-lg font-semibold">Entenda os status</h2>
  <p className="mt-1 text-sm text-muted-foreground">Cada status informa em qual etapa está sua solicitação.</p>
  <div className="mt-5 grid gap-3 sm:grid-cols-2">{statuses.map(({ name, description, Icon, color, background }) => <div key={name} className="flex items-start gap-3 rounded-xl border border-border p-4"><span className={`rounded-lg p-2 shrink-0 ${color} ${background}`}><Icon className="size-5" aria-hidden="true"/></span><div><h3 className={`text-sm font-semibold ${color}`}>{name}</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p></div></div>)}</div>
  <div className="mt-5 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"><ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden="true"/><div><p className="text-sm font-semibold">Você não precisa realizar nenhuma ação.</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Os status são apenas informativos. A equipe da Astros acompanha o processo e cuida das próximas etapas, inclusive quando houver análise negada ou reenvio.</p></div></div>
  <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Os status se referem à sua solicitação. A situação atual do número é verificada no aplicativo oficial do WhatsApp.</p>
 </section>;
}
