import type {QueryClient} from '@tanstack/react-query';
import type {ClientIdentity} from '../auth/session.server';
const key=['navigation-client-session'] as const;
// Per-router, memory-only UI identity. Server operations still authenticate live.
export async function navigationSession(queryClient:QueryClient,verify:()=>Promise<ClientIdentity|null>){
 const identity=await queryClient.fetchQuery({queryKey:key,queryFn:verify,staleTime:15000,gcTime:60000,retry:false});
 if(!identity)queryClient.removeQueries({queryKey:key});
 return identity;
}
export function clearNavigationSession(queryClient?:QueryClient){queryClient?.removeQueries({queryKey:key});}
