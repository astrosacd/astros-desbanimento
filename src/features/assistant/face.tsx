import type { AudioMotion } from "./audio-player";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { FaceMode } from "./portrait";
export type { FaceMode } from "./portrait";
export function AssistantFace({
  mode,
  audioMotion,
}: {
  mode: FaceMode;
  audioMotion?: MutableRefObject<AudioMotion | null>;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    modeRef = useRef(mode),
    audioRef = useRef(audioMotion);
  const [status, setStatus] = useState("Carregando avatar 3D…");
  modeRef.current = mode;
  audioRef.current = audioMotion;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const controller = new AbortController();
    let dispose: (() => void) | undefined;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    import("./avatar-3d")
      .then(({ mountAvatar }) => {
        if (controller.signal.aborted) return;
        return mountAvatar(
          canvas,
          () => ({
            mode: modeRef.current,
            articulation: audioRef.current?.current?.sample() ?? { jaw: 0, round: 0, width: 1 },
            reduced: motion.matches,
          }),
          controller.signal,
        );
      })
      .then((cleanup) => {
        dispose = cleanup;
        if (controller.signal.aborted) cleanup?.();
        else setStatus("");
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setStatus(
            "O avatar 3D não está disponível neste navegador. A conversa continua funcionando.",
          );
      });
    return () => {
      controller.abort();
      dispose?.();
    };
  }, []);
  return (
    <div className="astra-avatar-view">
      <canvas
        ref={ref}
        className="astra-face-canvas"
        role="img"
        aria-label="Avatar tridimensional da ASTRA, com movimentos faciais e partículas luminosas"
      />
      {status && (
        <span className="astra-avatar-load" role="status">
          {status}
        </span>
      )}
      <a
        className="astra-avatar-credit"
        href="/models/astra/NOTICE.txt"
        target="_blank"
        rel="noopener noreferrer"
      >
        Créditos do modelo 3D
      </a>
    </div>
  );
}
