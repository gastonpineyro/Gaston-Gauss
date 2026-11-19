"use strict";
var express = require("express");
var helmet = require("helmet");
var cors = require("cors");
var fs = require("fs");
var config = require("./config");
var auth = require("./auth");
var rest = require("./rest");
var rpc = require("./rpc");
var files = require("./files");
var functions = require("./functions");

function crearApp() {
  var app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // detrás de nginx

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin: function (origen, cb) {
        // Sin "Origin" (curl, servidor a servidor) se deja pasar; desde un navegador solo las páginas autorizadas.
        if (!origen || config.origenes.indexOf(origen) !== -1) return cb(null, true);
        cb(null, false);
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    })
  );

  fs.mkdirSync(config.carpetaArchivos, { recursive: true });
  fs.mkdirSync(require("path").join(config.carpetaArchivos, "comprobantes"), { recursive: true });
  app.use("/files/comprobantes", files.servirComprobantes());

  // El webhook de Mercado Pago necesita el cuerpo tal cual llegó para verificar la firma.
  app.use("/api/functions/mp-webhook", express.raw({ type: "*/*", limit: "1mb" }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", function (req, res) { res.json({ ok: true }); });
  app.use("/api/auth", auth.router);
  app.use("/api/rest", auth.identificar, rest.router);
  app.use("/api/rpc", rpc.router);
  app.use("/api/files", files.router);
  app.use("/api/functions", functions.router);

  app.use(function (req, res) { res.status(404).json({ error: { message: "No encontrado." } }); });
  // eslint-disable-next-line no-unused-vars
  app.use(function (err, req, res, next) {
    if (err && err.type === "entity.parse.failed") return res.status(400).json({ error: { message: "Datos inválidos." } });
    console.error("Error:", err);
    res.status(500).json({ error: { message: "Error interno del servidor." } });
  });
  return app;
}

module.exports = { crearApp: crearApp };

if (require.main === module) {
  crearApp().listen(config.puerto, function () {
    console.log("Servidor de Gauss escuchando en el puerto " + config.puerto);
  });
}
