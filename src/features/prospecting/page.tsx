import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import { getCountries } from "libphonenumber-js";
import { Search, Wallet, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmsOptionPicker } from "../sms/option-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { getWallet } from "../payments/actions";
import { prospectConfig, prospectSearch, prospectStatus } from "./actions";
import { ProspectHistory, ProspectRequests } from "./history";
import { failureLabels, queueLabels, money, type ProspectConfig, type ProspectRequest } from "./types";
const names = new Intl.DisplayNames(["pt-BR"], { type: "region" });
const countries = getCountries()
  .map((code) => ({ id: code, name: names.of(code) || code, iso: code }))
  .sort((a, b) => (a.id === "BR" ? -1 : b.id === "BR" ? 1 : a.name.localeCompare(b.name, "pt-BR")));
export function ProspectingPage() {
  const { client } = useRouteContext({ from: "__root__" });
  const cache = useQueryClient();
  const config = useQuery({
    queryKey: ["prospect-config", client?.id],
    queryFn: () => prospectConfig(),
    retry: false,
  });
  const wallet = useQuery({
    queryKey: ["prospect-wallet", client?.id],
    queryFn: () => getWallet(),
    retry: false,
  });
  const [tab, setTab] = useState("search"),
    [niche, setNiche] = useState(""),
    [country, setCountry] = useState("BR"),
    [city, setCity] = useState(""),
    [region, setRegion] = useState(""),
    [quantity, setQuantity] = useState(8),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<ProspectRequest | null>(null),
    [pending, setPending] = useState<string | null>(null);
  const lock = useRef(false);
  const c = config.data as ProspectConfig | undefined;
  const maximum = (c?.unitCents ?? 0) * quantity;
  const valid =
    !!c?.enabled &&
    niche.trim().length >= 2 &&
    city.trim().length >= 2 &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= 20;
  const insufficient = !!wallet.data && wallet.data.balanceCents < maximum;
  async function refresh() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["prospect-leads"] }),
      cache.invalidateQueries({ queryKey: ["prospect-requests"] }),
      cache.invalidateQueries({ queryKey: ["wallet"] }),
      cache.invalidateQueries({ queryKey: ["prospect-wallet"] }),
    ]);
  }
  async function search() {
    if (lock.current || !valid || pending) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setResult(null);
    const requestId = crypto.randomUUID();
    setPending(requestId);
    try {
      const r = (await prospectSearch({
        data: {
          requestId,
          niche,
          country,
          city,
          region,
          filter: "all",
          quantity,
          expectedUnitCents: c!.unitCents,
        },
      })) as ProspectRequest;
      setResult(r);
      if (!["queued","processing"].includes(r.state)) setPending(null);
      setConfirm(false);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível confirmar. Consulte a mesma tentativa.",
      );
      setConfirm(false);
      const message=e instanceof Error?e.message:'';
      if(['Saldo insuficiente. Faça uma recarga','Consulte o preço novamente','Prospecção temporariamente indisponível','Limite diário de buscas atingido','Confira a busca anterior antes de iniciar outra','Ative o processamento automático de Prospecção'].includes(message)){setPending(null);void cache.invalidateQueries({queryKey:['prospect-config']});void refresh();}
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function check() {
    if (!pending || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = (await prospectStatus({ data: { requestId: pending } })) as ProspectRequest;
      setResult(r);
      if (!["queued","processing"].includes(r.state)) setPending(null);
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Não foi possível confirmar.";
      setError(message);
      if (message === "Busca não encontrada") {
        setPending(null);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(()=>{if(!pending)return;const timer=setInterval(()=>void check(),10000);return()=>clearInterval(timer);},[pending]);
  return (
    <div className="prospect-page">
      <header className="prospect-heading">
        <div>
          <span className="eyebrow">ASTROS MAIS / PROSPECÇÃO</span>
          <h1>Encontre sua próxima oportunidade.</h1>
          <p>Busque empresas por nicho e região e organize seus contatos.</p>
        </div>
        <div className="prospect-wallet">
          <Wallet size={20} />
          <div>
            <span>Carteira compartilhada</span>
            <strong>{wallet.data ? money(wallet.data.balanceCents) : "Consultando…"}</strong>
          </div>
          <Button asChild variant="outline">
            <Link to="/carteira">Recarregar</Link>
          </Button>
        </div>
      </header>
      <nav className="prospect-tabs" aria-label="Prospecção">
        {[
          ["search", "Buscar empresas"],
          ["leads", "Meus leads"],
          ["history", "Histórico de buscas"],
        ].map(([id, label]) => (
          <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id!)}>
            {label}
          </button>
        ))}
      </nav>
      {tab === "search" && (
        <div className="prospect-search-layout">
          <section className="prospect-card">
            <header className="prospect-section-heading">
              <div>
                <h2>Qual empresa você procura?</h2>
                <p>Defina o nicho, a localização e a quantidade de leads.</p>
              </div>
              <Search size={22} />
            </header>
            {config.isPending ? (
              <p role="status">Consultando disponibilidade…</p>
            ) : config.isError ? (
              <p role="alert" className="error-text">
                {config.error.message}
              </p>
            ) : !c?.enabled ? (
              <div className="prospect-empty">
                <h3>Prospecção em preparação</h3>
                <p>
                  Novas buscas serão disponibilizadas após a ativação pela equipe. Seus leads e
                  histórico continuam acessíveis.
                </p>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setError("");
                  if (valid && !insufficient) setConfirm(true);
                }}
              >
                <fieldset disabled={busy || !!pending} className="prospect-form">
                  <label className="prospect-full">
                    Nicho ou atividade
                    <input
                      className="field"
                      value={niche}
                      onChange={(e) => setNiche(e.target.value)}
                      required
                      minLength={2}
                      maxLength={80}
                      placeholder="Ex.: dentistas, academias ou restaurantes"
                    />
                  </label>
                  <SmsOptionPicker
                    id="prospect-country"
                    label="País"
                    placeholder="Selecione o país"
                    value={country}
                    options={countries}
                    onChange={setCountry}
                  />
                  <label>
                    Cidade
                    <input
                      className="field"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      required
                      minLength={2}
                      maxLength={80}
                      placeholder="Ex.: Fortaleza"
                    />
                  </label>
                  <label>
                    Estado / região (opcional)
                    <input
                      className="field"
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      maxLength={80}
                      placeholder="Ex.: Ceará"
                    />
                  </label>
                  <label>
                    Quantidade desejada
                    <input
                      className="field"
                      type="number"
                      min={1}
                      max={20}
                      step={1}
                      value={quantity || ""}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      required
                    />
                    <small>De 1 a 20 leads por busca.</small>
                  </label>
                </fieldset>
                <div className="prospect-search-total">
                  <div>
                    <span>{money(c.unitCents)} por lead entregue</span>
                    <strong>Até {money(maximum)}</strong>
                    <small>Você paga somente pelos leads novos que receber.</small>
                  </div>
                  {insufficient ? (
                    <Button asChild>
                      <Link to="/carteira">Adicionar saldo</Link>
                    </Button>
                  ) : (
                    <Button disabled={!valid || busy || !!pending || !wallet.data} type="submit">
                      <Search size={17} />
                      {busy ? "Pesquisando…" : "Conferir busca"}
                    </Button>
                  )}
                </div>
                {insufficient && (
                  <p className="error-text mt-3">Saldo insuficiente para a quantidade desejada.</p>
                )}
              </form>
            )}
            {error && (
              <p role="alert" className="error-text mt-4">
                {error}
              </p>
            )}
            {pending && (
              <div className="prospect-notice" role="status">
                <strong>
                  {result?.state === "queued" ? "Busca na fila" : busy
                    ? "Buscando e verificando empresas…"
                    : "Confira o resultado desta tentativa"}
                </strong>
                <p>
                  {result?.state === "queued" ? queueLabels[result.queue_reason || "capacity"] || queueLabels["capacity"] : "A busca pode levar alguns instantes. Não é necessário enviar novamente."}
                  {" "}Acompanhamos automaticamente. O saldo só é descontado quando os leads são entregues. Se o saldo ficar insuficiente antes da entrega, a busca será encerrada sem cobrança.
                </p>
                <code>{pending}</code>
                <Button disabled={busy} variant="outline" onClick={check}>
                  Verificar esta busca
                </Button>
              </div>
            )}
            {result && !["queued","processing"].includes(result.state) && (
              <div className="prospect-result" role="status">
                <CheckCircle2 size={22} />
                <div>
                  <h3>
                    {result.state === "completed"
                      ? `${result.delivered} leads entregues`
                      : "Busca não concluída"}
                  </h3>
                  <p>
                    {result.state === "completed"
                      ? `Foram debitados ${money(result.charged_cents)} da sua carteira.`
                      : failureLabels[result.failureReason || "unavailable"] || failureLabels["unavailable"]}
                  </p>
                  {result.state === "completed" && result.delivered < result.quantity && (
                    <p>
                      A quantidade completa de leads novos não pôde ser entregue nesta tentativa. Você pode
                      ampliar a região ou tentar outro nicho.
                    </p>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => setTab(result.delivered ? "leads" : "history")}
                  >
                    {result.delivered ? "Ver meus leads" : "Ver histórico"}
                  </Button>
                </div>
              </div>
            )}
          </section>
          <aside className="prospect-card prospect-guide">
            <span className="eyebrow">COMO FUNCIONA</span>
            <h2>Uma busca, contatos organizados.</h2>
            <ol>
              <li>
                <strong>Escolha seu público</strong>
                <p>Pesquise empresas por nicho e localização.</p>
              </li>
              <li>
                <strong>Receba leads novos</strong>
                <p>
                  Empresas já entregues à sua conta ficam no histórico e não são cobradas novamente
                  como novos leads.
                </p>
              </li>
              <li>
                <strong>Confira a presença digital</strong>
                <p>
                  Distinguimos site acessível, possível problema, redes sociais e verificação
                  inconclusiva.
                </p>
              </li>
              <li>
                <strong>Faça sua abordagem</strong>
                <p>Use os contatos disponíveis e acompanhe sua negociação em Meus leads.</p>
              </li>
            </ol>
            <p>
              Resultados e contatos dependem da disponibilidade da pesquisa. A verificação do site
              mostra a situação observada naquele momento.
            </p>
          </aside>
        </div>
      )}
      {tab === "leads" && <ProspectHistory userId={client?.id || ""} />}{" "}
      {tab === "history" && <ProspectRequests userId={client?.id} />}
      <Dialog
        open={confirm}
        onOpenChange={(v) => {
          if (!busy) setConfirm(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar busca de leads</DialogTitle>
            <DialogDescription>
              Confira os critérios e o limite de cobrança antes de pesquisar.
            </DialogDescription>
          </DialogHeader>
          <dl className="prospect-confirm">
            <div>
              <dt>Nicho</dt>
              <dd>{niche}</dd>
            </div>
            <div>
              <dt>Localização</dt>
              <dd>
                {city}
                {region ? ", " + region : ""} · {names.of(country)}
              </dd>
            </div>
            <div>
              <dt>Quantidade desejada</dt>
              <dd>{quantity} leads</dd>
            </div>
            <div>
              <dt>Valor por lead entregue</dt>
              <dd>{money(c?.unitCents ?? 0)}</dd>
            </div>
            <div>
              <dt>Máximo desta busca</dt>
              <dd>{money(maximum)}</dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            Se forem entregues menos leads, o débito será proporcional. Você não paga novamente por
            empresas já recebidas na sua conta. A busca não envia mensagens aos contatos.
          </p>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>
              Voltar
            </Button>
            <Button disabled={busy || !valid || insufficient} onClick={search}>
              {busy ? "Pesquisando…" : "Confirmar e buscar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
