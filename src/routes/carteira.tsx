import { createFileRoute } from "@tanstack/react-router";
import { WalletPage } from "@/features/demo/forms";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/carteira")({ head: () => pageHead("Carteira e recargas", "Simule recargas e acompanhe movimentações de créditos fictícios."), component: WalletPage });
