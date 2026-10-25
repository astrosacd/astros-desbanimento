import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./navigation-loading.css";

// Mounted only during a real route transition; fast navigations never flash a loader.
export function NavigationLoading({ title }: { title: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 250);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  // Outside the busy page so assistive technology can announce the navigation.
  return createPortal(
    <div className="astros-navigation-loading">
      <div className="astros-navigation-card" role="status" aria-live="polite" aria-atomic="true">
        <div className="astros-navigation-symbol" aria-hidden="true">
          <span />
          <img src="/brand/astros-symbol.png" alt="" width="48" height="48" />
        </div>
        <span className="astros-navigation-brand">ASTROS MAIS</span>
        <h2>Abrindo {title}…</h2>
        <p>Aguarde um instante. Estamos preparando a página.</p>
      </div>
    </div>,
    document.body,
  );
}
