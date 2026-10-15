import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/features/panel/pages";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/termos")({ head: () => pageHead("Termos de uso", "Condições de uso do Astros Mais: conta, carteira compartilhada, pagamentos, desbanimento, ativações SMS e privacidade."), component: TermsPage });
