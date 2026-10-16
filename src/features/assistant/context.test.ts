import { it, expect, vi, afterEach } from "vitest";
import { handler, chatwootBase } from "../../../supabase/functions/astros-admin-context/index";
const uid = "00000000-0000-4000-8000-000000000001";
afterEach(() => vi.unstubAllGlobals());
function setup(role = "admin", wrongInbox = false) {
  vi.stubGlobal("Deno", {
    env: {
      get: (key: string) =>
        key === "SUPABASE_URL" ? "https://example.supabase.co" : "SERVER-SECRET",
    },
  });
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts: any = {}) => {
      calls.push(url);
      let data: any;
      if (url.includes("/auth/v1/user")) data = { id: uid, email_confirmed_at: "2026-01-01" };
      else if (url.includes("painel_de_desbanimento")) data = [{ id: uid, tipo_usuario: role }];
      else if (url.includes("astros_assistant_snapshot"))
        data = { generatedAt: "2026-10-16T20:00:00Z" };
      else if (url.includes("bridge_config"))
        data = {
          enabled: true,
          baseUrl: "https://support.example.com",
          websiteToken: "WIDGET-SECRET",
          apiToken: "API-SECRET",
          accountId: 1,
          hmacToken: "HMAC-SECRET",
        };
      else if (url.endsWith("/inboxes"))
        data = { payload: [{ id: 8, website_token: wrongInbox ? "other" : "WIDGET-SECRET" }] };
      else if (url.includes("/conversations?")) {
        expect(opts.method).toBeUndefined();
        data = {
          data: {
            meta: { all_count: 1 },
            payload: [
              {
                id: 1,
                inbox_id: 8,
                status: "open",
                created_at: 1792180800,
                messages: [{ content: "SECRET MESSAGE" }],
                meta: {
                  sender: { email: "client@example.com", name: "Cliente" },
                  assignee: { access_token: "ASSIGNEE-SECRET" },
                },
              },
            ],
          },
        };
      } else throw Error("unexpected " + url);
      return new Response(JSON.stringify(data));
    }),
  );
  return calls;
}
const req = () =>
  new Request("https://example.com", {
    method: "POST",
    headers: { Authorization: "Bearer admin-token" },
    body: JSON.stringify({ from: "2026-10-16", until: "2026-10-16", clientSearch: "" }),
  });
it("denies client role before loading context or Chatwoot secrets", async () => {
  const calls = setup("cliente");
  expect((await handler(req())).status).toBe(403);
  expect(calls.some((x) => x.includes("bridge_config") || x.includes("snapshot"))).toBe(false);
});
it("projects only safe current-inbox support metadata", async () => {
  setup();
  const r = await handler(req());
  expect(r.status).toBe(200);
  const v = await r.json();
  expect(v.chatwoot.openCount).toBe(1);
  expect(v.chatwoot.recent[0].customerEmail).toBe("client@example.com");
  expect(JSON.stringify(v)).not.toMatch(/SECRET|messages|assignee/);
});
it("never treats unknown inbox as all-account counts or zero", async () => {
  const calls = setup("admin", true);
  const v = await (await handler(req())).json();
  expect(v.chatwoot.available).toBe(false);
  expect(v.chatwoot.openCount).toBeUndefined();
  expect(calls.some((x) => x.includes("/conversations?"))).toBe(false);
});
it("rejects private endpoints, credentials and redirects as support targets", () => {
  for (const url of [
    "http://example.com",
    "https://127.0.0.1",
    "https://10.0.0.1",
    "https://x:y@example.com",
    "https://example.com/private",
    "https://host.local",
  ])
    expect(() => chatwootBase(url)).toThrow();
});
