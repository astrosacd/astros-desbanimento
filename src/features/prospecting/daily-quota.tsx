import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3 } from "lucide-react";
export type DailyQuota = {
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string;
  serverNow: string;
};
export function quotaClock(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}
export function DailyQuotaNotice({
  quota,
  updatedAt,
  onRenew,
  cnpj = false,
}: {
  cnpj?: boolean;
  quota: DailyQuota;
  updatedAt?: number | undefined;
  onRenew: () => void;
}) {
  const anchor = useMemo(
    () => ({
      at: performance.now(),
      ms: Math.max(
        0,
        Date.parse(quota.resetsAt) -
          Date.parse(quota.serverNow) -
          Math.max(0, Date.now() - (updatedAt || Date.now())),
      ),
    }),
    [quota.resetsAt, quota.serverNow, updatedAt],
  );
  const [tick, setTick] = useState(() => performance.now());
  const renewed = useRef("");
  useEffect(() => {
    setTick(performance.now());
    if (quota.remaining !== 0) return;
    const timer = setInterval(() => setTick(performance.now()), 1000);
    return () => clearInterval(timer);
  }, [anchor, quota.remaining]);
  const remaining = Math.max(0, anchor.ms - Math.max(0, tick - anchor.at)),
    blocked = quota.remaining === 0;
  useEffect(() => {
    if (blocked && remaining === 0 && renewed.current !== quota.resetsAt) {
      renewed.current = quota.resetsAt;
      onRenew();
    }
  }, [blocked, remaining, quota.resetsAt, onRenew]);
  return (
    <div className={`prospect-daily-quota${blocked ? " prospect-daily-blocked" : ""}`}>
      <Clock3 size={19} />
      <div>
        <strong>{blocked ? (cnpj ? "Limite diário de consultas CNPJ atingido" : "Limite diário de buscas atingido") : (cnpj ? "Suas consultas CNPJ de hoje" : "Suas buscas de hoje")}</strong>
        <p>
          {quota.used} de {quota.limit} {cnpj ? "consultas utilizadas" : "buscas utilizadas"}.{" "}
          {blocked
            ? (cnpj ? "Pesquisas, consultas e atualizações cadastrais usam esta mesma cota." : "Novas buscas ficam disponíveis após a renovação do limite.")
            : `${quota.remaining} ${cnpj ? "consulta(s)" : "busca(s)"} disponível(is).`}
        </p>
        {blocked && (
          <>
            <p>Você poderá solicitar novamente em:</p>
            <span className="prospect-quota-clock" aria-label="Tempo até a renovação do limite">
              {remaining > 0 ? quotaClock(remaining) : "Atualizando limite…"}
            </span>
            <small>
              Renovação à meia-noite, no horário de Fortaleza. A atualização é automática.
            </small>
          </>
        )}
      </div>
    </div>
  );
}
