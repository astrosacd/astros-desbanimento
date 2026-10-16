import { it, expect } from "vitest";
import { speechPlainText } from "./voice";
it("does not speak markdown punctuation and reads dates and currencies as prose", () => {
  const text = speechPlainText("**16/10/2026**: **R$ 193,65** e **US$ 2,84**. \\*\\*pronto\\*\\*");
  expect(text).toContain("16 de outubro de 2026");
  expect(text).toContain("cento e noventa e três reais e sessenta e cinco centavos");
  expect(text).toContain("dois dólares e oitenta e quatro centavos");
  expect(text).not.toMatch(/[*\\]/);
});
it("reads link labels and headings without markup or HTML", () => {
  expect(speechPlainText("## Resumo\n[Suporte](https://example.com) <b>ativo</b>")).toBe(
    "Resumo\nSuporte ativo",
  );
});
it("omits pictographs, emoji shortcodes and flags from speech", () => {
  const s = speechPlainText("Tudo bem 😊 :smile: 👨‍👩‍👧‍👦 🇧🇷!");
  expect(s).not.toMatch(/smile|😊|👨|🇧/);
});
it("speaks money as amounts rather than comma zero zero", () => {
  expect(speechPlainText("R$ 0,00")).toBe("zero reais");
  expect(speechPlainText("R$ 1,00")).toBe("um real");
  expect(speechPlainText("US$ 2,84")).toBe("dois dólares e oitenta e quatro centavos");
  expect(speechPlainText("R$ 0,50")).toBe("cinquenta centavos");
  expect(speechPlainText("R$ 1.050,25")).toBe("mil e cinquenta reais e vinte e cinco centavos");
});
