// Crea el link de pago de Mercado Pago (Checkout Pro) para uno o más pedidos.
// El monto sale SIEMPRE de la base de datos, nunca de lo que mande el navegador.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { pedidos } = await req.json();
    const ids: string[] = Array.isArray(pedidos) ? pedidos : [];
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (ids.length === 0 || ids.length > 6 || !ids.every((i) => uuid.test(i))) {
      return responder({ error: "Pedidos inválidos" }, 400);
    }

    const token = Deno.env.get("MP_ACCESS_TOKEN");
    const siteUrl = (Deno.env.get("SITE_URL") || "https://gastonpineyro.github.io/Gaston-Gauss").replace(/\/$/, "");
    if (!token) return responder({ error: "Falta configurar MP_ACCESS_TOKEN" }, 500);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await sb
      .from("pedidos")
      .select("id, producto_nombre, total, estado, pago_online_estado, creado_en")
      .in("id", ids);
    if (error || !data || data.length !== ids.length) return responder({ error: "No se encontraron los pedidos" }, 404);

    const haceDosHoras = Date.now() - 2 * 60 * 60 * 1000;
    for (const p of data) {
      if (p.pago_online_estado === "aprobado") return responder({ error: "Ese pedido ya está pagado" }, 409);
      if (p.estado === "cancelado" || p.estado === "devuelto") return responder({ error: "Pedido no disponible" }, 409);
      if (new Date(p.creado_en).getTime() < haceDosHoras) return responder({ error: "El pedido es viejo, hacé uno nuevo" }, 409);
      if (!(p.total > 0)) return responder({ error: "Pedido sin monto" }, 409);
    }

    const preferencia = {
      items: data.map((p) => ({
        title: String(p.producto_nombre).slice(0, 120),
        quantity: 1,
        currency_id: "ARS",
        unit_price: Number(p.total),
      })),
      external_reference: ids.join(","),
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook`,
      back_urls: {
        success: `${siteUrl}/pago.html?r=ok`,
        pending: `${siteUrl}/pago.html?r=pendiente`,
        failure: `${siteUrl}/pago.html?r=error`,
      },
      auto_return: "approved",
      statement_descriptor: "GAUSS ORTOPEDIA",
    };

    const mp = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(preferencia),
    });
    const resp = await mp.json();
    if (!mp.ok || !resp.init_point) {
      console.error("Mercado Pago rechazó la preferencia", JSON.stringify(resp));
      return responder({ error: "Mercado Pago no pudo crear el pago" }, 502);
    }

    await sb.from("pedidos").update({ pago_online_estado: "pendiente" }).in("id", ids).is("pago_online_estado", null);
    return responder({ url: resp.init_point });
  } catch (e) {
    console.error(e);
    return responder({ error: "Error inesperado" }, 500);
  }
});
