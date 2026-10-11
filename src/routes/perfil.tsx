import { createFileRoute, redirect } from '@tanstack/react-router';
import { ProfilePage } from '@/features/auth/profile-page';
import { getClientSession } from '@/features/auth/actions';
import { pageHead } from '@/features/demo/meta';
export const Route = createFileRoute('/perfil')({ head: () => pageHead('Meu perfil', 'Atualize seu nome e senha com segurança.'), loader: async () => { const identity = await getClientSession(); if (!identity) throw redirect({ to: '/login' }); return identity; }, component: () => <ProfilePage identity={Route.useLoaderData()}/> });
