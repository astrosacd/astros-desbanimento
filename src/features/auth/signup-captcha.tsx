import { useEffect, useRef, useState } from "react";
type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
let loading: Promise<Turnstile> | undefined;
function load(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading)
    loading = new Promise<Turnstile>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      const timer = window.setTimeout(() => {
        script.remove();
        reject(Error("timeout"));
      }, 15000);
      script.onload = () => {
        window.clearTimeout(timer);
        if (window.turnstile) resolve(window.turnstile);
        else reject(Error("unavailable"));
      };
      script.onerror = () => {
        window.clearTimeout(timer);
        script.remove();
        reject(Error("unavailable"));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      loading = undefined;
      throw error;
    });
  return loading;
}
export function SignupCaptcha({
  siteKey,
  attempt,
  onToken,
}: {
  siteKey: string;
  attempt: number;
  onToken: (token: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null),
    callback = useRef(onToken);
  callback.current = onToken;
  const [failed, setFailed] = useState(false),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true,
      id: string | undefined,
      api: Turnstile | undefined;
    setFailed(false);
    callback.current("");
    load()
      .then((value) => {
        if (!active || !element.current) return;
        api = value;
        id = api.render(element.current, {
          sitekey: siteKey,
          action: "signup",
          size: "compact",
          theme: "auto",
          callback: (token: string) => {
            if (active) callback.current(token);
          },
          "timeout-callback": () => {
            if (active) callback.current("");
          },
          "expired-callback": () => {
            if (active) callback.current("");
          },
          "error-callback": () => {
            if (active) {
              callback.current("");
              setFailed(true);
            }
          },
        });
      })
      .catch(() => {
        if (active) {
          callback.current("");
          setFailed(true);
        }
      });
    return () => {
      active = false;
      if (id && api) api.remove(id);
    };
  }, [siteKey, attempt, reload]);
  return (
    <div style={{ marginTop: 16, width: "100%", minWidth: 0 }}>
      <div ref={element} />
      {failed && (
        <div role="alert">
          <p className="error-text">Não foi possível carregar a verificação de segurança.</p>
          <button type="button" onClick={() => setReload((n) => n + 1)}>
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
