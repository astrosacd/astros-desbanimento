import { redactDiagnosticText } from "./privacy";
import { NaturalVoicePlayer, type NaturalAudio } from "./audio-player";
import { AssistantAnswer } from "./answer";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Mic, MicOff, Send, ShieldCheck, Volume2, VolumeX, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssistantFace, type FaceMode } from "./face";
import { askAssistant } from "./actions";
import { todayFortaleza } from "./validation";
import { speechInput, type SpeechInput } from "./voice";
type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  generatedAt?: string;
  from?: string;
  until?: string;
  sources?: Array<{ name: string; available: boolean }>;
};
const labels: Record<FaceMode, string> = {
  idle: "Pronta para consultar",
  listening: "Ouvindo você",
  thinking: "Consultando e preparando resposta",
  speaking: "Respondendo",
  error: "Consulta não concluída",
};
export function AssistantAdmin() {
  const [reportedError, setReportedError] = useState({
    module: "all" as "all" | "api" | "sms" | "social" | "desban" | "payment",
    screen: "",
    reference: "",
    message: "",
  });
  const [messages, setMessages] = useState<Message[]>([]),
    [question, setQuestion] = useState(""),
    [from, setFrom] = useState(todayFortaleza),
    [until, setUntil] = useState(todayFortaleza),
    [clientSearch, setClientSearch] = useState(""),
    [mode, setMode] = useState<FaceMode>("idle"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [voice, setVoice] = useState(false),
    [micAvailable, setMicAvailable] = useState(false),
    [conversation, setConversation] = useState(false);
  const lock = useRef(false),
    alive = useRef(true),
    recognition = useRef<SpeechInput | null>(null),
    end = useRef<HTMLDivElement>(null),
    seq = useRef(0),
    player = useRef<NaturalVoicePlayer | null>(null),
    speechSequence = useRef(0),
    conversationActive = useRef(false),
    restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    listenNext = useRef<() => void>(() => {}),
    sendNext = useRef<(text: string) => void>(() => {});
  useEffect(() => {
    alive.current = true;
    setMicAvailable(!!speechInput());
    return () => {
      alive.current = false;
      conversationActive.current = false;
      if (restartTimer.current) clearTimeout(restartTimer.current);
      recognition.current?.stop();
      player.current?.close();
      speechSequence.current++;
    };
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages, busy]);
  function stopVoice() {
    conversationActive.current = false;
    setConversation(false);
    if (restartTimer.current) clearTimeout(restartTimer.current);
    recognition.current?.stop();
    speechSequence.current++;
    player.current?.stop();

    setMode("idle");
  }
  function unlockAudio() {
    if (!player.current) player.current = new NaturalVoicePlayer();
    return player.current.unlock();
  }
  async function speak(audio?: NaturalAudio, voiceError?: string) {
    if (!voice && !conversationActive.current) return;
    if (!audio) {
      stopVoice();
      setError(
        voiceError ||
          "A voz natural está indisponível. A resposta continua disponível por escrito.",
      );
      return;
    }
    const current = ++speechSequence.current;
    try {
      if (!player.current) player.current = new NaturalVoicePlayer();
      await player.current.play(
        audio,
        () => {
          if (alive.current && current === speechSequence.current) setMode("speaking");
        },
        () => {
          if (alive.current && current === speechSequence.current) {
            setMode("idle");
            resumeListening();
          }
        },
      );
    } catch {
      if (alive.current && current === speechSequence.current) {
        stopVoice();
        setError(
          "Não foi possível reproduzir a voz natural. Continue por texto ou inicie novamente a conversa.",
        );
      }
    }
  }
  async function send(event?: FormEvent, prompt?: string) {
    event?.preventDefault();
    const text = redactDiagnosticText((prompt ?? question).trim());
    if (text.length < 2 || lock.current) return;
    recognition.current?.stop();
    const speechRequest = ++speechSequence.current;
    player.current?.stop();

    lock.current = true;
    setBusy(true);
    setError("");
    setMode("thinking");
    setQuestion("");
    const history = messages.slice(-4).map((m) => ({ role: m.role, text: m.text.slice(0, 4000) }));
    const reportSummary =
      reportedError.message.trim() || reportedError.reference.trim()
        ? `\n\nErro informado · ${reportedError.module}${reportedError.screen ? " · " + reportedError.screen : ""}${reportedError.reference ? " · REF " + reportedError.reference : ""}\n${reportedError.message.slice(0, 1000)}`
        : "";
    setMessages((old) => [
      ...old,
      { id: ++seq.current, role: "user", text: redactDiagnosticText(text + reportSummary) },
    ]);
    try {
      const answer = await askAssistant({
        data: {
          question: text,
          from,
          until,
          clientSearch,
          history,
          voiceRequested: voice || conversationActive.current,
          ...(reportedError.message.trim() || reportedError.reference.trim()
            ? {
                reportedError: {
                  ...reportedError,
                  message: redactDiagnosticText(reportedError.message),
                  screen: redactDiagnosticText(reportedError.screen),
                },
              }
            : {}),
        },
      });
      if (!alive.current) return;
      setFrom(answer.from);
      setUntil(answer.until);
      const { naturalAudio, voiceError, ...written } = answer;
      setMessages((old) => [...old, { id: ++seq.current, role: "assistant", ...written }]);
      setMode("idle");
      if (speechSequence.current === speechRequest) void speak(naturalAudio, voiceError);
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : "Não foi possível consultar agora.");
        conversationActive.current = false;
        setConversation(false);
        setMode("error");
        setQuestion(text);
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function resumeListening() {
    if (restartTimer.current) clearTimeout(restartTimer.current);
    if (!conversationActive.current || !alive.current) return;
    restartTimer.current = setTimeout(() => {
      if (conversationActive.current && alive.current && !lock.current) listenNext.current();
    }, 450);
  }
  function beginListening() {
    if (!conversationActive.current || !alive.current || lock.current) return;
    const r = speechInput();
    if (!r) {
      stopVoice();
      setError("Seu navegador não oferece conversa por voz. Continue por texto.");
      return;
    }
    recognition.current = r;
    r.lang = "pt-BR";
    r.continuous = false;
    r.interimResults = false;
    let heard = false;
    r.onresult = (e) => {
      if (!alive.current || !conversationActive.current || heard || recognition.current !== r)
        return;
      const transcript = (e.results[0]?.[0]?.transcript || "").trim().slice(0, 1000);
      if (transcript.length < 2) return;
      heard = true;
      sendNext.current(transcript);
    };
    r.onerror = () => {
      if (alive.current && conversationActive.current && recognition.current === r) {
        stopVoice();
        setError(
          "O microfone foi pausado. Confira a permissão e clique em Conversar por voz para continuar.",
        );
      }
    };
    r.onend = () => {
      if (alive.current && conversationActive.current && recognition.current === r && !heard) {
        setMode("idle");
        conversationActive.current = false;
        setConversation(false);
      }
    };
    try {
      setError("");
      r.start();
      setMode("listening");
    } catch {
      stopVoice();
      setError("Não foi possível iniciar o microfone.");
    }
  }
  listenNext.current = beginListening;
  sendNext.current = (text) => {
    void send(undefined, text);
  };
  function listen() {
    if (conversationActive.current) {
      stopVoice();
      return;
    }
    if (!window.AudioContext) {
      setError("A conversa por voz não está disponível neste navegador. Continue por texto.");
      return;
    }
    void unlockAudio().catch(() => {
      stopVoice();
      setError("Não foi possível habilitar o áudio. Continue por texto.");
    });
    conversationActive.current = true;
    setConversation(true);
    beginListening();
  }
  return (
    <div className="astra-page">
      <header className="astra-heading">
        <div>
          <span className="eyebrow">CENTRO DE INTELIGÊNCIA</span>
          <h2>ASTRA</h2>
          <p>Seu ecossistema. Uma conversa.</p>
        </div>
        <span className="astra-access">
          <ShieldCheck size={15} />
          Exclusivo da administração · consultas
        </span>
      </header>
      <div className="astra-workspace">
        <aside className="astra-avatar-panel" data-mode={mode}>
          <div className="astra-avatar-top">
            <span>ASTROS MAIS / INTELLIGENCE</span>
            <span className="astra-online-dot" />
          </div>
          <AssistantFace mode={mode} audioMotion={player} />
          <div className="astra-avatar-label">
            <span>INTELIGÊNCIA A SERVIÇO DA ASTROS</span>
            <h3>
              Visão completa. <br />
              Decisões com clareza.
            </h3>
            <p role="status">{labels[mode]}</p>
          </div>
          {micAvailable && (
            <Button
              type="button"
              className="astra-voice-start"
              disabled={busy && !conversation}
              onClick={listen}
            >
              {conversation ? <MicOff size={16} /> : <Mic size={16} />}{" "}
              {conversation ? "Encerrar conversa" : "Conversar por voz"}
            </Button>
          )}
          <div className="astra-capabilities">
            <span>Recargas</span>
            <span>Clientes</span>
            <span>Desbanimento</span>
            <span>SMS</span>
            <span>Redes sociais</span>
            <span>Suporte</span>
          </div>
          <p className="astra-readonly">
            Não altera contas, saldo ou pedidos. Cada pergunta faz uma nova consulta às fontes
            autorizadas.
          </p>
        </aside>
        <section className="astra-conversation" aria-label="Conversa administrativa">
          <div className="astra-chat-toolbar">
            <div>
              <Bot size={20} />
              <strong>Conversa com a ASTRA</strong>
            </div>
            <div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={
                  voice || conversation ? "Desativar resposta por voz" : "Ativar resposta por voz"
                }
                onClick={() => {
                  if (voice || conversation) stopVoice();
                  else
                    void unlockAudio().catch(() => {
                      setVoice(false);
                      setError("Não foi possível habilitar a voz neste navegador.");
                    });
                  setVoice(conversation ? false : !voice);
                }}
              >
                {voice || conversation ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Limpar conversa"
                disabled={busy}
                onClick={() => {
                  stopVoice();
                  setMessages([]);
                  setReportedError({ module: "all", screen: "", reference: "", message: "" });
                  setError("");
                }}
              >
                <Trash2 size={17} />
              </Button>
            </div>
          </div>
          <details className="astra-filters">
            <summary>Período e cliente da consulta</summary>
            <div>
              <label>
                De
                <input
                  className="field"
                  type="date"
                  value={from}
                  disabled={busy}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                Até
                <input
                  className="field"
                  type="date"
                  value={until}
                  disabled={busy}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </label>
              <label>
                Cliente ou e-mail
                <input
                  className="field"
                  value={clientSearch}
                  disabled={busy}
                  maxLength={100}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Todos os clientes"
                />
              </label>
            </div>
            <p>
              Até 31 dias. “Hoje”, “ontem” e “últimos 7 ou 30 dias” na pergunta ajustam o período.
              Chamados mostram o estado atual do inbox do painel.
            </p>
          </details>
          <details className="astra-diagnostics">
            <summary>
              Analisar um erro
              {reportedError.message || reportedError.reference ? " · contexto ativo" : ""}
            </summary>
            <p>
              Informe o erro e onde apareceu. A ASTRA cruza o relato com os registros disponíveis e
              orienta você, sem alterar o sistema. Não inclua senhas ou tokens. A referência
              pesquisa todas as datas, mantendo o módulo e o cliente selecionados.
            </p>
            <div className="astra-diagnostic-fields">
              <label>
                Módulo
                <select
                  className="field"
                  value={reportedError.module}
                  disabled={busy}
                  onChange={(e) =>
                    setReportedError((v) => ({ ...v, module: e.target.value as typeof v.module }))
                  }
                >
                  <option value="all">Toda a aplicação</option>
                  <option value="desban">Desbanimento</option>
                  <option value="sms">Ativações SMS</option>
                  <option value="social">Redes sociais</option>
                  <option value="payment">Pagamentos / carteira</option>
                  <option value="api">API de clientes</option>
                </select>
              </label>
              <label>
                Tela onde aconteceu
                <input
                  className="field"
                  maxLength={120}
                  value={reportedError.screen}
                  disabled={busy}
                  onChange={(e) => setReportedError((v) => ({ ...v, screen: e.target.value }))}
                  placeholder="Ex.: Carteira / Recargas"
                />
              </label>
              <label>
                Referência do pedido ou serviço
                <input
                  className="field"
                  maxLength={100}
                  value={reportedError.reference}
                  disabled={busy}
                  onChange={(e) => setReportedError((v) => ({ ...v, reference: e.target.value }))}
                  placeholder="Opcional"
                />
              </label>
              <label className="astra-diagnostic-message">
                Mensagem do erro
                <textarea
                  maxLength={3000}
                  value={reportedError.message}
                  disabled={busy}
                  onChange={(e) => setReportedError((v) => ({ ...v, message: e.target.value }))}
                  placeholder="Cole a mensagem exata e explique o que estava tentando fazer."
                />
              </label>
            </div>
            <div className="astra-diagnostic-actions">
              <Button
                type="button"
                variant="outline"
                disabled={
                  busy || (!reportedError.message.trim() && !reportedError.reference.trim())
                }
                onClick={() => {
                  setReportedError({ module: "all", screen: "", reference: "", message: "" });
                }}
              >
                Limpar contexto
              </Button>
              <Button
                type="button"
                disabled={
                  busy || (!reportedError.message.trim() && !reportedError.reference.trim())
                }
                onClick={() =>
                  void send(
                    undefined,
                    question.trim() ||
                      "Analise o erro informado. O que foi confirmado, qual a causa provável e como posso conferir ou corrigir sem alterar nada agora?",
                  )
                }
              >
                Analisar erro
              </Button>
            </div>
          </details>
          <div
            className="astra-chat-messages"
            role="log"
            aria-label="Mensagens da conversa"
            aria-busy={busy}
          >
            {!messages.length && (
              <div className="astra-empty">
                <span className="astra-mini-icon">
                  <Bot size={26} />
                </span>
                <h3>O que você quer saber?</h3>
                <p>
                  Pergunte sobre movimentações, compras, cadastros, erros ou ocorrências. Eu aviso
                  quando uma fonte não puder ser confirmada.
                </p>
                <div className="astra-prompts">
                  {[
                    "Quanto entrou de recargas hoje?",
                    "Qual o saldo no SMMRaja e SMSPool?",
                    "Como estão os pedidos de SMS e redes sociais?",
                    "Há bloqueios ou chamados abertos?",
                  ].map((text) => (
                    <button key={text} onClick={() => void send(undefined, text)} disabled={busy}>
                      {text}
                      <Send size={14} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <article key={m.id} className={`astra-message astra-message-${m.role}`}>
                <span>{m.role === "user" ? "Você" : "ASTRA"}</span>
                <AssistantAnswer text={m.text} />
                {m.generatedAt && (
                  <footer>
                    <span>
                      Consulta:{" "}
                      {new Date(m.generatedAt).toLocaleString("pt-BR", {
                        timeZone: "America/Fortaleza",
                      })}{" "}
                      · {m.from} a {m.until}
                    </span>
                    <div>
                      {m.sources?.map((s) => (
                        <span key={s.name} data-available={s.available}>
                          {s.available ? "✓" : "!"} {s.name}
                        </span>
                      ))}
                    </div>
                  </footer>
                )}
              </article>
            ))}
            {busy && (
              <p className="astra-thinking" role="status">
                <span />
                Consultando fontes e preparando a resposta…
              </p>
            )}
            <div ref={end} />
          </div>
          {error && (
            <div role="alert" className="astra-error">
              {error}
            </div>
          )}
          <form className="astra-composer" onSubmit={(e) => void send(e)}>
            <label className="sr-only" htmlFor="astra-question">
              Sua pergunta para a ASTRA
            </label>
            <textarea
              id="astra-question"
              value={question}
              maxLength={1000}
              rows={2}
              disabled={busy}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ex.: Quais clientes fizeram recarga hoje?"
            />
            <div>
              <small>
                {mode === "listening"
                  ? "Ouvindo… sua pergunta será enviada automaticamente."
                  : conversation
                    ? "Conversa por voz ativa. Vou escutar novamente após responder."
                    : "Digite e envie ou inicie uma conversa por voz."}
              </small>
              <div>
                {micAvailable && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={conversation ? "Encerrar conversa por voz" : "Usar microfone"}
                    disabled={busy && !conversation}
                    onClick={listen}
                  >
                    {mode === "listening" ? <MicOff size={17} /> : <Mic size={17} />}
                  </Button>
                )}
                <Button type="submit" disabled={busy || question.trim().length < 2}>
                  <Send size={16} />
                  {busy ? "Consultando…" : "Enviar"}
                </Button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
