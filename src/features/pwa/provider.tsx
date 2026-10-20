import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Download, MonitorSmartphone, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { disablePwa, ownsPwa, pwaConfig, PWA_SCRIPT, standalone } from "./runtime";
import "./style.css";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type PwaState = { enabled: boolean; installed: boolean; open: () => void };
const PwaContext = createContext<PwaState>({ enabled: false, installed: false, open: () => {} });
export function PwaProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false),
    [installed, setInstalled] = useState(false),
    [open, setOpen] = useState(false),
    [native, setNative] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [ios, setIos] = useState(false),
    [offline, setOffline] = useState(false);
  const prompt = useRef<InstallEvent | null>(null),
    enabledRef = useRef(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !window.isSecureContext || !("serviceWorker" in navigator)) return;
    let live = true,
      checking = false;
    const controller = new AbortController();
    const media = window.matchMedia("(display-mode: standalone)");
    const installedNow = () => {
      if (live) setInstalled(standalone());
    };
    const connected = () => {
      if (live) setOffline(!navigator.onLine);
    };
    const installedEvent = () => {
      if (!live) return;
      setInstalled(true);
      setOpen(false);
      setNative(false);
      prompt.current = null;
    };
    const offer = (event: Event) => {
      if (!enabledRef.current) return;
      event.preventDefault();
      prompt.current = event as InstallEvent;
      setNative(true);
    };
    const manifest = (show: boolean) => {
      let link = document.getElementById("astros-pwa-manifest") as HTMLLinkElement | null;
      if (!show) {
        link?.remove();
        return;
      }
      if (!link) {
        link = document.createElement("link");
        link.id = "astros-pwa-manifest";
        link.rel = "manifest";
        link.href = "/manifest.webmanifest";
        document.head.append(link);
      }
    };
    async function refresh() {
      if (checking || !live) return;
      checking = true;
      try {
        const isEnabled = await pwaConfig(controller.signal);
        if (!live) return;
        enabledRef.current = isEnabled;
        setEnabled(isEnabled);
        manifest(isEnabled);
        if (!isEnabled) {
          setOpen(false);
          setNative(false);
          prompt.current = null;
          await disablePwa(navigator.serviceWorker, window.caches, location.origin);
          return;
        }
        const existing = await navigator.serviceWorker.getRegistration("/");
        if (!live) return;
        if (existing && !ownsPwa(existing, location.origin)) {
          enabledRef.current = false;
          setEnabled(false);
          manifest(false);
          return;
        }
        const registration = await navigator.serviceWorker.register(PWA_SCRIPT, {
          scope: "/",
          updateViaCache: "none",
        });
        if (!live) return;
        // No forced reloads, background submissions, or application-response caching.
        void registration.update().catch(() => {});
      } catch {
        if (live) {
          enabledRef.current = false;
          setEnabled(false);
          setOpen(false);
          manifest(false);
        }
      } finally {
        checking = false;
      }
    }
    installedNow();
    connected();
    setIos(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    );
    media.addEventListener?.("change", installedNow);
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", installedEvent);
    window.addEventListener("online", connected);
    window.addEventListener("offline", connected);
    const focused = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("focus", focused);
    window.addEventListener("online", focused);
    document.addEventListener("visibilitychange", focused);
    const timer = window.setInterval(focused, 300000);
    void refresh();
    return () => {
      live = false;
      enabledRef.current = false;
      controller.abort();
      clearInterval(timer);
      media.removeEventListener?.("change", installedNow);
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", installedEvent);
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", connected);
      window.removeEventListener("focus", focused);
      window.removeEventListener("online", focused);
      document.removeEventListener("visibilitychange", focused);
      manifest(false);
    };
  }, []);
  async function install() {
    const event = prompt.current;
    if (!event || busy) return;
    prompt.current = null;
    setNative(false);
    setBusy(true);
    setMessage("");
    try {
      await event.prompt();
      const choice = await event.userChoice;
      setMessage(
        choice.outcome === "accepted"
          ? "Instalação solicitada. Conclua as etapas exibidas pelo seu navegador."
          : "Tudo bem! Você pode continuar acessando pelo navegador.",
      );
    } catch {
      setMessage("Use a opção de instalar aplicativo no menu do navegador ou continue pelo site.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <PwaContext.Provider
      value={{
        enabled,
        installed,
        open: () => {
          setMessage("");
          setOpen(true);
        },
      }}
    >
      {offline && (
        <div className="pwa-connection-notice" role="status">
          <WifiOff size={17} />
          <span>
            Sem conexão. Conecte-se à internet para atualizar dados ou realizar operações.
          </span>
        </div>
      )}
      {children}
      <Dialog open={open && enabled && !installed} onOpenChange={setOpen}>
        <DialogContent className="pwa-install-dialog">
          <DialogHeader>
            <div className="pwa-app-mark">
              <img src="/pwa/icon-192.png" width="64" height="64" alt="Logo da Astros" />
            </div>
            <DialogTitle>Astros Mais no seu dispositivo</DialogTitle>
            <DialogDescription>
              Abra seus serviços pelo ícone na tela inicial, com a mesma conta e carteira que você
              já utiliza.
            </DialogDescription>
          </DialogHeader>
          <div className="pwa-install-details">
            <MonitorSmartphone size={20} />
            <p>
              Acesso direto ao painel em uma janela própria. Os serviços continuam precisando de
              internet.
            </p>
          </div>
          {native ? (
            <Button
              type="button"
              disabled={busy}
              className="pwa-install-action"
              onClick={() => void install()}
            >
              <Download size={17} />
              {busy ? "Aguarde…" : "Instalar agora"}
            </Button>
          ) : (
            <div className="pwa-install-help">
              <strong>{ios ? "No iPhone ou iPad" : "Como instalar"}</strong>
              {ios ? (
                <ol>
                  <li>Abra este site no Safari.</li>
                  <li>Toque em Compartilhar.</li>
                  <li>Escolha Adicionar à Tela de Início e confirme.</li>
                </ol>
              ) : (
                <p>
                  Abra o menu do navegador e procure “Instalar aplicativo” ou “Adicionar à tela
                  inicial”. No computador, procure também o ícone de instalação na barra de
                  endereço.
                </p>
              )}
              <small>
                Se a opção não aparecer, abra o painel diretamente no navegador. A instalação
                depende do dispositivo e do navegador.
              </small>
            </div>
          )}
          {message && (
            <p role="status" className="pwa-install-feedback">
              {message}
            </p>
          )}
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Continuar pelo navegador
          </Button>
        </DialogContent>
      </Dialog>
    </PwaContext.Provider>
  );
}
export function PwaInstallButton({
  compact = false,
  entry = false,
}: {
  compact?: boolean;
  entry?: boolean;
}) {
  const pwa = useContext(PwaContext);
  if (!pwa.enabled || pwa.installed) return null;
  return (
    <button
      type="button"
      className={entry ? "pwa-public-install" : "nav-link pwa-install-entry"}
      onClick={pwa.open}
      title="Instalar Astros Mais"
      aria-label={compact ? "Instalar Astros Mais" : undefined}
    >
      <Download size={18} />
      {!compact && <span>Instalar Astros Mais</span>}
    </button>
  );
}
