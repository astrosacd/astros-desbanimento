import { z } from 'zod';
import { createFileRoute } from "@tanstack/react-router";
import { NewRequestPage } from "@/features/submissions/page";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/nova-solicitacao")({ validateSearch: z.object({ numero: z.string().max(200).optional() }), head: () => pageHead("Painel Astros", "Serviços e informações da sua conta."), component: NewRequestPage });
