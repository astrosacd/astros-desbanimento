import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DigitalResearchPage, ResearchDetails } from "../../src/features/digital-research/page";
import "../../src/features/panel/polish.css";
import "./preview.css";
import { Settings } from "../../src/features/digital-research/admin";
const profile = {
  username: "clinica.exemplo",
  name: "Clínica Exemplo",
  url: "https://www.instagram.com/clinica.exemplo/",
  biography:
    "Dados sintéticos para verificar o layout. Odontologia e cuidados com o sorriso em Fortaleza.",
  website: "https://example.com",
  email: "contato@example.com",
  phone: "",
  followers: 2300,
  following: 250,
  posts: 180,
  private: false,
  verified: false,
  about: { country: "Brasil", date_joined: "May 2020", former_usernames: 0 },
  address: "Endereço público sintético",
  hasChannel: false,
  instagramId: "12345678901234567890",
  recentPosts: [
    {
      url: "https://www.instagram.com/p/Synthetic1/",
      publishedAt: "2026-10-27T12:00:00Z",
      caption: "Publicação sintética para conferir a atividade recente.",
      likes: 0,
      comments: 2,
    },
  ],
  relatedProfiles: [{ username: "clinica.relacionada", name: "Clínica relacionada" }],
};
const linkedin = new URLSearchParams(location.search).has("linkedin");
const detail = linkedin || new URLSearchParams(location.search).has("results");
const admin = new URLSearchParams(location.search).has("admin");
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <main className="digital-preview content" data-preview-ready>
      {admin ? (
        <div className="digital-research">
          <Settings
            config={{
              installed: true,
              enabled: false,
              pilot: true,
              version: 1,
              dailyRequests: 3,
              dailyUsdCents: 100,
              concurrency: 1,
              tools: {
                linkedin_search: { enabled: false, unitCents: 0, maxQuantity: 10, maxUsdCents: 20 },
                linkedin_profile: { enabled: false, unitCents: 0, maxQuantity: 5, maxUsdCents: 20 },
                instagram_search: {
                  enabled: false,
                  unitCents: 0,
                  maxQuantity: 20,
                  maxUsdCents: 20,
                },
                instagram_profile: {
                  enabled: false,
                  unitCents: 0,
                  maxQuantity: 10,
                  maxUsdCents: 20,
                },
                instagram_followers: {
                  enabled: false,
                  unitCents: 0,
                  maxQuantity: 50,
                  maxUsdCents: 30,
                },
              },
            }}
            busy={false}
            saveError=""
            message=""
            onSave={() => {}}
          />
        </div>
      ) : (
        <DigitalResearchPage userId="synthetic-account" />
      )}
      {detail && (
        <ResearchDetails
          row={{
            id: "22222222-2222-4222-8222-222222222222",
            tool: linkedin ? "linkedin_profile" : "instagram_profile",
            query: linkedin ? "pessoa-exemplo" : "clinica.exemplo",
            quantity: 1,
            state: "completed",
            reserved_cents: 10,
            charged_cents: 10,
            delivered: 1,
            created_at: "2026-10-28T12:00:00Z",
            rows: [
              linkedin
                ? {
                    ...profile,
                    username: "linkedin:pessoa-exemplo",
                    name: "Pessoa Exemplo",
                    url: "https://www.linkedin.com/in/pessoa-exemplo",
                    email: "",
                    phone: "",
                    linkedin: {
                      identifier: "pessoa-exemplo",
                      headline: "Gerência comercial e desenvolvimento de negócios",
                      location: "Fortaleza, Ceará",
                      experience: [{ position: "Gerente comercial", company: "Empresa Exemplo" }],
                      education: [{ school: "Universidade Exemplo", degree: "Administração" }],
                    },
                  }
                : profile,
            ],
          }}
          onClose={() => {}}
          onRefresh={() => {}}
          busy={false}
        />
      )}
    </main>
  </QueryClientProvider>,
);
