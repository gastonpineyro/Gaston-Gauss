"use strict";
// Pagos con Mercado Pago (reemplaza a las funciones crear-pago y mp-webhook de Supabase).
// El monto sale SIEMPRE de la base de datos, nunca de lo que mande el navegador.
var express = require("express");
var crypto = require("crypto");
var rateLimit = require("express-rate-limit");
var db = require("./db");
var config = require("./config");

var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var router = express.Router();

var limitePagos = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Probá de nuevo en un rato." },
});

// Permite reemplazar fetch en las pruebas.
var http = { fetch: function () { return fetch.apply(null, arguments); } };

router.post("/crear-pago", limitePagos, async function (req, res) {
  try {
    var ids = Array.isArray(req.body && req.body.pedidos) ? req.body.pedidos : [];
    if (ids.length === 0 || ids.length > 6 || !ids.every(function (i) { return UUID.test(String(i)); })) {
      return res.status(400).json({ error: "Pedidos inválidos" });
    }
    if (!config.mpAccessToken) return res.status(500).json({ error: "Falta configurar MP_ACCESS_TOKEN" });

    var r = await db.query(
      "select id, producto_nombre, total, estado, pago_online_estado, creado_en from pedidos where id = any($1::uuid[])",
      [ids]
    );
    if (r.rows.length !== ids.length) return res.status(404).json({ error: "No se encontraron los pedidos" });

    var haceDosHoras = Date.now() - 2 * 60 * 60 * 1000;
    for (var i = 0; i < r.rows.length; i++) {
      var p = r.rows[i];
      if (p.pago_online_estado === "aprobado") return res.status(409).json({ error: "Ese pedido ya está pagado" });
      if (p.estado === "cancelado" || p.estado === "devuelto") return res.status(409).json({ error: "Pedido no disponible" });
      if (new Date(p.creado_en).getTime() < haceDosHoras) return res.status(409).json({ error: "El pedido es viejo, hacé uno nuevo" });
      if (!(p.total > 0)) return res.status(409).json({ error: "Pedido sin monto" });
    }

    var siteUrl = config.siteUrl || "https://gastonpineyro.github.io/Gaston-Gauss";
    var preferencia = {
      items: r.rows.map(function (p) {
        return { title: String(p.producto_nombre).slice(0, 120), quantity: 1, currency_id: "ARS", unit_price: Number(p.total) };
      }),
      external_reference: ids.join(","),
      notification_url: config.urlPublica + "/api/functions/mp-webhook",
      back_urls: {
        success: siteUrl + "/pago.html?r=ok",
        pending: siteUrl + "/pago.html?r=pendiente",
        failure: siteUrl + "/pago.html?r=error",
      },
      auto_return: "approved",
      statement_descriptor: "GAUSS ORTOPEDIA",
    };

    var mp = await http.fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: "Bearer " + config.mpAccessToken, "Content-Type": "application/json" },
      body: JSON.stringify(preferencia),
    });
    var resp = await mp.json();
    if (!mp.ok || !resp.init_point) {
      console.error("Mercado Pago rechazó la preferencia", JSON.stringify(resp));
      return res.status(502).json({ error: "Mercado Pago no pudo crear el pago" });
    }

    await db.query("update pedidos set pago_online_estado = 'pendiente' where id = any($1::uuid[]) and pago_online_estado is null", [ids]);
    res.json({ url: resp.init_point });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error inesperado" });
  }
});

// Si hay MP_WEBHOOK_SECRET, se verifica que el aviso realmente venga de Mercado Pago.
function firmaValida(req, pagoId) {
  if (!config.mpWebhookSecret) return true;
  var cab = String(req.headers["x-signature"] || "");
  var ts = (/(?:^|,)\s*ts=([^,]+)/.exec(cab) || [])[1];
  var v1 = (/(?:^|,)\s*v1=([^,]+)/.exec(cab) || [])[1];
  if (!ts || !v1) return false;
  var manifest = "id:" + String(pagoId).toLowerCase() + ";request-id:" + (req.headers["x-request-id"] || "") + ";ts:" + ts + ";";
  var esperada = crypto.createHmac("sha256", config.mpWebhookSecret).update(manifest).digest("hex");
  var a = Buffer.from(esperada), b = Buffer.from(v1.trim());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Mercado Pago avisa acá cada vez que cambia un pago. NO confiamos en lo que llega:
// con el número de pago le preguntamos a Mercado Pago (con tu token) el estado real.
router.all("/mp-webhook", async function (req, res) {
  try {
    var tipo = req.query.type || req.query.topic;
    var pagoId = req.query["data.id"] || req.query.id;
    if (req.method === "POST" && req.body && req.body.length) {
      try {
        var cuerpo = JSON.parse(req.body.toString("utf8"));
        tipo = cuerpo.type || cuerpo.topic || tipo;
        pagoId = (cuerpo.data && cuerpo.data.id) || pagoId;
      } catch (e) { /* ignorar */ }
    }
    if (tipo !== "payment" || !pagoId || !/^\d+$/.test(String(pagoId))) return res.status(200).send("ignorado");
    if (!firmaValida(req, pagoId)) return res.status(401).send("firma inválida");
    if (!config.mpAccessToken) return res.status(500).send("sin token");

    var r = await http.fetch("https://api.mercadopago.com/v1/payments/" + pagoId, {
      headers: { Authorization: "Bearer " + config.mpAccessToken },
    });
    if (!r.ok) return res.status(502).send("no se pudo verificar"); // MP reintenta
    var pago = await r.json();

    var ids = String(pago.external_reference || "").split(",").filter(Boolean).filter(function (i) { return UUID.test(i); });
    if (ids.length === 0) return res.status(200).send("sin referencia");

    var q = await db.query("select id, total, pago_online_estado, pago_online_id from pedidos where id = any($1::uuid[])", [ids]);
    if (q.rows.length === 0) return res.status(200).send("pedidos inexistentes");

    var suma = q.rows.reduce(function (a, p) { return a + Number(p.total || 0); }, 0);
    var monto = Number(pago.transaction_amount || 0);
    var estado = "pendiente";
    if (pago.status === "approved") estado = Math.abs(monto - suma) < 1 ? "aprobado" : "revisar_monto";
    else if (pago.status === "rejected" || pago.status === "cancelled") estado = "rechazado";
    else if (pago.status === "refunded" || pago.status === "charged_back") estado = "devuelto";

    for (var i = 0; i < q.rows.length; i++) {
      var p = q.rows[i];
      // Un intento rechazado no pisa un pago que ya fue aprobado con otro número.
      var yaPagado = p.pago_online_estado === "aprobado" && p.pago_online_id !== String(pagoId);
      if (yaPagado && estado !== "aprobado") continue;
      await db.query(
        "update pedidos set pago_online_estado = $2, pago_online_id = $3, pago_online_monto = $4, pago_online_metodo = $5, pagado_en = $6 where id = $1",
        [p.id, estado, String(pagoId), monto, pago.payment_type_id || null,
          pago.status === "approved" ? pago.date_approved || new Date().toISOString() : null]
      );
    }
    res.status(200).send("ok");
  } catch (e) {
    console.error(e);
    res.status(500).send("error");
  }
});

module.exports = { router: router, http: http };
