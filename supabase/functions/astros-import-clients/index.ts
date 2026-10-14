import {createClient} from 'npm:@supabase/supabase-js@2';
import {validateClient,excludedEmail} from './core.ts';
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
   const password=(crypto.randomUUID()+crypto.randomUUID()).replace(/-/g,'')+'aA1!';
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
