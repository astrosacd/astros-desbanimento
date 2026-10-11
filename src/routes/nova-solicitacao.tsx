import { createFileRoute } from "@tanstack/react-router";
import { NewRequestPage } from "@/features/demo/forms";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/nova-solicitacao")({ head: () => pageHead("Nova solicitação", "Simule um pedido de acompanhamento sem envio real ou cobrança."), component: NewRequestPage });
