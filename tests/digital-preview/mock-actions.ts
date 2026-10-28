// Synthetic visual fixture only. Never imported by an application route.
export const digitalConfig = async () => ({
  installed: true,
  enabled: true,
  version: 1,
  tools: Object.fromEntries(
    ["instagram_search", "instagram_profile", "instagram_followers"].map((id) => [
      id,
      {
        enabled: true,
        unitCents: 10,
        maxQuantity: id === "instagram_profile" ? 10 : 50,
        maxUsdCents: 20,
      },
    ]),
  ),
});
export const digitalHistory = async () => ({ rows: [] });
export const digitalCollections = async () => ({ rows: [] });
export const digitalStart = async () => {
  throw Error("Esta prévia não executa pesquisas.");
};
export const digitalStatus = digitalStart,
  digitalRefresh = digitalStart,
  digitalSave = digitalStart,
  digitalUnsave = digitalStart;
