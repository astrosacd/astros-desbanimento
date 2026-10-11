import { createFileRoute } from "@tanstack/react-router";
import { RequestsPage } from "@/features/demo/requests";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/solicitacoes")({ head: () => pageHead("Solicitações", "Histórico fictício com filtros, detalhes e exportação CSV."), component: RequestsPage });
