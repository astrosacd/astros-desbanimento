// Synthetic, deliberately bounded data. Unknown actions fail closed; no network implementation.
const tools = Object.fromEntries(
  ["instagram_search", "instagram_profile", "instagram_followers"].map((id) => [
    id,
    { enabled: true, unitCents: 10, maxQuantity: 10, maxUsdCents: 20 },
  ]),
);
const empty = {
  summary: { total: 0, completed: 0, processing: 0, review: 0, failed: 0 },
  orders: [],
  items: [],
  rows: [],
  requests: [],
  leads: [],
  events: [],
  hasMore: false,
  count: 0,
  total: 0,
  page: 1,
  pageSize: 10,
};
export async function fixtureAction(name: string, args?: any): Promise<any> {
  (window as any).__fixtureCalls ??= [];
  (window as any).__fixtureCalls.push(name);
  switch (name) {
    case "getMyModules":
      return {
        modules: ["desbanimento", "sms", "social", "prospecting", "digital"].map((module) => ({
          module,
          enabled: true,
          message: "",
        })),
      };
    case "getWallet":
      return { balanceCents: 12345, orders: [], movements: [] };
    case "getPaymentPrices":
    case "getAdminPrices":
      return {
        servicePriceCents: 2000,
        feeCents: 2000,
        submissionCents: 2000,
        minimumEnabled: false,
        minimumRechargeCents: 1000,
      };
    case "getClientCountries":
      return [];
    case "getClientNotice":
      return { active: false };
    case "getClientNotices":
    case "clientUpdates":
    case "searchSubmissionHistory":
    case "smsHistory":
    case "socialHistory":
    case "digitalHistory":
    case "digitalCollections":
    case "prospectHistory":
    case "prospectRequests":
    case "prospectLeads":
    case "getActivities":
    case "getFollowups":
      return empty;
    case "getSubmissionHistory":
      return [];
    case "cnpjHistory":
      return empty;
    case "getOverviewBanner":
      return { banner: null, serverNow: Date.now() };
    case "listNumbers":
      return { ...empty, rows: [] };
    case "getBanner":
    case "getClientBanner":
      return { enabled: false };
    case "digitalConfig":
      return { installed: true, enabled: true, version: 1, tools };
    case "digitalAdminConfig":
      return {
        installed: true,
        enabled: true,
        pilot: false,
        version: 1,
        dailyRequests: 50,
        dailyUsdCents: 1000,
        concurrency: 5,
        tools,
      };
    case "smsCatalog":
      return {
        available: true,
        services: [{ id: "wa", name: "WhatsApp" }],
        countries: [{ id: "br", name: "Brasil" }],
      };
    case "socialPlatforms":
      return { platforms: [{ id: "instagram", name: "Instagram" }] };
    case "socialCatalogFacets":
      return { groups: [{ network: "instagram", kind: "views", category: "Original", count: 1 }] };
    case "socialCatalog":
      return {
        available: true,
        services: [
          {
            id: 1,
            title: "Visualizações de vídeo com descrição longa de demonstração",
            network: "instagram",
            serviceType: "views",
            category: "Original",
            description: "Condições sintéticas para conferir organização e quebra de texto.",
            minimum: 100,
            maximum: 10000,
            refill: false,
            cancel: true,
          },
        ],
      };
    case "prospectConfig":
      return { enabled: true, unitCents: 10, maxQuantity: 20 };
    case "prospectDailyQuota":
      return {
        limit: 10,
        used: 2,
        remaining: 8,
        serverNow: new Date().toISOString(),
        resetsAt: new Date(Date.now() + 3600000).toISOString(),
      };
    case "prospectCities":
      return { cities: [{ id: "2304400", name: "Fortaleza" }] };
    case "getSignupProtection":
      return { enabled: false, siteKey: "" };
    case "getApiStatus":
      return { enabled: true, hasKey: false };
    case "getSupportSettings":
      return { enabled: false };
    case "getAffiliation":
      return {
        enabled: true,
        origin: "https://example.com",
        code: "a".repeat(32),
        rateBps: 1000,
        referrals: 0,
        creditedCents: 0,
        reversedCents: 0,
        availableCents: 0,
        pendingCents: 0,
        events: [],
        referralCode: "a".repeat(32),
        referralUrl: "https://example.com/cadastro?ref=" + "a".repeat(32),
      };
    case "getAdminModules":
      return {
        installed: true,
        modules: ["desbanimento", "sms", "social", "prospecting", "digital"].map((module) => ({
          module,
          globalEnabled: true,
          clientEnabled: true,
          message: "",
        })),
      };
    case "getAffiliateSettings":
      return {
        enabled: true,
        rateBps: 3000,
        minimumCents: 0,
        maximumCents: 0,
        pendingCount: 0,
        errorCount: 0,
        workerAt: null,
      };
    case "getAdminCountries":
      return [];
    case "getPanelAddress":
      return { origin: "https://example.com" };
    case "getPaymentSettings":
      return {
        enabled: false,
        liveMode: false,
        hasToken: false,
        hasSecret: false,
        hasPublicKey: false,
        webhookUrl: "https://example.com/api/" + "endereco-de-demonstracao".repeat(12),
      };
    case "getAdminSupportSettings":
      return {
        enabled: false,
        title: "Atendimento de demonstração",
        description: "Configuração sintética para revisão visual.",
        accountId: null,
        baseUrl: "",
        websiteToken: "",
      };
    case "getAdminSupportWhatsapp":
      return { phone: "", enabled: false, links: [] };
    case "getAdminApiLogs":
    case "getAdminNotices":

    case "getPaymentHistory":
    case "adminUpdates":
    case "digitalAdminHistory":
      return empty;
    case "getAdminSubmissionHistory":
      return {
        ...empty,
        total: 1,
        summary: { total: 1, completed: 1, processing: 0, review: 0, failed: 0 },
        rows: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            number: "5585999999999",
            email: "cliente-com-endereco-longo-de-demonstracao@example.com",
            kind: "new",
            state: "completed",
            amountCents: 2000,
            createdAt: "2026-11-06T12:00:00Z",
            updatedAt: "2026-11-06T12:00:00Z",
          },
        ],
      };
    case "getAdminSubmissions":
      return [];
    case "getBannerHistory":
      return empty;
    case "smsAdminSettings":
      return {
        enabled: true,
        hasKey: true,
        workerReady: true,
        fxMode: "manual",
        usdBrlUnits: 55000,
        marginBps: 5000,
        feeCents: 100,
      };
    case "smsProviders":
      return {
        supplier: "smspool",
        enabled: true,
        workerReady: true,
        hasFiveKey: true,
        fiveFx: 1000,
        fiveMargin: 5000,
        fiveFee: 0,
      };
    case "socialAdminSettings":
      return {
        enabled: true,
        hasKey: true,
        workerReady: true,
        fxUnits: 55000,
        marginBps: 5000,
        feeCents: 0,
      };
    case "prospectAdminConfig":
      return {
        enabled: true,
        unitCents: 10,
        maxQuantity: 20,
        cacheDays: 7,
        dailyRequests: 5,
        dailyCalls: 20,
        hasKey: true,
      };
    case "digitalAdminUsage":
      return {
        reservedUsdCents: 0,
        pending: 0,
        review: 0,
        reservedCents: 0,
        chargedCents: 0,
        delivered: 0,
      };
    case "getStatusAdmin": {
      const keys = [
        "panel",
        "auth",
        "desbanimento",
        "sms",
        "social",
        "prospect_maps",
        "prospect_cnpj",
      ];
      return {
        public: {
          generatedAt: new Date().toISOString(),
          components: keys.map((key) => ({
            key,
            label: key,
            status: "operational",
            source: "automatic",
            message: "",
            checkedAt: new Date().toISOString(),
          })),
          events: [],
        },
        settings: keys.map((key) => ({
          key,
          label: key,
          automatic: "operational",
          checked_at: new Date().toISOString(),
          diagnostic: "ok",
          manual: null,
          message: "",
          expires_at: null,
        })),
      };
    }
    case "getFinancialReport": {
      const totals = {
        debitsCents: 0,
        refundsCents: 0,
        netCents: 0,
        paidCount: 0,
        freeCount: 0,
        completedSalesCents: 0,
        openCents: 0,
        completedCount: 0,
        knownCostCents: 0,
        knownGainCents: 0,
        missingCostCount: 0,
        deliveredCount: 0,
      };
      return {
        ...totals,
        from: args.data.from,
        until: args.data.until,
        generatedAt: new Date().toISOString(),
        receivedCents: 0,
        paymentRefundsCents: 0,
        netReceiptsCents: 0,
        manualCreditsCents: 0,
        manualReversalsCents: 0,
        unclassifiedCount: 0,
        currentBalanceCents: 12345,
        desban: totals,
        sms: totals,
        social: totals,
        prospect: totals,
        digital: totals,
        daily: [{ date: args.data.until, receivedCents: 0, consumedCents: 0, returnedCents: 0 }],
      };
    }
    default:
      (window as any).__fixtureUnsupported ??= [];
      (window as any).__fixtureUnsupported.push(name);
      throw Error("Prévia isolada: ação não configurada (" + name + ").");
  }
}

export const research = {
  id: "22222222-2222-4222-8222-222222222222",
  tool: "instagram_profile",
  query: "clinica.exemplo",
  quantity: 1,
  state: "completed",
  reserved_cents: 10,
  charged_cents: 10,
  delivered: 1,
  created_at: "2026-11-06T12:00:00Z",
  rows: [
    {
      username: "clinica.exemplo",
      name: "Clínica de demonstração com nome e especialidades extensos",
      instagramId: "12345678901234567890",
      url: "https://www.instagram.com/clinica.exemplo/",
      biography: "Informação sintética. " + "Atendimento e serviços de demonstração. ".repeat(15),
      website: "https://example.com/" + "caminho-longo".repeat(15),
      email: "contato-de-demonstracao@example.com",
      phone: "+5585999999999",
      followers: 1000000,
      following: 2000,
      posts: 3200,
      private: false,
      verified: true,
      about: { country: "Brasil", date_joined: "May 2020", former_usernames: 0 },
      address: "Endereço público sintético",
      hasChannel: false,
      recentPosts: Array.from({ length: 4 }, (_, i) => ({
        url: "https://www.instagram.com/p/Synthetic" + i + "/",
        publishedAt: "2026-11-05T12:00:00Z",
        caption: "Texto de demonstração para avaliar a expansão da legenda e a rolagem. ".repeat(
          30,
        ),
        likes: 0,
        comments: 2,
        type: "Video",
      })),
      relatedProfiles: [
        { username: "clinica.relacionada", name: "Clínica relacionada de demonstração" },
      ],
    },
  ],
};
