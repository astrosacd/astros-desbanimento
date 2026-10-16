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

export function speechPlainText(text: string) {
  const months = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/\\([*_`~#])/g, "$1")
    .replace(/[*`~]/g, "")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-+>]\s+/gm, "")
    .replace(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g, (all, d, m, y) =>
      Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31
        ? `${Number(d)} de ${months[Number(m) - 1]} de ${y}`
        : all,
    )
    .replace(/US\$\s*(\d[\d.,]*\d|\d)/g, "$1 dólares")
    .replace(/R\$\s*(\d[\d.,]*\d|\d)/g, "$1 reais")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export type SpeechMotion = {
  active: boolean;
  paused: boolean;
  text: string;
  charIndex: number;
  anchorAt: number;
};
export type Articulation = { jaw: number; round: number; width: number };
export function speechArticulation(s: SpeechMotion | null, time: number): Articulation {
  if (!s?.active || s.paused) return { jaw: 0, round: 0, width: 1 };
  const position = Math.min(
      s.text.length - 1,
      s.charIndex + (Math.max(0, time - s.anchorAt) / 1000) * 13,
    ),
    index = Math.floor(position),
    fraction = position - index;
  function pose(index: number): Articulation {
    const char = (s!.text[index] || " ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (/[\s.,!?;:]/.test(char)) return { jaw: 0, round: 0, width: 1 };
    if (/[mbp]/.test(char)) return { jaw: 0, round: 0, width: 0.95 };
    if (char === "a") return { jaw: 0.9, round: 0, width: 1.05 };
    if (char === "o") return { jaw: 0.65, round: 0.8, width: 0.8 };
    if (char === "u") return { jaw: 0.35, round: 1, width: 0.74 };
    if (char === "e") return { jaw: 0.5, round: 0, width: 1.07 };
    if (char === "i") return { jaw: 0.23, round: 0, width: 1.12 };
    return { jaw: 0.22, round: 0.1, width: 1 };
  }
  const a = pose(index),
    b = pose(index + 1),
    blend = fraction * fraction * (3 - 2 * fraction);
  return {
    jaw: a.jaw + (b.jaw - a.jaw) * blend,
    round: a.round + (b.round - a.round) * blend,
    width: a.width + (b.width - a.width) * blend,
  };
}
