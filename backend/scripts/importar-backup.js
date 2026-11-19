"use strict";
// Pasa los datos de la copia de seguridad del panel (gauss-backup-AAAA-MM-DD.json) a este servidor.
// Uso: npm run importar -- ruta/al/gauss-backup.json
// Se puede correr varias veces: lo que ya existe no se duplica.
var fs = require("fs");
var db = require("../src/db");

// Orden importante: primero las tablas de las que dependen las demás.
var ORDEN = ["variantes_producto", "pedidos", "equipos", "equipos_historial", "contactos", "trabajos_plantillas"];
// variantes_producto: se pisa con el stock real del backup. El resto: lo existente no se toca.
var PISAR = { variantes_producto: true };

(async function () {
  var archivo = process.argv[2];
  if (!archivo || !fs.existsSync(archivo)) {
    console.error("Uso: npm run importar -- ruta/al/gauss-backup.json");
    process.exit(1);
  }
  var copia = JSON.parse(fs.readFileSync(archivo, "utf8"));
  if (!copia || !copia.tablas) {
    console.error("Ese archivo no parece una copia de seguridad del panel.");
    process.exit(1);
  }
  var cliente = await db.pool.connect();
  try {
    await cliente.query("begin");
    for (var t = 0; t < ORDEN.length; t++) {
      var tabla = ORDEN[t];
      var filas = copia.tablas[tabla] || [];
      var cols = (await cliente.query(
        "select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1", [tabla]
      )).rows;
      var tipos = {};
      cols.forEach(function (c) { tipos[c.column_name] = c.data_type; });
      var nuevas = 0, existentes = 0, omitidas = 0;
      for (var i = 0; i < filas.length; i++) {
        var f = filas[i];
        var ks = Object.keys(f).filter(function (k) { return k in tipos; });
        if (ks.length === 0 || !("id" in f)) { omitidas++; continue; }
        var vals = ks.map(function (k) {
          var v = f[k];
          return v !== null && typeof v === "object" && tipos[k] === "jsonb" ? JSON.stringify(v) : v;
        });
        var sql = "insert into " + tabla + " (" + ks.map(function (k) { return '"' + k + '"'; }).join(", ") + ") values (" +
          ks.map(function (k, j) { return "$" + (j + 1); }).join(", ") + ") ";
        if (PISAR[tabla]) {
          var sets = ks.filter(function (k) { return k !== "id"; }).map(function (k) { return '"' + k + '" = excluded."' + k + '"'; });
          sql += 'on conflict (id) do update set ' + (sets.join(", ") || "id = excluded.id");
        } else {
          sql += "on conflict (id) do nothing";
        }
        var r = await cliente.query(sql, vals);
        if (r.rowCount > 0) nuevas++; else existentes++;
      }
      console.log(tabla.padEnd(22) + " " + filas.length + " en la copia → " + nuevas + " cargadas, " + existentes + " ya estaban" + (omitidas ? ", " + omitidas + " omitidas" : ""));
    }
    await cliente.query("commit");
    console.log("Listo. Los datos se importaron correctamente.");
  } catch (e) {
    await cliente.query("rollback");
    console.error("No se importó nada (se deshizo todo). Motivo:", e.message);
    process.exitCode = 1;
  } finally {
    cliente.release();
    await db.pool.end();
  }
})();
