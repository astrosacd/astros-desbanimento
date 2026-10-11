import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/features/demo/pages";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/cadastro")({ head: () => pageHead("Cadastro demonstrativo", "Fluxo visual demonstrativo Astros, sem autenticação real ou armazenamento de senhas."), component: () => <AuthPage mode="cadastro"/> });
