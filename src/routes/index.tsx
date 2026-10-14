import {createFileRoute} from '@tanstack/react-router';
import {ClientHome} from '@/features/panel/home';
import {pageHead} from '@/features/demo/meta';
export const Route=createFileRoute('/')({head:()=>pageHead('Início','Acesse os serviços e o atendimento da Astros Mais.'),component:ClientHome});
