"use strict";
process.env.NODE_ENV = "test";
require("dotenv").config();
process.env.URL_PUBLICA = "http://localhost:3055";
var test = require("node:test");
var assert = require("node:assert");
var bcrypt = require("bcryptjs");
var db = require("../src/db");
var { crearApp } = require("../src/server");

var servidor, base, token;
var PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a7a20000000049454e44ae426082", "hex");

async function api(ruta, cuerpo, tk, extra) {
  var h = { "Content-Type": "application/json" };
  if (tk) h.Authorization = "Bearer " + tk;
  var r = await fetch(base + ruta, Object.assign({ method: "POST", headers: h, body: JSON.stringify(cuerpo) }, extra || {}));
  return { estado: r.status, json: await r.json() };
}
var rest = function (q, tk) { return api("/api/rest", q, tk); };

test.before(async function () {
  await db.query("delete from pedidos; delete from admin_users;");
  await db.query("insert into admin_users (email, password_hash) values ($1,$2)", ["admin@gauss.test", await bcrypt.hash("clave-segura-123", 4)]);
  servidor = crearApp().listen(0);
  base = "http://127.0.0.1:" + servidor.address().port;
});
test.after(async function () { servidor.close(); await db.pool.end(); });

test("login: clave mala rechazada, buena devuelve sesión", async function () {
  var mal = await api("/api/auth/login", { email: "admin@gauss.test", password: "otra" });
  assert.strictEqual(mal.estado, 400);
  var inexistente = await api("/api/auth/login", { email: "nadie@gauss.test", password: "otra" });
  assert.strictEqual(inexistente.estado, 400);
  assert.strictEqual(inexistente.json.error.message, mal.json.error.message);
  var ok = await api("/api/auth/login", { email: "ADMIN@gauss.test", password: "clave-segura-123" });
  assert.strictEqual(ok.estado, 200);
  token = ok.json.session.access_token;
  assert.ok(token);
});

test("visitante puede crear pedido pero no decide estado ni pagos", async function () {
  var r = await rest({ tabla: "pedidos", op: "insert", devolver: true, unico: "single",
    valores: { tipo: "venta", producto_id: "andador", producto_nombre: "Andador", cantidad: 1, precio_unitario: 100, total: 100,
      nombre: "Juan", dni: "30123456", estado: "entregado", pago_online_estado: "aprobado", pagado_en: "2026-01-01" } });
  assert.strictEqual(r.estado, 200, JSON.stringify(r.json));
  assert.strictEqual(r.json.data.estado, "pendiente");
  assert.strictEqual(r.json.data.pago_online_estado, null);
  assert.strictEqual(r.json.data.pagado_en, null);
  assert.strictEqual(r.json.data.nombre, "Juan");
});

test("visitante NO puede leer pedidos, ni tablas privadas, ni modificar", async function () {
  var a = await rest({ tabla: "pedidos", op: "select", columnas: "*" });
  assert.strictEqual(a.estado, 401);
  var b = await rest({ tabla: "pedidos", op: "select", columnas: "dni,nombre" });
  assert.strictEqual(b.estado, 401);
  var c = await rest({ tabla: "contactos", op: "select", columnas: "*" });
  assert.strictEqual(c.estado, 401);
  var d = await rest({ tabla: "pedidos", op: "update", valores: { estado: "cancelado" }, filtros: [{ col: "tipo", op: "eq", val: "venta" }] });
  assert.strictEqual(d.estado, 401);
  var e = await rest({ tabla: "pedidos", op: "delete", filtros: [{ col: "tipo", op: "eq", val: "venta" }] });
  assert.strictEqual(e.estado, 401);
  var f = await rest({ tabla: "admin_users", op: "select", columnas: "*" }, token);
  assert.strictEqual(f.estado, 403);
  var g = await rest({ tabla: "pedidos", op: "select", columnas: "*", filtros: [{ col: "id", op: "eq", val: "x" }] }, "token.falso.aqui");
  assert.strictEqual(g.estado, 401);
});

test("visitante lee 1 pedido por id con columnas públicas (renovar.html)", async function () {
  var id = (await db.query("select id from pedidos limit 1")).rows[0].id;
  var ok = await rest({ tabla: "pedidos", op: "select", unico: "single", columnas: "id, producto_nombre, nombre, estado",
    filtros: [{ col: "id", op: "eq", val: id }] });
  assert.strictEqual(ok.estado, 200);
  assert.strictEqual(ok.json.data.nombre, "Juan");
  var dni = await rest({ tabla: "pedidos", op: "select", unico: "single", columnas: "id, dni", filtros: [{ col: "id", op: "eq", val: id }] });
  assert.strictEqual(dni.estado, 401);
});

test("visitante lee disponibilidad y stock", async function () {
  var d = await rest({ tabla: "disponibilidad_publica", op: "select", columnas: "id",
    filtros: [{ col: "producto_id", op: "eq", val: "x" }, { col: "estado", op: "not", val: "(cancelado,devuelto)", not: true }] }).catch(function () { return null; });
  var v = await rest({ tabla: "variantes_producto", op: "select", columnas: "stock, en_reparacion", unico: "quizas", filtros: [{ col: "id", op: "eq", val: "muletas-chica" }] });
  assert.strictEqual(v.estado, 200);
  assert.strictEqual(v.json.data.stock >= 0, true);
  var cols = await rest({ tabla: "disponibilidad_publica", op: "select", columnas: "*" });
  assert.strictEqual(cols.estado, 200);
});

test("filtros de la disponibilidad (not in, lte, gte, like)", async function () {
  await db.query("insert into pedidos (tipo,producto_id,producto_nombre,precio_unitario,total,fecha_desde,fecha_hasta,estado) values " +
    "('alquiler','magneto','Magneto',1,1,'2026-12-01','2026-12-10','confirmado'),('alquiler','magneto','Magneto',1,1,'2026-12-01','2026-12-10','cancelado')");
  var r = await rest({ tabla: "disponibilidad_publica", op: "select", columnas: "id",
    filtros: [{ col: "producto_id", op: "like", val: "magneto%" }, { col: "estado", op: "in", val: "(cancelado,devuelto)", not: true },
      { col: "fecha_desde", op: "lte", val: "2026-12-05" }, { col: "fecha_hasta", op: "gte", val: "2026-12-02" }] });
  assert.strictEqual(r.estado, 200);
  assert.strictEqual(r.json.data.length, 1);
});

test("admin: leer, paginar, actualizar, borrar, y filtro obligatorio", async function () {
  var todos = await rest({ tabla: "pedidos", op: "select", columnas: "*", orden: [{ col: "creado_en", asc: false }], rango: [0, 0] }, token);
  assert.strictEqual(todos.estado, 200);
  assert.strictEqual(todos.json.data.length, 1);
  var id = todos.json.data[0].id;
  var sinFiltro = await rest({ tabla: "pedidos", op: "update", valores: { estado: "confirmado" }, filtros: [] }, token);
  assert.strictEqual(sinFiltro.estado, 400);
  var up = await rest({ tabla: "pedidos", op: "update", valores: { estado: "entregado" }, filtros: [{ col: "id", op: "eq", val: id }], devolver: true }, token);
  assert.strictEqual(up.json.data[0].estado, "entregado");
  var invalido = await rest({ tabla: "pedidos", op: "update", valores: { estado: "inventado" }, filtros: [{ col: "id", op: "eq", val: id }], devolver: true }, token);
  assert.strictEqual(invalido.estado, 400);
  var inj = await rest({ tabla: "pedidos", op: "select", columnas: "id; drop table pedidos", }, token);
  assert.strictEqual(inj.estado, 400);
  var inj2 = await rest({ tabla: "pedidos", op: "select", columnas: "*", filtros: [{ col: "estado", op: "eq; drop", val: "x" }] }, token);
  assert.strictEqual(inj2.estado, 400);
  var inj3 = await rest({ tabla: "pedidos", op: "select", columnas: "*", filtros: [{ col: "estado", op: "eq", val: "x' or '1'='1" }] }, token);
  assert.strictEqual(inj3.json.data.length, 0);
  var del = await rest({ tabla: "pedidos", op: "delete", filtros: [{ col: "id", op: "in", val: [id] }], devolver: true }, token);
  assert.strictEqual(del.json.data.length, 1);
});

test("admin: jsonb (contactos.historial) y equipos", async function () {
  var c = await rest({ tabla: "contactos", op: "insert", devolver: true, unico: "single",
    valores: { nombre: "Ana", historial: [{ producto: "Magneto", desde: "2026-01-01" }] } }, token);
  assert.strictEqual(c.estado, 200, JSON.stringify(c.json));
  assert.strictEqual(c.json.data.historial[0].producto, "Magneto");
  var e = await rest({ tabla: "equipos", op: "insert", valores: { id: "MAGNETO-001", variante_id: "magneto" }, devolver: true }, token);
  assert.strictEqual(e.estado, 200);
});

test("RPC: avisar_transferencia y subir_comprobante", async function () {
  var p = await rest({ tabla: "pedidos", op: "insert", devolver: true, unico: "single",
    valores: { tipo: "venta", producto_id: "x", producto_nombre: "X", precio_unitario: 5, total: 5 } });
  var id = p.json.data.id;
  var url = "http://localhost:3055/files/comprobantes/" + id + "/a.png";
  var mal = await api("/api/rpc/avisar_transferencia", { pedido_ids: [id], url: "http://evil.com/x.png" });
  assert.strictEqual(mal.estado, 400);
  var ok = await api("/api/rpc/avisar_transferencia", { pedido_ids: [id], url: url });
  assert.strictEqual(ok.estado, 200);
  var fila = (await db.query("select pago_online_estado, pago_online_metodo, comprobante_url from pedidos where id=$1", [id])).rows[0];
  assert.strictEqual(fila.pago_online_estado, "transferencia");
  assert.strictEqual(fila.comprobante_url, url);
  var sc = await api("/api/rpc/subir_comprobante", { pedido_id: id, url: url, duracion_elegida: 15, monto_elegido: 1000 });
  assert.strictEqual(sc.estado, 200);
  var inv = await api("/api/rpc/subir_comprobante", { pedido_id: "no-uuid", url: url });
  assert.strictEqual(inv.estado, 400);
});

test("archivos: acepta imagen real, rechaza falsificados y se sirve con cabeceras seguras", async function () {
  var id = (await db.query("select id from pedidos limit 1")).rows[0].id;
  function form(buf, nombre, carpeta) {
    var f = new FormData();
    f.append("carpeta", carpeta || id);
    f.append("archivo", new Blob([buf], { type: "image/png" }), nombre);
    return f;
  }
  var ok = await (await fetch(base + "/api/files/comprobantes", { method: "POST", body: form(PNG, "foto.png") })).json();
  assert.ok(ok.data.publicUrl.indexOf("/files/comprobantes/" + id) !== -1, JSON.stringify(ok));
  var servido = await fetch(base + ok.data.publicUrl.replace("http://localhost:3055", ""));
  assert.strictEqual(servido.status, 200);
  assert.strictEqual(servido.headers.get("x-content-type-options"), "nosniff");
  assert.match(servido.headers.get("content-security-policy"), /sandbox/);
  var falso = await fetch(base + "/api/files/comprobantes", { method: "POST", body: form(Buffer.from("<html><script>alert(1)</script></html>"), "x.png") });
  assert.strictEqual(falso.status, 400);
  var traversal = await fetch(base + "/api/files/comprobantes", { method: "POST", body: form(PNG, "x.png", "../../etc") });
  assert.strictEqual(traversal.status, 400);
  var grande = await fetch(base + "/api/files/comprobantes", { method: "POST", body: form(Buffer.concat([PNG, Buffer.alloc(9 * 1024 * 1024)]), "g.png") });
  assert.strictEqual(grande.status, 400);
  var fuga = await fetch(base + "/files/comprobantes/..%2f..%2f.env");
  assert.notStrictEqual(fuga.status, 200);
});
