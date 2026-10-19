/** Display supplier values verbatim; absent/invalid values are never guessed. */
export function accountCount(value: unknown): string {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value.toLocaleString("pt-BR")
    : "Não informado";
}
