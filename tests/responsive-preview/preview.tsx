import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { AppShell } from "../../src/features/demo/shell";
import { AdminArea } from "../../src/features/admin/page";
import { ClientHome } from "../../src/features/panel/home";
import { DashboardPage } from "../../src/features/demo/dashboard";
import { NewRequestPage } from "../../src/features/submissions/page";
import { SubmissionHistory } from "../../src/features/submissions/history";
import { WalletPage } from "../../src/features/payments/wallet";
import { SocialPage } from "../../src/features/social/page";
import { SmsPage } from "../../src/features/sms/page";
import { ProspectingPage } from "../../src/features/prospecting/page";
import { DigitalResearchPage, ResearchDetails } from "../../src/features/digital-research/page";
import { ProfilePage } from "../../src/features/auth/profile-page";
import { ApiPage } from "../../src/features/client-api/page";
import { AffiliationPage } from "../../src/features/affiliates/client";
import { Entrance } from "../../src/features/auth/page";
import { SupportChatPage } from "../../src/features/support/page";
import { TermsPage } from "../../src/features/panel/pages";
import { UpdatesPage } from "../../src/features/updates/client";
import { research } from "./data";
import "./style.css";
import "../../src/features/panel/polish.css";
const identity = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Cliente de demonstração com nome completo extenso",
  email: "cliente@example.com",
  confirmed: true,
};
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
const root = createRootRouteWithContext<any>()({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  ),
});
const pages: Record<string, () => React.ReactNode> = {
  "/": () => <ClientHome />,
  "/desbanimento": () => <DashboardPage />,
  "/nova-solicitacao": () => <NewRequestPage />,
  "/solicitacoes": () => <SubmissionHistory />,
  "/carteira": () => <WalletPage />,
  "/redes-sociais": () => <SocialPage />,
  "/ativacoes-sms": () => <SmsPage />,
  "/prospeccao": () => <ProspectingPage />,
  "/pesquisa-digital": () => (
    <>
      <DigitalResearchPage userId={identity.id} />
      {new URLSearchParams(location.search).has("details") && (
        <ResearchDetails
          row={research as any}
          onClose={() => {}}
          onRefresh={() => {}}
          busy={false}
        />
      )}
    </>
  ),
  "/perfil": () => <ProfilePage identity={identity} />,
  "/api": () => <ApiPage />,
  "/afiliacao": () => <AffiliationPage />,
  "/suporte": () => <SupportChatPage />,
  "/termos": () => <TermsPage />,
  "/novidades": () => <UpdatesPage userId={identity.id} />,
};
const routes = Object.entries(pages).map(([path, Content]) =>
  createRoute({
    getParentRoute: () => root,
    path,
    component: () => (
      <AppShell identity={identity as any}>
        <div data-responsive-ready>
          <Content />
        </div>
      </AppShell>
    ),
  }),
);
for (const [path, mode] of [
  ["/login", "login"],
  ["/cadastro", "cadastro"],
  ["/recuperar-senha", "recuperacao"],
] as const)
  routes.push(
    createRoute({
      getParentRoute: () => root,
      path,
      component: () => (
        <div data-responsive-ready>
          <Entrance mode={mode} />
        </div>
      ),
    }) as any,
  );
routes.push(
  createRoute({
    getParentRoute: () => root,
    path: "/admin",
    component: () => (
      <div data-responsive-ready>
        <AdminArea session={{ admin: { ...identity }, authenticated: true } as any} />
      </div>
    ),
  }) as any,
);
const router = createRouter({
  routeTree: root.addChildren(routes),
  context: { queryClient, client: identity },
  defaultPreload: false,
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
