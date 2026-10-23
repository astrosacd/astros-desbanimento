import { getCookie, setResponseHeader } from "@tanstack/react-start/server";
import { requireAdmin, request } from "../admin/auth.server";
import { saveSchema, snapshotSchema, type Save } from "./model";
import { z } from "zod";
async function rpc(name: string, body: unknown) {
  await requireAdmin();
  setResponseHeader("Cache-Control", "private, no-store");
  const token = getCookie("astros_admin_session");
  if (!token) throw Error("Entre novamente.");
  const auth = await request("/auth/v1/user", token);
  const user = auth.ok ? await auth.json() : null;
  if (!user?.id || !user.email_confirmed_at)
    throw Error("Use uma conta administrativa confirmada.");
  const response = await request("/rest/v1/rpc/" + name, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw Error(
      "Não foi possível acessar o status. Confira se o SQL desta função já foi instalado.",
    );
  return response.json();
}
const adminSchema = z.object({
  public: snapshotSchema,
  bridge: z
    .object({
      enabled: z.boolean(),
      lastChecked: z.string().nullable(),
      lastSuccess: z.string().nullable(),
      diagnostic: z.string(),
      items: z.array(
        z.object({ key: z.string(), diagnostic: z.string(), lastSynced: z.string().nullable() }),
      ),
    })
    .nullable()
    .optional(),
  settings: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      automatic: z.string(),
      checked_at: z.string().nullable(),
      diagnostic: z.string().nullable(),
      manual: z.enum(["operational", "degraded", "unavailable", "maintenance"]).nullable(),
      message: z.string(),
      expires_at: z.string().nullable(),
    }),
  ),
});
export async function readStatusAdmin() {
  return adminSchema.parse(await rpc("astros_status_admin", {}));
}
export async function writeStatus(input: Save) {
  const data = saveSchema.parse(input);
  await rpc("astros_status_save", {
    component_key: data.key,
    manual_status: data.status,
    public_message: data.message,
    expires: data.expires,
  });
  return { saved: true };
}
