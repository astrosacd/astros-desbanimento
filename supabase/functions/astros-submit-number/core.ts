export type Row={id:number;field_4741?:string;field_4773?:string;field_4784?:string;field_4831?:{value:string}|null};
export const normalize=(v:string,country='BR')=>{const n=String(v||'').replace(/\D/g,'');return country==='BR'?(n.startsWith('55')&&[12,13].includes(n.length)?n.slice(2):n):'+'+n;};
export function classify(rows:Row[],number:string,email:string,price:number,country='BR'){
 const matches=rows.filter(r=>{
  const value=r.field_4741||'';const label=String(r.field_4784||'').trim().toLowerCase();const digits=value.replace(/\D/g,'');
  const international=label==='internacional'||value.trim().startsWith('+')&&!value.trim().startsWith('+55')||digits.length>11&&!digits.startsWith('55');
  if(country==='BR'&&international||country!=='BR'&&label==='nacional')return false;
  const match=normalize(value,country)===number;
  if(match&&country!=='BR'&&!international)throw Error('Este número antigo precisa de conferência pelo suporte para identificar o país.');
  return match;
 });
 if(matches.length>1)throw Error('Este número precisa de conferência pelo suporte antes do envio.');
 const row=matches[0];
 if(row&&String(row.field_4773||'').trim().toLowerCase()!==email.trim().toLowerCase())throw Error('Este número não está vinculado à sua conta. Entre em contato com o suporte.');
 const status=row?.field_4831?.value;
 if(row&&!['EXCLUIDO','REEDESBANIMENTO','EM ANÁLISE PELA META','DESBANIMENTO OK','ANÁLISE NEGADA'].includes(status||''))throw Error('O status deste número precisa de conferência pelo suporte.');
 const kind=!row?'new':status==='EXCLUIDO'?'renew':'resend';
 const costCents=kind==='resend'?0:Number(price);
 if(!Number.isSafeInteger(costCents)||costCents<0||costCents>1000000||(kind!=='resend'&&costCents===0))throw Error('A taxa do serviço ainda não foi configurada.');
 return {row,kind,costCents,targetStatus:kind==='resend'?'REEDESBANIMENTO':'EM ANÁLISE PELA META'};
}
export function confirmed(row:Row,number:string,email:string,target:string,observations:string,country='BR'){return Number.isSafeInteger(row?.id)&&row.id>0&&normalize(row.field_4741||'',country)===number&&String(row.field_4773||'').trim().toLowerCase()===email.trim().toLowerCase()&&row.field_4831?.value===target&&String(row.field_4784||'')===observations;}
