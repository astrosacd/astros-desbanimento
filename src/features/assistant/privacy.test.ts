import { it, expect } from "vitest";
import { redactDiagnosticText, redactDiagnosticValue } from "./privacy";
it("removes common credentials without removing useful error codes or money", () => {
  const source =
    'N06 R$ 12,50 api_key="secret-123" Authorization: Bearer jwt-secret https://user:pass@host.test/path?token=hidden&code=N10 astros_' +
    "a".repeat(64);
  const safe = redactDiagnosticText(source);
  for (const key of ["secret-123", "jwt-secret", "user:pass", "hidden", "astros_" + "a".repeat(64)])
    expect(safe).not.toContain(key);
  expect(safe).toContain("N06");
  expect(safe).toContain("R$ 12,50");
  expect(safe).toContain("code=N10");
  expect(redactDiagnosticValue({ rows: [{ detail: "password=private", total: 45 }] })).toEqual({
    rows: [{ detail: "password=[OCULTO]", total: 45 }],
  });
});

it("redacts credential-named nested fields while retaining business values", () => {
  expect(
    redactDiagnosticValue({
      apiKey: "private",
      rows: [{ access_token: "secret", state: "review", amount_cents: 500 }],
    }),
  ).toEqual({
    apiKey: "[OCULTO]",
    rows: [{ access_token: "[OCULTO]", state: "review", amount_cents: 500 }],
  });
});
