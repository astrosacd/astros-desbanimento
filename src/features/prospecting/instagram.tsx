import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  instagramRead,
  instagramConsult,
  instagramAdminConfig,
  instagramAdminSave,
} from "./actions";
import type { Lead } from "./types";
type InstagramResult = {
  username: string;
  url: string;
  name: string;
  biography: string;
  followers: number | null;
  following: number | null;
  professional: boolean | null;
  verified: boolean | null;
  links: string[];
  emails: string[];
  phones: string[];
  queriedAt: string;
};
type InstagramRead = {
  installed: boolean;
  enabled: boolean;
  candidates: string[];
  request: {
    state: string;
    profileId?: string;
    requestedAt?: string;
    queriedAt?: string;
    result?: InstagramResult | null;
  };
};
export function InstagramLead({ lead, userId }: { lead: Lead; userId: string }) {
  const cache = useQueryClient(),
    source = lead.snapshot.source === "cnpj" ? "cnpj" : "maps";
  const key = ["instagram-lead", userId, source, lead.id];
  const q = useQuery({
    queryKey: key,
    queryFn: () => instagramRead({ data: { leadId: lead.id, source } }) as Promise<InstagramRead>,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [profile, setProfile] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const intent = useRef<{ profile: string; id: string } | null>(null),
    locked = useRef(false);
  const state = q.data?.request.state,
    result = q.data?.request.result;
  const recent =
    !!q.data?.request.requestedAt && Date.now() - Date.parse(q.data.request.requestedAt) < 86400000;
  async function consult() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    const handle = profile || q.data?.candidates[0] || "";
    if (intent.current?.profile !== handle)
      intent.current = { profile: handle, id: crypto.randomUUID() };
    try {
      const value = (await instagramConsult({
        data: { leadId: lead.id, source, profileId: handle, requestId: intent.current.id },
      })) as InstagramRead;
      cache.setQueryData(key, value);
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Não foi possível confirmar. Atualize esta consulta antes de tentar novamente.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  if (q.isPending)
    return (
      <p className="prospect-help" role="status">
        Conferindo complemento Instagram…
      </p>
    );
  if (q.isError)
    return (
      <section className="prospect-site-details">
        <p>
          O complemento Instagram não pôde ser carregado. Os dados da empresa continuam disponíveis.
        </p>
        <Button variant="outline" onClick={() => void q.refetch()}>
          Atualizar complemento
        </Button>
      </section>
    );
  if (!q.data?.installed || (!q.data.enabled && state === "none")) return null;
  return (
    <section className="prospect-instagram" aria-label="Informações do Instagram">
      <h4>Instagram · complemento do lead</h4>
      <p className="prospect-help">
        Consulta o perfil encontrado nos links deste lead. O vínculo com a empresa e os contatos não
        são confirmados. Não coleta a lista de seguidores.
      </p>
      {!q.data.candidates.length ? (
        <p>
          Nenhum link de perfil Instagram foi encontrado neste registro. Os demais dados permanecem
          disponíveis.
        </p>
      ) : (
        <>
          <label>
            Perfil publicado no lead
            <select
              className="field"
              value={profile || q.data.candidates[0]}
              disabled={busy}
              onChange={(e) => {
                setProfile(e.target.value);
                intent.current = null;
              }}
            >
              {q.data.candidates.map((v) => (
                <option key={v} value={v}>
                  @{v}
                </option>
              ))}
            </select>
          </label>
          <p className="prospect-help">
            Sem cobrança adicional na carteira nesta versão. Uma tentativa por perfil neste lead a
            cada 24 horas, sujeita à disponibilidade.
          </p>
          <Button
            variant="outline"
            disabled={
              busy ||
              !q.data.enabled ||
              (recent && q.data.request.profileId === (profile || q.data.candidates[0]))
            }
            onClick={() => void consult()}
          >
            {busy ? "Consultando…" : "Consultar informações do Instagram"}
          </Button>
        </>
      )}
      {state === "processing" && (
        <p role="status">
          Consulta em conferência. Atualize o resultado; não é necessário iniciar outra.
        </p>
      )}
      {state === "failed" && (
        <p role="status">
          Não foi possível confirmar um perfil público nesta tentativa. Os dados originais foram
          preservados. Nova tentativa disponível após 24 horas da solicitação.
        </p>
      )}
      {state !== "none" && (
        <Button variant="ghost" disabled={busy || q.isFetching} onClick={() => void q.refetch()}>
          Atualizar resultado salvo
        </Button>
      )}
      {message && <p role="alert">{message}</p>}
      {result && (
        <div className="prospect-instagram-result">
          <strong>
            {result.name || "Perfil"} · @{result.username}
          </strong>
          <a href={result.url} target="_blank" rel="noopener noreferrer">
            Abrir perfil consultado
          </a>
          <p>{result.biography || "Biografia não informada."}</p>
          <dl className="prospect-cnpj-data">
            <div>
              <dt>Seguidores (quantidade)</dt>
              <dd>{result.followers?.toLocaleString("pt-BR") ?? "Não informado"}</dd>
            </div>
            <div>
              <dt>Seguindo (quantidade)</dt>
              <dd>{result.following?.toLocaleString("pt-BR") ?? "Não informado"}</dd>
            </div>
            <div>
              <dt>Profissional</dt>
              <dd>
                {result.professional === null
                  ? "Não informado"
                  : result.professional
                    ? "Sim"
                    : "Não"}
              </dd>
            </div>
            <div>
              <dt>Verificado</dt>
              <dd>
                {result.verified === null ? "Não informado" : result.verified ? "Sim" : "Não"}
              </dd>
            </div>
          </dl>
          {!!result.emails.length && <p>E-mails escritos na bio: {result.emails.join(" · ")}</p>}
          {!!result.phones.length && (
            <p>Possíveis telefones escritos na bio: {result.phones.join(" · ")}</p>
          )}
          {!result.emails.length && !result.phones.length && (
            <p>Nenhum telefone ou e-mail identificado na biografia retornada.</p>
          )}
          {!!result.links.length && (
            <ul>
              {result.links.map((v) => (
                <li key={v}>
                  <a href={v} target="_blank" rel="noopener noreferrer">
                    {v}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <small>
            Fonte: perfil público do Instagram via serviço de consulta. Consultado em{" "}
            {new Date(result.queriedAt).toLocaleString("pt-BR")}. Informações podem mudar.
          </small>
        </div>
      )}
    </section>
  );
}
export function InstagramAdmin({ adminId }: { adminId: string }) {
  const q = useQuery({
    queryKey: ["instagram-admin", adminId],
    queryFn: () => instagramAdminConfig(),
    retry: false,
  });
  const [enabled, setEnabled] = useState(false),
    [daily, setDaily] = useState(20),
    [userDaily, setUserDaily] = useState(5),
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
      await instagramAdminSave({
        data: { enabled, dailyCalls: daily, userDaily, reserveCalls: reserve },
      });
      setMessage("Configuração Instagram salva.");
      await q.refetch();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="prospect-card">
      <h2>Instagram · complemento dos leads</h2>
      <p>
        Usa a chave SerpApi já cadastrada e a mesma cota do Google Maps. Começa desligado. Não
        descobre seguidores nem pesquisa perfis por nome.
      </p>
      <p>
        O cliente confirma a consulta de um perfil publicado nos dados do próprio lead. Não há
        débito adicional na carteira nesta versão; o consumo SerpApi é da aplicação.
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
          Atualização Instagram ainda não instalada no Supabase. As buscas existentes continuam
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
              Liberar consulta adicional ao Instagram
            </label>
            <label>
              Consultas Instagram por dia (aplicação)
              <input
                className="field"
                type="number"
                min={1}
                max={1000}
                required
                value={daily}
                onChange={(e) => setDaily(Number(e.target.value))}
              />
              <small>Teto conjunto de todos os clientes; tentativas também contam.</small>
            </label>
            <label>
              Consultas Instagram por cliente/dia
              <input
                className="field"
                type="number"
                min={1}
                max={100}
                required
                value={userDaily}
                onChange={(e) => setUserDaily(Number(e.target.value))}
              />
              <small>Dia no horário de Fortaleza. Não altera a cota individual Maps.</small>
            </label>
            <label>
              Reserva mínima de consultas para Maps
              <input
                className="field"
                type="number"
                min={1}
                max={1000000}
                required
                value={reserve}
                onChange={(e) => setReserve(Number(e.target.value))}
              />
              <small>
                O complemento para antes de consumir essa reserva do saldo de consultas. O limite
                horário e o teto global existentes continuam valendo.
              </small>
            </label>
            <p className="prospect-full">
              Buscas Maps já na fila têm prioridade. Resultados ficam separados do cadastro
              original; uma tentativa por lead/perfil a cada 24 horas. Pausar impede novas consultas
              e preserva resultados.
            </p>
            <Button type="submit">{busy ? "Salvando…" : "Salvar configuração Instagram"}</Button>
          </fieldset>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
