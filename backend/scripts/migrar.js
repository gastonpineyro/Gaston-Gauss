"use strict";
// Crea / actualiza las tablas. Se puede correr las veces que haga falta.
var fs = require("fs");
var path = require("path");
var db = require("../src/db");

(async function () {
  var sql = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8");
  await db.query(sql);
  console.log("Base de datos lista.");
  await db.pool.end();
})().catch(function (e) {
  console.error("No se pudo preparar la base:", e.message);
  process.exit(1);
});
