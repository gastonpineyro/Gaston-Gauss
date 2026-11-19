"use strict";
require("dotenv").config();

function requerido(nombre) {
  var v = process.env[nombre];
  if (!v) {
    console.error("Falta la variable " + nombre + " en el archivo .env");
    process.exit(1);
  }
  return v;
}

var esTest = process.env.NODE_ENV === "test";

module.exports = {
  puerto: parseInt(process.env.PORT || "3000", 10),
  databaseUrl: requerido("DATABASE_URL"),
  jwtSecret: esTest ? (process.env.JWT_SECRET || "test-secret-test-secret-test-secret-123") : requerido("JWT_SECRET"),
  sesionHoras: parseInt(process.env.SESION_HORAS || "12", 10),
  origenes: (process.env.ORIGENES_PERMITIDOS || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean),
  carpetaArchivos: process.env.CARPETA_ARCHIVOS || "./archivos",
  urlPublica: (process.env.URL_PUBLICA || "").replace(/\/$/, ""),
  mpAccessToken: process.env.MP_ACCESS_TOKEN || "",
  mpWebhookSecret: process.env.MP_WEBHOOK_SECRET || "",
  siteUrl: (process.env.SITE_URL || "").replace(/\/$/, ""),
};
