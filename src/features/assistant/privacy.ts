// Best-effort redaction for pasted error messages, not a substitute for avoiding secrets.
export function redactDiagnosticText(value: string) {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [OCULTO]")
    .replace(
      /(?<![?&\w])(["']?(?:api[_ -]?key|apikey|access[_ -]?token|refresh[_ -]?token|authorization|password|senha|webhook[_ -]?secret|secret|token|key)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi,
      "$1[OCULTO]",
    )
    .replace(/([?&](?:key|token|secret|api_key|access_token|password)=)[^&#\s]+/gi, "$1[OCULTO]")
    .replace(
      /\b(?:sb_(?:secret|publishable)_[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{12,}|astros_[a-f0-9]{40,})\b/gi,
      "[CREDENCIAL OCULTA]",
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g,
      "[SESSÃO OCULTA]",
    )
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[CREDENCIAL]@");
}
export function redactDiagnosticValue(value: unknown): unknown {
  if (typeof value === "string") return redactDiagnosticText(value);
  if (Array.isArray(value)) return value.map(redactDiagnosticValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /^(?:api_?key|access_?token|refresh_?token|authorization|password|senha|secret|webhook_?secret|token)$/i.test(
          k,
        )
          ? "[OCULTO]"
          : redactDiagnosticValue(v),
      ]),
    );
  return value;
}
