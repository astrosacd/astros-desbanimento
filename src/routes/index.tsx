import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/features/demo/dashboard";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/")({ head: () => pageHead("Visão geral", "Acompanhe solicitações fictícias de revisão no painel demonstrativo Astros."), component: DashboardPage });
