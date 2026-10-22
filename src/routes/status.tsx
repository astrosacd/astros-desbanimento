import { createFileRoute } from "@tanstack/react-router";
import { PublicStatus } from "@/features/service-status/public";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/status")({
  head: () =>
    pageHead("Status dos serviços", "Acompanhe a disponibilidade dos serviços da Astros Mais."),
  component: PublicStatus,
});
