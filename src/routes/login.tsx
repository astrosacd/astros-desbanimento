import { createFileRoute } from '@tanstack/react-router';
import { Entrance } from '@/features/auth/page';
import { pageHead } from '@/features/demo/meta';
export const Route = createFileRoute('/login')({ head: () => pageHead('Entrar', 'Acesso à conta Astros.'), component: () => <Entrance mode="login"/> });
