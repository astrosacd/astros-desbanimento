import {useQuery} from '@tanstack/react-query';
import {useRouteContext} from '@tanstack/react-router';
import {getMyModules} from './actions';
import type {ModuleKey} from './model';
export function useModuleAccess(module:ModuleKey){
 const {client}=useRouteContext({from:'__root__'});
 const q=useQuery({queryKey:['my-modules',client?.id],queryFn:()=>getMyModules(),enabled:!!client?.id,retry:false,refetchInterval:15000,staleTime:0});
 const state=q.data?.modules?.find(r=>r.module===module);
 return {blocked:state?.enabled===false,message:state?.message||'',loading:q.isPending,error:q.isError};
}
export function ModuleNotice({module}:{module:ModuleKey}){
 const access=useModuleAccess(module);
 return access.blocked?<div role="status" className="notice my-4"><div className="min-w-0 text-sm leading-relaxed"><p className="font-semibold">{access.message}</p><p className="mt-1">Seu histórico e o acompanhamento de pedidos já iniciados continuam disponíveis.</p></div></div>:null;
}
