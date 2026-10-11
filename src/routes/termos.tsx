import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/features/demo/pages";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/termos")({ head: () => pageHead("Termos da demonstração", "Finalidade e limites de uso do painel demonstrativo Astros."), component: TermsPage });
