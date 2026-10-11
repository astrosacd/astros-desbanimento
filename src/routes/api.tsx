import { createFileRoute } from "@tanstack/react-router";
import { ApiPage } from "@/features/demo/pages";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/api")({ head: () => pageHead("API demonstrativa", "Documentação conceitual sem endpoints reais ou credenciais."), component: ApiPage });
