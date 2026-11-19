"use strict";
// Subida y publicación de comprobantes (reemplaza al Storage de Supabase).
var express = require("express");
var multer = require("multer");
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var rateLimit = require("express-rate-limit");
var config = require("./config");

var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var MAX_BYTES = 8 * 1024 * 1024;

// Se detecta el tipo por el contenido real del archivo, no por lo que diga el navegador.
function detectarTipo(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.slice(0, 4).toString("latin1") === "GIF8") return "gif";
  if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") return "webp";
  if (buf.slice(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf.slice(4, 8).toString("latin1") === "ftyp") {
    var marca = buf.slice(8, 12).toString("latin1");
    if (/^(heic|heix|hevc|mif1|msf1)$/.test(marca)) return "heic";
  }
  return null;
}

function carpetaComprobantes() {
  return path.resolve(config.carpetaArchivos, "comprobantes");
}

var subir = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });

var limite = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Demasiadas subidas seguidas. Probá de nuevo en un rato." } },
});

var router = express.Router();

router.post("/comprobantes", limite, function (req, res, next) {
  subir.single("archivo")(req, res, function (err) {
    if (err) {
      var msg = err.code === "LIMIT_FILE_SIZE" ? "El archivo es muy pesado (máximo 8 MB)." : "No se pudo recibir el archivo.";
      return res.status(400).json({ error: { message: msg } });
    }
    try {
      var carpeta = String((req.body && req.body.carpeta) || "");
      if (!UUID.test(carpeta)) return res.status(400).json({ error: { message: "Datos inválidos." } });
      if (!req.file) return res.status(400).json({ error: { message: "Falta el archivo." } });
      var tipo = detectarTipo(req.file.buffer);
      if (!tipo) return res.status(400).json({ error: { message: "Solo se aceptan fotos (JPG, PNG, WEBP, HEIC) o PDF." } });

      var dir = path.join(carpetaComprobantes(), carpeta.toLowerCase());
      fs.mkdirSync(dir, { recursive: true });
      var nombre = Date.now() + "-" + crypto.randomBytes(6).toString("hex") + "." + tipo;
      fs.writeFileSync(path.join(dir, nombre), req.file.buffer, { flag: "wx" });
      var ruta = carpeta.toLowerCase() + "/" + nombre;
      res.json({ data: { path: ruta, publicUrl: config.urlPublica + "/files/comprobantes/" + ruta } });
    } catch (e) {
      next(e);
    }
  });
});

// Publica los comprobantes (el link es largo y no adivinable, igual que antes).
function servirComprobantes() {
  return express.static(carpetaComprobantes(), {
    dotfiles: "deny",
    index: false,
    redirect: false,
    maxAge: "7d",
    setHeaders: function (res) {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self'");
      res.setHeader("Content-Disposition", "inline");
    },
  });
}

module.exports = { router: router, servirComprobantes: servirComprobantes, detectarTipo: detectarTipo };
