import { createFileRoute } from "@tanstack/react-router";
import { WalletPage } from "@/features/panel/pages";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/carteira")({ head: () => pageHead("Painel Astros", "Serviços e informações da sua conta."), component: WalletPage });
