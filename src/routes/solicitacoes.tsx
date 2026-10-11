import { createFileRoute } from "@tanstack/react-router";
import { RequestsPage } from "@/features/panel/pages";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/solicitacoes")({ head: () => pageHead("Painel Astros", "Serviços e informações da sua conta."), component: RequestsPage });
