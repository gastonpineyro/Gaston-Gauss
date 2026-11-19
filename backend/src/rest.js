"use strict";
// API de datos genérica (reemplaza a PostgREST/RLS de Supabase).
// El navegador manda una "consulta" en JSON; acá se valida contra una lista
// blanca de tablas/columnas y permisos por rol, y se arma SQL con parámetros.
var express = require("express");
var db = require("./db");

var COLS_PEDIDO_PUBLICO_INSERT = [
  "tipo", "producto_id", "producto_nombre", "cantidad", "precio_unitario", "total",
  "fecha_desde", "fecha_hasta", "duracion_dias",
  "nombre", "apellido", "telefono", "dni", "direccion", "lesion",
];
// Lo único que un visitante puede leer de UN pedido (por su id), para renovar.html
var COLS_PEDIDO_PUBLICO_LEER = [
  "id", "producto_id", "producto_nombre", "nombre", "fecha_desde", "fecha_hasta",
  "duracion_dias", "total", "estado", "pago_pendiente_revision",
];

// rol -> operaciones permitidas, por tabla.
var TABLAS = {
  pedidos: { anon: ["insert", "select"], admin: ["select", "insert", "update", "delete"] },
  disponibilidad_publica: { anon: ["select"], admin: ["select"] },
  variantes_producto: { anon: ["select"], admin: ["select", "insert", "update", "delete"] },
  equipos: { anon: [], admin: ["select", "insert", "update", "delete"] },
  equipos_historial: { anon: [], admin: ["select", "insert", "update", "delete"] },
  contactos: { anon: [], admin: ["select", "insert", "update", "delete"] },
  trabajos_plantillas: { anon: [], admin: ["select", "insert", "update", "delete"] },
};

var OPERADORES = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike" };
var MAX_FILAS = 1000;

var columnas = null; // tabla -> { col: tipo }
async function cargarColumnas() {
  var r = await db.query(
    "select table_name, column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = any($1)",
    [Object.keys(TABLAS)]
  );
  var mapa = {};
  r.rows.forEach(function (f) {
    mapa[f.table_name] = mapa[f.table_name] || {};
    mapa[f.table_name][f.column_name] = f.data_type;
  });
  columnas = mapa;
}

class ErrorConsulta extends Error {
  constructor(mensaje, estado, codigo) {
    super(mensaje);
    this.estado = estado || 400;
    this.codigo = codigo || "";
  }
}

function ident(nombre) {
  return '"' + nombre.replace(/"/g, '""') + '"';
}

function validarColumna(tabla, col) {
  if (typeof col !== "string" || !columnas[tabla] || !(col in columnas[tabla])) {
    throw new ErrorConsulta("Columna inválida: " + String(col).slice(0, 40));
  }
  return col;
}

function listaColumnas(tabla, texto) {
  var t = (texto || "*").trim();
  if (t === "*" || t === "") return { todas: true, lista: Object.keys(columnas[tabla]) };
  var lista = t.split(",").map(function (c) { return validarColumna(tabla, c.trim()); });
  return { todas: false, lista: lista };
}

function parsearLista(val) {
  if (Array.isArray(val)) return val;
  var t = String(val).trim();
  if (t[0] === "(" && t[t.length - 1] === ")") t = t.slice(1, -1);
  return t === "" ? [] : t.split(",").map(function (s) { return s.trim().replace(/^"(.*)"$/, "$1"); });
}

// Arma "WHERE ..." con parámetros. filtros: [{col, op, val, not}]
function armarWhere(tabla, filtros, params) {
  var partes = [];
  (filtros || []).forEach(function (f) {
    var col = ident(validarColumna(tabla, f.col));
    var op = f.op;
    var cond;
    if (op in OPERADORES) {
      params.push(f.val);
      cond = col + " " + OPERADORES[op] + " $" + params.length;
    } else if (op === "in") {
      var lista = parsearLista(f.val);
      if (lista.length === 0) {
        cond = "false";
      } else {
        params.push(lista);
        cond = col + "::text = any($" + params.length + "::text[])";
      }
    } else if (op === "is") {
      if (f.val === null || f.val === "null") cond = col + " is null";
      else if (f.val === true || f.val === "true") cond = col + " is true";
      else if (f.val === false || f.val === "false") cond = col + " is false";
      else throw new ErrorConsulta("Filtro 'is' inválido");
    } else {
      throw new ErrorConsulta("Operador no permitido: " + String(op).slice(0, 20));
    }
    partes.push(f.not ? "not (" + cond + ")" : cond);
  });
  return partes.length ? " where " + partes.join(" and ") : "";
}

function valorParaColumna(tabla, col, v) {
  if (v !== null && typeof v === "object" && columnas[tabla][col] === "jsonb") return JSON.stringify(v);
  return v;
}

function permiso(tabla, rol, op) {
  var t = TABLAS[tabla];
  if (!t) throw new ErrorConsulta("Tabla no permitida", 403);
  if (t[rol].indexOf(op) === -1) {
    throw new ErrorConsulta(rol === "anon" ? "Necesitás iniciar sesión." : "Operación no permitida", rol === "anon" ? 401 : 403);
  }
}

async function ejecutar(q, rol) {
  if (!columnas) await cargarColumnas();
  var tabla = q.tabla;
  var op = q.op;
  permiso(tabla, rol, op);
  var params = [];

  if (op === "select") {
    var cols = listaColumnas(tabla, q.columnas);
    // Un visitante solo puede leer un pedido puntual (por id) y solo columnas públicas.
    if (tabla === "pedidos" && rol === "anon") {
      var soloId = (q.filtros || []).some(function (f) { return f.col === "id" && f.op === "eq" && !f.not; });
      var colsOk = !cols.todas && cols.lista.every(function (c) { return COLS_PEDIDO_PUBLICO_LEER.indexOf(c) !== -1; });
      if (!soloId || !colsOk) throw new ErrorConsulta("Necesitás iniciar sesión.", 401);
    }
    var sel = cols.lista.map(ident).join(", ");
    var sql = "select " + sel + " from " + ident(tabla) + armarWhere(tabla, q.filtros, params);
    var orden = (q.orden || []).map(function (o) {
      return ident(validarColumna(tabla, o.col)) + (o.asc === false ? " desc" : " asc");
    });
    if (orden.length) sql += " order by " + orden.join(", ");
    var limite = MAX_FILAS, desde = 0;
    if (Array.isArray(q.rango) && q.rango.length === 2) {
      desde = Math.max(parseInt(q.rango[0], 10) || 0, 0);
      limite = Math.min(Math.max((parseInt(q.rango[1], 10) || 0) - desde + 1, 0), MAX_FILAS);
    } else if (q.limite) {
      limite = Math.min(parseInt(q.limite, 10) || MAX_FILAS, MAX_FILAS);
    }
    if (q.unico) limite = 2;
    sql += " limit " + limite + " offset " + desde;
    var r = await db.query(sql, params);
    if (q.unico) {
      if (r.rows.length === 1) return { data: r.rows[0] };
      if (r.rows.length === 0 && q.unico === "quizas") return { data: null };
      throw new ErrorConsulta("JSON object requested, multiple (or no) rows returned", 406, "PGRST116");
    }
    return { data: r.rows };
  }

  if (op === "insert") {
    var filas = Array.isArray(q.valores) ? q.valores : [q.valores];
    if (filas.length === 0 || filas.length > 200) throw new ErrorConsulta("Cantidad de filas inválida");
    var permitidas = rol === "anon" && tabla === "pedidos" ? COLS_PEDIDO_PUBLICO_INSERT : Object.keys(columnas[tabla]);
    var colsInsert = [];
    filas.forEach(function (fila) {
      if (!fila || typeof fila !== "object") throw new ErrorConsulta("Fila inválida");
      Object.keys(fila).forEach(function (c) {
        validarColumna(tabla, c);
        if (permitidas.indexOf(c) === -1) {
          if (rol === "anon") return; // se ignora (no puede decidir estado, pagos, etc.)
          throw new ErrorConsulta("Columna no permitida: " + c);
        }
        if (colsInsert.indexOf(c) === -1) colsInsert.push(c);
      });
    });
    if (colsInsert.length === 0) throw new ErrorConsulta("No hay datos para guardar");
    var valoresSql = filas.map(function (fila) {
      return "(" + colsInsert.map(function (c) {
        params.push(c in fila ? valorParaColumna(tabla, c, fila[c]) : null);
        // Si la columna no viene, usa el valor por defecto de la base.
        return c in fila ? "$" + params.length : "default";
      }).join(", ") + ")";
    });
    var sqlI = "insert into " + ident(tabla) + " (" + colsInsert.map(ident).join(", ") + ") values " + valoresSql.join(", ");
    if (q.devolver) sqlI += " returning *";
    var ri = await db.query(sqlI, params);
    if (!q.devolver) return { data: null };
    return { data: q.unico ? ri.rows[0] || null : ri.rows };
  }

  if (op === "update" || op === "delete") {
    if (!q.filtros || q.filtros.length === 0) throw new ErrorConsulta("Falta indicar qué filas modificar");
    var sqlU;
    if (op === "update") {
      var cambios = q.valores || {};
      var cs = Object.keys(cambios);
      if (cs.length === 0) throw new ErrorConsulta("No hay cambios para guardar");
      var sets = cs.map(function (c) {
        validarColumna(tabla, c);
        if (c === "id") throw new ErrorConsulta("No se puede cambiar el id");
        params.push(valorParaColumna(tabla, c, cambios[c]));
        return ident(c) + " = $" + params.length;
      });
      sqlU = "update " + ident(tabla) + " set " + sets.join(", ") + armarWhere(tabla, q.filtros, params);
    } else {
      sqlU = "delete from " + ident(tabla) + armarWhere(tabla, q.filtros, params);
    }
    if (q.devolver) sqlU += " returning *";
    var ru = await db.query(sqlU, params);
    if (!q.devolver) return { data: null };
    return { data: q.unico ? ru.rows[0] || null : ru.rows };
  }

  throw new ErrorConsulta("Operación inválida");
}

var router = express.Router();

router.post("/", async function (req, res) {
  try {
    var q = req.body || {};
    var salida = await ejecutar(q, req.rol);
    res.json(salida);
  } catch (e) {
    if (e instanceof ErrorConsulta) {
      return res.status(e.estado).json({ error: { message: e.message, code: e.codigo } });
    }
    // Errores de la base (valor inválido, restricción, etc.): se informan sin datos internos.
    if (e && e.code && /^(22|23|42)/.test(e.code)) {
      return res.status(400).json({ error: { message: e.message, code: e.code } });
    }
    console.error("Error en consulta:", e);
    res.status(500).json({ error: { message: "Error interno del servidor." } });
  }
});

module.exports = { router: router, ejecutar: ejecutar, cargarColumnas: cargarColumnas };
