export type SmsOrder={id:string;service:string;country:string;priceCents:number;state:'dispatching'|'pending'|'received'|'refunded'|'review';phone:string|null;code:string|null;expiresAt:string|null;createdAt:string;email?:string;name?:string;hasProvider?:boolean};
export type SmsQuote={quoteId:string;priceCents:number;expiresAt:string;service:string;country:string};
export type SmsOption={id:number;name:string;iso?:string};
export const money=(cents:number)=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const smsStates={dispatching:'Preparando ativação',pending:'Aguardando SMS',received:'SMS recebido',refunded:'Saldo devolvido',review:'Em conferência'};
