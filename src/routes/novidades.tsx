import {createFileRoute} from '@tanstack/react-router';
import {UpdatesPage} from '@/features/updates/client';
import {pageHead} from '@/features/demo/meta';
export const Route=createFileRoute('/novidades')({head:()=>pageHead('Novidades | Astros Mais','Acompanhe novidades, melhorias e correções da plataforma.'),component:Page});
function Page(){const {client}=Route.useRouteContext();return client?<UpdatesPage userId={client.id}/>:null;}
