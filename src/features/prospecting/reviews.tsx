import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { reviewsRead, reviewsConsult, reviewsAdminConfig, reviewsAdminSave } from "./actions";
import type { Lead } from "./types";
type Review = {
  id: string;
  rating: number;
  text: string;
  date: string;
  isoDate: string;
  url: string;
  response: string;
  responseDate: string;
  responseIsoDate: string;
};
type ReviewResult = {
  name: string;
  rating: number | null;
  total: number | null;
  reviews: Review[];
  queriedAt: string;
  url: string;
};
type ReviewRead = {
  installed: boolean;
  enabled: boolean;
  eligible: boolean;
  request: { state: string; requestedAt?: string; result?: ReviewResult | null };
};
const date = (iso: string, fallback = "") =>
  iso ? new Date(iso).toLocaleString("pt-BR") : fallback || "Data não informada";
// The wrapper never mounts query hooks for CNPJ leads.
export function LeadReviews({ lead, userId }: { lead: Lead; userId: string }) {
  return lead.snapshot.source === "cnpj" ? null : (
    <MapsReviews key={userId + lead.id} lead={lead} userId={userId} />
  );
}
function MapsReviews({ lead, userId }: { lead: Lead; userId: string }) {
  const cache = useQueryClient(),
    key = ["maps-reviews", userId, lead.id];
  const q = useQuery({
    queryKey: key,
    queryFn: () => reviewsRead({ data: { leadId: lead.id } }) as Promise<ReviewRead>,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const intent = useRef(""),
    lock = useRef(false);
  const request = q.data?.request,
    result = request?.result,
    recent = !!request?.requestedAt && Date.now() - Date.parse(request.requestedAt) < 86400000;
  useEffect(() => {
    if (request?.state === "completed" || request?.state === "failed") intent.current = "";
  }, [request?.state, request?.requestedAt]);
  async function consult() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    intent.current ||= crypto.randomUUID();
    try {
      const value = (await reviewsConsult({
        data: { leadId: lead.id, requestId: intent.current },
      })) as ReviewRead;
      cache.setQueryData(key, value);
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Não foi possível confirmar a consulta. Atualize o resultado salvo.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  if (q.isPending)
    return (
      <p role="status" className="prospect-help">
        Conferindo complemento de avaliações…
      </p>
    );
  if (q.isError)
    return (
      <section className="prospect-site-details">
        <p>
          O complemento de avaliações não pôde ser carregado. Os dados da empresa continuam
          disponíveis.
        </p>
        <Button variant="outline" onClick={() => void q.refetch()}>
          Atualizar complemento de avaliações
        </Button>
      </section>
    );
  if (!q.data?.installed || (!q.data.enabled && request?.state === "none")) return null;
  return (
    <section className="prospect-instagram" aria-label="Avaliações no Google">
      <h4>Avaliações no Google</h4>
      <p className="prospect-help">
        Consulta opcional de até 10 avaliações, priorizando as mais recentes retornadas. É uma
        amostra, não o histórico completo nem um diagnóstico da empresa.
      </p>
      {!q.data.eligible ? (
        <p>
          Este registro não possui identificação Google Maps compatível para consultar avaliações.
        </p>
      ) : (
        <>
          <p className="prospect-help">
            Sem cobrança adicional na carteira nesta versão. Uma tentativa por lead a cada 24 horas,
            sujeita à disponibilidade.
          </p>
          <Button
            variant="outline"
            disabled={busy || !q.data.enabled || recent}
            onClick={() => void consult()}
          >
            {busy ? "Consultando…" : "Consultar avaliações"}
          </Button>
        </>
      )}
      {request?.state === "processing" && (
        <p role="status">Consulta em conferência. Atualize o resultado salvo, sem iniciar outra.</p>
      )}
      {request?.state === "failed" && (
        <p role="status">
          Não foi possível confirmar as avaliações nesta tentativa. Os dados da empresa foram
          preservados. Nova tentativa após 24 horas da solicitação.
        </p>
      )}
      {request?.state !== "none" && (
        <Button variant="ghost" disabled={busy || q.isFetching} onClick={() => void q.refetch()}>
          Atualizar avaliações salvas
        </Button>
      )}
      {message && <p role="alert">{message}</p>}
      {result && (
        <div className="prospect-instagram-result">
          <strong>{result.name}</strong>
          <p>
            Nota geral informada: {result.rating ?? "Não informada"} · Total informado:{" "}
            {result.total?.toLocaleString("pt-BR") ?? "Não informado"}
          </p>
          <small>
            Fonte: Google Maps via serviço de consulta. Consultado em {date(result.queriedAt)}.
            Textos podem ser trechos; a situação pode mudar.
          </small>
          <a href={result.url} target="_blank" rel="noopener noreferrer">
            Conferir empresa no Google Maps
          </a>
          {!result.reviews.length ? (
            <p>Nenhuma avaliação do Google disponível nesta resposta.</p>
          ) : (
            <ol className="prospect-review-list">
              {result.reviews.map((r, i) => (
                <li key={r.id}>
                  <strong>
                    Avaliação {i + 1} · Nota {r.rating}/5
                  </strong>
                  <small>{date(r.isoDate, r.date)}</small>
                  <p>{r.text || "Avaliação sem comentário escrito."}</p>
                  {r.response && (
                    <details>
                      <summary>Resposta da empresa</summary>
                      <p>{r.response}</p>
                      <small>{date(r.responseIsoDate, r.responseDate)}</small>
                    </details>
                  )}
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noopener noreferrer">
                      Ver avaliação no Google
                    </a>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
export function ReviewsAdmin({ adminId }: { adminId: string }) {
  const q = useQuery({
    queryKey: ["reviews-admin", adminId],
    queryFn: () => reviewsAdminConfig(),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [enabled, setEnabled] = useState(false),
    [daily, setDaily] = useState(5),
    [userDaily, setUserDaily] = useState(2),
    [reserve, setReserve] = useState(10),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (q.data?.installed) {
      setEnabled(q.data.enabled);
      setDaily(q.data.dailyCalls);
      setUserDaily(q.data.userDaily);
      setReserve(q.data.reserveCalls);
    }
  }, [q.data]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await reviewsAdminSave({
        data: { enabled, dailyCalls: daily, userDaily, reserveCalls: reserve },
      });
      setMessage("Configuração de avaliações salva.");
      await q.refetch();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="prospect-card">
      <h2>Avaliações · Google Maps</h2>
      <p>
        Complemento apenas dos leads Maps. Usa a chave e cota SerpApi existentes, compartilhadas com
        buscas e Instagram. Começa desligado.
      </p>
      <p>
        Uma página por consulta, até 10 avaliações mais recentes retornadas. Nenhum débito adicional
        na carteira; pode consumir uma consulta da aplicação no fornecedor. Não altera a busca por
        CNPJ.
      </p>
      {q.isPending ? (
        <p>Consultando configuração…</p>
      ) : q.isError ? (
        <p role="alert">
          Não foi possível carregar a configuração.{" "}
          <Button variant="outline" onClick={() => void q.refetch()}>
            Tentar novamente
          </Button>
        </p>
      ) : !q.data?.installed ? (
        <p role="status">
          Atualização de avaliações ainda não instalada no Supabase. As buscas existentes continuam
          disponíveis.
        </p>
      ) : (
        <form onSubmit={save}>
          <fieldset className="prospect-admin-form" disabled={busy}>
            <label className="prospect-checkbox prospect-full">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Liberar consulta de avaliações
            </label>
            <label>
              Consultas de avaliações por dia (aplicação)
              <input
                className="field"
                type="number"
                required
                min={1}
                max={1000}
                value={daily}
                onChange={(e) => setDaily(Number(e.target.value))}
              />
              <small>Todos os clientes juntos. Tentativas também contam.</small>
            </label>
            <label>
              Consultas por cliente/dia
              <input
                className="field"
                type="number"
                required
                min={1}
                max={100}
                value={userDaily}
                onChange={(e) => setUserDaily(Number(e.target.value))}
              />
              <small>Dia no horário de Fortaleza, independente do limite Instagram.</small>
            </label>
            <label>
              Reserva mínima de consultas para Maps
              <input
                className="field"
                type="number"
                required
                min={1}
                max={1000000}
                value={reserve}
                onChange={(e) => setReserve(Number(e.target.value))}
              />
              <small>
                Deixa esta quantidade de consultas restantes para buscar empresas. Limites globais e
                horários continuam protegidos.
              </small>
            </label>
            <p className="prospect-full">
              Buscas de empresas já na fila têm prioridade. Instagram e avaliações não iniciam
              simultaneamente; consultas não confirmadas não são repetidas. Pausar preserva os
              resultados salvos.
            </p>
            <Button type="submit">
              {busy ? "Salvando…" : "Salvar configuração de avaliações"}
            </Button>
          </fieldset>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
