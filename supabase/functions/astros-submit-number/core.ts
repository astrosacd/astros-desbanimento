export function retiredSim(value: unknown) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').includes('sim nao aprovisionado'); }
export type Row={[field:string]:unknown;id:number;field_4741?:string;field_4773?:string;field_4784?:string;field_4831?:{value:string}|null};
export const normalize=(v:string,country='BR')=>{const n=String(v||'').replace(/\D/g,'');return country==='BR'?(n.startsWith('55')&&[12,13].includes(n.length)?n.slice(2):n):'+'+n;};
export function classify(rows:Row[],number:string,email:string,price:number,country='BR'){
 const matches=rows.filter(r=>{
  const value=r.field_4741||'';const label=String(r.field_4784||'').trim().toLowerCase();const digits=value.replace(/\D/g,'');
  const international=label.startsWith('internacional')||value.trim().startsWith('+')&&!value.trim().startsWith('+55')||digits.length>11&&!digits.startsWith('55');
  if(country==='BR'&&international||country!=='BR'&&label==='nacional')return false;
  const match=normalize(value,country)===number;
  if(match&&country!=='BR'&&!international)throw Error('Este número antigo precisa de conferência pelo suporte para identificar o país.');
  return match;
 });
 if(matches.some(r=>retiredSim(r.field_4784)&&String(r.field_4773||'').trim().toLowerCase()===email.trim().toLowerCase()))throw Error('Este número não está mais disponível para solicitação nesta conta. Entre em contato com o suporte.');
 const active=matches.filter(r=>!retiredSim(r.field_4784));
 if(active.length>1)throw Error('Este número precisa de conferência pelo suporte antes do envio.');
 const row=active[0];
 if(row&&String(row.field_4773||'').trim().toLowerCase()!==email.trim().toLowerCase())throw Error('Este número não está vinculado à sua conta. Entre em contato com o suporte.');
 const status=row?.field_4831?.value;
 if(row&&!['EXCLUIDO','REEDESBANIMENTO','EM ANÁLISE PELA META','DESBANIMENTO OK','ANÁLISE NEGADA'].includes(status||''))throw Error('O status deste número precisa de conferência pelo suporte.');
 const kind=!row?'new':status==='EXCLUIDO'?'renew':'resend';
 const costCents=kind==='resend'?0:Number(price);
 if(!Number.isSafeInteger(costCents)||costCents<0||costCents>1000000||(kind!=='resend'&&costCents===0))throw Error('A taxa do serviço ainda não foi configurada.');
 return {row,kind,costCents,targetStatus:kind==='resend'?'REEDESBANIMENTO':'EM ANÁLISE PELA META'};
}
export function confirmed(row:Row,number:string,email:string,target:string,observations:string,country='BR'){return Number.isSafeInteger(row?.id)&&row.id>0&&normalize(row.field_4741||'',country)===number&&String(row.field_4773||'').trim().toLowerCase()===email.trim().toLowerCase()&&row.field_4831?.value===target&&String(row.field_4784||'')===observations;}
