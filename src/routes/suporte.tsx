import { createFileRoute } from "@tanstack/react-router";
import { SupportPage } from "@/features/demo/pages";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/suporte")({ head: () => pageHead("Suporte", "Dúvidas frequentes e formulário de contato demonstrativo sem envio real."), component: SupportPage });
