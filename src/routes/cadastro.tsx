import { createFileRoute } from '@tanstack/react-router';
import { Entrance } from '@/features/auth/page';
import { pageHead } from '@/features/demo/meta';
export const Route = createFileRoute('/cadastro')({ head: () => pageHead('Criar conta', 'Acesso à conta Astros.'), component: () => <Entrance mode="cadastro"/> });
