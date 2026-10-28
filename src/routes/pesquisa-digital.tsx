import { createFileRoute } from "@tanstack/react-router";
import { DigitalResearchPage } from "@/features/digital-research/page";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/pesquisa-digital")({
  head: () =>
    pageHead("Pesquisa digital | Astros Mais", "Pesquise perfis e organize suas descobertas."),
  component: Page,
});
function Page() {
  const { client } = Route.useRouteContext();
  return client ? <DigitalResearchPage key={client.id} userId={client.id} /> : null;
}
