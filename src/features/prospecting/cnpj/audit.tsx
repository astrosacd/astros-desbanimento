import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cnpjAdminAudit } from "../actions";
import { type Lead, stageLabels } from "../types";
import { CnpjDetails, displayCnpj } from "./details";

type View = "businesses" | "deliveries";
type Item = {
  id: string;
  snapshot: Lead["snapshot"];
  updatedAt?: string;
  createdAt?: string;
  deliveryCount?: number;
  requestId?: string;
  stage?: keyof typeof stageLabels;
  client?: { name: string; email: string };
};
type Report = { items: Item[]; total: number; hasMore: boolean };
const date = (v?: string) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" }) : "Não informado";
export function CnpjAudit({
  adminId,
  requestId = "",
  queryId = "",
  initialView = "businesses",
}: {
  adminId: string;
  requestId?: string;
  queryId?: string;
  initialView?: View;
}) {
  const [view, setView] = useState<View>(initialView),
    [page, setPage] = useState(0),
    [search, setSearch] = useState(""),
    [email, setEmail] = useState("");
  const [filters, setFilters] = useState({ search: "", email: "" }),
    [selected, setSelected] = useState<Item | null>(null);
  const query = useQuery({
    queryKey: ["cnpj-admin-audit", adminId, view, page, filters, requestId, queryId],
    queryFn: async () =>
      (await cnpjAdminAudit({ data: { view, page, ...filters, requestId, queryId } })) as Report,
    retry: false,
  });
  function apply(e: FormEvent) {
    e.preventDefault();
    setFilters({
      search: /^[\d.\/\s-]+$/.test(search) ? search.replace(/\D/g, "") : search.trim(),
      email: email.trim(),
    });
    setPage(0);
  }
  function change(next: View) {
    setView(next);
    setPage(0);
    setSelected(null);
  }
  return (
    <section className="prospect-card cnpj-audit">
      <header className="prospect-section-heading">
        <div>
          <span className="eyebrow">CNPJ / CONSULTA ADMINISTRATIVA</span>
          <h3>{view === "businesses" ? "Empresas salvas" : "Entregas de empresas"}</h3>
          <p>
            {view === "businesses"
              ? "Confira os dados disponíveis na base e quantas contas receberam cada empresa."
              : "Confira quem recebeu cada empresa e os dados salvos para essa conta."}
          </p>
        </div>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          Atualizar lista
        </Button>
      </header>
      <div className="cnpj-audit-actions" role="group" aria-label="Consulta CNPJ">
        <Button
          variant={view === "businesses" ? "default" : "outline"}
          onClick={() => change("businesses")}
        >
          Ver empresas salvas
        </Button>
        <Button
          variant={view === "deliveries" ? "default" : "outline"}
          onClick={() => change("deliveries")}
        >
          Ver entregas
        </Button>
      </div>
      {requestId && (
        <p className="prospect-help">
          {view === "businesses"
            ? "Empresas vinculadas aos critérios desta pesquisa; a base pode receber atualizações posteriores."
            : "Entregas vinculadas exatamente a esta solicitação."}
        </p>
      )}
      <form className="cnpj-audit-filters" onSubmit={apply}>
        <label>
          Empresa ou CNPJ
          <input
            className="field"
            value={search}
            maxLength={80}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome ou CNPJ"
          />
        </label>
        <label>
          E-mail de quem recebeu
          <input
            type="email"
            className="field"
            value={email}
            maxLength={254}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Todos os clientes"
          />
        </label>
        <Button type="submit" disabled={query.isFetching}>
          Pesquisar
        </Button>
      </form>
      {query.isPending ? (
        <p role="status">Carregando registros CNPJ…</p>
      ) : query.isError ? (
        <p role="alert">
          Não foi possível carregar os registros. Confira a atualização da função e do SQL CNPJ e
          tente novamente.
        </p>
      ) : (
        <>
          <p className="prospect-help">
            {query.data?.total ?? 0}{" "}
            {view === "businesses" ? "empresa(s) encontrada(s)" : "entrega(s) encontrada(s)"}
          </p>
          <div className="cnpj-audit-list">
            {query.data?.items.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.snapshot.name}</strong>
                  <p>{displayCnpj(item.snapshot.cnpj)}</p>
                  <p>{item.snapshot.address || "Endereço não informado neste registro."}</p>
                  <p>{item.snapshot.phone || "Telefone não informado neste registro."}</p>
                  {view === "deliveries" ? (
                    <>
                      <p>
                        <strong>{item.client?.name}</strong> · {item.client?.email}
                      </p>
                      <small>
                        Entregue em {date(item.createdAt)} ·{" "}
                        {item.stage ? stageLabels[item.stage] : ""}
                      </small>
                      <details>
                        <summary>Referência da solicitação</summary>
                        <code>{item.requestId}</code>
                      </details>
                    </>
                  ) : (
                    <small>
                      Atualizado em {date(item.updatedAt)} · {item.deliveryCount ?? 0} entrega(s)
                    </small>
                  )}
                </div>
                <Button variant="outline" onClick={() => setSelected(item)}>
                  Ver dados da empresa
                </Button>
              </article>
            ))}
          </div>
          {!query.data?.items.length && (
            <p className="prospect-empty">Nenhum registro encontrado para estes filtros.</p>
          )}
          <div className="list-pagination">
            <Button
              variant="outline"
              disabled={page === 0 || query.isFetching}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <span>Página {page + 1}</span>
            <Button
              variant="outline"
              disabled={!query.data?.hasMore || query.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="cnpj-audit-dialog">
          <DialogHeader>
            <DialogTitle>{selected?.snapshot.name}</DialogTitle>
            <DialogDescription>
              Consulta dos dados empresariais salvos. Esta tela não executa uma nova busca.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <p>{selected.snapshot.address || "Endereço não informado"}</p>
              <p>{selected.snapshot.phone || "Telefone não informado"}</p>
              <CnpjDetails
                readOnly
                userId={adminId}
                lead={{
                  id: selected.id,
                  status: selected.stage || "new",
                  created_at: selected.createdAt || "",
                  request_id: selected.requestId || "",
                  snapshot: selected.snapshot,
                }}
              />
              <div className="cnpj-audit-contacts">
                {selected.snapshot.contacts?.map((c) => (
                  <p key={c.kind + ":" + c.value}>
                    {c.label}: {c.value}
                  </p>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
