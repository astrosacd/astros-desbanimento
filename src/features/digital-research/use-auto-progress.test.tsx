import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Research } from "./model";
import { useAutoProgress } from "./use-auto-progress";
const row: Research = {
  id: "22222222-2222-4222-8222-222222222222",
  tool: "instagram_profile",
  query: "example",
  quantity: 1,
  state: "running",
  reserved_cents: 1,
  charged_cents: 0,
  delivered: 0,
  created_at: "2026-10-30T12:00:00Z",
};
let check: ReturnType<typeof vi.fn>, receive: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  check = vi.fn().mockResolvedValue(row);
  receive = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const options = () => ({ scope: "account-a", row, enabled: true, blocked: false, check, receive });
const advance = async (ms = 15000) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
it("checks only the original running ID at a controlled interval and stops after completion", async () => {
  const { rerender } = renderHook((props) => useAutoProgress(props), { initialProps: options() });
  expect(check).not.toHaveBeenCalled();
  await advance();
  expect(check).toHaveBeenCalledExactlyOnceWith(row.id);
  expect(receive).toHaveBeenCalledWith(row);
  rerender({ ...options(), row: { ...row, state: "completed" } });
  await advance(60000);
  expect(check).toHaveBeenCalledTimes(1);
});
it("pauses when hidden and cancels timers when the view closes", async () => {
  const { rerender } = renderHook((props) => useAutoProgress(props), { initialProps: options() });
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await advance(60000);
  expect(check).not.toHaveBeenCalled();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await advance();
  expect(check).toHaveBeenCalledTimes(1);
  rerender({ ...options(), enabled: false });
  await advance(60000);
  expect(check).toHaveBeenCalledTimes(1);
});
it("does not overlap checks, compete with a manual action or apply a response after account change", async () => {
  let resolve!: (r: Research) => void;
  check.mockImplementationOnce(
    () =>
      new Promise<Research>((r) => {
        resolve = r;
      }),
  );
  const { rerender } = renderHook((props) => useAutoProgress(props), {
    initialProps: { ...options(), blocked: true },
  });
  await advance();
  expect(check).not.toHaveBeenCalled();
  rerender(options());
  await advance();
  await advance(60000);
  expect(check).toHaveBeenCalledTimes(1);
  rerender({ ...options(), scope: "account-b", enabled: false });
  await act(async () => resolve(row));
  expect(receive).not.toHaveBeenCalled();
});
it("stops on a transport error and caps polling at twenty checks", async () => {
  check.mockRejectedValueOnce(Error("unavailable"));
  const first = renderHook(() => useAutoProgress(options()));
  await advance();
  expect(first.result.current).toBe("paused");
  await advance(60000);
  expect(check).toHaveBeenCalledTimes(1);
  first.unmount();
  check.mockReset().mockResolvedValue(row);
  const second = renderHook(() => useAutoProgress(options()));
  await advance(600000);
  expect(check).toHaveBeenCalledTimes(20);
  expect(second.result.current).toBe("paused");
});
it.each(["review", "dispatching", "rejected", "completed"] as const)(
  "never automatically reconciles a %s request",
  async (state) => {
    renderHook(() => useAutoProgress({ ...options(), row: { ...row, state } }));
    await advance(60000);
    expect(check).not.toHaveBeenCalled();
  },
);
