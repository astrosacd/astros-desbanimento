import {getCookie,setResponseHeader} from '@tanstack/react-start/server';
import {requireAdmin,request} from '../admin/auth.server';
import {listSchema,updateSchema,deleteSchema,type UpdateList} from './model';
async function session(admin:boolean){
 setResponseHeader('Cache-Control','private, no-store');
 if(admin)await requireAdmin();
 const token=getCookie(admin?'astros_admin_session':'astros_client_session');
 if(!token)throw Error('Entre novamente para continuar.');
 if(!admin){const r=await request('/auth/v1/user',token);if(!r.ok)throw Error('Sua sessão expirou.');const u=await r.json();if(!u.id||!u.email_confirmed_at)throw Error('Confirme seu e-mail para continuar.');}
 return token;
}
export async function listUpdates(input:unknown,admin=false):Promise<UpdateList>{
 const token=await session(admin),data=listSchema.parse(input);
 const params=new URLSearchParams({select:'id,title,summary,body,category,status,version,published_at,created_at',order:admin?'created_at.desc,id.desc':'published_at.desc,id.desc',limit:'10',offset:String((data.page-1)*10)});
 if(!admin)params.set('status','eq.published');
 if(data.category!=='all')params.set('category',`eq.${data.category}`);
 // Escape LIKE wildcards; URLSearchParams prevents filter/URL injection.
 if(data.search)params.set('title',`ilike.*${data.search.replace(/[\\%_*]/g,c=>'\\'+c)}*`);
 const r=await request('/rest/v1/astros_updates?'+params,token,{headers:{Prefer:'count=exact'}});
 if(!r.ok)throw Error(admin?'Instale o SQL de Novidades para acessar esta área.':'As novidades estão temporariamente indisponíveis.');
 const total=Number(r.headers.get('content-range')?.split('/')[1]);if(!Number.isSafeInteger(total)||total<0)throw Error('Não foi possível conferir o histórico.');
 return {rows:await r.json(),total,page:data.page};
}
export async function writeUpdate(input:unknown){
 const token=await session(true),data=updateSchema.parse(input);
 const r=await request('/rest/v1/rpc/astros_update_save',token,{method:'POST',body:JSON.stringify({payload:data})});
 if(!r.ok)throw Error('Não foi possível salvar. Se houve outra edição, recarregue a lista e abra a publicação novamente.');
 return await r.json() as {id:string;version:number};
}

export async function removeUpdate(input:unknown){
 const token=await session(true),data=deleteSchema.parse(input);
 const r=await request('/rest/v1/rpc/astros_update_delete',token,{method:'POST',body:JSON.stringify({update_id:data.id,expected_version:data.version})});
 if(!r.ok)throw Error('Não foi possível excluir. Confira o SQL de exclusão de Novidades e recarregue a lista se a publicação foi editada.');
 if(await r.json()!==true)throw Error('A exclusão não foi confirmada.');
 return {success:true};
}
