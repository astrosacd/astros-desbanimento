import { useEffect, useRef } from "react";
export type FaceMode = "idle" | "listening" | "thinking" | "speaking" | "error";
export function AssistantFace({ mode }: { mode: FaceMode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      last = 0;
    const points: Array<[number, number, number, number]> = [];
    for (let y = -1; y <= 1; y += 0.035) {
      for (let x = -1; x <= 1; x += 0.035) {
        const width = 0.64 * (y > 0.45 ? 1 - (y - 0.45) * 0.48 : 1);
        if ((x / width) ** 2 + y * y > 1) continue;
        const eye = ((Math.abs(x) - 0.25) / 0.15) ** 2 + ((y + 0.18) / 0.075) ** 2;
        if (eye < 1) continue;
        const z =
          Math.sqrt(Math.max(0, 1 - (x / width) ** 2 - y * y)) * 0.4 +
          Math.exp(-x * x * 100) * Math.exp(-((y - 0.05) ** 2) * 15) * 0.22;
        points.push([x, y, z, eye < 2.2 ? 1 : 0]);
      }
    }
    for (let i = 0; i < 80; i++) {
      const x = (i / 79 - 0.5) * 0.42;
      points.push([x, 0.44 + 0.04 * Math.cos(x * 12), 0.38, 1]);
    }
    for (let i = 0; i < 45; i++) {
      const y = -0.1 + (i / 44) * 0.39;
      points.push([0, y, 0.61 - Math.abs(y - 0.12) * 0.3, 1]);
    }
    function draw(time: number) {
      frame = requestAnimationFrame(draw);
      if (document.hidden || time - last < 33) return;
      last = time;
      const width = canvas!.clientWidth,
        height = canvas!.clientHeight,
        dpr = Math.min(devicePixelRatio || 1, 1.5);
      if (
        canvas!.width !== Math.round(width * dpr) ||
        canvas!.height !== Math.round(height * dpr)
      ) {
        canvas!.width = Math.round(width * dpr);
        canvas!.height = Math.round(height * dpr);
      }
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, width, height);
      const t = motion.matches ? 0 : time / 1000;
      const mode = modeRef.current,
        angle = motion.matches ? 0 : Math.sin(t * 0.35) * 0.17;
      const scale = Math.min(width * 0.66, height * 0.4),
        cx = width / 2,
        cy = height * 0.47;
      const bright =
        mode === "error" ? "255,160,100" : mode === "listening" ? "100,241,192" : "99,220,244";
      ctx!.strokeStyle = `rgba(${bright},.2)`;
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.ellipse(cx, cy, scale * 0.9, scale * 1.19, 0, 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.beginPath();
      ctx!.ellipse(cx, cy, scale * 1.01, scale * 1.28, 0, t * 0.12, t * 0.12 + Math.PI * 1.4);
      ctx!.stroke();
      for (const [x, y, z, feature] of points) {
        const X = x * Math.cos(angle) + z * Math.sin(angle),
          Z = z * Math.cos(angle) - x * Math.sin(angle);
        const mouth =
          mode === "speaking" && y > 0.38 && y < 0.53 ? Math.sin(t * 15 + x * 9) * 0.018 : 0;
        const drift = mode === "thinking" ? Math.sin(t * 2 + y * 4) * 0.009 : 0;
        const px = cx + (X + drift) * scale,
          py = cy + (y + mouth) * scale;
        ctx!.fillStyle = `rgba(${bright},${feature ? 0.95 : 0.25 + Z * 1.3})`;
        ctx!.beginPath();
        ctx!.arc(px, py, feature ? 1.3 : 0.65 + Z * 0.8, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.fillStyle = `rgba(${bright},.25)`;
      ctx!.fillRect(cx - scale * 0.6, cy + Math.sin(t * 0.6) * scale, scale * 1.2, 1);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <canvas
      ref={ref}
      className="astra-face-canvas"
      role="img"
      aria-label="Rosto digital da assistente Astros, formado por partículas"
    />
  );
}
