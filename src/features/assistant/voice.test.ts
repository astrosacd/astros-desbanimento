import { it, expect } from "vitest";
import { speechPlainText, speechArticulation } from "./voice";
it("does not speak markdown punctuation and reads dates and currencies as prose", () => {
  const text = speechPlainText("**16/10/2026**: **R$ 193,65** e **US$ 2,84**. \\*\\*pronto\\*\\*");
  expect(text).toContain("16 de outubro de 2026");
  expect(text).toContain("193,65 reais");
  expect(text).toContain("2,84 dólares");
  expect(text).not.toMatch(/[*\\]/);
});
it("reads link labels and headings without markup or HTML", () => {
  expect(speechPlainText("## Resumo\n[Suporte](https://example.com) <b>ativo</b>")).toBe(
    "Resumo\nSuporte ativo",
  );
});
it("articulates vowels, closes lips for bilabials and stops when speech pauses", () => {
  const base = { active: true, paused: false, text: "a", charIndex: 0, anchorAt: 100 };
  expect(speechArticulation(base, 100).jaw).toBeGreaterThan(0.5);
  expect(speechArticulation({ ...base, text: "m" }, 100).jaw).toBe(0);
  expect(speechArticulation({ ...base, text: "u" }, 100).round).toBe(1);
  expect(speechArticulation({ ...base, paused: true }, 100).jaw).toBe(0);
  expect(speechArticulation(null, 100).jaw).toBe(0);
});
