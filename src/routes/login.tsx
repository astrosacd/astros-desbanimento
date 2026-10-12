import { z } from 'zod';
import { createFileRoute } from '@tanstack/react-router';
import { Entrance } from '@/features/auth/page';
import { pageHead } from '@/features/demo/meta';
export const Route = createFileRoute('/login')({ validateSearch: z.object({ senha: z.enum(['atualizada']).optional() }), head: () => pageHead('Entrar', 'Acesso à conta Astros.'), component: LoginPage });

function LoginPage(){const {senha}=Route.useSearch();return <Entrance mode="login" passwordUpdated={senha==='atualizada'}/>;}
