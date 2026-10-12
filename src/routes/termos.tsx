import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/features/panel/pages";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/termos")({ head: () => pageHead("Termos de uso", "Condições, taxas, solicitações e privacidade do serviço de desbanimento da Astros."), component: TermsPage });
