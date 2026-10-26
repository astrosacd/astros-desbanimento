import { expect, it } from "vitest";
import { isoDay, statementSchema, localDay, csvCell, statementCsv, followupSchema } from "./model";
it("uses real calendar days and Fortaleza midnight boundaries", () => {
  expect(isoDay.safeParse("2026-02-30").success).toBe(false);
  expect(isoDay.safeParse("2028-02-29").success).toBe(true);
  expect(localDay(new Date("2026-10-26T02:59:59Z"))).toBe("2026-10-25");
  expect(localDay(new Date("2026-10-26T03:00:00Z"))).toBe("2026-10-26");
});
it("rejects reversed and oversized statement windows and cross-account input", () => {
  expect(statementSchema.safeParse({ from: "2026-10-26", until: "2026-10-25" }).success).toBe(
    false,
  );
  expect(statementSchema.safeParse({ from: "2025-01-01", until: "2026-01-02" }).success).toBe(
    false,
  );
  expect(
    statementSchema.safeParse({ from: "2026-01-01", until: "2026-10-26", userId: "other" }).success,
  ).toBe(false);
  expect(
    followupSchema.safeParse({
      leadId: "00000000-0000-4000-8000-000000000001",
      source: "maps",
      note: "x",
      dueOn: null,
      done: false,
      version: 0,
      actor: "other",
    }).success,
  ).toBe(false);
});
it("escapes formulas, quotes and separators without converting legitimate negative amounts into text", () => {
  expect(csvCell(' =HYPERLINK("x")')).toBe('"\' =HYPERLINK(""x"")"');
  expect(csvCell("-1,50")).toBe('"-1,50"');
  expect(csvCell('a;"b"\nc')).toBe('"a;""b""\nc"');
});
it("exports supplied complete rows with BOM, signed cents and stable movement references", () => {
  const csv = statementCsv({
    from: "2026-10-26",
    until: "2026-10-26",
    timezone: "America/Fortaleza",
    rows: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        created_at: "2026-10-26T03:30:00Z",
        amount_cents: -50,
        kind: "reversal",
        description: "Comissão estornada",
      },
    ],
  });
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain('"-0,50"');
  expect(csv).toContain("26/10/2026, 00:30:00");
  expect(csv).toContain("Comissão estornada");
  expect(csv).toContain("\r\n");
});
