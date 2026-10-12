import { SubmissionHistory } from '../submissions/history';
import { ServicePrice } from '../payments/service-price';
import { useSearch } from '@tanstack/react-router';
import { NumbersList } from '../numbers/list';
import { Inbox } from 'lucide-react';
import { PageHeading } from '../panel/heading';
export function EmptyPanel({ title, description }: { title: string; description: string }) {
 return <section className="table-section"><div className="empty-state"><Inbox/><h3>{title}</h3><p className="mt-3 text-sm text-muted-foreground max-w-lg mx-auto">{description}</p></div></section>;
}
function PendingPage({ title, description }: { title: string; description: string }) { return <><PageHeading title={title} subtitle="Acompanhe os serviços da sua conta."/><EmptyPanel title="Em preparação" description={description}/></>; }
export function RequestsPage() { return <><PageHeading title="Solicitações" subtitle="Acompanhe os números vinculados à sua conta."/><SubmissionHistory/><NumbersList/></>; }
export function NewRequestPage() {
 const { numero } = useSearch({ from: '/nova-solicitacao' });
 if (!numero) return <><PageHeading title="Nova solicitação" subtitle="Desbanimento permanente de número."/><ServicePrice/><EmptyPanel title="Em preparação" description="A contratação estará disponível após a conexão do envio ao serviço."/></>;
 return <><PageHeading title="Solicitar novo desbanimento" subtitle="Uma nova contratação para um novo banimento permanente."/><section className="form-section max-w-2xl space-y-5"><div><label htmlFor="renewal-number" className="block text-sm font-medium mb-2">Número</label><input id="renewal-number" value={numero} readOnly className="w-full rounded-lg border border-border bg-background p-3"/></div><div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-4"><h2 className="font-semibold">Nova taxa necessária</h2><ServicePrice/><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Cada taxa cobre um único desbanimento permanente. Se o número foi banido permanentemente novamente, é necessário contratar e pagar uma nova solicitação.</p></div><p className="text-sm text-muted-foreground">A contratação e o pagamento pelo painel ainda estão em preparação. A taxa atual está indicada acima e será conferida novamente antes da contratação.</p><p className="text-sm font-medium">Nenhuma cobrança foi realizada e nenhum processo foi reiniciado.</p></section></>;
}
export function WalletPage() { return <PendingPage title="Carteira e recargas" description="Saldo, recargas e movimentações estarão disponíveis após a conexão da carteira."/>; }
export function ApiPage() { return <PendingPage title="API" description="As configurações da API estarão disponíveis após a ativação da integração."/>; }
export function SupportPage() { return <PendingPage title="Central de suporte" description="Os canais de atendimento serão disponibilizados nesta área."/>; }
export function TermsPage() { return <div className="content max-w-3xl mx-auto"><PageHeading title="Termos de uso" subtitle="Informações sobre sua conta e os serviços da Astros."/><div className="form-section space-y-5"><h2 className="font-semibold">Conta e acesso</h2><p>Seu cadastro utiliza nome completo, e-mail, WhatsApp e senha. O e-mail identifica sua conta e não pode ser alterado pelo painel. Nome e senha podem ser atualizados em Meu perfil.</p><h2 className="font-semibold">Disponibilidade dos serviços</h2><p>As funcionalidades operacionais estão em preparação. As condições de contratação serão apresentadas antes da disponibilização desses serviços.</p></div></div>; }
