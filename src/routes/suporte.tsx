import { createFileRoute } from "@tanstack/react-router";
import { SupportChatPage } from "@/features/support/page";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/suporte")({
 validateSearch: (search: Record<string, unknown>): {smsOrder?:string} => {
  const id=search['smsOrder'];
  return typeof id==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? {smsOrder:id} : {};
 },
 head: () => pageHead("Painel Astros", "Serviços e informações da sua conta."), component: SupportChatPage
});
