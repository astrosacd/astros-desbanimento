import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "@/features/demo/pages";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/admin")({ head: () => pageHead("Administração demo", "Visão administrativa ilustrativa sem permissões ou contas reais."), component: AdminPage });
