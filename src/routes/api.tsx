import { createFileRoute } from "@tanstack/react-router";
import { ApiPage } from "@/features/client-api/page";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/api")({ head: () => pageHead("Painel Astros", "Serviços e informações da sua conta."), component: ApiPage });
