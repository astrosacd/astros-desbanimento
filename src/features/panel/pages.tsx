import {useState} from 'react';
import {Link} from '@tanstack/react-router';
import {Button} from '@/components/ui/button';
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
export function RequestsPage() {
 const [tab,setTab]=useState<'numbers'|'history'>('numbers');
 return <div className="requests-page"><PageHeading title="Solicitações" subtitle="Acompanhe seus números e consulte os envios realizados pelo painel."/><div className="requests-toolbar"><div className="requests-tabs" role="group" aria-label="Consulta de solicitações"><button type="button" aria-pressed={tab==='numbers'} onClick={()=>setTab('numbers')}>Seus números</button><button type="button" aria-pressed={tab==='history'} onClick={()=>setTab('history')}>Histórico de envios</button></div><Button asChild><Link to="/nova-solicitacao">Enviar número</Link></Button></div><div hidden={tab!=='numbers'}><NumbersList/></div><div hidden={tab!=='history'}><SubmissionHistory/></div></div>;
}
export function NewRequestPage() {
 const { numero } = useSearch({ from: '/nova-solicitacao' });
 if (!numero) return <><PageHeading title="Nova solicitação" subtitle="Desbanimento permanente de número."/><ServicePrice/><EmptyPanel title="Em preparação" description="A contratação estará disponível após a conexão do envio ao serviço."/></>;
 return <><PageHeading title="Solicitar novo desbanimento" subtitle="Uma nova contratação para um novo banimento permanente."/><section className="form-section max-w-2xl space-y-5"><div><label htmlFor="renewal-number" className="block text-sm font-medium mb-2">Número</label><input id="renewal-number" value={numero} readOnly className="w-full rounded-lg border border-border bg-background p-3"/></div><div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-4"><h2 className="font-semibold">Nova taxa necessária</h2><ServicePrice/><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Cada taxa cobre um único desbanimento permanente. Se o número foi banido permanentemente novamente, é necessário contratar e pagar uma nova solicitação.</p></div><p className="text-sm text-muted-foreground">A contratação e o pagamento pelo painel ainda estão em preparação. A taxa atual está indicada acima e será conferida novamente antes da contratação.</p><p className="text-sm font-medium">Nenhuma cobrança foi realizada e nenhum processo foi reiniciado.</p></section></>;
}
export function WalletPage() { return <PendingPage title="Carteira e recargas" description="Saldo, recargas e movimentações estarão disponíveis após a conexão da carteira."/>; }
export function ApiPage() { return <PendingPage title="API" description="As configurações da API estarão disponíveis após a ativação da integração."/>; }
export function SupportPage() { return <PendingPage title="Central de suporte" description="Os canais de atendimento serão disponibilizados nesta área."/>; }
export function TermsPage() {
 const sections = [
  [
    "1. Sobre o Astros Mais",
    "O Astros Mais, da Astros Comunicação Digital®, reúne serviços independentes em uma mesma conta, incluindo solicitações de desbanimento, ativações SMS temporárias e serviços para redes sociais. Estes termos se aplicam aos serviços efetivamente disponíveis no painel. Cada contratação segue o preço, a disponibilidade e as condições apresentados antes da confirmação."
  ],
  [
    "2. Conta, segurança e uso permitido",
    "Mantenha seus dados corretos e proteja sua senha e seus códigos de acesso. Utilize somente números, contas e serviços para os quais tenha autorização. É proibido usar a aplicação para fraude, acesso a contas de terceiros, práticas ilícitas ou violação de direitos. A contratação não dispensa o cumprimento das regras da plataforma de destino. Suspeitas de uso indevido podem ser analisadas e o acesso restringido, preservados os direitos aplicáveis."
  ],
  [
    "3. Carteira compartilhada e recargas",
    "O saldo da carteira é em reais e pode ser utilizado nos serviços habilitados da aplicação. Uma recarga confirmada de R$ 50,00 adiciona R$ 50,00 à carteira; não compra automaticamente um serviço. O crédito depende da confirmação do pagamento, e gerar um Pix ou iniciar um pagamento por cartão não significa aprovação. O mínimo de recarga, quando configurado, é informado antes do pagamento. A carteira representa créditos para contratação de serviços, não uma conta bancária."
  ],
  [
    "4. Preços e confirmação da contratação",
    "Os valores são variáveis e aparecem no painel antes da contratação. Em ativações SMS, o preço depende do serviço, país, disponibilidade e condições comerciais vigentes; o valor final é apresentado em reais. A validade da oferta de preço é diferente do prazo de recebimento do SMS. Ofertas vencidas precisam ser consultadas novamente. Alterações de preço não modificam retroativamente o valor de uma contratação já confirmada."
  ],
  [
    "5. Desbanimento: execução e ausência de garantia",
    "A Astros Comunicação Digital® realiza o encaminhamento e o acompanhamento de solicitações de revisão de banimento permanente diretamente com a Meta. Esse contato não significa que a Astros seja o WhatsApp ou a Meta, nem que controle as decisões dessas plataformas. O pagamento remunera a execução do serviço; não garante desbloqueio, prazo de resposta ou permanência do número desbloqueado. Confira o número e o país antes de enviar. Após o encaminhamento, não há garantia de interrupção ou reversão do processo."
  ],
  [
    "6. Desbanimento: cobrança e reenvios",
    "A contratação de um novo processo de desbanimento exige a taxa vigente informada no painel antes do envio. Se o número sofrer um novo banimento permanente após o encerramento do processo anterior, será necessária uma nova contratação, com nova taxa. O reenvio de uma solicitação cujo processo permanece aberto não gera nova cobrança. O painel verifica a situação da solicitação e informa o valor aplicável antes do envio."
  ],
  [
    "7. Ativações SMS: número temporário",
    "A ativação oferece uso temporário de um número para tentar receber o código SMS do serviço e país escolhidos. Não é venda de uma linha permanente, assinatura mensal ou garantia de propriedade ou uso futuro do número. Não utilize esse número como meio permanente de recuperação de contas ou para serviços que exijam acesso contínuo. Não há garantia de que a plataforma de destino aceite o número ou aprove seu cadastro; a entrega de um código também não garante a criação ou manutenção da conta nessa plataforma."
  ],
  [
    "8. Ativações SMS: prazo, cancelamento e devolução",
    "Confira o serviço, país, preço total e saldo estimado antes de confirmar. Acompanhe o número, o código e o prazo no histórico. O fim do contador não comprova, sozinho, cancelamento ou devolução. O cancelamento depende da etapa da ativação e da confirmação do prestador responsável. Quando uma recusa ou devolução é confirmada e aplicável ao pedido, o valor é restituído uma única vez à carteira. Pedidos em conferência precisam ter o resultado verificado antes de nova compra. Um SMS recebido não dá direito automático a nova ativação gratuita, reutilização ou devolução por recusa da plataforma de destino, sem prejuízo dos direitos previstos em lei."
  ],
  [
    "9. Falhas, cobranças e reembolsos",
    "O painel e os serviços integrados podem sofrer manutenção, indisponibilidade ou atrasos. Em caso de falha de comunicação, consulte o histórico antes de repetir a operação: o pedido pode estar em conferência. Não presuma sucesso, cancelamento ou devolução apenas por uma mensagem de conexão. Devolução à carteira e reembolso ao meio de pagamento são operações diferentes. Cobranças indevidas, pedidos de cancelamento e reembolso são analisados pela Central de suporte conforme a execução do serviço e a legislação aplicável, inclusive o direito de arrependimento quando cabível. Estes termos não afastam direitos legais do consumidor."
  ],
  [
    "10. Dados pessoais e privacidade",
    "Tratamos dados de cadastro e identificação, números enviados, serviços e países selecionados, links públicos e quantidades de pedidos de redes sociais, pedidos, códigos SMS recebidos, movimentações e mensagens de atendimento para operar a aplicação, prestar os serviços e manter segurança e registros necessários. Dados necessários são compartilhados com os prestadores de autenticação, infraestrutura, pagamento, processamento e suporte, incluindo Supabase, Baserow, Mercado Pago, Chatwoot e o fornecedor de ativações SMS, SMSPool, e o fornecedor de serviços de redes sociais, SMMRaja, conforme cada finalidade. Não envie senhas de contas externas nas mensagens de suporte. Solicitações de acesso, correção ou exclusão de dados podem ser encaminhadas à Central de suporte, observadas as obrigações legais de conservação de registros. O uso do painel não autoriza tratamento irrestrito para outras finalidades."
  ],
  [
    "11. Responsabilidades e atendimento",
    "A Astros não controla decisões de plataformas externas, políticas de aceitação de números ou o uso dos serviços pelo cliente. Cada ocorrência será analisada conforme a legislação aplicável, sem exclusão de responsabilidades legais da Astros. Para informar falhas, cobranças ou dúvidas, utilize a Central de suporte e indique o pedido relacionado, sem compartilhar senhas ou códigos de acesso desnecessários. A disponibilidade do canal não significa promessa de resposta humana imediata ou de resolução em prazo fixo."
  ],
  [
    "12. Redes sociais: pedidos e acompanhamento",
    "Confira a rede, a descrição do serviço, o link público, a quantidade e o preço total antes de confirmar. Não forneça senhas. Mantenha o destino acessível durante o processamento. A entrega depende do prestador e das condições apresentadas para o serviço; não representa crescimento orgânico, público interessado, resultado comercial ou garantia de permanência. As plataformas podem remover engajamento artificial ou aplicar restrições conforme suas regras. Prazos de início e velocidade são estimativas, não prazos garantidos. Quedas posteriores podem ocorrer. Reposição somente é oferecida quando confirmada nas condições do serviço; indicações contraditórias não representam garantia e devem ser esclarecidas com o suporte antes da contratação. Cancelamento e reposição são solicitações sujeitas à análise e às condições do serviço, sem garantia de aprovação imediata. A confirmação de recebimento de uma solicitação de cancelamento não significa que o pedido foi cancelado. Devoluções confirmadas de pedidos não executados ou encerrados parcialmente são registradas uma única vez na carteira; em entrega parcial, o valor é proporcional à quantidade não entregue. Uma falha de comunicação, isoladamente, não comprova cancelamento. Direitos previstos em lei permanecem preservados."
  ],
  [
    "13. Prospecção de empresas",
    "A Prospecção permite pesquisar empresas por nicho e localização e acompanhar os contatos na sua conta. O preço por lead e o máximo da busca são apresentados antes da confirmação; somente leads novos efetivamente entregues geram débito proporcional na carteira. Uma empresa pode ser entregue a contas diferentes, sem exclusividade. A identificação da origem é utilizada para evitar nova entrega à mesma conta. Dados de contato e presença digital podem estar incompletos ou mudar. A classificação do site corresponde à evidência observada na data indicada; uma verificação inconclusiva não significa ausência de site. A pesquisa não envia mensagens automaticamente. O usuário é responsável pelo uso adequado dos contatos e pelas suas abordagens, respeitando privacidade e solicitações para interromper contato. Não há garantia de contato válido, resposta, contratação ou resultado comercial."
  ],
  [
    "14. Atualizações destes termos",
    "A versão e a data de atualização permanecem nesta página. Mudanças relevantes serão comunicadas no painel, respeitando os direitos previstos em lei e as condições das contratações já confirmadas. Consulte as condições antes de adicionar saldo ou contratar um serviço e procure o suporte em caso de dúvida."
  ]
];
 return <div className="max-w-3xl mx-auto"><PageHeading title="Termos de uso" subtitle="Condições de uso do Astros Mais: conta, carteira, desbanimento, ativações SMS, redes sociais e prospecção."/><div className="form-section"><p className="text-xs text-muted-foreground mb-6">Versão de 18 de outubro de 2026</p><div className="notice mb-7"><p><strong>Entenda o serviço antes de contratar.</strong> Desbanimento não tem resultado garantido. Ativações SMS utilizam números temporários. Serviços para redes sociais não garantem crescimento orgânico ou permanência. Confira os valores e as condições de cada pedido antes de confirmar.</p></div><div className="space-y-7">{sections.map(([title,body])=><section key={title}><h2 className="font-semibold text-base mb-3">{title}</h2><p className="text-sm leading-7 text-muted-foreground">{body}</p></section>)}</div><div className="notice mt-7"><p>Utilize o Astros Mais somente após ler e compreender estas condições. Em caso de dúvida, procure a Central de suporte antes de adicionar saldo ou confirmar uma contratação.</p></div></div></div>;
}
