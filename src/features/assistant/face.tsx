import { speechArticulation, type SpeechMotion } from "./voice";
import { useEffect, useRef, type MutableRefObject } from "react";
import { drawPortrait, type FaceMode } from "./portrait";
export type { FaceMode } from "./portrait";
export function AssistantFace({
  mode,
  speechMotion,
}: {
  mode: FaceMode;
  speechMotion?: MutableRefObject<SpeechMotion | null>;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    modeRef = useRef(mode),
    speechRef = useRef(speechMotion);
  speechRef.current = speechMotion;
  modeRef.current = mode;
  useEffect(() => {
    const canvas = ref.current,
      ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      last = -Infinity;
    const smooth = { jaw: 0, round: 0, width: 1 };

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
      const target = speechArticulation(speechRef.current?.current ?? null, time);
      smooth.jaw += (target.jaw - smooth.jaw) * 0.4;
      smooth.round += (target.round - smooth.round) * 0.4;
      smooth.width += (target.width - smooth.width) * 0.4;
      drawPortrait(ctx!, width, height, time, modeRef.current, motion.matches, smooth);
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
