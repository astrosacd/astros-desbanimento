import { createFileRoute } from "@tanstack/react-router";
import { SupportChatPage } from "@/features/support/page";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/suporte")({ head: () => pageHead("Painel Astros", "Serviços e informações da sua conta."), component: SupportChatPage });
