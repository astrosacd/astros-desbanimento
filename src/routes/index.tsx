import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/features/demo/dashboard";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/")({ head: () => pageHead("Visão geral", "Sua central de solicitações e informações da conta Astros."), component: DashboardPage });
