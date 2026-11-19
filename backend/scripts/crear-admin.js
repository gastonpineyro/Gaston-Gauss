"use strict";
// Uso: npm run crear-admin -- correo@ejemplo.com
// Pide la contraseña por pantalla (o la toma de la variable ADMIN_PASSWORD).
var bcrypt = require("bcryptjs");
var readline = require("readline");
var db = require("../src/db");

function preguntar(texto) {
  var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(function (ok) { rl.question(texto, function (r) { rl.close(); ok(r); }); });
}

(async function () {
  var email = String(process.argv[2] || "").trim().toLowerCase();
  if (!email || email.indexOf("@") === -1) {
    console.error("Uso: npm run crear-admin -- correo@ejemplo.com");
    process.exit(1);
  }
  var password = process.env.ADMIN_PASSWORD || (await preguntar("Contraseña (mínimo 10 caracteres): "));
  if (password.length < 10) {
    console.error("La contraseña es muy corta (mínimo 10 caracteres).");
    process.exit(1);
  }
  var hash = await bcrypt.hash(password, 12);
  await db.query(
    "insert into admin_users (email, password_hash) values ($1, $2) " +
      "on conflict (email) do update set password_hash = excluded.password_hash, activo = true",
    [email, hash]
  );
  console.log("Listo: usuario " + email + " creado/actualizado.");
  await db.pool.end();
})().catch(function (e) {
  console.error("Error:", e.message);
  process.exit(1);
});
