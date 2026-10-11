import { createFileRoute } from "@tanstack/react-router";
import { SupportPage } from "@/features/panel/pages";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/suporte")({ head: () => pageHead("Painel Astros", "Serviços e informações da sua conta."), component: SupportPage });
