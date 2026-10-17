import { WhatsappSupportCard } from "./whatsapp-card";
import { smsSupportOrder } from "../sms/actions";
import { copySms } from "../sms/orders";
import { money, smsStates, type SmsOrder } from "../sms/types";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouteContext, useSearch } from "@tanstack/react-router";
import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js";
import {
  Headphones,
  MessageCircle,
  UserRound,
  ArrowUpRight,
  Phone,
  Wallet,
  Smartphone,
  ListChecks,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeading } from "../panel/heading";
import { CountryPicker } from "../countries/picker";
import { getSupportSettings, prepareSupport, prepareSmsSupport } from "./actions";
import { openSupport, closeSupport } from "./widget";
const region = new Intl.DisplayNames(["pt-BR"], { type: "region" });
const countries = getCountries()
  .map((code) => ({ code, name: region.of(code) || code, ddi: getCountryCallingCode(code) }))
  .sort((a, b) =>
    a.code === "BR" ? -1 : b.code === "BR" ? 1 : a.name.localeCompare(b.name, "pt-BR"),
  );
export function SupportChatPage() {
  const { client } = useRouteContext({ from: "__root__" });
  const { smsOrder } = useSearch({ from: "/suporte" });
  const context = useQuery({
    queryKey: ["sms-support-order", client?.id, smsOrder],
    queryFn: () => smsSupportOrder({ data: { orderId: smsOrder! } }),
    enabled: Boolean(smsOrder),
    retry: false,
  });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const settings = useQuery({
    queryKey: ["support-settings"],
    queryFn: () => getSupportSettings(),
    retry: false,
    refetchInterval: 30000,
  });
  const [number, setNumber] = useState("");
  const [country, setCountry] = useState<CountryCode>("BR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState(false);
  const [contact, setContact] = useState("");
  useEffect(() => {
    const failed = () => {
      closeSupport();
      setOpened(false);
      setError(
        "O atendimento não conseguiu identificar sua conta. Tente abrir novamente. Se continuar, informe a equipe para conferir a configuração do chat.",
      );
    };
    window.addEventListener("chatwoot:error", failed);
    return () => window.removeEventListener("chatwoot:error", failed);
  }, []);
  async function connect() {
    setBusy(true);
    setError("");
    try {
      if (smsOrder && !context.data)
        throw Error("Aguarde a identificação do pedido ou abra o atendimento geral.");
      const identity = smsOrder
        ? await prepareSmsSupport({ data: { number, country, smsOrderId: smsOrder } })
        : await prepareSupport({ data: { number, country } });
      if (!alive.current) return;
      await openSupport(identity);
      if (!alive.current) return;
      setContact(identity.phone);
      setOpened(true);
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Não foi possível abrir o atendimento.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function start(e: FormEvent) {
    e.preventDefault();
    void connect();
  }
  return (
    <div className="support-page">
      <PageHeading
        title="Central de suporte"
        subtitle="Tire suas dúvidas e receba ajuda com os serviços do Astros Mais."
      />
      {smsOrder && (
        <section className="form-section sms-support-context">
          <h2 className="font-semibold">Atendimento sobre uma ativação SMS</h2>
          {context.isPending ? (
            <p role="status">Identificando seu pedido…</p>
          ) : context.isError ? (
            <p role="alert" className="error-text">
              Não foi possível localizar este pedido na sua conta. Volte ao histórico e tente
              novamente.
            </p>
          ) : (
            context.data && (
              <>
                <p>
                  {context.data.service} · {context.data.country} · {money(context.data.priceCents)}
                </p>
                <p>
                  {smsStates[context.data.state as SmsOrder["state"]]} ·{" "}
                  {new Date(context.data.createdAt).toLocaleString("pt-BR")}
                </p>
                <p className="sms-help">
                  A referência deste pedido acompanha sua identificação no chat. Você também pode
                  copiar o resumo e colar na conversa. O código SMS não é incluído.
                </p>
                <Button
                  variant="outline"
                  onClick={() =>
                    copySms(
                      `Preciso de ajuda com a ativação SMS. Pedido: ${context.data.id}. Serviço: ${context.data.service}. País: ${context.data.country}. Valor: ${money(context.data.priceCents)}. Situação: ${smsStates[context.data.state as SmsOrder["state"]]}.`,
                      "Resumo do pedido",
                    )
                  }
                >
                  Copiar resumo do pedido
                </Button>
              </>
            )
          )}
          <Link to="/suporte" search={{}} className="support-link">
            Abrir atendimento geral
            <ArrowUpRight size={16} />
          </Link>
        </section>
      )}
      <div className="support-layout">
        <section className="form-section support-card support-chat">
          <div className="support-heading">
            <span className="support-icon">
              <Headphones size={24} />
            </span>
            <div>
              <span className="eyebrow">CHAT DO PAINEL</span>
              <h2 className="text-xl font-semibold mt-1">
                {settings.data?.title || "Como podemos ajudar?"}
              </h2>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
            {settings.data?.description ||
              "Converse com nossa equipe sobre sua conta e suas solicitações."}
          </p>
          {settings.isPending ? (
            <p role="status" className="mt-6">
              Consultando atendimento…
            </p>
          ) : settings.isError ? (
            <p role="alert" className="mt-6 text-destructive">
              {settings.error.message}
            </p>
          ) : !settings.data?.enabled ? (
            <p className="notice mt-6">O atendimento pelo chat ainda não está disponível.</p>
          ) : opened ? (
            <div className="support-ready">
              <div className="flex items-start gap-3">
                <MessageCircle className="text-primary shrink-0" size={22} />
                <div>
                  <h3 className="font-semibold">Seu atendimento está preparado</h3>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                    Continue na janela do chat. Se ela estiver fechada, use o botão abaixo para
                    abrir novamente.
                  </p>
                </div>
              </div>
              <p className="support-contact">
                <Phone size={16} />
                Contato para retorno: <strong>{contact}</strong>
              </p>
              <div className="flex flex-wrap gap-3">
                <Button type="button" disabled={busy} onClick={() => void connect()}>
                  <MessageCircle size={17} />
                  {busy ? "Abrindo…" : "Abrir atendimento"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setOpened(false);
                    setError("");
                  }}
                >
                  Alterar contato
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={start} className="support-contact-form">
              <h3 className="font-semibold">Comece seu atendimento</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Informe um WhatsApp para retorno. Sua conta já será identificada no chat.
              </p>
              <div className="support-phone-fields">
                <div className="min-w-0">
                  <label className="block text-sm mb-2" htmlFor="submission-country">
                    País / DDI
                  </label>
                  <CountryPicker
                    countries={countries}
                    value={country}
                    onChange={(v) => setCountry(v as CountryCode)}
                    disabled={busy}
                  />
                </div>
                <label className="text-sm" htmlFor="support-phone">
                  WhatsApp
                  <input
                    id="support-phone"
                    className="field mt-2"
                    inputMode="tel"
                    autoComplete="tel-national"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="Ex.: (85) 99999-9999"
                    required
                    maxLength={40}
                    disabled={busy}
                  />
                </label>
              </div>
              <p className="support-private-note">
                <ShieldCheck size={14} />
                Seu contato é usado apenas para este atendimento.
              </p>
              <Button className="mt-6" type="submit" disabled={busy}>
                <MessageCircle size={17} />
                {busy ? "Preparando atendimento…" : "Abrir atendimento"}
              </Button>
            </form>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive mt-4">
              {error}
            </p>
          )}
          <div className="support-account">
            <span className="support-account-icon">
              <UserRound size={18} />
            </span>
            <div>
              <span className="support-caption">CONTA IDENTIFICADA</span>
              <strong>{client?.name || "Cliente"}</strong>
              <span>{client?.email}</span>
            </div>
          </div>
        </section>
        <WhatsappSupportCard />
      </div>
      <section className="form-section support-records">
        <div className="support-records-heading">
          <h2>Encontre o registro do que aconteceu</h2>
          <p>Consulte seu histórico e tenha a referência em mãos ao falar com a equipe.</p>
        </div>
        <nav className="support-shortcuts" aria-label="Históricos dos serviços">
          <Link to="/carteira">
            <span className="support-shortcut-icon">
              <Wallet size={19} />
            </span>
            <span>
              <strong>Carteira e recargas</strong>
              <small>Saldo e pagamentos</small>
            </span>
            <ArrowUpRight size={16} />
          </Link>
          <Link to="/solicitacoes">
            <span className="support-shortcut-icon">
              <ListChecks size={19} />
            </span>
            <span>
              <strong>Desbanimento</strong>
              <small>Números e solicitações</small>
            </span>
            <ArrowUpRight size={16} />
          </Link>
          <Link to="/ativacoes-sms">
            <span className="support-shortcut-icon">
              <Smartphone size={19} />
            </span>
            <span>
              <strong>Ativações SMS</strong>
              <small>Ativações e recebimentos</small>
            </span>
            <ArrowUpRight size={16} />
          </Link>
          <Link to="/redes-sociais">
            <span className="support-shortcut-icon">
              <Share2 size={19} />
            </span>
            <span>
              <strong>Redes sociais</strong>
              <small>Serviços e pedidos</small>
            </span>
            <ArrowUpRight size={16} />
          </Link>
        </nav>
      </section>
    </div>
  );
}
