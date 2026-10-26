import {QuickHelp} from "../workspace/help";
import {ModuleNotice,useModuleAccess} from '../module-access/client';
import { categoryLabel } from "./category";
import { SocialNetworkIcon } from "./network-icon";
import { useSocialEstimate, LivePrice, AverageDelivery } from "./live-price";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import { ShoppingCart, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { getWallet } from "../payments/actions";
import { SmsOptionPicker } from "../sms/option-picker";
import { useSecondsLeft, timeLabel } from "../sms/countdown";
import {
  socialPlatforms,
  socialCatalog,
  socialCatalogFacets,
  socialQuote,
  socialBuy,
  socialRelease,
} from "./actions";
import { SocialHistory, SocialOrderDetail } from "./orders";
import { networks, money, type SocialService, type SocialQuote, type Network } from "./types";
import { SocialPreferencesDialog } from "./preferences";
import { ServiceReference } from "./service-reference";
import { emptySocialPreferences, type SocialPreferences } from "./types";
import { DeliveryInformation } from "./delivery";
export function SocialPage() {
 const moduleAccess=useModuleAccess('social');
  const { client } = useRouteContext({ from: "__root__" });
  const cache = useQueryClient();
  const [preferencesOpen, setPreferencesOpen] = useState(false),
    [preferences, setPreferences] = useState<SocialPreferences>({ ...emptySocialPreferences }),
    [tab, setTab] = useState("new"),
    [page, setPage] = useState(0),
    [search, setSearch] = useState(""),
    [applied, setApplied] = useState(""),
    [network, setNetwork] = useState<Network | "all">("all"),
    [serviceType, setServiceType] = useState("all"),
    [category, setCategory] = useState("all"),
    [serviceId, setServiceId] = useState(""),
    [link, setLink] = useState(""),
    [quantity, setQuantity] = useState(""),
    [quote, setQuote] = useState<SocialQuote | null>(null),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [unavailable, setUnavailable] = useState(false),
    [attempted, setAttempted] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<string | null>(null);
  const intent = useRef<{ requestId: string; quoteId: string } | null>(null),
    lock = useRef(false);
  const seconds = useSecondsLeft(quote?.expiresAt);
  const catalog = useQuery({
    queryKey: [
      "social-catalog",
      client?.id,
      applied,
      network,
      serviceType,
      category,
      page,
      preferences,
    ],
    queryFn: () =>
      socialCatalog({
        data: {
          page,
          preferences,
          search: applied,
          network,
          state: "all",
          serviceType,
          category: category === "all" ? "" : category,
        },
      }),
    retry: false,
    staleTime: 30000,
  });
  const platformQuery = useQuery({
    queryKey: ["social-platforms", false, client?.id],
    queryFn: () => socialPlatforms({ data: { admin: false } }),
    retry: false,
    staleTime: 30000,
  });
  const networkOptions: Array<{ id: string; name: string }> = platformQuery.data?.platforms ?? [];
  const wallet = useQuery({
    queryKey: ["social-wallet", client?.id],
    queryFn: () => getWallet(),
    refetchInterval: 15000,
  });
  const services: SocialService[] = catalog.data?.services ?? [];
  const facets = useQuery({
    queryKey: ["social-facets", client?.id],
    queryFn: () => socialCatalogFacets(),
    retry: false,
    staleTime: 60000,
  });
  const groups: Array<{ network: string; kind: string; category: string; count: number }> =
    facets.data?.groups ?? [];
  const typeOptions = [
    ...new Set(groups.filter((g) => network === "all" || g.network === network).map((g) => g.kind)),
  ];
  const categories = [
    ...new Set(
      groups
        .filter(
          (g) =>
            (network === "all" || g.network === network) &&
            (serviceType === "all" || g.kind === serviceType),
        )
        .map((g) => g.category),
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const list = services.filter(
    (s) =>
      (network === "all" || s.network === network) &&
      (serviceType === "all" || s.serviceType === serviceType) &&
      (category === "all" || s.category === category),
  );
  const service = list.find((s) => String(s.id) === serviceId);
  async function consult() {
    if (!service || lock.current) return;
    if (
      !/^\d+$/.test(quantity) ||
      !Number.isSafeInteger(Number(quantity)) ||
      Number(quantity) < service.minimum ||
      Number(quantity) > Math.min(service.maximum, 100000000)
    ) {
      setError(
        `Informe uma quantidade inteira entre ${service.minimum.toLocaleString("pt-BR")} e ${Math.min(service.maximum, 100000000).toLocaleString("pt-BR")}.`,
      );
      return;
    }
    lock.current = true;
    setUnavailable(false);
    setBusy(true);
    setError("");
    try {
      const q = await socialQuote({
        data: { serviceId: service.id, link, quantity: Number(quantity) },
      });
      setQuote(q);
      intent.current = { quoteId: q.id, requestId: crypto.randomUUID() };
      setAttempted(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível consultar.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function buy() {
    if (!quote || !intent.current || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setAttempted(true);
    try {
      const r = await socialBuy({ data: intent.current });
      setSelected(r.order.id);
      setQuote(null);
      intent.current = null;
      setConfirm(false);
      setAttempted(false);
      void cache.invalidateQueries({ queryKey: ["social-history"] });
      void cache.invalidateQueries({ queryKey: ["social-wallet"] });
      void cache.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Não foi possível confirmar. Verifique a mesma tentativa.";
      if (
        message ===
        "Redes sociais está temporariamente indisponível. Nenhum valor foi descontado nesta tentativa."
      ) {
        setAttempted(false);
        setConfirm(false);
        setQuote(null);
        intent.current = null;
        setUnavailable(true);
        setError("");
      } else setError(message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function reset() {
    if (!intent.current) {
      setQuote(null);
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (attempted) {
        const r = await socialRelease({ data: intent.current });
        if (r.order) setSelected(r.order.id);
        else if (!r.released) throw Error("Mantenha a mesma tentativa até confirmar o resultado.");
      }
      setQuote(null);
      intent.current = null;
      setAttempted(false);
      setConfirm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível confirmar.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const preferenceActive = JSON.stringify(preferences) !== JSON.stringify(emptySocialPreferences);
  const filterCount =
    Number(network !== "all") +
    Number(serviceType !== "all") +
    Number(category !== "all") +
    Number(preferenceActive);
  function searchAll() {
    setPage(0);
    setApplied(search.trim());
    setNetwork("all");
    setServiceType("all");
    setCategory("all");
    setPreferences({ ...emptySocialPreferences });
    setServiceId("");
    setError("");
  }
  function clearCatalog() {
    setSearch("");
    setApplied("");
    setNetwork("all");
    setServiceType("all");
    setCategory("all");
    setPreferences({ ...emptySocialPreferences });
    setPage(0);
    setServiceId("");
    setError("");
  }
  const catalogReady =
    !!applied || (network !== "all" && serviceType !== "all" && category !== "all");
  const estimate = useSocialEstimate(service, quantity, client?.id, quote, unavailable);
  const livePriceProps = {
    ...estimate,
    balance: wallet.data?.balanceCents,
    quantity,
    confirmed: !!quote,
  };
  const insufficient =
    !!quote && !!wallet.data && wallet.data.balanceCents < quote.priceCents && !attempted;
  return (
    <div className="social-page social-client-page">
      <header className="social-page-heading social-client-heading">
        <div>
          <span className="eyebrow">ASTROS MAIS / REDES SOCIAIS</span>
          <h1>Redes sociais</h1>
          <p>Escolha um serviço, confira o valor e acompanhe seus pedidos.</p>
        </div>
        <div className="sms-balance social-client-wallet">
          <Wallet size={20} />
          <div>
            <span>Saldo disponível</span>
            <strong>{wallet.data ? money(wallet.data.balanceCents) : "Consultando…"}</strong>
          </div>
          <Button asChild variant="outline">
            <Link to="/carteira">Recarregar</Link>
          </Button>
        </div>
      </header>
      <QuickHelp module="social"/><ModuleNotice module="social"/><Tabs value={tab} onValueChange={setTab}>
        <TabsList className="social-tabs" aria-label="Redes sociais">
          <TabsTrigger value="new">Novo pedido</TabsTrigger>
          <TabsTrigger value="orders">Meus pedidos</TabsTrigger>
        </TabsList>
        <TabsContent value="new" forceMount hidden={tab !== "new"}>
          {moduleAccess.blocked&&!attempted?<p className="notice">Novos pedidos estão indisponíveis. Acesse Meus pedidos para acompanhar os existentes.</p>:<><ol className="social-client-steps" aria-label="Etapas do pedido">
            {[
              ["Escolha o serviço", "Rede, tipo e categoria"],
              ["Confira os detalhes", "Destino e quantidade"],
              ["Confirme o pedido", "Valor antes de comprar"],
            ].map(([label, hint], i) => (
              <li
                key={label}
                aria-current={i === (quote ? 2 : service ? 1 : 0) ? "step" : undefined}
                data-complete={i < (quote ? 2 : service ? 1 : 0)}
              >
                <span>{i + 1}</span>
                <div>
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </div>
              </li>
            ))}
          </ol>
          <div className="social-client-workspace" data-service-selected={!!service || !!quote}>
            <section className="social-card social-client-selection">
              <div className="social-section-heading">
                <div>
                  <span className="eyebrow">01 / CATÁLOGO</span>
                  <h2>Escolha seu serviço</h2>
                  <p>Pesquise pelo nome ou referência, ou escolha rede, tipo e categoria abaixo.</p>
                </div>
              </div>
              {catalog.isPending ? (
                <p role="status">Carregando serviços…</p>
              ) : catalog.isError ? (
                <div role="alert">
                  <p className="error-text">{catalog.error.message}</p>
                  <Button variant="outline" onClick={() => catalog.refetch()}>
                    Tentar novamente
                  </Button>
                </div>
              ) : !catalog.data?.available ? (
                <div className="sms-empty">
                  <h3>Redes sociais em preparação</h3>
                  <p>Os serviços desta área serão disponibilizados após a configuração.</p>
                </div>
              ) : (
                <>
                  <fieldset
                    disabled={busy || !!quote}
                    className="social-fields social-client-catalog-fields"
                  >
                    <div className="social-catalog-search social-client-full-field social-client-primary-search">
                      <label htmlFor="social-search">Pesquisar serviço ou categoria</label>
                      <div>
                        <input
                          className="field"
                          id="social-search"
                          value={search}
                          maxLength={80}
                          placeholder="Ex.: seguidores para Instagram"
                          onChange={(e) => setSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              searchAll();
                            }
                          }}
                        />
                        <Button type="button" onClick={searchAll}>
                          Buscar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setPreferencesOpen(true)}
                        >
                          Preferências
                        </Button>
                      </div>
                      <small>
                        A busca pesquisa todos os serviços liberados e limpa os filtros anteriores.
                        Você também pode navegar pelas etapas abaixo.
                      </small>
                    </div>
                    {(applied || filterCount > 0) && (
                      <div
                        className="social-client-filter-status social-client-full-field"
                        role="status"
                      >
                        <div>
                          {applied && (
                            <span>
                              Pesquisa: <strong>{applied}</strong>
                            </span>
                          )}
                          {network !== "all" && (
                            <span>
                              Rede: {networkOptions.find((p) => p.id === network)?.name || network}
                            </span>
                          )}
                          {serviceType !== "all" && <span>Tipo: {categoryLabel(serviceType)}</span>}
                          {category !== "all" && <span>Categoria: {category}</span>}
                          {preferenceActive && <span>Preferências aplicadas</span>}
                        </div>
                        <Button type="button" variant="ghost" onClick={clearCatalog}>
                          Limpar pesquisa e filtros
                        </Button>
                      </div>
                    )}
                    <div
                      className="social-client-refine social-client-full-field social-guided-catalog"
                      aria-label="Escolha por rede, tipo e categoria"
                    >
                      <div className="social-refine-heading">
                        <strong>Ou escolha por etapas</strong>
                        <span>As opções seguintes acompanham sua seleção.</span>
                      </div>
                      <div className="social-guided-step">
                        <span className="social-guided-number">1</span>
                        <SmsOptionPicker
                          id="social-network"
                          label="Rede social"
                          placeholder="Escolha a rede social"
                          value={network}
                          options={[
                            { id: "all", name: "Escolha a rede social" },
                            ...networkOptions,
                          ]}
                          onChange={(value) => {
                            setPage(0);
                            setNetwork(value);
                            setServiceType("all");
                            setCategory("all");
                            setServiceId("");
                            setError("");
                          }}
                        />
                      </div>
                      <div className="social-guided-step">
                        <span className="social-guided-number">2</span>
                        <SmsOptionPicker
                          id="social-kind"
                          label="Tipo de serviço"
                          placeholder="Escolha o tipo"
                          value={serviceType}
                          disabled={network === "all"}
                          options={[
                            { id: "all", name: "Escolha o tipo" },
                            ...typeOptions.map((kind) => ({ id: kind, name: categoryLabel(kind) })),
                          ]}
                          onChange={(value) => {
                            setPage(0);
                            setServiceType(value);
                            setCategory("all");
                            setServiceId("");
                            setError("");
                          }}
                        />
                        <small>
                          {network === "all"
                            ? "Selecione uma rede primeiro."
                            : "Ex.: seguidores, curtidas ou visualizações."}
                        </small>
                      </div>
                      <div className="social-guided-step">
                        <span className="social-guided-number">3</span>
                        <SmsOptionPicker
                          id="social-category"
                          label="Categoria / origem"
                          placeholder="Escolha a categoria"
                          value={category}
                          disabled={network === "all" || serviceType === "all"}
                          options={[
                            { id: "all", name: "Escolha a categoria" },
                            ...categories.map((name) => ({ id: name, name })),
                          ]}
                          onChange={(value) => {
                            setPage(0);
                            setCategory(value);
                            setServiceId("");
                            setError("");
                          }}
                        />
                        <small>
                          {network === "all" || serviceType === "all"
                            ? "Selecione o tipo primeiro."
                            : "Confira as opções disponíveis para este tipo."}
                        </small>
                      </div>
                    </div>

                    <div className="social-client-full-field social-client-service-field">
                      {catalogReady ? (
                        <>
                          <SmsOptionPicker
                            id="social-service"
                            label="Serviço"
                            placeholder="Pesquise pelo nome ou referência"
                            value={serviceId}
                            options={list.map((s) => ({
                              id: s.id,
                              name: `${s.title} · Ref. ${s.id}${applied ? ` · ${networkOptions.find((p) => p.id === s.network)?.name || networks[s.network] || s.network} · ${categoryLabel(s.serviceType || "")} · ${s.category || ""}` : ""}`,
                            }))}
                            onChange={(value) => {
                              setServiceId(value);
                              setUnavailable(false);
                              setQuantity("");
                              setError("");
                            }}
                          />
                          <small>
                            {(catalog.data?.total ?? list.length).toLocaleString("pt-BR")} serviços
                            encontrados · pesquise dentro da lista por nome ou referência.
                          </small>
                        </>
                      ) : (
                        <div className="social-guided-empty">
                          <ShoppingCart size={22} />
                          <div>
                            <strong>Vamos encontrar o serviço certo</strong>
                            <p>
                              Escolha a rede social, o tipo e a categoria para ver os serviços
                              correspondentes. Se preferir, use a pesquisa acima.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                    {catalogReady && (page > 0 || catalog.data?.hasMore) && (
                      <div className="social-catalog-pagination social-client-full-field">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy || !!quote || page === 0}
                          onClick={() => {
                            setPage((p) => p - 1);
                            setServiceId("");
                          }}
                        >
                          Serviços anteriores
                        </Button>
                        <span>Página {page + 1}</span>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy || !!quote || !catalog.data?.hasMore}
                          onClick={() => {
                            setPage((p) => p + 1);
                            setServiceId("");
                          }}
                        >
                          Mais serviços
                        </Button>
                      </div>
                    )}
                  </fieldset>
                  {catalogReady && list.length === 0 && (
                    <p className="social-info">
                      Nenhum serviço encontrado. Tente outra pesquisa ou consulte mais tarde.
                    </p>
                  )}
                </>
              )}
            </section>

            {(service || quote) && (
              <section className="social-card social-client-order">
                <div className="social-section-heading">
                  <div>
                    <span className="eyebrow">02 / SEU PEDIDO</span>
                    <h2>Destino e quantidade</h2>
                    <p>Confira o link e consulte o valor exato da sua compra.</p>
                  </div>
                </div>
                {service && (
                  <fieldset
                    disabled={busy || !!quote}
                    className="social-fields social-client-order-fields"
                  >
                    <label className="social-client-full-field">
                      Link público do perfil ou conteúdo
                      <input
                        className="field"
                        type="url"
                        value={link}
                        maxLength={1500}
                        placeholder="https://…"
                        onChange={(e) => setLink(e.target.value)}
                      />
                      <small>Use o link exigido pelo serviço escolhido. Não informe senha.</small>
                    </label>
                    <label>
                      Quantidade
                      <input
                        className="field"
                        aria-label="Quantidade"
                        aria-describedby="social-quantity-hint social-quantity-validation"
                        aria-invalid={quantity !== "" && !estimate.valid}
                        type="number"
                        min={service.minimum}
                        max={Math.min(service.maximum, 100000000)}
                        step={1}
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                      />
                      <small id="social-quantity-hint">
                        Mínimo: {service.minimum.toLocaleString("pt-BR")} · máximo por pedido:{" "}
                        {Math.min(service.maximum, 100000000).toLocaleString("pt-BR")}
                      </small>
                      {quantity !== "" && !estimate.valid && (
                        <small id="social-quantity-validation" role="alert" className="error-text">
                          {Number(quantity) < service.minimum
                            ? `A quantidade mínima deste serviço é ${service.minimum.toLocaleString("pt-BR")} unidades.`
                            : `Informe uma quantidade inteira até ${Math.min(service.maximum, 100000000).toLocaleString("pt-BR")} unidades.`}
                        </small>
                      )}
                    </label>
                  </fieldset>
                )}
                <div className="social-live-mobile">
                  {!unavailable && <LivePrice {...livePriceProps} />}
                </div>
                {unavailable ? (
                  <div className="social-blocked-purchase" role="alert">
                    <h3>Compra temporariamente indisponível</h3>
                    <p>
                      Não foi possível iniciar este pedido. Nenhum valor foi descontado da sua
                      carteira.
                    </p>
                    <p>
                      Tente novamente mais tarde. Uma nova consulta só será feita quando você
                      solicitar.
                    </p>
                    <Button
                      variant="outline"
                      disabled={busy || !estimate.valid || !link}
                      onClick={consult}
                    >
                      Consultar novamente
                    </Button>
                  </div>
                ) : !quote ? (
                  <div className="social-client-consult">
                    <p>Confira a estimativa e consulte o valor final para continuar.</p>
                    <Button
                      disabled={busy || !service || !link || !estimate.valid}
                      onClick={consult}
                    >
                      {busy ? "Consultando…" : "Consultar preço total"}
                    </Button>
                  </div>
                ) : (
                  <div className="social-quote">
                    <span>Total do pedido</span>
                    <strong>{money(quote.priceCents)}</strong>
                    <p>
                      {quote.quantity.toLocaleString("pt-BR")} unidades · {quote.title}
                    </p>
                    <small>
                      {seconds === 0
                        ? "Preço expirado. Consulte novamente."
                        : `Preço válido por ${timeLabel(seconds ?? 0)}. Isso não é o prazo de entrega.`}
                    </small>
                    {insufficient ? (
                      <>
                        <p role="alert" className="error-text">
                          Saldo insuficiente para este pedido.
                        </p>
                        <Button asChild>
                          <Link to="/carteira">Adicionar saldo</Link>
                        </Button>
                      </>
                    ) : (
                      <Button
                        disabled={busy || !wallet.data || (!attempted && seconds === 0)}
                        onClick={() => setConfirm(true)}
                      >
                        <ShoppingCart size={17} />
                        {attempted ? "Verificar mesma tentativa" : "Continuar para confirmação"}
                      </Button>
                    )}
                    <Button variant="ghost" disabled={busy} onClick={reset}>
                      Alterar pedido
                    </Button>
                  </div>
                )}
              </section>
            )}
            <aside className="social-card social-client-overview">
              <span className="eyebrow">DETALHES DO SERVIÇO</span>
              {service ? (
                <>
                  <div className="social-client-service-heading">
                    <span className="social-client-network-badge">
                      <SocialNetworkIcon network={service.network} />
                      {networkOptions.find((p) => p.id === service.network)?.name ||
                        networks[service.network] ||
                        service.network}
                    </span>
                    <h2>{service.title}</h2>
                  </div>
                  {service.referencePriceCents !== undefined && (
                    <div className="social-client-price-reference">
                      <span>Exemplo de total para 1.000 unidades</span>
                      <strong>{money(service.referencePriceCents)}</strong>
                      <small>
                        Com os acréscimos. O total da quantidade escolhida será confirmado antes da
                        compra.
                      </small>
                    </div>
                  )}
                  <div className="social-live-desktop">
                    {unavailable ? (
                      <p className="social-info">
                        Novas compras temporariamente indisponíveis. Nenhum valor foi descontado.
                      </p>
                    ) : (
                      <LivePrice {...livePriceProps} />
                    )}
                  </div>
                  <AverageDelivery service={service} />
                  <dl className="social-client-limits">
                    <div>
                      <dt>Quantidade mínima</dt>
                      <dd>{service.minimum.toLocaleString("pt-BR")}</dd>
                    </div>
                    <div>
                      <dt>Máximo por pedido</dt>
                      <dd>{Math.min(service.maximum, 100000000).toLocaleString("pt-BR")}</dd>
                    </div>
                  </dl>
                  <section className="social-client-description-section">
                    <h3>Descrição do serviço</h3>
                    <div
                      className="social-client-description-scroll"
                      tabIndex={0}
                      aria-label="Descrição do serviço"
                    >
                      <p className="social-client-description">
                        {service.description ||
                          "Confira o link, a quantidade e as condições antes de enviar."}
                      </p>
                    </div>
                    <p className="social-client-conditions">
                      {service.refill
                        ? "Reposição conforme condições do serviço."
                        : "Sem reposição."}{" "}
                      {service.cancel
                        ? "Cancelamento sujeito à análise."
                        : "Sem solicitação de cancelamento."}
                    </p>
                  </section>
                  <details className="social-client-disclosure">
                    <summary>Mais informações de entrega</summary>
                    <DeliveryInformation
                      description={service.details || service.description}
                      metrics={service.deliveryMetrics}
                    />
                  </details>
                  <ServiceReference serviceId={service.id} />
                </>
              ) : (
                <div className="social-client-preview-empty">
                  <ShoppingCart size={26} />
                  <h2>Conheça antes de comprar.</h2>
                  <p>
                    Selecione um serviço para conferir os limites, a referência de preço e as
                    condições de entrega.
                  </p>
                  <span>O envio só acontece após sua confirmação.</span>
                </div>
              )}
              <details className="social-client-disclosure social-client-help">
                <summary>Orientações para seu pedido</summary>
                <ol>
                  <li>Escolha o serviço adequado ao perfil ou publicação.</li>
                  <li>Informe o link público e uma quantidade dentro dos limites.</li>
                  <li>Confira o total e confirme com seu saldo.</li>
                  <li>Acompanhe a entrega em Meus pedidos.</li>
                </ol>
                <p>
                  Mantenha o perfil e o conteúdo acessíveis durante a entrega. Não altere o link nem
                  envie pedidos simultâneos para o mesmo destino enquanto houver processamento.
                </p>
                <p>
                  Os prazos e as condições variam por serviço. Quantidade não representa público
                  interessado ou resultado comercial. As plataformas podem remover engajamento
                  artificial ou restringir contas.
                </p>
              </details>
              <Button asChild variant="ghost">
                <Link to="/suporte">Falar com o suporte</Link>
              </Button>
            </aside>
            {error && (
              <p role="alert" className="error-text social-client-error">
                {error}
              </p>
            )}
          </div>
        </>}</TabsContent>
        <TabsContent value="orders">
          <SocialHistory />
        </TabsContent>
      </Tabs>
      {preferencesOpen && (
        <SocialPreferencesDialog
          value={preferences}
          onClose={() => setPreferencesOpen(false)}
          onApply={(value) => {
            setPreferences(value);
            setPreferencesOpen(false);
            setPage(0);
            setServiceId("");
            setError("");
          }}
        />
      )}
      {selected && (
        <SocialOrderDetail
          key={selected}
          orderId={selected}
          onClose={() => {
            setSelected(null);
            setTab("orders");
          }}
        />
      )}
      <Dialog
        open={confirm}
        onOpenChange={(v) => {
          if (!busy) setConfirm(v);
        }}
      >
        <DialogContent className="social-detail-dialog">
          <DialogHeader>
            <DialogTitle>Confirmar pedido</DialogTitle>
            <DialogDescription>
              Confira o destino, a quantidade e o valor antes de enviar.
            </DialogDescription>
          </DialogHeader>
          {quote && (
            <>
              <dl className="sms-confirm-summary">
                <div>
                  <dt>Serviço</dt>
                  <dd>{quote.title}</dd>
                </div>
                <div>
                  <dt>Quantidade</dt>
                  <dd>{quote.quantity.toLocaleString("pt-BR")}</dd>
                </div>
                <div>
                  <dt>Preço total</dt>
                  <dd>{money(quote.priceCents)}</dd>
                </div>
                <div>
                  <dt>Saldo estimado após a compra</dt>
                  <dd>
                    {wallet.data
                      ? money(wallet.data.balanceCents - quote.priceCents)
                      : "Consultando…"}
                  </dd>
                </div>
              </dl>
              <ServiceReference serviceId={quote.serviceId} />
              <p className="social-order-link">{quote.link}</p>
              {quote.description && (
                <div className="social-service-description">
                  <h3>Condições atuais do serviço</h3>
                  <DeliveryInformation
                    description={quote.details || quote.description}
                    metrics={quote.deliveryMetrics}
                  />
                  <p>{quote.description}</p>
                </div>
              )}
              <p className="social-info">
                {quote.refill
                  ? "Permite solicitar reposição conforme as condições atuais."
                  : "Este pedido não oferece solicitação de reposição."}{" "}
                {quote.cancel
                  ? "Cancelamento sujeito à confirmação."
                  : "Este pedido não oferece solicitação de cancelamento."}
              </p>
              <p className="social-info">
                Ao confirmar, o pedido entra no processamento. Cancelamento e reposição dependem das
                condições do serviço e de confirmação. Não há garantia de permanência ou resultado
                comercial.
              </p>
              {attempted && (
                <p className="social-info">
                  Esta tentativa usa a mesma referência. Não altere o pedido para repetir um envio
                  sem confirmação.
                </p>
              )}
              {error && (
                <p role="alert" className="error-text">
                  {error}
                </p>
              )}
              {seconds === 0 && !attempted && (
                <p role="alert" className="error-text">
                  Preço expirado. Volte e consulte novamente.
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>
                  Voltar
                </Button>
                <Button
                  disabled={busy || !wallet.data || insufficient || (!attempted && seconds === 0)}
                  onClick={buy}
                >
                  {busy
                    ? "Confirmando…"
                    : attempted
                      ? "Verificar tentativa"
                      : `Confirmar por ${money(quote.priceCents)}`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
