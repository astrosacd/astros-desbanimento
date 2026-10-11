import { createFileRoute } from "@tanstack/react-router";
import { NewRequestPage } from "@/features/panel/pages";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/nova-solicitacao")({ head: () => pageHead("Painel Astros", "Serviços e informações da sua conta."), component: NewRequestPage });
