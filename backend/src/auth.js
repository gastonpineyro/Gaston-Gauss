"use strict";
var express = require("express");
var bcrypt = require("bcryptjs");
var jwt = require("jsonwebtoken");
var rateLimit = require("express-rate-limit");
var config = require("./config");
var db = require("./db");

// Hash falso para que tardar lo mismo aunque el email no exista.
var HASH_FALSO = bcrypt.hashSync("no-existe-" + Math.random(), 10);

function firmarSesion(usuario) {
  var expiraEn = config.sesionHoras * 3600;
  var token = jwt.sign({ sub: usuario.id, email: usuario.email, rol: "admin" }, config.jwtSecret, {
    expiresIn: expiraEn,
    algorithm: "HS256",
  });
  return {
    access_token: token,
    expires_at: Math.floor(Date.now() / 1000) + expiraEn,
    user: { id: usuario.id, email: usuario.email },
  };
}

// Pone req.rol = "admin" si trae un token válido; si no, "anon".
function identificar(req, res, next) {
  req.rol = "anon";
  req.usuario = null;
  var cab = req.headers.authorization || "";
  var m = /^Bearer (.+)$/.exec(cab);
  if (m) {
    try {
      var datos = jwt.verify(m[1], config.jwtSecret, { algorithms: ["HS256"] });
      if (datos && datos.rol === "admin") {
        req.rol = "admin";
        req.usuario = { id: datos.sub, email: datos.email };
      }
    } catch (e) {
      /* token vencido o inválido: sigue como anónimo */
    }
  }
  next();
}

function soloAdmin(req, res, next) {
  if (req.rol !== "admin") return res.status(401).json({ error: { message: "Necesitás iniciar sesión." } });
  next();
}

var router = express.Router();

var limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Demasiados intentos. Esperá unos minutos y probá de nuevo." } },
});

router.post("/login", limiteLogin, async function (req, res, next) {
  try {
    var email = String((req.body && req.body.email) || "").trim().toLowerCase();
    var password = String((req.body && req.body.password) || "");
    if (!email || !password || password.length > 200) {
      return res.status(400).json({ error: { message: "Completá email y contraseña." } });
    }
    var r = await db.query("select id, email, password_hash from admin_users where email = $1 and activo", [email]);
    var usuario = r.rows[0];
    var ok = await bcrypt.compare(password, usuario ? usuario.password_hash : HASH_FALSO);
    if (!usuario || !ok) return res.status(400).json({ error: { message: "Email o contraseña incorrectos." } });
    res.json({ session: firmarSesion(usuario) });
  } catch (e) {
    next(e);
  }
});

router.get("/session", identificar, function (req, res) {
  if (req.rol !== "admin") return res.json({ session: null });
  res.json({ session: { user: req.usuario } });
});

router.post("/logout", function (req, res) {
  // Las sesiones son tokens que vencen solos; el navegador descarta el suyo.
  res.json({ ok: true });
});

module.exports = { router: router, identificar: identificar, soloAdmin: soloAdmin };
