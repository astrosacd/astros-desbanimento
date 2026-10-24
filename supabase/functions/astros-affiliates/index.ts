// Worker only. Verify JWT OFF; dedicated private secret OR verified confirmed admin is mandatory.
import { createClient } from "npm:@supabase/supabase-js@2";
import { timingSafeEqual } from "node:crypto";
const same = (a: string, b: string) => {
  const x = new TextEncoder().encode(a),
    y = new TextEncoder().encode(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
Deno.serve(async (req) => {
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  if (req.method !== "POST") return reply({ error: "Método indisponível." }, 405);
  try {
    const key = req.headers.get("x-astros-affiliate-worker") || "";
    const token = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
    if (!key && !token) return reply({ error: "Acesso não autorizado." }, 401);
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    let allowed = false;
    if (key) {
      const { data, error } = await db
        .from("astros_affiliate_private")
        .select("worker_secret")
        .eq("id", true)
        .single();
      allowed = !error && typeof data?.worker_secret === "string" && same(key, data.worker_secret);
    } else {
      const { data, error } = await db.auth.getUser(token);
      const u = data?.user;
      if (!error && u?.id) {
        const checked = await db.rpc("astros_affiliate_worker_authorize", { p_actor: u.id });
        allowed = !checked.error && checked.data === true;
      }
    }
    if (!allowed) return reply({ error: "Acesso não autorizado." }, 401);
    const { data: queue, error } = await db
      .from("astros_affiliate_commissions")
      .select("order_id,attempts")
      .eq("pending", true)
      .lte("retry_at", new Date().toISOString())
      .order("retry_at")
      .order("created_at")
      .limit(20);
    if (error) return reply({ error: "Não foi possível consultar a fila de comissões." }, 503);
    let processed = 0,
      failed = 0;
    for (const entry of queue || []) {
      const { data, error: e } = await db.rpc("astros_affiliate_process_order", {
        p_order: entry.order_id,
      });
      if (e) {
        failed++;
        await db
          .from("astros_affiliate_commissions")
          .update({
            attempts: Math.min(Number(entry.attempts || 0) + 1, 100000),
            last_error_at: new Date().toISOString(),
            retry_at: new Date(
              Date.now() + 60000 * Math.min(30, Number(entry.attempts || 0) + 1),
            ).toISOString(),
          })
          .eq("order_id", entry.order_id)
          .eq("pending", true);
      } else if (data?.processed) processed++;
    }
    const heartbeat = await db
      .from("astros_affiliate_settings")
      .update({ worker_at: new Date().toISOString() })
      .eq("id", true);
    if (heartbeat.error) return reply({ error: "Não foi possível registrar a execução." }, 503);
    return reply({ processed, failed });
  } catch {
    return reply({ error: "Não foi possível processar a afiliação agora." }, 503);
  }
});
