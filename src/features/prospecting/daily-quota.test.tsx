import { afterEach, it, expect, vi } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { DailyQuotaNotice, quotaClock } from "./daily-quota";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("formats a duration without negative or extra hours", () => {
  expect(quotaClock(3661000)).toBe("01:01:01");
  expect(quotaClock(86400000)).toBe("24:00:00");
  expect(quotaClock(-100)).toBe("00:00:00");
});
it("counts down from server time, refreshes once at zero and never submits a search", () => {
  vi.useFakeTimers({ toFake: ["Date", "performance", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date("2026-10-19T03:59:58Z"));
  const renew = vi.fn();
  render(
    <DailyQuotaNotice
      quota={{
        limit: 5,
        used: 5,
        remaining: 0,
        serverNow: "2026-10-19T02:59:58Z",
        resetsAt: "2026-10-19T03:00:00Z",
      }}
      updatedAt={Date.now()}
      onRenew={renew}
    />,
  );
  expect(screen.getByText("00:00:02")).toBeTruthy();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText("00:00:01")).toBeTruthy();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText("Atualizando limite…")).toBeTruthy();
  expect(renew).toHaveBeenCalledOnce();
  act(() => vi.advanceTimersByTime(5000));
  expect(renew).toHaveBeenCalledOnce();
});
it("shows the actual daily allowance without a blocking timer when searches remain", () => {
  render(
    <DailyQuotaNotice
      quota={{
        limit: 5,
        used: 2,
        remaining: 3,
        serverNow: "2026-10-19T10:00:00Z",
        resetsAt: "2026-10-20T03:00:00Z",
      }}
      onRenew={vi.fn()}
    />,
  );
  expect(screen.getByText(/2 de 5 buscas/)).toBeTruthy();
  expect(screen.queryByLabelText("Tempo até a renovação do limite")).toBeNull();
});
