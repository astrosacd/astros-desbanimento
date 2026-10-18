import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ExternalLink, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prospectAdminConfig, prospectAdminSave, prospectAdminAccount } from "./actions";
import { ProspectRequests } from "./history";
import type { ProspectConfig } from "./types";
export function ProspectingAdmin({ adminId }: { adminId: string }) {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["prospect-admin-config", adminId],
    queryFn: () => prospectAdminConfig(),
    retry: false,
  });
  const [tab, setTab] = useState("settings"),
    [enabled, setEnabled] = useState(false),
    [apiKey, setKey] = useState(""),
    [price, setPrice] = useState("0,00"),
    [days, setDays] = useState(7),
    [daily, setDaily] = useState(5),
    [calls, setCalls] = useState(20),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [account, setAccount] = useState<{
      plan: string;
      remaining: number;
      used: number;
      monthly: number;
    } | null>(null);
  useEffect(() => {
    if (!query.data) return;
    const s = query.data as ProspectConfig;
    setEnabled(s.enabled);
    setPrice((s.unitCents / 100).toFixed(2).replace(".", ","));
    setDays(s.cacheDays ?? 7);
    setDaily(s.dailyRequests ?? 5);
    setCalls(s.dailyCalls ?? 20);
  }, [query.data]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!/^\d{1,3}([.,]\d{1,2})?$/.test(price)) {
      setError("Informe o preço em reais, com até duas casas decimais.");
      return;
    }
    setBusy(true);
    try {
      await prospectAdminSave({
        data: {
          enabled,
          unitCents: Math.round(Number(price.replace(",", ".")) * 100),
          cacheDays: days,
          dailyRequests: daily,
          dailyCalls: calls,
          apiKey,
        },
      });
      setKey("");
      setMessage("Configuração de prospecção salva.");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["prospect-admin-config", adminId] }),
        cache.invalidateQueries({ queryKey: ["prospect-config"] }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  async function consult() {
    setBusy(true);
    setError("");
    try {
      setAccount(await prospectAdminAccount());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível consultar a cota.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="prospect-page">
      <header className="prospect-heading">
        <div>
          <span className="eyebrow">PROSPECÇÃO / ADMINISTRAÇÃO</span>
          <h2>Empresas e oportunidades</h2>
          <p>Integração, preço por lead e controle de consumo.</p>
        </div>
        <Search size={26} />
      </header>
      <nav className="prospect-tabs" aria-label="Administração da prospecção">
        {[
          ["settings", "Configurações"],
          ["requests", "Buscas dos clientes"],
        ].map(([id, label]) => (
          <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id!)}>
            {label}
          </button>
        ))}
      </nav>
      <div hidden={tab !== "settings"}>
        <section className="prospect-card">
          <header className="prospect-section-heading">
            <div>
              <h2>Integração SerpApi</h2>
              <p>A chave fica privada. Os clientes não têm acesso à API do fornecedor.</p>
            </div>
            <KeyRound size={22} />
          </header>
          {query.isPending ? (
            <p role="status">Consultando configuração…</p>
          ) : query.isError ? (
            <p role="alert" className="error-text">
              {query.error.message}
            </p>
          ) : (
            <form onSubmit={save}>
              <fieldset disabled={busy} className="prospect-admin-form">
                <label className="prospect-full">
                  Chave de API da SerpApi
                  <input
                    className="field"
                    type="password"
                    autoComplete="new-password"
                    value={apiKey}
                    onChange={(e) => setKey(e.target.value)}
                    maxLength={200}
                    placeholder={
                      query.data?.hasKey
                        ? "Chave salva. Deixe vazio para manter."
                        : "Cole sua chave de API"
                    }
                  />
                </label>
                <a
                  className="prospect-provider-link prospect-full"
                  href="https://serpapi.com/manage-api-key"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir minha chave na SerpApi
                  <ExternalLink size={14} />
                </a>
                <div className="prospect-full prospect-form-divider">
                  <h3>Venda e limites</h3>
                  <p>
                    O preço é cobrado por lead novo efetivamente entregue, usando a carteira
                    compartilhada.
                  </p>
                </div>
                <label>
                  Preço por lead entregue (R$)
                  <input
                    className="field"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                  />
                  <small>
                    0,00 permite testes gratuitos. O cliente vê o máximo antes de confirmar.
                  </small>
                </label>
                <label>
                  Validade da base compartilhada (dias)
                  <input
                    className="field"
                    type="number"
                    min={1}
                    max={30}
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                    required
                  />
                  <small>
                    Depois desse prazo, a busca volta a consultar a origem. O histórico individual é
                    preservado.
                  </small>
                </label>
                <label>
                  Buscas por conta por dia
                  <input
                    className="field"
                    type="number"
                    min={1}
                    max={100}
                    value={daily}
                    onChange={(e) => setDaily(Number(e.target.value))}
                    required
                  />
                  <small>
                    Inclui buscas concluídas e tentativas não concluídas. Dia no horário de
                    Fortaleza.
                  </small>
                </label>
                <label>
                  Máximo de pesquisas na SerpApi por dia
                  <input
                    className="field"
                    type="number"
                    min={1}
                    max={5000}
                    value={calls}
                    onChange={(e) => setCalls(Number(e.target.value))}
                    required
                  />
                  <small>
                    Limite compartilhado por toda a aplicação. Uma pesquisa pode retornar várias
                    empresas.
                  </small>
                </label>
                <label className="prospect-checkbox prospect-full">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  Liberar novas buscas para os clientes
                </label>
              </fieldset>
              <p className="prospect-help">
                Cada busca entrega até 20 leads. A mesma empresa pode atender contas diferentes, mas
                não é entregue novamente como novo lead à mesma conta. O módulo usa primeiro os
                resultados válidos da base e consulta novas páginas quando necessário, dentro dos
                limites.
              </p>
              <Button type="submit" disabled={busy}>
                {busy ? "Salvando…" : "Salvar configuração"}
              </Button>
            </form>
          )}
        </section>
        <section className="prospect-card mt-5">
          <header className="prospect-section-heading">
            <div>
              <h2>Consultas disponíveis no fornecedor</h2>
              <p>Consulta manual da cota atual da SerpApi, sem expor a chave.</p>
            </div>
            <Button variant="outline" disabled={busy || !query.data?.hasKey} onClick={consult}>
              <RefreshCw size={16} />
              Consultar cota
            </Button>
          </header>
          {account ? (
            <div className="prospect-quota">
              <div>
                <span>Plano</span>
                <strong>{account.plan || "Não informado"}</strong>
              </div>
              <div>
                <span>Consultas restantes</span>
                <strong>{account.remaining.toLocaleString("pt-BR")}</strong>
              </div>
              <div>
                <span>Uso neste mês</span>
                <strong>{account.used.toLocaleString("pt-BR")}</strong>
              </div>
            </div>
          ) : (
            <p className="prospect-help">Clique em Consultar cota para conferir os dados atuais.</p>
          )}
          <a
            className="prospect-provider-link"
            href="https://serpapi.com/manage-account"
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir conta na SerpApi
            <ExternalLink size={14} />
          </a>
        </section>
      </div>
      {tab === "requests" && <ProspectRequests adminId={adminId} />}{" "}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-primary">
          {message}
        </p>
      )}
    </div>
  );
}
