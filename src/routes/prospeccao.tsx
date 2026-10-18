import { createFileRoute } from "@tanstack/react-router";
import { ProspectingPage } from "@/features/prospecting/page";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/prospeccao")({
  head: () => pageHead("Prospecção", "Pesquise empresas e organize seus leads na Astros Mais."),
  component: ProspectingPage,
});
