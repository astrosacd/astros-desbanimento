// Only definite pre-dispatch rejections may release the local pending UUID.
export function cnpjRejection(message: string): string | null {
  if (message === "Limite diário de consultas CNPJ atingido") return "Você atingiu o limite diário de consultas CNPJ desta conta. Aguarde a renovação diária. Pesquisas, consultas e atualizações cadastrais usam esse limite.";
  if (["Limite de consultas CNPJ ao fornecedor atingido", "Busca CNPJ temporariamente indisponível", "Consulta complementar indisponível"].includes(message)) return "As consultas estão temporariamente indisponíveis. Tente novamente mais tarde.";
  if (["Saldo insuficiente. Faça uma recarga", "Consulte o preço CNPJ novamente", "Filtros CNPJ inválidos", "Lead CNPJ não encontrado", "Informe um CNPJ numérico válido.", "Confira a consulta CNPJ em andamento", "Esta pesquisa CNPJ já está em andamento"].includes(message)) return message;
  return null;
}
export const cnpjMissingRequest = "Esta tentativa não foi registrada. Você pode iniciar uma nova consulta.";
