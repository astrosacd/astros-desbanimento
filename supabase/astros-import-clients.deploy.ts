import {createClient} from 'npm:@supabase/supabase-js@2';
export const excludedEmail='eudezioj@gmail.com';
export type LegacyClient={sourceId:string;name:string;email:string;whatsapp:string;amountCents:number};
export function validateClient(value:unknown):LegacyClient{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Registro inválido.');const r=value as Record<string,unknown>;
 if(Object.keys(r).sort().join(',')!=='amountCents,email,name,sourceId,whatsapp')throw Error('Campos da importação inválidos.');
 if(typeof r.sourceId!=='string'||!/^\d{1,20}$/.test(r.sourceId)||typeof r.name!=='string'||!r.name.trim()||r.name.trim().length>120||typeof r.email!=='string'||r.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)||typeof r.whatsapp!=='string'||!/^\d{7,15}$/.test(r.whatsapp)||!Number.isSafeInteger(r.amountCents)||Number(r.amountCents)<0||Number(r.amountCents)>1000000)throw Error('Confira nome, e-mail, WhatsApp e saldo do registro.');
 return {sourceId:r.sourceId,name:r.name.trim(),email:r.email.trim().toLowerCase(),whatsapp:r.whatsapp,amountCents:Number(r.amountCents)};
}
export function parseMoney(input:string){let value=input.trim().replace(/^R\$\s*/,'').replace(/\s/g,'');if(value.includes(',')){if(value.includes('.'))value=value.replace(/\./g,'');value=value.replace(',','.');}if(!/^\d+(?:\.\d{1,2})?$/.test(value))throw Error('Recarga inválida: use valor não negativo com até duas casas decimais.');const [whole,fraction='']=value.split('.');const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(!Number.isSafeInteger(cents)||cents>1000000)throw Error('Recarga acima do limite de R$ 10.000,00.');return cents;}
function csvRows(input:string){const text=input.replace(/^\uFEFF/,'');const header=text.split(/\r?\n/,1)[0];const delimiter=header.includes(';')?';':',';const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}if(c==='"'){if(cell||closed)throw Error('CSV com aspas inválidas.');quoted=true;}else if(c===delimiter){row.push(cell);cell='';closed=false;}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';closed=false;}else{if(closed&&!/\s/.test(c))throw Error('CSV com conteúdo após aspas.');if(!closed)cell+=c;}}
 if(quoted)throw Error('CSV com aspas sem fechamento.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
export function parseLegacyCsv(text:string){if(text.length>2000000)throw Error('CSV muito grande.');const rows=csvRows(text);if(rows.length<2||rows.length>2001)throw Error('Use um CSV com 1 a 2.000 registros.');const columns=rows.shift()!.map(x=>x.trim());const required=['id','Nome','Email','WhatsApp','Recarga'];for(const name of required)if(columns.filter(x=>x===name).length!==1)throw Error(`Coluna obrigatória ausente ou repetida: ${name}.`);
 const clients:LegacyClient[]=[];const emails=new Set<string>();const ids=new Set<string>();let excluded=0;
 for(const [index,row]of rows.entries()){if(row.length!==columns.length)throw Error(`Linha ${index+2}: quantidade de colunas inválida.`);const at=(name:string)=>row[columns.indexOf(name)].trim();if(at('Email').toLowerCase()===excludedEmail){excluded++;continue;}let client:LegacyClient;try{client=validateClient({sourceId:at('id'),name:at('Nome'),email:at('Email').toLowerCase(),whatsapp:at('WhatsApp').replace(/\D/g,''),amountCents:parseMoney(at('Recarga'))});}catch(e){throw Error(`Linha ${index+2}: ${e instanceof Error?e.message:'Dados inválidos.'}`);}if(emails.has(client.email)||ids.has(client.sourceId))throw Error(`Linha ${index+2}: e-mail ou ID duplicado.`);emails.add(client.email);ids.add(client.sourceId);clients.push(client);}
 return {clients,excluded,totalCents:clients.reduce((sum,row)=>sum+row.amountCents,0)};
}

const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async req=>{
 if(req.method!=='POST')return json({success:false,message:'Método não permitido.'},405);
 try{
  const token=req.headers.get('authorization')?.replace(/^Bearer /i,'')||'';
  const {data:{user},error:authError}=await db.auth.getUser(token);
  if(authError||!user?.id||!user.email_confirmed_at)return json({success:false,message:'Entre novamente na administração.'},401);
  const {data:admin,error:adminError}=await db.from('painel_de_desbanimento').select('tipo_usuario').eq('id',user.id).single();
  if(adminError||admin?.tipo_usuario!=='admin')return json({success:false,message:'Acesso administrativo necessário.'},403);
  if(Number(req.headers.get('content-length')||0)>8192)return json({success:false,message:'Registro muito grande.'},400);
  let row;try{row=validateClient(await req.json());}catch{return json({success:false,message:'Confira os dados do registro.'},400);}
  if(row.email===excludedEmail)return json({success:true,state:'excluded'});
  const params={actor:user.id,legacy_id:row.sourceId,client_email:row.email,client_name:row.name,client_whatsapp:row.whatsapp,credit_cents:row.amountCents};
  const {data:job,error:jobError}=await db.rpc('astros_prepare_legacy_client',params);
  if(jobError||!job?.id)return json({success:false,message:'Não foi possível reservar este registro. Confira o SQL de importação e se os dados foram alterados.'},409);
  if(job.state==='completed'||job.state==='skipped')return json({success:true,state:job.state,repeated:job.state==='completed'});
  let clientId=job.userId;
  if(!clientId){
   // A new unknown random password prevents login using any legacy password.
   // No invitation or recovery message is sent during import.
   const password=crypto.randomUUID()+crypto.randomUUID()+'aA1!';
   const {data:created,error:createError}=await db.auth.admin.createUser({email:row.email,password,email_confirm:true,user_metadata:{nome:row.name,whatsapp:row.whatsapp},app_metadata:{astros_legacy_import:job.id}});
   if(createError||!created.user?.id){
    // On timeout/duplicate, inspect our durable provenance; never reset an existing account.
    const {data:again,error:againError}=await db.rpc('astros_prepare_legacy_client',params);
    if(againError||!again?.id)return json({success:false,message:'Criação não confirmada. Repita a importação com o mesmo arquivo.'},503);
    if(again.state==='completed'||again.state==='skipped')return json({success:true,state:again.state,repeated:again.state==='completed'});
    clientId=again.userId;
    if(!clientId)return json({success:false,message:'Conta ainda não criada. Repita com o mesmo arquivo; se persistir, confira a configuração de cadastro.'},503);
   }else clientId=created.user.id;
  }
  const {data:result,error:finishError}=await db.rpc('astros_finish_legacy_client',{actor:user.id,import_id:job.id,client_id:clientId});
  if(finishError||result?.state!=='completed')return json({success:false,message:'Saldo ainda não confirmado. Repita com o mesmo arquivo para concluir sem duplicar o crédito.'},503);
  return json({success:true,state:'completed',repeated:result.repeated===true});
 }catch{return json({success:false,message:'Importação interrompida. Mantenha o mesmo arquivo e tente novamente.'},503);}
});
