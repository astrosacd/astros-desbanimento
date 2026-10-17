import {useQuery} from '@tanstack/react-query';
import {ArrowUpRight,MessageCircle} from 'lucide-react';
import {getSupportWhatsapp} from './actions';
import {whatsappSettingsSchema} from './whatsapp';
export function WhatsappSupportCard(){
 const query=useQuery({queryKey:['support-whatsapp'],queryFn:()=>getSupportWhatsapp(),retry:false,refetchInterval:30000});
 const parsed=whatsappSettingsSchema.safeParse(query.data);if(!parsed.success||!parsed.data.enabled)return null;
 return <section className="form-section"><div className="flex items-center gap-2"><MessageCircle size={19} className="text-primary shrink-0"/><h2 className="font-semibold">Prefere falar pelo WhatsApp?</h2></div><p className="text-sm text-muted-foreground mt-3 leading-relaxed">Se não conseguir abrir o chat, fale com nossa equipe por um dos contatos abaixo. Informe que precisa de suporte do Astros Mais.</p><div className="mt-4 grid gap-3">{parsed.data.links.map(link=><a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm font-medium text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"><span className="min-w-0 break-words">{link.label}</span><ArrowUpRight size={17} className="shrink-0"/></a>)}</div><p className="text-xs text-muted-foreground mt-3">Abre o WhatsApp. Você confere e envia sua mensagem por lá.</p></section>;
}
