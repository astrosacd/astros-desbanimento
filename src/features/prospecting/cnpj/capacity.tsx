import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ExternalLink, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cnpjAdminConfig, cnpjAdminBalance } from "../actions";
type Credits = {
  total: number;
  lots: { id: string; value: number | null; createdAt: string | null; expiresAt: string | null }[];
  fetchedAt: string;
};
const number = (v: number | null | undefined) =>
  typeof v !== "number" || !Number.isFinite(v) ? "Não informado" : v.toLocaleString("pt-BR", { maximumFractionDigits: 20 });
export function creditDate(v: string | null) {
  if (!v) return "Não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(v.includes("T") ? { timeStyle: "short" } : {}),
    timeZone: "America/Fortaleza",
  }).format(new Date(v.includes("T") ? v : v + "T12:00:00Z"));
}
export function CnpjCapacity({
  adminId,
  onSettings,
  onHistory,
}: {
  adminId: string;
  onSettings: () => void;
  onHistory: () => void;
}) {
  const config = useQuery({
    queryKey: ["cnpj-admin-config", adminId],
    queryFn: () => cnpjAdminConfig(),
    retry: false,
  });
  const saved = config.data as
    | {
        hasKey: boolean;
        dailyRequests: number;
        dailyCalls: number;
        minuteCalls: number;
        cacheDays: number;
      }
    | undefined;
  const balance = useQuery({
    queryKey: ["cnpj-provider-balance", adminId],
    queryFn: () => cnpjAdminBalance(),
    enabled: saved?.hasKey === true,
    staleTime: 60000,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const value = balance.data as Credits | undefined;
  return (
    <section className="prospect-card cnpj-capacity">
      <header className="prospect-section-heading">
        <div>
          <span className="eyebrow">CNPJ / CASA DOS DADOS</span>
          <h2>Créditos e validade</h2>
          <p>
            Saldo total e lotes retornados pela API do fornecedor. Valores em créditos, sem
            conversão para reais.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!saved?.hasKey || balance.isFetching}
          onClick={() => void balance.refetch()}
        >
          <RefreshCw size={16} />
          {balance.isFetching ? "Consultando…" : "Atualizar créditos"}
        </Button>
      </header>
      {config.isPending ? (
        <p role="status">Conferindo a integração CNPJ…</p>
      ) : config.isError ? (
        <div role="alert" className="prospect-notice">
          <p>Não foi possível conferir a configuração CNPJ.</p>
          <Button variant="outline" onClick={() => void config.refetch()}>
            Verificar configuração
          </Button>
        </div>
      ) : !saved?.hasKey ? (
        <div className="prospect-notice">
          <strong>Configure a integração CNPJ</strong>
          <p>Cadastre a chave da Casa dos Dados para consultar o saldo real.</p>
          <Button variant="outline" onClick={onSettings}>
            Configurar CNPJ
          </Button>
        </div>
      ) : (
        <>
          {balance.isError && (
            <p role="alert" className="prospect-notice">
              {balance.error instanceof Error
                ? balance.error.message
                : "Não foi possível atualizar o saldo."}{" "}
              {value
                ? "Os valores abaixo são da última consulta confirmada."
                : "Nenhum saldo foi confirmado; isso não significa saldo zero."}
            </p>
          )}
          {!value && balance.isPending && <p role="status">Consultando saldo na Casa dos Dados…</p>}
          {value && (
            <>
              <div
                className="prospect-quota cnpj-credit-summary"
                aria-label="Créditos informados pela Casa dos Dados"
              >
                <div>
                  <span>
                    <Coins size={16} aria-hidden="true" /> Saldo total informado
                  </span>
                  <strong>{number(value.total)}</strong>
                  <small>Créditos do fornecedor</small>
                </div>
                <div>
                  <span>Lotes retornados</span>
                  <strong>{value.lots.length}</strong>
                  <small>Detalhamento recebido nesta consulta</small>
                </div>
                <div>
                  <span>Última consulta confirmada</span>
                  <strong className="cnpj-credit-time">{creditDate(value.fetchedAt)}</strong>
                  <small>Atualiza a cada minuto enquanto esta tela está aberta.</small>
                </div>
              </div>
              {value.total === 0 && (
                <p role="status" className="prospect-notice">
                  A API informou saldo total zero. Confira seus créditos na Casa dos Dados antes de
                  realizar novas consultas externas.
                </p>
              )}
              <section className="cnpj-credit-lots">
                <header>
                  <h3>Lotes de créditos</h3>
                  <p>
                    Criação e vencimento são datas dos créditos; não representam datas de pagamento
                    ou de cobrança.
                  </p>
                </header>
                {!value.lots.length ? (
                  <p className="prospect-empty">
                    A API não retornou lotes detalhados nesta consulta.
                  </p>
                ) : (
                  <div className="cnpj-credit-lot-list">
                    {value.lots.map((lot, index) => (
                      <article key={lot.id || index}>
                        <header>
                          <strong>Lote {index + 1}</strong>
                          {lot.expiresAt &&
                            Date.parse(lot.expiresAt) <= Date.parse(value.fetchedAt) && (
                              <span className="prospect-badge">Vencido</span>
                            )}
                        </header>
                        <dl>
                          <div>
                            <dt>Créditos informados</dt>
                            <dd>{number(lot.value)}</dd>
                          </div>
                          <div>
                            <dt>Criado em</dt>
                            <dd>{creditDate(lot.createdAt)}</dd>
                          </div>
                          <div>
                            <dt>Vence em</dt>
                            <dd>{creditDate(lot.expiresAt)}</dd>
                          </div>
                        </dl>
                        <details>
                          <summary>Identificação do lote</summary>
                          <code>{lot.id || "Não informada"}</code>
                        </details>
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <p className="prospect-help">
                Este saldo pertence à Casa dos Dados, separado da carteira dos clientes. Não
                estimamos quantas empresas ele permitirá consultar nem calculamos o saldo total
                somando lotes.
              </p>
            </>
          )}
        </>
      )}
      {saved && (
        <section className="cnpj-local-limits">
          <header>
            <span className="eyebrow">CONFIGURAÇÃO DA APLICAÇÃO</span>
            <h3>Limites internos de proteção</h3>
            <p>
              Valores salvos no admin. Não são limites de requisição informados pela API da Casa dos
              Dados.
            </p>
          </header>
          <dl>
            <div>
              <dt>Consultas por conta / dia</dt>
              <dd>{number(saved.dailyRequests)}</dd>
            </div>
            <div>
              <dt>Chamadas aos fornecedores / dia</dt>
              <dd>{number(saved.dailyCalls)}</dd>
            </div>
            <div>
              <dt>Chamadas Casa dos Dados / minuto</dt>
              <dd>{number(saved.minuteCalls)}</dd>
            </div>
            <div>
              <dt>Validade da base CNPJ</dt>
              <dd>{typeof saved.cacheDays === "number" ? `${saved.cacheDays} dias` : "Não informada"}</dd>
            </div>
          </dl>
          <div className="prospect-outreach-actions">
            <Button variant="outline" onClick={onSettings}>
              Editar configuração CNPJ
            </Button>
            <Button variant="outline" onClick={onHistory}>
              Ver histórico CNPJ
            </Button>
          </div>
        </section>
      )}
      <div className="prospect-policy-grid">
        <div>
          <h3>Base primeiro</h3>
          <p>
            As buscas aproveitam resultados válidos salvos para os mesmos filtros antes de consultar
            novas páginas.
          </p>
        </div>
        <div>
          <h3>Sem repetição na conta</h3>
          <p>O mesmo CNPJ não é entregue novamente como um novo lead ao mesmo cliente.</p>
        </div>
        <div>
          <h3>Fontes separadas</h3>
          <p>
            A base CNPJ e o Google Maps são independentes. Atualização cadastral é uma ação
            explícita, sem compra repetida do lead.
          </p>
        </div>
      </div>
      <a
        className="prospect-provider-link"
        href="https://portal.casadosdados.com.br/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Abrir Casa dos Dados
        <ExternalLink size={14} />
      </a>
    </section>
  );
}
