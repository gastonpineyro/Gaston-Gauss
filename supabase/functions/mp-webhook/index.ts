// Mercado Pago avisa acá cada vez que cambia un pago. NO confiamos en lo que
// llega: con el número de pago le preguntamos a Mercado Pago (con tu token) el
// estado real y recién ahí marcamos los pedidos.
// IMPORTANTE: esta función se despliega con "Verify JWT" DESACTIVADO.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let tipo = url.searchParams.get("type") || url.searchParams.get("topic");
    let pagoId = url.searchParams.get("data.id") || url.searchParams.get("id");
    if (req.method === "POST") {
      const texto = await req.text();
      if (texto) {
        try {
          const cuerpo = JSON.parse(texto);
          tipo = cuerpo.type || cuerpo.topic || tipo;
          pagoId = cuerpo?.data?.id || pagoId;
        } catch (_) { /* ignorar */ }
      }
    }
    if (tipo !== "payment" || !pagoId || !/^\d+$/.test(String(pagoId))) return new Response("ignorado", { status: 200 });

    const token = Deno.env.get("MP_ACCESS_TOKEN");
    if (!token) return new Response("sin token", { status: 500 });

    const r = await fetch(`https://api.mercadopago.com/v1/payments/${pagoId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return new Response("no se pudo verificar", { status: 502 }); // MP reintenta
    const pago = await r.json();

    const ids = String(pago.external_reference || "").split(",").filter(Boolean);
    if (ids.length === 0) return new Response("sin referencia", { status: 200 });

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: pedidos } = await sb.from("pedidos").select("id, total, pago_online_estado, pago_online_id").in("id", ids);
    if (!pedidos || pedidos.length === 0) return new Response("pedidos inexistentes", { status: 200 });

    const suma = pedidos.reduce((a, p) => a + Number(p.total || 0), 0);
    const monto = Number(pago.transaction_amount || 0);
    let estado = "pendiente";
    if (pago.status === "approved") estado = Math.abs(monto - suma) < 1 ? "aprobado" : "revisar_monto";
    else if (pago.status === "rejected" || pago.status === "cancelled") estado = "rechazado";
    else if (pago.status === "refunded" || pago.status === "charged_back") estado = "devuelto";

    for (const p of pedidos) {
      // Un intento rechazado no pisa un pago que ya fue aprobado con otro número.
      const yaPagado = p.pago_online_estado === "aprobado" && p.pago_online_id !== String(pagoId);
      if (yaPagado && estado !== "aprobado") continue;
      await sb.from("pedidos").update({
        pago_online_estado: estado,
        pago_online_id: String(pagoId),
        pago_online_monto: monto,
        pago_online_metodo: pago.payment_type_id || null,
        pagado_en: pago.status === "approved" ? (pago.date_approved || new Date().toISOString()) : null,
      }).eq("id", p.id);
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 });
  }
});
