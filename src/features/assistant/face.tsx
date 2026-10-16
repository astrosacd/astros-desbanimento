import { useEffect, useRef } from "react";
import { drawPortrait, type FaceMode } from "./portrait";
export type { FaceMode } from "./portrait";
export function AssistantFace({ mode }: { mode: FaceMode }) {
  const ref = useRef<HTMLCanvasElement>(null),
    modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => {
    const canvas = ref.current,
      ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      last = -Infinity;

    function draw(time: number) {
      frame = requestAnimationFrame(draw);
      if (document.hidden || time - last < 40) return;
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
      drawPortrait(ctx!, width, height, time, modeRef.current, motion.matches);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <canvas
      ref={ref}
      className="astra-face-canvas"
      role="img"
      aria-label="Rosto holográfico tridimensional da ASTRA, formado por partículas luminosas"
    />
  );
}
