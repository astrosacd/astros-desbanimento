import { createFileRoute } from '@tanstack/react-router';
import { getAdminSession } from '@/features/admin/auth';
import { AdminArea } from '@/features/admin/page';
import { pageHead } from '@/features/demo/meta';
export const Route = createFileRoute('/admin')({
  head: () => ({ ...pageHead('Área administrativa', 'Acesso restrito à administração Astros.'), meta: [...pageHead('Área administrativa', 'Acesso restrito à administração Astros.').meta, { name: 'robots', content: 'noindex, nofollow' }] }),
  loader: () => getAdminSession(), staleTime: 0, preload: false,
  component: AdminRoute,
});
function AdminRoute() { return <AdminArea session={Route.useLoaderData()}/>; }
