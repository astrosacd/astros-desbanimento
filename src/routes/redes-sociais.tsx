import {createFileRoute} from '@tanstack/react-router';import {SocialPage} from '@/features/social/page';import {pageHead} from '@/features/demo/meta';
export const Route=createFileRoute('/redes-sociais')({head:()=>pageHead('Redes sociais','Escolha serviços e acompanhe seus pedidos na Astros Mais.'),component:SocialPage});
