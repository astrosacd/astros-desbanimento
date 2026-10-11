import { Inbox, Clock3 } from 'lucide-react';
import { PageHeading } from '../panel/heading';
export function EmptyPanel({ title, description }: { title: string; description: string }) {
 return <section className="table-section"><div className="empty-state"><Inbox/><h3>{title}</h3><p className="mt-3 text-sm text-muted-foreground max-w-lg mx-auto">{description}</p></div></section>;
}
function PendingPage({ title, description }: { title: string; description: string }) { return <><PageHeading title={title} subtitle="Acompanhe os serviços da sua conta."/><EmptyPanel title="Em preparação" description={description}/></>; }
export function RequestsPage() { return <PendingPage title="Solicitações" description="Seu histórico aparecerá aqui quando o serviço de solicitações estiver conectado."/>; }
export function NewRequestPage() { return <PendingPage title="Nova solicitação" description="O envio de solicitações estará disponível após a configuração do serviço."/>; }
export function WalletPage() { return <PendingPage title="Carteira e recargas" description="Saldo, recargas e movimentações estarão disponíveis após a conexão da carteira."/>; }
export function ApiPage() { return <PendingPage title="API" description="As configurações da API estarão disponíveis após a ativação da integração."/>; }
export function SupportPage() { return <PendingPage title="Central de suporte" description="Os canais de atendimento serão disponibilizados nesta área."/>; }
export function TermsPage() { return <div className="content max-w-3xl mx-auto"><PageHeading title="Termos de uso" subtitle="Informações sobre sua conta e os serviços da Astros."/><div className="form-section space-y-5"><h2 className="font-semibold">Conta e acesso</h2><p>Seu cadastro utiliza nome completo, e-mail, WhatsApp e senha. O e-mail identifica sua conta e não pode ser alterado pelo painel. Nome e senha podem ser atualizados em Meu perfil.</p><h2 className="font-semibold">Disponibilidade dos serviços</h2><p>As funcionalidades operacionais estão em preparação. As condições de contratação serão apresentadas antes da disponibilização desses serviços.</p></div></div>; }
