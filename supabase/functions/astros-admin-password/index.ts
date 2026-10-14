import {createClient} from 'npm:@supabase/supabase-js@2';
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(Deno.env.get('SUPABASE_URL')!,key,{auth:{persistSession:false}});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
async function fingerprint(password:string){const hmac=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',hmac,new TextEncoder().encode(password)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
Deno.serve(async req=>{if(req.method!=='POST')return json({success:false,message:'Método não permitido.'},405);try{
 const token=req.headers.get('authorization')?.replace(/^Bearer /i,'')||'';const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user?.id||!user.email_confirmed_at)return json({success:false,message:'Entre novamente na administração.'},401);
 const {data:admin,error:profileError}=await db.from('painel_de_desbanimento').select('tipo_usuario').eq('id',user.id).single();
 if(profileError||admin?.tipo_usuario!=='admin')return json({success:false,message:'Acesso administrativo necessário.'},403);
 const input=await req.json();
 if(!input||Object.keys(input).sort().join(',')!=='clientId,password,reason,requestId'||!uuid(input.clientId)||!uuid(input.requestId)||input.clientId===user.id||typeof input.password!=='string'||input.password.length<8||new TextEncoder().encode(input.password).length>72||typeof input.reason!=='string'||input.reason.trim().length<3||input.reason.trim().length>300)return json({success:false,message:'Confira o cliente, a senha temporária e o motivo.'},400);
 const {data:job,error:beginError}=await db.rpc('astros_begin_admin_password_reset',{actor:user.id,target:input.clientId,request_id:input.requestId,request_fingerprint:await fingerprint(input.password),description:input.reason.trim()});
 if(beginError||!job)return json({success:false,message:'Não foi possível iniciar. Confira o SQL, selecione um cliente confirmado e preserve os dados da tentativa anterior.'},409);
 if(!job.execute){const {data:result,error:finishError}=await db.rpc('astros_finish_admin_password_reset',{actor:user.id,request_id:input.requestId,rejected:false});if(finishError)return json({success:false,message:'Não foi possível conferir. Mantenha os dados desta tentativa.'},503);return json({success:result.state==='awaiting_change'||result.state==='completed',state:result.state,message:result.state==='processing'?'Alteração em conferência. Aguarde e repita com a mesma senha e referência.':result.state==='failed'?'A tentativa anterior foi recusada. Inicie uma nova tentativa.':result.state==='superseded'?'Esta senha foi substituída por uma redefinição mais recente.':'Senha temporária confirmada.'},result.state==='processing'?202:200);}
 const {data:target,error:targetError}=await db.auth.admin.getUserById(input.clientId);
 if(targetError||!target.user){await db.rpc('astros_finish_admin_password_reset',{actor:user.id,request_id:input.requestId,rejected:true});return json({success:false,state:'failed',message:'Não foi possível localizar a conta.'},400);}
 const {error:updateError}=await db.auth.admin.updateUserById(input.clientId,{password:input.password,app_metadata:{...target.user.app_metadata,astros_password_change_required:true,astros_password_reset_id:input.requestId}});
 const definite=!!updateError&&[400,401,403,404,422].includes(updateError.status||0);
 const {data:result,error:finishError}=await db.rpc('astros_finish_admin_password_reset',{actor:user.id,request_id:input.requestId,rejected:definite});
 if(finishError||!result)return json({success:false,message:'Não foi possível confirmar. Repita com a mesma senha e referência.'},503);
 if(result.state==='awaiting_change'||result.state==='completed')return json({success:true,state:result.state,message:'Senha temporária confirmada.'});
 return json({success:false,state:result.state,message:definite?'A senha foi recusada. Confira os requisitos de senha e inicie outra tentativa.':'Alteração em conferência. Aguarde e repita mantendo os mesmos dados.'},definite?400:202);
}catch{return json({success:false,message:'Não foi possível confirmar. Preserve a senha e a referência desta tentativa.'},503);}});
