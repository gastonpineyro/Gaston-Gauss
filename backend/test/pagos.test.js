"use strict";
process.env.NODE_ENV = "test";
require("dotenv").config();
process.env.URL_PUBLICA = "http://localhost:3055";
process.env.MP_ACCESS_TOKEN = "TEST-token";
process.env.MP_WEBHOOK_SECRET = "secreto";
var test = require("node:test");
var assert = require("node:assert");
var crypto = require("crypto");
var db = require("../src/db");
var funciones = require("../src/functions");
var { crearApp } = require("../src/server");

var servidor, base, id1, id2, llamadas = [];

async function post(ruta, cuerpo, headers) {
  var r = await fetch(base + ruta, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers || {}), body: JSON.stringify(cuerpo) });
  var t = await r.text();
  var j; try { j = JSON.parse(t); } catch (e) { j = t; }
  return { estado: r.status, json: j };
}
function firmar(pagoId, ts, reqId) {
  var v1 = crypto.createHmac("sha256", "secreto").update("id:" + pagoId + ";request-id:" + reqId + ";ts:" + ts + ";").digest("hex");
  return { "x-signature": "ts=" + ts + ",v1=" + v1, "x-request-id": reqId };
}

test.before(async function () {
  await db.query("delete from pedidos");
  id1 = (await db.query("insert into pedidos (tipo,producto_id,producto_nombre,precio_unitario,total) values ('venta','a','A',1000,1000) returning id")).rows[0].id;
  id2 = (await db.query("insert into pedidos (tipo,producto_id,producto_nombre,precio_unitario,total) values ('venta','b','B',500,500) returning id")).rows[0].id;
  servidor = crearApp().listen(0);
  base = "http://127.0.0.1:" + servidor.address().port;
  funciones.http.fetch = async function (url, opts) {
    llamadas.push({ url: url, opts: opts });
    if (url.indexOf("/checkout/preferences") !== -1) return { ok: true, json: async function () { return { init_point: "https://mp.test/pagar" }; } };
    var estado = global.__estadoMP || "approved";
    var monto = global.__montoMP || 1500;
    return { ok: true, json: async function () { return { status: estado, transaction_amount: monto, external_reference: id1 + "," + id2, payment_type_id: "credit_card", date_approved: "2026-11-19T10:00:00Z" }; } };
  };
});
test.after(async function () { servidor.close(); await db.pool.end(); });

test("crear-pago: el monto sale de la base, no del navegador", async function () {
  var r = await post("/api/functions/crear-pago", { pedidos: [id1, id2], total: 1 });
  assert.strictEqual(r.estado, 200, JSON.stringify(r.json));
  assert.strictEqual(r.json.url, "https://mp.test/pagar");
  var pref = JSON.parse(llamadas[0].opts.body);
  assert.deepStrictEqual(pref.items.map(function (i) { return i.unit_price; }), [1000, 500]);
  assert.strictEqual(pref.notification_url, "http://localhost:3055/api/functions/mp-webhook");
  var est = (await db.query("select pago_online_estado from pedidos where id=$1", [id1])).rows[0].pago_online_estado;
  assert.strictEqual(est, "pendiente");
});

test("crear-pago: rechaza ids inválidos y pedidos inexistentes", async function () {
  assert.strictEqual((await post("/api/functions/crear-pago", { pedidos: ["x"] })).estado, 400);
  assert.strictEqual((await post("/api/functions/crear-pago", { pedidos: ["11111111-1111-1111-1111-111111111111"] })).estado, 404);
});

test("webhook: sin firma o con firma falsa se rechaza", async function () {
  var sin = await post("/api/functions/mp-webhook", { type: "payment", data: { id: "123" } });
  assert.strictEqual(sin.estado, 401);
  var falsa = await post("/api/functions/mp-webhook", { type: "payment", data: { id: "123" } }, { "x-signature": "ts=1,v1=00", "x-request-id": "r" });
  assert.strictEqual(falsa.estado, 401);
});

test("webhook: pago aprobado por el monto correcto marca los pedidos", async function () {
  var ok = await post("/api/functions/mp-webhook", { type: "payment", data: { id: "123" } }, firmar("123", "1700000000", "req-1"));
  assert.strictEqual(ok.estado, 200);
  var f = (await db.query("select pago_online_estado, pago_online_id, pago_online_monto, pago_online_metodo, pagado_en from pedidos where id=$1", [id1])).rows[0];
  assert.strictEqual(f.pago_online_estado, "aprobado");
  assert.strictEqual(f.pago_online_id, "123");
  assert.strictEqual(f.pago_online_monto, 1500);
  assert.ok(f.pagado_en);
});

test("webhook: monto distinto va a revisar; un rechazo no pisa un pago aprobado", async function () {
  global.__estadoMP = "rejected";
  await post("/api/functions/mp-webhook", { type: "payment", data: { id: "999" } }, firmar("999", "1700000001", "req-2"));
  var f = (await db.query("select pago_online_estado, pago_online_id from pedidos where id=$1", [id1])).rows[0];
  assert.strictEqual(f.pago_online_estado, "aprobado");
  assert.strictEqual(f.pago_online_id, "123");
  global.__estadoMP = "approved"; global.__montoMP = 10;
  await db.query("update pedidos set pago_online_estado=null, pago_online_id=null where true");
  await post("/api/functions/mp-webhook", { type: "payment", data: { id: "555" } }, firmar("555", "1700000002", "req-3"));
  var g = (await db.query("select pago_online_estado from pedidos where id=$1", [id2])).rows[0];
  assert.strictEqual(g.pago_online_estado, "revisar_monto");
});

test("crear-pago: pedido ya pagado no se vuelve a cobrar", async function () {
  await db.query("update pedidos set pago_online_estado='aprobado' where id=$1", [id1]);
  var r = await post("/api/functions/crear-pago", { pedidos: [id1] });
  assert.strictEqual(r.estado, 409);
});
