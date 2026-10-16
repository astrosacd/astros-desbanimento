import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AssistantAnswer } from "./answer";
it("formats emphasis without interpreting model HTML", () => {
  const { container } = render(
    <AssistantAnswer text={"Saldo: **US$ 1,99**\n\n<script>alert(1)</script>"} />,
  );
  expect(container.querySelector("strong")?.textContent).toBe("US$ 1,99");
  expect(container.querySelector("script")).toBeNull();
  expect(screen.getByText("<script>alert(1)</script>")).toBeTruthy();
});
