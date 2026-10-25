import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NavigationLoading } from "./navigation-loading";

afterEach(() => { cleanup(); vi.useRealTimers(); });
it("announces the destination only after the delay and outside the busy content", () => {
  vi.useFakeTimers();
  const { container } = render(<main aria-busy="true"><NavigationLoading title="Prospecção" /></main>);
  expect(screen.queryByRole("status")).toBeNull();
  act(() => vi.advanceTimersByTime(249));
  expect(screen.queryByRole("status")).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole("status")).toHaveTextContent("Abrindo Prospecção…");
  expect(container).not.toContainElement(screen.getByRole("status"));
});
it("cancels a fast transition and removes a visible overlay immediately on completion", () => {
  vi.useFakeTimers();
  const fast = render(<NavigationLoading title="Carteira / Recargas" />);
  fast.unmount();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByRole("status")).toBeNull();
  const slow = render(<NavigationLoading title="Suporte" />);
  act(() => vi.advanceTimersByTime(250));
  expect(screen.getByRole("status")).toHaveTextContent("Abrindo Suporte…");
  slow.unmount();
  expect(screen.queryByRole("status")).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
