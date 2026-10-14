import {createFileRoute} from '@tanstack/react-router';
import {SmsPage} from '@/features/sms/page';
import {pageHead} from '@/features/demo/meta';
export const Route=createFileRoute('/ativacoes-sms')({head:()=>pageHead('Ativações SMS','Escolha um serviço e país para receber seu código por SMS.'),component:SmsPage});
