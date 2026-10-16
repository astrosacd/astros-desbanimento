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
  const [messages, setMessages] = useState<Message[]>([]),
    [question, setQuestion] = useState(""),
    [from, setFrom] = useState(todayFortaleza),
    [until, setUntil] = useState(todayFortaleza),
    [clientSearch, setClientSearch] = useState(""),
    [mode, setMode] = useState<FaceMode>("idle"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [voice, setVoice] = useState(false),
    [micAvailable, setMicAvailable] = useState(false);
  const lock = useRef(false),
    alive = useRef(true),
    recognition = useRef<SpeechInput | null>(null),
    end = useRef<HTMLDivElement>(null),
    seq = useRef(0);
  useEffect(() => {
    alive.current = true;
    setMicAvailable(!!speechInput());
    return () => {
      alive.current = false;
      recognition.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages, busy]);
  function stopVoice() {
    window.speechSynthesis?.cancel();
    setMode("idle");
  }
  function speak(text: string) {
    if (!voice || !window.speechSynthesis) return;
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "pt-BR";
    speech.rate = 1.02;
    speech.onstart = () => {
      if (alive.current) setMode("speaking");
    };
    speech.onend = speech.onerror = () => {
      if (alive.current) setMode("idle");
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(speech);
  }
  async function send(event?: FormEvent, prompt?: string) {
    event?.preventDefault();
    const text = (prompt ?? question).trim();
    if (text.length < 2 || lock.current) return;
    recognition.current?.stop();
    window.speechSynthesis?.cancel();
    lock.current = true;
    setBusy(true);
    setError("");
    setMode("thinking");
    setQuestion("");
    const history = messages.slice(-4).map((m) => ({ role: m.role, text: m.text.slice(0, 4000) }));
    setMessages((old) => [...old, { id: ++seq.current, role: "user", text }]);
    try {
      const answer = await askAssistant({
        data: { question: text, from, until, clientSearch, history },
      });
      if (!alive.current) return;
      setFrom(answer.from);
      setUntil(answer.until);
      setMessages((old) => [...old, { id: ++seq.current, role: "assistant", ...answer }]);
      setMode("idle");
      speak(answer.text);
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : "Não foi possível consultar agora.");
        setMode("error");
        setQuestion(text);
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function listen() {
    if (mode === "listening") {
      recognition.current?.stop();
      setMode("idle");
      return;
    }
    const r = speechInput();
    if (!r) {
      setError("Seu navegador não oferece entrada por voz. Use o campo de texto.");
      return;
    }
    window.speechSynthesis?.cancel();
    recognition.current = r;
    r.lang = "pt-BR";
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e) => {
      if (alive.current) setQuestion(e.results[0]?.[0]?.transcript.slice(0, 1000) || "");
    };
    r.onerror = () => {
      if (alive.current) {
        setError("Não foi possível usar o microfone. Confira a permissão ou digite sua pergunta.");
        setMode("idle");
      }
    };
    r.onend = () => {
      if (alive.current) setMode((m) => (m === "listening" ? "idle" : m));
    };
    try {
      r.start();
      setMode("listening");
    } catch {
      setError("Não foi possível iniciar o microfone.");
    }
  }
  return (
    <div className="astra-page">
      <header className="astra-heading">
        <div>
          <span className="eyebrow">INTELIGÊNCIA ADMINISTRATIVA</span>
          <h2>Converse com a ASTRA.</h2>
          <p>Uma visão do seu sistema, em uma conversa.</p>
        </div>
        <span className="astra-access">
          <ShieldCheck size={15} />
          Exclusivo da administração · consultas
        </span>
      </header>
      <div className="astra-workspace">
        <aside className="astra-avatar-panel" data-mode={mode}>
          <div className="astra-avatar-top">
            <span>ASTRA / ASTROS MAIS</span>
            <span className="astra-online-dot" />
          </div>
          <AssistantFace mode={mode} />
          <div className="astra-avatar-label">
            <span>ASSISTENTE DO ECOSSISTEMA</span>
            <h3>
              Dados reais.
              <br />
              Respostas com contexto.
            </h3>
            <p role="status">{labels[mode]}</p>
          </div>
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
              <strong>Seu centro de consulta</strong>
            </div>
            <div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={voice ? "Desativar resposta por voz" : "Ativar resposta por voz"}
                onClick={() => {
                  if (voice) stopVoice();
                  setVoice(!voice);
                }}
              >
                {voice ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Limpar conversa"
                disabled={busy}
                onClick={() => {
                  stopVoice();
                  setMessages([]);
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
                  Pergunte sobre movimentações, compras, cadastros ou ocorrências. Eu aviso quando
                  uma fonte não puder ser confirmada.
                </p>
                <div className="astra-prompts">
                  {[
                    "Quanto entrou de recargas hoje?",
                    "Quem se cadastrou hoje?",
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
                <p>{m.text}</p>
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
                  ? "Ouvindo… revise o texto antes de enviar."
                  : "Conversa mantida apenas nesta tela. Voz depende do navegador."}
              </small>
              <div>
                {micAvailable && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={mode === "listening" ? "Parar microfone" : "Usar microfone"}
                    disabled={busy}
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
