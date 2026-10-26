import { beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ request: vi.fn(), cookie: vi.fn(), header: vi.fn() }));
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: api.cookie,
  setResponseHeader: api.header,
}));
vi.mock("../admin/auth.server", () => ({ request: api.request }));
import { readFollowup, saveFollowup, statement, activities, markActivities } from "./server";
const leadId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.resetAllMocks();
  api.cookie.mockReturnValue("owner-token");
  api.request.mockImplementation(async (path: string) =>
    path === "/auth/v1/user"
      ? new Response(JSON.stringify({ id: "owner", email_confirmed_at: "yes" }))
      : new Response(JSON.stringify({ note: "", dueOn: null, done: false, version: 0 })),
  );
});
it("rejects expired and unconfirmed identity before accessing data", async () => {
  api.cookie.mockReturnValue(undefined);
  await expect(activities()).rejects.toThrow("sessão");
  expect(api.request).not.toHaveBeenCalled();
  api.cookie.mockReturnValue("owner-token");
  api.request.mockResolvedValue(
    new Response(JSON.stringify({ id: "owner", email_confirmed_at: null })),
  );
  await expect(activities()).rejects.toThrow("Confirme");
  expect(api.request).toHaveBeenCalledTimes(1);
});
it("passes only validated lead coordinates with the authenticated token", async () => {
  await readFollowup({ leadId, source: "cnpj" });
  expect(api.request).toHaveBeenLastCalledWith(
    "/rest/v1/rpc/astros_followup_read",
    "owner-token",
    expect.objectContaining({ body: JSON.stringify({ source_name: "cnpj", delivery_id: leadId }) }),
  );
  expect(api.header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  await expect(
    saveFollowup({
      leadId,
      source: "maps",
      note: "note",
      dueOn: null,
      done: false,
      version: 0,
      user_id: "other",
    }),
  ).rejects.toThrow();
});
it("degrades missing optional SQL and never leaks private database errors", async () => {
  api.request.mockImplementation(async (path: string) =>
    path === "/auth/v1/user"
      ? new Response(JSON.stringify({ id: "owner", email_confirmed_at: "yes" }))
      : new Response(JSON.stringify({ code: "PGRST202" }), { status: 404 }),
  );
  expect(await activities()).toEqual({ installed: false });
  api.request.mockImplementation(async (path: string) =>
    path === "/auth/v1/user"
      ? new Response(JSON.stringify({ id: "owner", email_confirmed_at: "yes" }))
      : new Response(JSON.stringify({ message: "private internal data" }), { status: 500 }),
  );
  await expect(activities()).rejects.toThrow("Não foi possível concluir");
});
it("handles an empty successful read acknowledgement without attempting JSON parsing", async () => {
  api.request.mockImplementation(async (path: string) =>
    path === "/auth/v1/user"
      ? new Response(JSON.stringify({ id: "owner", email_confirmed_at: "yes" }))
      : new Response(null, { status: 204 }),
  );
  expect(await markActivities(["wallet:" + leadId])).toEqual({ success: true });
});
it("does not request an invalid or reversed export period", async () => {
  await expect(statement({ from: "2026-10-27", until: "2026-10-26" })).rejects.toThrow();
  expect(api.request).not.toHaveBeenCalled();
});
