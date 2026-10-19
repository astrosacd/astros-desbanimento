import {useQuery} from "@tanstack/react-query";
import {cnpjConfig} from "../actions";
import {DailyQuotaNotice,type DailyQuota} from "../daily-quota";
export function useCnpjQuota(userId: string) {
  const query=useQuery({queryKey:["cnpj-config",userId],queryFn:()=>cnpjConfig(),retry:false,refetchInterval:60000});
  const quota=query.data?.dailyQuota as DailyQuota|undefined;
  return {query,quota,blocked:quota?.remaining===0};
}
export function CnpjQuotaNotice({userId}:{userId:string}) {
  const {query,quota}=useCnpjQuota(userId);
  return quota ? <DailyQuotaNotice cnpj quota={quota} updatedAt={query.dataUpdatedAt} onRenew={()=>void query.refetch()}/> : null;
}
