export type SpeechInput = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
export function speechInput() {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechInput;
    webkitSpeechRecognition?: new () => SpeechInput;
  };
  const C = w.SpeechRecognition || w.webkitSpeechRecognition;
  return C ? new C() : null;
}
