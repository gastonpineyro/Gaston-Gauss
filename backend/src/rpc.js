"use strict";
// Funciones públicas (reemplazan a las "RPC" de Supabase).
var express = require("express");
var db = require("./db");
var config = require("./config");

var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var PREFIJO_ARCHIVOS = function () { return config.urlPublica + "/files/comprobantes/"; };

function urlValida(url) {
  if (url === null || url === undefined || url === "") return true;
  return typeof url === "string" && url.indexOf(PREFIJO_ARCHIVOS()) === 0 && url.length < 400;
}

var router = express.Router();

// El cliente sin login marca su pedido con el comprobante de renovación.
router.post("/subir_comprobante", async function (req, res, next) {
  try {
    var b = req.body || {};
    if (!UUID.test(String(b.pedido_id)) || !urlValida(b.url) || !b.url) {
      return res.status(400).json({ error: { message: "Datos inválidos." } });
    }
    var dur = b.duracion_elegida == null ? null : parseInt(b.duracion_elegida, 10);
    var monto = b.monto_elegido == null ? null : parseInt(b.monto_elegido, 10);
    if ((dur !== null && (isNaN(dur) || dur < 1 || dur > 365)) || (monto !== null && (isNaN(monto) || monto < 0 || monto > 100000000))) {
      return res.status(400).json({ error: { message: "Datos inválidos." } });
    }
    await db.query(
      "update pedidos set comprobante_url = $2, comprobante_subido_en = now(), pago_pendiente_revision = true, " +
        "renovacion_duracion_dias = $3, renovacion_monto = $4 where id = $1",
      [b.pedido_id, b.url, dur, monto]
    );
    res.json({ data: null });
  } catch (e) {
    next(e);
  }
});

// El cliente avisa que pagó por transferencia/QR (hasta 3 horas después de crear el pedido).
router.post("/avisar_transferencia", async function (req, res, next) {
  try {
    var b = req.body || {};
    var ids = Array.isArray(b.pedido_ids) ? b.pedido_ids : [];
    if (ids.length === 0 || ids.length > 50 || !ids.every(function (i) { return UUID.test(String(i)); }) || !urlValida(b.url)) {
      return res.status(400).json({ error: { message: "Datos inválidos." } });
    }
    await db.query(
      "update pedidos set pago_online_estado = 'transferencia', pago_online_metodo = 'transferencia', " +
        "comprobante_url = $2, comprobante_subido_en = now() " +
        "where id = any($1::uuid[]) and creado_en > now() - interval '3 hours' " +
        "and (pago_online_estado is null or pago_online_estado in ('pendiente', 'transferencia', 'rechazado'))",
      [ids, b.url || null]
    );
    res.json({ data: null });
  } catch (e) {
    next(e);
  }
});

module.exports = { router: router };
