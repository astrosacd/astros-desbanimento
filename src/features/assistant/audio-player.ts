import type { Articulation } from "./voice";
export type NaturalAudio = {
  base64: string;
  mimeType: "audio/wav" | "audio/mpeg";
  spokenText: string;
  shortened: boolean;
};
export type AudioMotion = { sample: () => Articulation };
export function spectrumPose(
  samples: Float32Array,
  bins: Uint8Array,
  sampleRate: number,
  fft: number,
): Articulation {
  let sum = 0;
  for (const x of samples) sum += x * x;
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  if (rms < 0.012) return { jaw: 0, round: 0, width: 1 };
  let low = 0,
    high = 0;
  for (let i = 0; i < bins.length; i++) {
    const hz = (i * sampleRate) / fft;
    if (hz >= 180 && hz < 900) low += bins[i]!;
    if (hz >= 1200 && hz < 4000) high += bins[i]!;
  }
  const ratio = low / Math.max(1, low + high),
    jaw = Math.min(0.9, Math.max(0, (rms - 0.012) * 7));
  return { jaw, round: Math.max(0, ratio - 0.35) * 0.8, width: 1 + (1 - ratio) * 0.08 };
}
export class NaturalVoicePlayer implements AudioMotion {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private epoch = 0;
  private wave = new Float32Array(512);
  private bins = new Uint8Array(256);
  async unlock() {
    if (!this.context) {
      const C = window.AudioContext;
      if (!C) throw Error("Seu navegador não oferece reprodução de voz natural.");
      this.context = new C();
    }
    if (this.context.state === "suspended") await this.context.resume();
  }
  stop() {
    this.epoch++;
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {}
      this.source.disconnect();
      this.source = null;
    }
    this.analyser?.disconnect();
    this.analyser = null;
  }
  async play(audio: NaturalAudio, onStart: () => void, onEnd: () => void) {
    this.stop();
    const epoch = this.epoch;
    await this.unlock();
    if (this.epoch !== epoch) return false;
    if (!["audio/wav", "audio/mpeg"].includes(audio.mimeType) || audio.base64.length > 5600000)
      throw Error("Áudio inválido.");
    const binary = atob(audio.base64),
      bytes = Uint8Array.from(binary, (x) => x.charCodeAt(0));
    const ctx = this.context!,
      buffer = await ctx.decodeAudioData(bytes.buffer);
    if (this.epoch !== epoch) return false;
    if (buffer.duration > 90 || buffer.duration <= 0)
      throw Error("A resposta de voz ultrapassou o limite de reprodução.");
    const source = ctx.createBufferSource(),
      analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;
    source.buffer = buffer;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    this.source = source;
    this.analyser = analyser;
    source.onended = () => {
      if (this.epoch !== epoch) return;
      source.disconnect();
      analyser.disconnect();
      this.source = null;
      this.analyser = null;
      onEnd();
    };
    source.start();
    onStart();
    return true;
  }
  sample() {
    if (!this.analyser || !this.source || this.context?.state !== "running")
      return { jaw: 0, round: 0, width: 1 };
    this.analyser.getFloatTimeDomainData(this.wave);
    this.analyser.getByteFrequencyData(this.bins);
    return spectrumPose(this.wave, this.bins, this.context.sampleRate, this.analyser.fftSize);
  }
  close() {
    this.stop();
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
    this.context = null;
  }
}
