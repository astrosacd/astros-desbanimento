import {createFileRoute} from '@tanstack/react-router';
import {DashboardPage} from '@/features/demo/dashboard';
import {pageHead} from '@/features/demo/meta';
export const Route=createFileRoute('/desbanimento')({head:()=>pageHead('Desbanimento — Visão geral','Acompanhe seus números e solicitações de desbanimento.'),component:DashboardPage});
