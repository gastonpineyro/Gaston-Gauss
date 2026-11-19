"use strict";
var pg = require("pg");
var config = require("./config");

// Los DATE de Postgres se devuelven como texto "AAAA-MM-DD" (sin corrimiento de zona horaria).
pg.types.setTypeParser(1082, function (v) { return v; });
// numeric -> número (pago_online_monto)
pg.types.setTypeParser(1700, function (v) { return v === null ? null : parseFloat(v); });
// bigint (count) -> número
pg.types.setTypeParser(20, function (v) { return parseInt(v, 10); });

var pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
pool.on("error", function (e) { console.error("Error en la conexión a la base:", e.message); });

module.exports = {
  pool: pool,
  query: function (texto, params) { return pool.query(texto, params); },
};
