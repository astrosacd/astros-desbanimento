import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/features/demo/forms";
import { pageHead } from "@/features/demo/meta";
export const Route = createFileRoute("/perfil")({ head: () => pageHead("Meu perfil", "Edite informações demonstrativas somente neste navegador."), component: ProfilePage });
