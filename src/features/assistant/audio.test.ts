import { it, expect, vi, afterEach } from "vitest";
import { spectrumPose, NaturalVoicePlayer } from "./audio-player";
afterEach(() => vi.unstubAllGlobals());
it("mouth closes on silence and follows actual waveform energy", () => {
  const silence = new Float32Array(512),
    speech = new Float32Array(512).fill(0.1),
    bins = new Uint8Array(256).fill(50);
  expect(spectrumPose(silence, bins, 48000, 512).jaw).toBe(0);
  expect(spectrumPose(speech, bins, 48000, 512).jaw).toBeGreaterThan(0.4);
});
it("stops playback without delivering an end callback and prevents late decoded audio", async () => {
  let finish!: (b: any) => void;
  const source = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as any,
      buffer: null,
    },
    analyser = { connect: vi.fn(), disconnect: vi.fn(), fftSize: 512, smoothingTimeConstant: 0 };
  class Context {
    state = "running";
    destination = {};
    sampleRate = 48000;
    decodeAudioData = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    createBufferSource = () => source;
    createAnalyser = () => analyser;
    close = vi.fn().mockResolvedValue(undefined);
  }
  vi.stubGlobal("AudioContext", Context);
  const player = new NaturalVoicePlayer(),
    start = vi.fn(),
    end = vi.fn();
  const p = player.play(
    { base64: btoa("fixture"), mimeType: "audio/mpeg", spokenText: "Olá", shortened: false },
    start,
    end,
  );
  await Promise.resolve();
  player.stop();
  finish({ duration: 2 });
  expect(await p).toBe(false);
  expect(source.start).not.toHaveBeenCalled();
  expect(end).not.toHaveBeenCalled();
});
