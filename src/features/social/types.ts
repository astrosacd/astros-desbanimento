export const networks:Record<string,string>={instagram:'Instagram',facebook:'Facebook',youtube:'YouTube',tiktok:'TikTok',x:'X / Twitter',telegram:'Telegram',twitch:'Twitch',linkedin:'LinkedIn',spotify:'Spotify',threads:'Threads',website:'Sites / Website',snapchat:'Snapchat',whatsapp:'WhatsApp',kick:'Kick',pinterest:'Pinterest'};
export type Network=string;
export type SocialService={averageTime?:string;referencePriceCents?:number;deliveryMetrics?:Record<string,string>;id:number;title:string;network:Network|'';category:string;description:string;minimum:number;maximum:number;refill:boolean;cancel:boolean;providerName?:string;enabled?:boolean;available?:boolean;rateUnits?:number;providerCategory?:string;originalDescription?:string;customerDescription?:string;categoryCode?:string;needsReview?:boolean;serviceType?:string;details?:string};
export type SocialQuote={serviceId?:number;deliveryMetrics?:Record<string,string>;details?:string;description?:string;refill?:boolean;cancel?:boolean;id:string;title:string;network:Network;link:string;quantity:number;priceCents:number;expiresAt:string};
export type SocialOrder={serviceId?:number;description?:string;id:string;title:string;network:Network;link:string;quantity:number;priceCents:number;refundCents:number;state:'dispatching'|'pending'|'processing'|'completed'|'partial'|'refunded'|'review';remains:number|null;startCount:number|null;refill:boolean;cancel:boolean;createdAt:string;updatedAt:string;email?:string;name?:string;diagnostic?:string;hasProvider?:boolean};
export const states={dispatching:'Confirmando pedido',pending:'Na fila',processing:'Em andamento',completed:'Concluído',partial:'Entrega parcial',refunded:'Saldo devolvido',review:'Em conferência'};
export type SocialAction={kind:'cancel'|'refill';state:'pending'|'accepted'|'rejected'|'uncertain'|'resolved';created_at:string};
export const actionStates={pending:'Em confirmação',accepted:'Solicitação recebida pelo fornecedor',rejected:'Solicitação não aceita',uncertain:'Aguardando confirmação do fornecedor',resolved:'Pedido encerrado; confira o resultado acima'};
export const money=(value:number)=>(value/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export const socialCategories={followers:'Seguidores',likes:'Curtidas',views:'Visualizações',comments:'Comentários',shares:'Compartilhamentos',subscribers:'Inscritos',other:'Outros serviços'};

export type SocialPreferences={sort:'default'|'cheapest'|'reliability'|'drop';region:string;minPriceCents:number|null;maxPriceCents:number|null;minQuantity:number|null;maxQuantity:number|null};
export const emptySocialPreferences:SocialPreferences={sort:'default',region:'',minPriceCents:null,maxPriceCents:null,minQuantity:null,maxQuantity:null};
