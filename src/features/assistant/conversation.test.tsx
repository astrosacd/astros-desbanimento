const sound = vi.hoisted(() => ({ spoken: [] as any[] }));
vi.mock("./audio-player", () => ({
  NaturalVoicePlayer: class {
    unlock = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn();
    close = vi.fn();
    play = async (audio: any, onStart: () => void, onEnd: () => void) => {
      sound.spoken.push({ text: audio.spokenText, onend: onEnd });
      onStart();
      return true;
    };
  },
}));
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
vi.mock("./face", () => ({ AssistantFace: () => <div /> }));
vi.mock("./actions", () => ({
  askAssistant: vi.fn().mockResolvedValue({
    text: "Hoje não entrou nenhuma recarga. 😊",
    from: "2026-10-16",
    until: "2026-10-16",
    generatedAt: "2026-10-16T20:00:00Z",
    sources: [],
    naturalAudio: {
      base64: "fixture",
      mimeType: "audio/wav",
      spokenText: "Hoje não entrou nenhuma recarga.",
      shortened: false,
    },
  }),
}));
import { AssistantAdmin } from "./page";
import { askAssistant } from "./actions";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function browser() {
  const inputs: any[] = [],
    spoken = sound.spoken;
  spoken.length = 0;
  vi.stubGlobal("AudioContext", class {});
  class Recognition {
    onresult: any;
    onend: any;
    onerror: any;
    start = vi.fn();
    stop = vi.fn(() => this.onend?.());
    constructor() {
      inputs.push(this);
    }
  }
  vi.stubGlobal("SpeechRecognition", Recognition);
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    },
  );
  vi.stubGlobal("speechSynthesis", {
    getVoices: () => [],
    cancel: vi.fn(),
    speak: (u: any) => {
      spoken.push(u);
      u.onstart?.();
    },
  });
  Element.prototype.scrollIntoView = vi.fn();
  return { inputs, spoken };
}
it("asks by voice without Send, waits for spoken answer, then listens again until stopped", async () => {
  const { inputs, spoken } = browser();
  render(<AssistantAdmin />);
  expect(inputs.every((r) => !r.start.mock.calls.length)).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Conversar por voz" }));
  const r = inputs.at(-1);
  expect(r.start).toHaveBeenCalledTimes(1);
  const result = { results: [[{ transcript: "Quanto entrou hoje?" }]] };
  act(() => {
    r.onresult(result);
    r.onresult(result);
  });
  await waitFor(() => expect(spoken).toHaveLength(1));
  expect(askAssistant).toHaveBeenCalledTimes(1);
  expect(spoken[0].text).not.toContain("😊");
  expect(inputs).toHaveLength(2);
  act(() => spoken[0].onend());
  await waitFor(() => expect(inputs).toHaveLength(3));
  expect(inputs[2].start).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Encerrar conversa" }));
  expect(inputs[2].stop).toHaveBeenCalled();
  act(() => inputs[2].onresult(result));
  expect(askAssistant).toHaveBeenCalledTimes(1);
});
it("stops on microphone failure and does not submit empty audio", async () => {
  const { inputs } = browser();
  render(<AssistantAdmin />);
  fireEvent.click(screen.getByRole("button", { name: "Conversar por voz" }));
  act(() => inputs.at(-1).onerror());
  expect(screen.getByRole("alert").textContent).toContain("microfone foi pausado");
  expect(askAssistant).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Conversar por voz" })).toBeTruthy();
});
it("can end the microphone session while waiting and does not speak a late response", async () => {
  const { inputs, spoken } = browser();
  let finish!: (v: any) => void;
  vi.mocked(askAssistant).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<AssistantAdmin />);
  fireEvent.click(screen.getByRole("button", { name: "Conversar por voz" }));
  act(() => inputs.at(-1).onresult({ results: [[{ transcript: "Quem pagou hoje?" }]] }));
  expect(askAssistant).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Encerrar conversa por voz" }));
  await act(async () =>
    finish({
      text: "Nenhuma recarga hoje.",
      from: "2026-10-16",
      until: "2026-10-16",
      generatedAt: "2026-10-16T20:00:00Z",
      sources: [],
    }),
  );
  expect(spoken).toHaveLength(0);
  expect(screen.getByText("Nenhuma recarga hoje.")).toBeTruthy();
});
