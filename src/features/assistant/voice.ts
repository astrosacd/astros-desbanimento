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
    .replace(/\p{Regional_Indicator}{2}/gu, "")
    .replace(
      /\p{Extended_Pictographic}(?:[\uFE0E\uFE0F\u200D\p{Emoji_Modifier}\p{Extended_Pictographic}])*/gu,
      "",
    )
    .replace(/[0-9#*]\uFE0F?\u20E3/gu, "")
    .replace(/:[a-z][a-z0-9_+-]*:/gi, "")
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
    .replace(/US\$\s*(\d[\d.,]*\d|\d)/g, (_, v) => moneySpeech(v, "dólar", "dólares"))
    .replace(/R\$\s*(\d[\d.,]*\d|\d)/g, (_, v) => moneySpeech(v, "real", "reais"))
    .replace(/\b(\d+),00\s+(reais|dólares)\b/g, "$1 $2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export type Articulation = { jaw: number; round: number; width: number };
function integerSpeech(n: number): string {
  const small = [
    "zero",
    "um",
    "dois",
    "três",
    "quatro",
    "cinco",
    "seis",
    "sete",
    "oito",
    "nove",
    "dez",
    "onze",
    "doze",
    "treze",
    "catorze",
    "quinze",
    "dezesseis",
    "dezessete",
    "dezoito",
    "dezenove",
  ];
  if (n < 20) return small[n]!;
  if (n < 100)
    return (
      [
        "",
        "",
        "vinte",
        "trinta",
        "quarenta",
        "cinquenta",
        "sessenta",
        "setenta",
        "oitenta",
        "noventa",
      ][Math.floor(n / 10)]! + (n % 10 ? " e " + integerSpeech(n % 10) : "")
    );
  if (n === 100) return "cem";
  if (n < 1000)
    return (
      [
        "",
        "cento",
        "duzentos",
        "trezentos",
        "quatrocentos",
        "quinhentos",
        "seiscentos",
        "setecentos",
        "oitocentos",
        "novecentos",
      ][Math.floor(n / 100)]! + (n % 100 ? " e " + integerSpeech(n % 100) : "")
    );
  if (n < 1000000) {
    const k = Math.floor(n / 1000),
      r = n % 1000;
    return (
      (k === 1 ? "mil" : integerSpeech(k) + " mil") +
      (r ? (r < 100 || r % 100 === 0 ? " e " : " ") + integerSpeech(r) : "")
    );
  }
  return String(n);
}
function moneySpeech(raw: string, singular: string, plural: string) {
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 999999) return raw + " " + plural;
  const cents = Math.round(value * 100),
    whole = Math.floor(cents / 100),
    fraction = cents % 100;
  return (
    (whole || !fraction ? integerSpeech(whole) + " " + (whole === 1 ? singular : plural) : "") +
    (fraction
      ? (whole ? " e " : "") + integerSpeech(fraction) + (fraction === 1 ? " centavo" : " centavos")
      : "")
  );
}
