import { describe, it, expect } from "vitest";
import { overall, saveSchema, visibleSnapshot, type Snapshot } from "./model";
const date = new Date().toISOString();
const snapshot = (): Snapshot => ({
  generatedAt: date,
  components: [
    "panel",
    "auth",
    "desbanimento",
    "sms",
    "social",
    "prospect_maps",
    "prospect_cnpj",
  ].map((key) => ({
    key,
    label: key,
    status: "operational",
    source: "automatic",
    checkedAt: date,
    message: "",
  })),
  events: [],
});
describe("public service status", () => {
  it("drops stale automatic green status without overriding an active manual notice", () => {
    const s = snapshot();
    s.generatedAt = new Date(Date.now() - 660000).toISOString();
    s.components[0] = { ...s.components[0], source: "manual", status: "maintenance" };
    const v = visibleSnapshot(s);
    expect(v.components[0].status).toBe("maintenance");
    expect(v.components[1].status).toBe("unknown");
    expect(overall(v)).toBe("maintenance");
  });
  it("rejects missing timestamps and stale samples despite a fresh response", () => {
    const s = snapshot();
    s.components[0].checkedAt = null;
    s.components[1].checkedAt = new Date(Date.now() - 660000).toISOString();
    expect(
      visibleSnapshot(s)
        .components.slice(0, 2)
        .map((c) => c.status),
    ).toEqual(["unknown", "unknown"]);
  });
  it("prioritizes outage over maintenance and never lets one healthy component hide an unknown", () => {
    const s = snapshot();
    s.components[0].status = "unknown";
    expect(overall(s)).toBe("unknown");
    s.components[1].status = "maintenance";
    s.components[2].status = "unavailable";
    expect(overall(s)).toBe("unavailable");
  });
  it("also requires a fresh message for operational notices while allowing automatic reset", () => {
    expect(
      saveSchema.safeParse({ key: "sms", status: "operational", message: "   ", expires: null })
        .success,
    ).toBe(false);
    expect(
      saveSchema.safeParse({
        key: "sms",
        status: "operational",
        message: "Serviço normalizado",
        expires: null,
      }).success,
    ).toBe(true);
    expect(
      saveSchema.safeParse({ key: "sms", status: null, message: "", expires: null }).success,
    ).toBe(true);
  });
  it("requires an explanatory public message and restricts component and status keys", () => {
    expect(
      saveSchema.safeParse({ key: "sms", status: "maintenance", message: "", expires: null })
        .success,
    ).toBe(false);
    expect(
      saveSchema.safeParse({
        key: "wallet",
        status: "maintenance",
        message: "Manutenção",
        expires: null,
      }).success,
    ).toBe(false);
    expect(
      saveSchema.safeParse({ key: "sms", status: null, message: "", expires: null }).success,
    ).toBe(true);
  });
});
