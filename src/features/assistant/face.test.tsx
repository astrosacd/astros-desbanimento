import { it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ mount: vi.fn() }));
vi.mock("./avatar-3d", () => ({ mountAvatar: mocks.mount }));
import { AssistantFace } from "./face";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const media = () =>
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
it("cancels a late avatar initialization when leaving the assistant", async () => {
  media();
  let finish!: (dispose: () => void) => void;
  mocks.mount.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { unmount } = render(<AssistantFace mode="idle" />);
  await waitFor(() => expect(mocks.mount).toHaveBeenCalledTimes(1));
  const signal = mocks.mount.mock.calls[0]![2] as AbortSignal;
  unmount();
  expect(signal.aborted).toBe(true);
  const dispose = vi.fn();
  finish(dispose);
  await waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
});
it("shows a local fallback notice if 3D is unavailable", async () => {
  media();
  mocks.mount.mockRejectedValueOnce(Error("WebGL unavailable"));
  render(<AssistantFace mode="idle" />);
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("A conversa continua funcionando"),
  );
  expect(screen.getByRole("link", { name: "Créditos do modelo 3D" })).toHaveAttribute(
    "href",
    "/models/astra/NOTICE.txt",
  );
});
