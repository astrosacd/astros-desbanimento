import { describe, it, expect, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  mapBridgeResources,
  bridgeTarget,
  syncBetterStack,
} from "../../../supabase/functions/astros-status/betterstack";
vi.stubGlobal("crypto", webcrypto);
const names = {
  panel: "Painel e acesso",
  auth: "Autenticação",
  desbanimento: "Desbanimento",
  sms: "Ativações SMS",
  social: "Redes sociais",
  prospect_maps: "Prospecção · Google Maps",
  prospect_cnpj: "Prospecção · CNPJ",
};
function fixture() {
  const keys = Object.keys(names),
    items: any[] = keys.map((component) => ({
      component,
      resource_id: null,
      report_id: null,
      report_type: null,
      title: null,
      pending: false,
      fingerprint: null,
    }));
  const components: any[] = keys.map((key) => ({
    key,
    label: names[key as keyof typeof names],
    status: "operational",
    source: "automatic",
    message: "",
    checkedAt: new Date().toISOString(),
  }));
  const resources = keys.map((k, i) => ({
    id: String(100 + i),
    attributes: {
      public_name: names[k as keyof typeof names],
      resource_type: "ManuallyTrackedItem",
    },
  }));
  const reports: any[] = [],
    calls: { path: string; method: string; body: any }[] = [];
  let result = "",
    nextId = 200,
    lostCreate = false,
    rejectedCreate = false,
    lostUpdate = false,
    lostDelete = false;
  const db = vi.fn(async (path: string, body?: any) => {
    if (path.endsWith("_claim"))
      return {
        lease: "lease",
        pageId: "268731",
        items: structuredClone(items),
        snapshot: { components: structuredClone(components) },
        expiries: {},
      };
    if (path.endsWith("_finish")) {
      result = body.result;
      return null;
    }
    if (path.endsWith("_checkpoint")) {
      const { synced, ...patch } = body.patch;
      Object.assign(
        items.find((i) => i.component === body.component_key),
        patch,
      );
      return null;
    }
    throw Error("unexpected DB endpoint");
  });
  const fetcher = vi.fn(async (input: any, init: any) => {
    const u = new URL(String(input));
    expect(u.origin).toBe("https://incidents.betterstack.com");
    expect(init.redirect).toBe("error");
    expect(init.headers.Authorization).toBe("Bearer private-betterstack");
    const path = u.pathname.replace("/api/v2/status-pages/268731", ""),
      method = init.method,
      body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ path, method, body });
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
    if (path === "" && method === "GET")
      return json({ data: { id: "268731", attributes: { subdomain: "astros-mais" } } });
    if (path === "/resources") return json({ data: resources, links: { next: null } });
    if (path === "/status-reports" && method === "GET")
      return json({ data: reports.map((r) => r.data), links: { next: null } });
    if (path === "/status-reports" && method === "POST") {
      if (rejectedCreate) return json({}, 422);
      const id = String(nextId++),
        r = {
          data: {
            id,
            attributes: {
              ...body,
              status_page_id: 268731,
              aggregate_state: body.affected_resources[0].status,
            },
          },
          included: [
            {
              id: "1",
              type: "status_update",
              attributes: { message: body.message, published_at: new Date().toISOString() },
            },
          ],
        };
      reports.push(r);
      if (lostCreate) {
        lostCreate = false;
        throw Error("response lost with private credentials");
      }
      return json(r, 201);
    }
    const id = path.split("/")[2],
      r = reports.find((r) => r.data.id === id);
    if (!r) return json({}, 404);
    if (method === "DELETE") {
      reports.splice(reports.indexOf(r), 1);
      if (lostDelete) {
        lostDelete = false;
        throw Error("lost cancellation response");
      }
      return new Response(null, { status: 204 });
    }
    if (path.endsWith("/status-updates")) {
      if (body.affected_resources) {
        r.data.attributes.affected_resources = body.affected_resources;
        r.data.attributes.aggregate_state = body.affected_resources[0].status;
      }
      r.included = [
        {
          id: "2",
          type: "status_update",
          attributes: { message: body.message, published_at: new Date().toISOString() },
        },
      ];
      if (lostUpdate) {
        lostUpdate = false;
        throw Error("lost response");
      }
      return json(
        {
          data: {
            id: "2",
            type: "status_update",
            attributes: { message: body.message, status_report_id: id },
          },
        },
        201,
      );
    }
    if (method === "PATCH") Object.assign(r.data.attributes, body);
    return json(r);
  });
  const run = () =>
    syncBetterStack({
      apiKey: "private-betterstack",
      db,
      fetcher,
      readJson: (r) => (r.status === 204 ? Promise.resolve(null) : r.json()),
    });
  return {
    items,
    components,
    resources,
    reports,
    calls,
    db,
    fetcher,
    run,
    result: () => result,
    loseCreate: () => {
      lostCreate = true;
    },
    rejectCreate: () => {
      rejectedCreate = true;
    },
    loseDelete: () => {
      lostDelete = true;
    },
    loseUpdate: () => {
      lostUpdate = true;
    },
  };
}
describe("Better Stack status-only bridge", () => {
  it("publishes a manual operational message once, without inventing an outage", async () => {
    const f = fixture();
    f.components[3].source = "manual";
    f.components[3].message = "Serviço disponível. Atualização concluída.";
    await f.run();
    await f.run();
    await f.run();
    const posts = f.calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].body.affected_resources[0].status).toBe("resolved");
    expect(posts[0].body.notify_subscribers).toBe(false);
  });
  it("does not create fake incidents for verified healthy services", async () => {
    const f = fixture();
    expect(await f.run()).toEqual({ synced: true });
    expect(f.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
    expect(f.items.every((i) => i.diagnostic === "ok" && i.fingerprint)).toBe(true);
  });
  it("publishes only affected service status and never notifies subscribers", async () => {
    const f = fixture();
    f.components[3].status = "unavailable";
    await f.run();
    const posts = f.calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({
      notify_subscribers: false,
      report_type: "manual",
      affected_resources: [{ status_page_resource_id: "103", status: "downtime" }],
    });
    expect(JSON.stringify(posts)).not.toContain("private-betterstack");
  });
  it("repeated identical checks do not duplicate reports or status updates", async () => {
    const f = fixture();
    f.components[3].status = "degraded";
    await f.run();
    await f.run();
    expect(f.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });
  it("publishes recovery on its own report without changing another component", async () => {
    const f = fixture();
    f.components[3].status = "unavailable";
    await f.run();
    f.components[3].status = "operational";
    await f.run();
    const update = f.calls.find((c) => c.path.endsWith("/status-updates"));
    expect(update?.body).toMatchObject({
      notify_subscribers: false,
      affected_resources: [{ status_page_resource_id: "103", status: "resolved" }],
    });
    expect(f.items[3].report_id).toBeNull();
    expect(f.items[4].report_id).toBeNull();
  });
  it("maps missing confirmation to degraded with explicit text, never to operational", async () => {
    const f = fixture();
    f.components[3].status = "unknown";
    await f.run();
    const post = f.calls.find((c) => c.method === "POST");
    expect(post?.body.affected_resources[0].status).toBe("degraded");
    expect(post?.body.message).toContain("Não foi possível confirmar");
  });
  it("drops stale automatic green before publication", async () => {
    const f = fixture();
    f.components[0].checkedAt = new Date(Date.now() - 660000).toISOString();
    await f.run();
    expect(f.calls.find((c) => c.method === "POST")?.body.affected_resources).toEqual([
      { status_page_resource_id: "100", status: "degraded" },
    ]);
  });
  it("preserves global/manual maintenance and closes it on recovery", async () => {
    const f = fixture();
    f.components[3] = {
      ...f.components[3],
      status: "maintenance",
      source: "module",
      message: "Manutenção em andamento",
    };
    await f.run();
    const created = f.calls.find((c) => c.method === "POST");
    expect(created?.body).toMatchObject({
      report_type: "maintenance",
      notify_subscribers: false,
      affected_resources: [{ status_page_resource_id: "103", status: "maintenance" }],
    });
    expect(Date.parse(created!.body.ends_at)).toBeGreaterThan(Date.now() + 89 * 86400000);
    f.components[3].status = "operational";
    f.components[3].source = "automatic";
    f.components[3].message = "";
    await f.run();
    expect(
      f.calls.some((c) => c.method === "PATCH" && Date.parse(c.body.ends_at) <= Date.now()),
    ).toBe(true);
    expect(f.items[3].report_id).toBeNull();
  });
  it("switches between maintenance and downtime with the correct report type", async () => {
    const f = fixture();
    f.components[3].status = "unavailable";
    await f.run();
    f.components[3].status = "maintenance";
    await f.run();
    const posts = f.calls.filter((c) => c.path === "/status-reports" && c.method === "POST");
    expect(posts.map((c) => c.body.report_type)).toEqual(["manual", "maintenance"]);
    expect(
      f.calls.filter((c) => c.method === "POST").every((c) => c.body.notify_subscribers === false),
    ).toBe(true);
  });
  it("rejects ambiguous or missing names before any publication", async () => {
    const f = fixture();
    f.resources.push(structuredClone(f.resources[0]));
    f.components[3].status = "unavailable";
    expect(await f.run()).toEqual({ synced: false });
    expect(f.result()).toBe("mapping_mismatch");
    expect(f.calls.every((c) => c.method === "GET")).toBe(true);
  });
  it("does not repoint a saved mapping to a replacement resource", async () => {
    const f = fixture();
    f.items[0].resource_id = "999";
    await f.run();
    expect(f.result()).toBe("mapping_mismatch");
    expect(f.calls.every((c) => c.method === "GET")).toBe(true);
  });
  it("reconciles a lost create response using its saved title, page and resource", async () => {
    const f = fixture();
    f.components[3].status = "unavailable";
    f.loseCreate();
    await f.run();
    expect(f.items[3].pending).toBe(true);
    expect(f.items[3].report_id).toBeNull();
    await f.run();
    expect(f.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(f.items[3].pending).toBe(false);
    expect(f.items[3].report_id).toBe("200");
    expect(f.result()).toBe("ok");
  });
  it("does not blindly replay an uncertain report creation when no matching report is visible", async () => {
    const f = fixture();
    f.components[3].status = "unavailable";
    f.items[3] = {
      ...f.items[3],
      pending: true,
      title: "Unconfirmed report",
      report_type: "manual",
    };
    await f.run();
    expect(f.result()).toBe("awaiting_confirmation");
    expect(f.calls.every((c) => c.method === "GET")).toBe(true);
  });
  it("reconciles a lost status-update response by observing the remote status", async () => {
    const f = fixture();
    f.components[3].status = "degraded";
    await f.run();
    f.components[3].status = "unavailable";
    f.loseUpdate();
    await f.run();
    await f.run();
    expect(f.calls.filter((c) => c.path.endsWith("/status-updates"))).toHaveLength(1);
    expect(f.result()).toBe("ok");
  });
  it("allows a definite rejected create to retry after configuration is corrected", async () => {
    const f = fixture();
    f.components[3].status = "degraded";
    f.rejectCreate();
    await f.run();
    expect(f.items[3].pending).toBe(false);
    expect(f.result()).toBe("api_rejected");
  });
  it("does not call Better Stack when the API token is missing", async () => {
    const f = fixture();
    await syncBetterStack({
      apiKey: undefined,
      db: f.db,
      fetcher: f.fetcher,
      readJson: (r) => (r.status === 204 ? Promise.resolve(null) : r.json()),
    });
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.result()).toBe("configuration_missing");
  });
  it("does not call Better Stack when another batch owns the lease or SQL is not installed", async () => {
    const fetcher = vi.fn();
    expect(
      await syncBetterStack({
        apiKey: "secret",
        db: async () => null,
        fetcher,
        readJson: (r) => (r.status === 204 ? Promise.resolve(null) : r.json()),
      }),
    ).toEqual({ skipped: true });
    expect(
      await syncBetterStack({
        apiKey: "secret",
        db: async () => {
          throw Error("missing");
        },
        fetcher,
        readJson: (r) => (r.status === 204 ? Promise.resolve(null) : r.json()),
      }),
    ).toEqual({ installed: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("limits resource types and status vocabulary", () => {
    const f = fixture();
    f.resources[0].attributes.resource_type = "Monitor";
    expect(() => mapBridgeResources(f.resources)).toThrow();
    expect(() => bridgeTarget("fake")).toThrow();
    expect(bridgeTarget("maintenance")).toBe("maintenance");
  });
});

it("publishes future maintenance without marking the effective automatic snapshot down, and cancels only its own future report", async () => {
  const f = fixture();
  const component = f.components.find((c: any) => c.key === "sms")!;
  const start = new Date(Date.now() + 3600000).toISOString();
  const end = new Date(Date.now() + 7200000).toISOString();
  component.scheduled = {
    startsAt: start,
    endsAt: end,
    message: "Manutenção programada com impacto informado",
  };
  await f.run();
  const created = f.calls.find((c: any) => c.method === "POST")!;
  expect(created.body).toMatchObject({
    report_type: "maintenance",
    starts_at: start,
    ends_at: end,
    notify_subscribers: false,
  });
  expect(component.status).toBe("operational");
  await f.run();
  expect(f.calls.filter((c: any) => c.method === "POST")).toHaveLength(1);
  component.scheduled = null;
  await f.run();
  expect(f.calls.filter((c: any) => c.method === "DELETE")).toHaveLength(1);
  expect(f.calls.some((c: any) => c.path.includes("/resources/") && c.method !== "GET")).toBe(
    false,
  );
});
it("a current failure takes precedence over a future maintenance", async () => {
  const f = fixture();
  const c = f.components.find((c: any) => c.key === "sms")!;
  c.status = "unavailable";
  c.scheduled = {
    startsAt: new Date(Date.now() + 3600000).toISOString(),
    endsAt: new Date(Date.now() + 7200000).toISOString(),
    message: "Agendamento futuro",
  };
  await f.run();
  expect(f.calls.find((c: any) => c.method === "POST")!.body).toMatchObject({
    report_type: "manual",
    affected_resources: [{ status_page_resource_id: "103", status: "downtime" }],
  });
});

it("reconciles cancellation of its future report after a lost delete response without replay", async () => {
  const f = fixture();
  const c = f.components.find((c: any) => c.key === "sms")!;
  c.scheduled = {
    startsAt: new Date(Date.now() + 3600000).toISOString(),
    endsAt: new Date(Date.now() + 7200000).toISOString(),
    message: "Manutenção planejada",
  };
  await f.run();
  c.scheduled = null;
  f.loseDelete();
  await f.run();
  expect(f.items.find((i: any) => i.component === "sms").pending).toBe(true);
  await f.run();
  expect(f.result()).toBe("ok");
  expect(f.items.find((i: any) => i.component === "sms").report_id).toBe(null);
  expect(f.calls.filter((c: any) => c.method === "DELETE")).toHaveLength(1);
});
it("updates the same owned report when progress and impact change", async () => {
  const f = fixture();
  const c = f.components.find((c: any) => c.key === "sms")!;
  c.source = "manual";
  c.status = "unavailable";
  c.message = "Investigando. Novas ativações afetadas.";
  await f.run();
  c.message = "Causa identificada. Próxima atualização às 14h (Brasília).";
  await f.run();
  await f.run();
  expect(
    f.calls.filter((c: any) => c.path === "/status-reports" && c.method === "POST"),
  ).toHaveLength(1);
  const updates = f.calls.filter(
    (c: any) => c.path.endsWith("/status-updates") && c.method === "POST",
  );
  expect(updates).toHaveLength(1);
  expect(updates[0].body).toMatchObject({ message: c.message, notify_subscribers: false });
});
