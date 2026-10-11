import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Warm visible navigation before the first click. These routes have no server loaders.
    defaultPreload: 'viewport',
    defaultPreloadStaleTime: 60_000,
    defaultPendingMs: 150,
    defaultPendingMinMs: 0,
  });

  return router;
};
