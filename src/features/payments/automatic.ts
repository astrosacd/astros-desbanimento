import {useEffect,useRef} from 'react';
import {useQuery} from '@tanstack/react-query';
import {checkRecharge} from './actions';
export const paymentPending=(status:string)=>['pending','in_process','authorized','test_pending','test_in_process','test_authorized'].includes(status);
export function useAutomaticPayment(userId:string|undefined,order:{id:string;status:string}|null,paused:boolean,onResult:(id:string,status:string)=>void){
 const callback=useRef(onResult);callback.current=onResult;
 const query=useQuery({queryKey:['automatic-payment',userId,order?.id],queryFn:async()=>{const result=await checkRecharge({data:{orderId:order!.id}});return {id:order!.id,status:result.status};},enabled:!!userId&&!!order&&paymentPending(order.status)&&!paused,retry:false,refetchInterval:q=>q.state.data&&!paymentPending(q.state.data.status)?false:8000,refetchIntervalInBackground:false,refetchOnWindowFocus:true,staleTime:0});
 useEffect(()=>{if(query.data&&query.data.id===order?.id)callback.current(query.data.id,query.data.status);},[query.data,query.dataUpdatedAt,order?.id]);
 return {checking:query.isFetching,error:query.isError};
}
