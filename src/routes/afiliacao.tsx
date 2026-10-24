import { createFileRoute } from "@tanstack/react-router";
import { AffiliationPage } from "@/features/affiliates/client";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/afiliacao")({
  head: () =>
    pageHead(
      "Afiliação | Astros Mais",
      "Indique o Astros Mais e acompanhe suas comissões em saldo.",
    ),
  component: AffiliationPage,
});
