import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { PwaProvider, PwaInstallButton } from "./provider";
let configEnabled = true;
const register = vi.fn(),
  unregister = vi.fn(),
  getRegistrations = vi.fn(),
  getRegistration = vi.fn();
beforeEach(() => {
  vi.stubEnv("PROD", true);
  configEnabled = true;
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ enabled: configEnabled }), {
          headers: { "content-type": "application/json" },
        }),
    ),
  );
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register, getRegistration, getRegistrations },
  });
  getRegistration.mockResolvedValue(undefined);
  getRegistrations.mockResolvedValue([]);
  register.mockResolvedValue({ update: vi.fn().mockResolvedValue(undefined) });
});
afterEach(() => {
  cleanup();
  document.getElementById("astros-pwa-manifest")?.remove();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
function mount() {
  return render(
    <PwaProvider>
      <PwaInstallButton />
      <main>Conteúdo do painel</main>
    </PwaProvider>,
  );
}
it("registers same-origin PWA and explains installation without auto-prompting", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Instalar Astros Mais" }));
  expect(await screen.findByRole("dialog")).toHaveTextContent("mesma conta e carteira");
  expect(register).toHaveBeenCalledWith("/astros-sw.js", { scope: "/", updateViaCache: "none" });
  expect(document.querySelector('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
});
it("prompts only on explicit user action, uses the event once and hides install after success", async () => {
  mount();
  await screen.findByRole("button", { name: "Instalar Astros Mais" });
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
  fireEvent(window, event);
  expect(prompt).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Instalar Astros Mais" }));
  fireEvent.click(screen.getByRole("button", { name: "Instalar agora" }));
  await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
  fireEvent(window, new Event("appinstalled"));
  expect(screen.queryByRole("button", { name: "Instalar Astros Mais" })).toBeNull();
});
it("disables promotion and unregisters its worker without touching normal panel content", async () => {
  configEnabled = false;
  getRegistrations.mockResolvedValue([
    { active: { scriptURL: location.origin + "/astros-sw.js", postMessage: vi.fn() }, unregister },
  ]);
  mount();
  await waitFor(() => expect(unregister).toHaveBeenCalled());
  expect(screen.getByText("Conteúdo do painel")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Instalar Astros Mais" })).toBeNull();
  expect(register).not.toHaveBeenCalled();
});
it("does not replace another service worker at the same scope", async () => {
  getRegistration.mockResolvedValue({ active: { scriptURL: location.origin + "/another-app.js" } });
  mount();
  await waitFor(() => expect(getRegistration).toHaveBeenCalled());
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Instalar Astros Mais" })).toBeNull(),
  );
  expect(register).not.toHaveBeenCalled();
});
it("does not register after unmounting while configuration is in flight", async () => {
  let resolve!: (value: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>((r) => (resolve = r))),
  );
  const view = mount();
  view.unmount();
  resolve(new Response('{"enabled":true}', { headers: { "content-type": "application/json" } }));
  await Promise.resolve();
  expect(register).not.toHaveBeenCalled();
});
it("shows offline guidance without submitting or reloading the panel", async () => {
  mount();
  await screen.findByRole("button", { name: "Instalar Astros Mais" });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  fireEvent(window, new Event("offline"));
  expect(screen.getByRole("status")).toHaveTextContent("Sem conexão");
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  fireEvent(window, new Event("online"));
  expect(screen.queryByText(/Sem conexão/)).toBeNull();
});
it("hides installation when already running in an installed window", async () => {
  const media = vi
    .spyOn(window, "matchMedia")
    .mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any);
  try {
    mount();
    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Instalar Astros Mais" })).toBeNull();
  } finally {
    media.mockRestore();
  }
});
it("shows Safari installation instructions on iPhone instead of inventing an automatic prompt", async () => {
  const agent = vi
    .spyOn(navigator, "userAgent", "get")
    .mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1");
  try {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Instalar Astros Mais" }));
    expect(screen.getByText("No iPhone ou iPad")).toBeTruthy();
    expect(screen.getByText("Abra este site no Safari.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Instalar agora" })).toBeNull();
  } finally {
    agent.mockRestore();
  }
});
