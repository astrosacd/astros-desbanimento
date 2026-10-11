import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/features/panel/pages";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/termos")({ head: () => pageHead("Painel Astros", "Serviços e informações da sua conta."), component: TermsPage });
