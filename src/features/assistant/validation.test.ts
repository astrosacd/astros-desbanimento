import { it, expect } from "vitest";
import { resolvePeriod, todayFortaleza, assistantInput } from "./validation";
it("uses Fortaleza dates and resolves relative periods without arbitrary SQL", () => {
  expect(todayFortaleza(new Date("2026-10-17T01:00:00Z"))).toBe("2026-10-16");
  expect(resolvePeriod("Quem pagou ontem?", "", "", "2026-10-16")).toEqual({
    from: "2026-10-15",
    until: "2026-10-15",
  });
  expect(resolvePeriod("últimos 7 dias", "", "", "2026-10-16")).toEqual({
    from: "2026-10-10",
    until: "2026-10-16",
  });
});
it("requires real dates, bounded question and at most 31 days", () => {
  expect(
    assistantInput.safeParse({ question: "teste", from: "2026-02-30", until: "2026-03-02" })
      .success,
  ).toBe(false);
  expect(
    assistantInput.safeParse({ question: "teste", from: "2026-10-01", until: "2026-10-31" })
      .success,
  ).toBe(true);
  expect(
    assistantInput.safeParse({
      question: "x".repeat(1001),
      from: "2026-10-01",
      until: "2026-10-31",
    }).success,
  ).toBe(false);
});

it("bounds reported error context without accepting administrative actions", () => {
  const base = { question: "Analise este erro", from: "2026-10-17", until: "2026-10-17" };
  expect(
    assistantInput.safeParse({
      ...base,
      reportedError: { module: "sms", message: "BALANCE_ERROR" },
    }).success,
  ).toBe(true);
  expect(
    assistantInput.safeParse({
      ...base,
      reportedError: { module: "sms", message: "x".repeat(3001) },
    }).success,
  ).toBe(false);
  expect(
    assistantInput.safeParse({ ...base, reportedError: { module: "sql", message: "select" } })
      .success,
  ).toBe(false);
  expect(
    assistantInput.safeParse({ ...base, reportedError: { module: "sms", action: "refund" } })
      .success,
  ).toBe(false);
});
