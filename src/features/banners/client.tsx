import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useRouteContext} from '@tanstack/react-router';
import {Info} from 'lucide-react';
import {getOverviewBanner} from './actions';
import {bannerVisible} from './validation';
export function OverviewBanner(){
 const {client}=useRouteContext({from:'__root__'});
 const query=useQuery({queryKey:['overview-banner',client?.id],queryFn:()=>getOverviewBanner(),enabled:!!client,retry:false,refetchInterval:30000,refetchOnWindowFocus:true});
 const [tick,setTick]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setTick(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const banner=query.data?.banner;
 const now=query.data?query.data.serverNow+Math.max(0,tick-query.dataUpdatedAt):tick;
 if(!client||!banner||!bannerVisible(banner,now))return null;
 return <aside className="overview-banner" role="status" aria-label="Aviso da Astros"><Info size={22} aria-hidden="true"/><div><strong>Aviso importante</strong><p>{banner.message}</p></div></aside>;
}
