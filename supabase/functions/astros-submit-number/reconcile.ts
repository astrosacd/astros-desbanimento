import {normalize,type Row} from './core.ts';
export type ServiceJob={id:string;user_id:string;number:string;kind:string;amount_cents:number;target_status:string;state:string;protocol_version:number;remote_phase:string;lease_key:string;check_attempts:number;remote_intent:{email:string;country:string;number:string;targetStatus:string;markerField:string}};
export function receiptMatches(row:Row,job:ServiceJob){return normalize(row.field_4741||'',job.remote_intent.country)===job.number&&String(row.field_4773||'').trim().toLowerCase()===job.remote_intent.email.trim().toLowerCase()&&(row as unknown as Record<string,unknown>)[job.remote_intent.markerField]===job.id;}
export function reconciliationDecision(job:ServiceJob,rows:Row[]){
 if(job.protocol_version!==2)throw Error('Envio antigo requer conferência da equipe.');
 if(['prepared','rejected'].includes(job.remote_phase))return 'failed' as const;
 const receipts=rows.filter(r=>(r as unknown as Record<string,unknown>)[job.remote_intent.markerField]===job.id);
 if(receipts.length===1&&receiptMatches(receipts[0]!,job))return 'completed' as const;
 if(receipts.length)return 'review' as const;
 // Absence after an uncertain POST is not proof of failure: never refund blindly.
 return job.check_attempts>=12?'review' as const:'processing' as const;
}
export function jobResponse(job:ServiceJob,state:string){const message=state==='completed'?'Seu número chegou ao Baserow. Envio confirmado.':state==='failed'?(job.amount_cents?'O envio não foi concluído. A taxa foi devolvida automaticamente.':'O envio não foi concluído. Nenhuma taxa foi descontada.'):state==='review'?'Nossa equipe está conferindo este envio. Não envie o mesmo número novamente.':'Envio em processamento. Estamos conferindo automaticamente; acompanhe em Solicitações.';return {success:true,state,number:job.number,kind:job.kind,costCents:Number(job.amount_cents),targetStatus:job.target_status,message};}
