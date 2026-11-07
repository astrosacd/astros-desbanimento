// Synthetic visual fixture only. Never imported by an application route.
export const digitalConfig = async () => ({
  installed: true,
  enabled: true,
  version: 1,
  tools: Object.fromEntries(
    [
      "instagram_search",
      "instagram_profile",
      "instagram_followers",
      "linkedin_search",
      "linkedin_profile",
    ].map((id) => [
      id,
      {
        enabled: true,
        unitCents: 10,
        maxQuantity: id.endsWith("_profile") ? 10 : id === "linkedin_search" ? 25 : 50,
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

export const digitalAdminAccessByEmail = digitalStart,
  digitalAdminConfig = digitalStart,
  digitalAdminHistory = digitalStart,
  digitalAdminRefresh = digitalStart,
  digitalAdminSave = digitalStart,
  digitalAdminStatus = digitalStart,
  digitalAdminUsage = digitalStart;
