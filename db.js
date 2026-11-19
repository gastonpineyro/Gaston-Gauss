/* ============================================================
   DB.JS — Conexión con Supabase para Gauss Ortopedia
   Módulo compartido por carrito.js, reservas.js y admin.js.
   Requiere que supabase-config.js y el SDK de Supabase se
   carguen ANTES que este archivo.
   ============================================================ */


/* ============================================================
   CLIENTE DEL SERVIDOR PROPIO
   Imita lo justo de Supabase (from/select/insert/update/delete,
   rpc, storage, functions y auth) para que el resto del sitio
   funcione igual con el backend propio. Se usa solo si en
   supabase-config.js está completa la constante BACKEND_URL.
   ============================================================ */
var GaussClienteAPI = (function () {
  "use strict";
  var CLAVE_SESION = "gauss-sesion";

  function leerSesion() {
    try {
      var s = JSON.parse(localStorage.getItem(CLAVE_SESION));
      if (s && s.access_token && s.expires_at * 1000 > Date.now()) return s;
    } catch (e) {}
    return null;
  }
  function guardarSesion(s) {
    try { if (s) localStorage.setItem(CLAVE_SESION, JSON.stringify(s)); else localStorage.removeItem(CLAVE_SESION); } catch (e) {}
  }

  function crear(urlBase) {
    var base = String(urlBase).replace(/\/$/, "");
    var urlsSubidas = {};

    function cabeceras(conJson) {
      var h = {};
      if (conJson) h["Content-Type"] = "application/json";
      var s = leerSesion();
      if (s) h.Authorization = "Bearer " + s.access_token;
      return h;
    }

    async function llamar(ruta, cuerpo) {
      try {
        var r = await fetch(base + ruta, { method: "POST", headers: cabeceras(true), body: JSON.stringify(cuerpo || {}) });
        var j = null;
        try { j = await r.json(); } catch (e) {}
        if (!r.ok) {
          var msg = (j && j.error && (j.error.message || j.error)) || "Error " + r.status;
          return { data: null, error: { message: String(msg), code: (j && j.error && j.error.code) || "", status: r.status } };
        }
        return { data: j && "data" in j ? j.data : j, error: null };
      } catch (e) {
        return { data: null, error: { message: "No se pudo conectar con el servidor." } };
      }
    }

    function Consulta(tabla) {
      this.q = { tabla: tabla, op: "select", columnas: "*", filtros: [], orden: [] };
    }
    var P = Consulta.prototype;
    P.select = function (columnas) {
      if (this.q.op === "select") this.q.columnas = columnas || "*";
      else this.q.devolver = true;
      return this;
    };
    P.insert = function (valores) { this.q.op = "insert"; this.q.valores = valores; return this; };
    P.update = function (valores) { this.q.op = "update"; this.q.valores = valores; return this; };
    P.delete = function () { this.q.op = "delete"; return this; };
    ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike"].forEach(function (op) {
      P[op] = function (col, val) { this.q.filtros.push({ col: col, op: op, val: val }); return this; };
    });
    P.in = function (col, val) { this.q.filtros.push({ col: col, op: "in", val: val }); return this; };
    P.is = function (col, val) { this.q.filtros.push({ col: col, op: "is", val: val }); return this; };
    P.not = function (col, op, val) { this.q.filtros.push({ col: col, op: op, val: val, not: true }); return this; };
    P.match = function (obj) {
      var self = this;
      Object.keys(obj).forEach(function (k) { self.q.filtros.push({ col: k, op: "eq", val: obj[k] }); });
      return this;
    };
    P.order = function (col, opts) { this.q.orden.push({ col: col, asc: !(opts && opts.ascending === false) }); return this; };
    P.range = function (desde, hasta) { this.q.rango = [desde, hasta]; return this; };
    P.limit = function (n) { this.q.limite = n; return this; };
    P.single = function () { this.q.unico = "single"; return this; };
    P.maybeSingle = function () { this.q.unico = "quizas"; return this; };
    P.then = function (ok, fallo) { return llamar("/api/rest", this.q).then(ok, fallo); };

    return {
      from: function (tabla) { return new Consulta(tabla); },
      rpc: function (nombre, params) { return llamar("/api/rpc/" + nombre, params); },
      functions: {
        invoke: async function (nombre, opciones) {
          var r = await llamar("/api/functions/" + nombre, (opciones && opciones.body) || {});
          // Estas funciones devuelven {url} o {error} directamente.
          return r;
        },
      },
      storage: {
        from: function (bucket) {
          return {
            upload: async function (ruta, archivo) {
              try {
                var f = new FormData();
                f.append("carpeta", String(ruta).split("/")[0]);
                f.append("archivo", archivo);
                var r = await fetch(base + "/api/files/" + bucket, { method: "POST", body: f });
                var j = await r.json().catch(function () { return null; });
                if (!r.ok) return { data: null, error: { message: (j && j.error && j.error.message) || "Error " + r.status } };
                urlsSubidas[ruta] = j.data.publicUrl;
                return { data: { path: j.data.path }, error: null };
              } catch (e) {
                return { data: null, error: { message: "No se pudo conectar con el servidor." } };
              }
            },
            getPublicUrl: function (ruta) { return { data: { publicUrl: urlsSubidas[ruta] || base + "/files/" + bucket + "/" + ruta } }; },
          };
        },
      },
      auth: {
        signInWithPassword: async function (cred) {
          var r = await llamar("/api/auth/login", { email: cred.email, password: cred.password });
          if (r.error) return { data: { session: null, user: null }, error: r.error };
          guardarSesion(r.data.session);
          return { data: { session: r.data.session, user: r.data.session.user }, error: null };
        },
        getSession: async function () { return { data: { session: leerSesion() }, error: null }; },
        signOut: async function () { guardarSesion(null); return { error: null }; },
        onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
      },
    };
  }
  return { crear: crear };
})();

var GaussDB = (function () {
  "use strict";

  var listo = false;
  var cliente = null;

  function usaBackendPropio() {
    return typeof BACKEND_URL !== "undefined" && typeof BACKEND_URL === "string" && BACKEND_URL.trim() !== "";
  }

  function configurado() {
    if (usaBackendPropio()) return true;
    return (
      typeof SUPABASE_URL !== "undefined" &&
      typeof SUPABASE_ANON_KEY !== "undefined" &&
      SUPABASE_URL.indexOf("PEGA_ACA") === -1 &&
      SUPABASE_ANON_KEY.indexOf("PEGA_ACA") === -1
    );
  }

  function obtenerCliente() {
    if (!configurado()) return null;
    if (!cliente && usaBackendPropio()) {
      cliente = GaussClienteAPI.crear(BACKEND_URL);
      listo = true;
    } else if (!cliente && typeof supabase !== "undefined") {
      cliente = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      listo = true;
    }
    return cliente;
  }

  /**
   * Guarda un pedido (venta o alquiler) en Supabase.
   * No lanza error hacia afuera: si falla (o no está configurado),
   * devuelve { ok:false } y el flujo de WhatsApp sigue andando igual,
   * para que un problema de conexión nunca le impida a alguien reservar.
   */
  async function crearPedido(pedido) {
    var db = obtenerCliente();
    if (!db) return { ok: false, motivo: "sin-configurar" };

    try {
      var fila = {
        tipo: pedido.tipo,
        producto_id: pedido.productoId,
        producto_nombre: pedido.productoNombre,
        cantidad: pedido.cantidad || 1,
        precio_unitario: pedido.precioUnitario,
        total: pedido.total,
        fecha_desde: pedido.fechaDesde || null,
        fecha_hasta: pedido.fechaHasta || null,
        duracion_dias: pedido.duracionDias || null,
        nombre: pedido.nombre || null,
        apellido: pedido.apellido || null,
        telefono: pedido.telefono || null,
        dni: pedido.dni || null,
        direccion: pedido.direccion || null,
        lesion: pedido.lesion || null,
      };
      var resultado = await db.from("pedidos").insert(fila).select().single();
      if (resultado.error) {
        console.warn("GaussDB: no se pudo guardar el pedido ->", resultado.error.message);
        return { ok: false, motivo: resultado.error.message };
      }
      return { ok: true, pedido: resultado.data };
    } catch (e) {
      console.warn("GaussDB: error de conexión al guardar el pedido ->", e);
      return { ok: false, motivo: String(e) };
    }
  }

  /**
   * Chequea si una VARIANTE puntual (ej: "muletas-mediana") tiene stock
   * libre entre fechaDesde y fechaHasta: cuenta cuántas reservas activas
   * se superponen con esas fechas y lo compara contra el stock cargado
   * en variantes_producto. Si la variante no está en esa tabla (todavía
   * no armaste el stock, o no aplica), asume disponible.
   */
  // El Magneto es un solo equipo: el modelo (placas, tubos, tubo y placas) se
  // elige en el pedido, pero el stock y los QR son de "magneto" en conjunto.
  function esMagneto(id) {
    return typeof id === "string" && (id === "magneto" || id.indexOf("magneto-") === 0);
  }

  async function chequearDisponibilidad(productoId, fechaDesde, fechaHasta) {
    var db = obtenerCliente();
    if (!db) return { disponible: true, motivo: "sin-configurar" };

    try {
      // Los equipos en reparacion no se pueden alquilar: se descuentan del stock.
      var agrupado = esMagneto(productoId);
      var stockResultado = await db
        .from("variantes_producto")
        .select("stock, en_reparacion")
        .eq("id", agrupado ? "magneto" : productoId)
        .maybeSingle();

      // Si todavia no se unificaron las variantes del Magneto en la base,
      // se suman las que haya (placas + tubos + tubo y placas).
      if (agrupado && !stockResultado.error && !stockResultado.data) {
        var sueltas = await db.from("variantes_producto").select("stock, en_reparacion").like("id", "magneto-%");
        if (!sueltas.error && sueltas.data && sueltas.data.length) {
          stockResultado = {
            data: {
              stock: sueltas.data.reduce(function (a, r) { return a + (r.stock || 0); }, 0),
              en_reparacion: sueltas.data.reduce(function (a, r) { return a + (r.en_reparacion || 0); }, 0),
            },
          };
        }
      }

      if (stockResultado.error) {
        // Por si todavia no existe la columna en_reparacion en la base.
        stockResultado = await db
          .from("variantes_producto")
          .select("stock")
          .eq("id", agrupado ? "magneto" : productoId)
          .maybeSingle();
      }

      var stock = stockResultado.data
        ? Math.max(stockResultado.data.stock - (stockResultado.data.en_reparacion || 0), 0)
        : 1;

      var consultaOcupadas = db.from("disponibilidad_publica").select("id");
      consultaOcupadas = agrupado
        ? consultaOcupadas.like("producto_id", "magneto%")
        : consultaOcupadas.eq("producto_id", productoId);
      var resultado = await consultaOcupadas
        .not("estado", "in", "(cancelado,devuelto)")
        .lte("fecha_desde", fechaHasta)
        .gte("fecha_hasta", fechaDesde);

      if (resultado.error) return { disponible: true, motivo: resultado.error.message };
      return { disponible: resultado.data.length < stock, ocupadas: resultado.data.length, stock: stock };
    } catch (e) {
      return { disponible: true, motivo: String(e) };
    }
  }

  /**
   * Trae todas las variantes con su stock, para mostrarlas/editarlas
   * en el panel de administración.
   */
  async function listarVariantes() {
    var db = obtenerCliente();
    if (!db) return { ok: false, motivo: "sin-configurar" };
    try {
      var resultado = await db
        .from("variantes_producto")
        .select("*")
        .order("producto_id")
        .order("variante");
      if (resultado.error) return { ok: false, motivo: resultado.error.message };
      return { ok: true, variantes: resultado.data };
    } catch (e) {
      return { ok: false, motivo: String(e) };
    }
  }

  /**
   * Actualiza la cantidad de stock de una variante. Requiere estar
   * logueado (lo controla la política de Supabase, no esta función).
   */
  async function actualizarStock(id, nuevoStock) {
    var db = obtenerCliente();
    if (!db) return { ok: false, motivo: "sin-configurar" };
    try {
      var resultado = await db
        .from("variantes_producto")
        .update({ stock: nuevoStock })
        .eq("id", id)
        .select();
      if (resultado.error) return { ok: false, motivo: resultado.error.message };
      if (!resultado.data || resultado.data.length === 0) {
        return {
          ok: false,
          motivo:
            "No se actualizó ninguna fila (¿la sesión venció? probá cerrar sesión y volver a entrar, o revisá que hayas corrido supabase-schema.sql).",
        };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, motivo: String(e) };
    }
  }

  /**
   * Busca un pedido puntual por id (para la página renovar.html).
   * Solo trae lo necesario para mostrarle el resumen al cliente.
   */
  async function buscarPedido(pedidoId) {
    var db = obtenerCliente();
    if (!db) return { ok: false, motivo: "sin-configurar" };
    try {
      var resultado = await db
        .from("pedidos")
        .select(
          "id, producto_id, producto_nombre, nombre, fecha_desde, fecha_hasta, duracion_dias, total, estado, pago_pendiente_revision"
        )
        .eq("id", pedidoId)
        .single();
      if (resultado.error) return { ok: false, motivo: resultado.error.message };
      return { ok: true, pedido: resultado.data };
    } catch (e) {
      return { ok: false, motivo: String(e) };
    }
  }

  /**
   * Sube la imagen del comprobante al Storage de Supabase y marca el
   * pedido como "pago_pendiente_revision" a través de una función segura
   * (el cliente, sin login, solo puede tocar ese campo puntual, nada más).
   */
  async function subirComprobante(pedidoId, archivo, duracionElegida, montoElegido) {
    var db = obtenerCliente();
    if (!db) return { ok: false, motivo: "sin-configurar" };

    try {
      var extension = (archivo.name && archivo.name.split(".").pop()) || "jpg";
      var ruta = pedidoId + "/" + Date.now() + "." + extension;

      var subida = await db.storage.from("comprobantes").upload(ruta, archivo, {
        cacheControl: "3600",
        upsert: false,
      });
      if (subida.error) {
        console.warn("GaussDB: no se pudo subir el comprobante ->", subida.error.message);
        return { ok: false, motivo: subida.error.message };
      }

      var publica = db.storage.from("comprobantes").getPublicUrl(ruta);
      var url = publica.data.publicUrl;

      var rpc = await db.rpc("subir_comprobante", {
        pedido_id: pedidoId,
        url: url,
        duracion_elegida: duracionElegida || null,
        monto_elegido: montoElegido || null,
      });
      if (rpc.error) {
        console.warn("GaussDB: no se pudo asociar el comprobante al pedido ->", rpc.error.message);
        return { ok: false, motivo: rpc.error.message };
      }

      return { ok: true, url: url };
    } catch (e) {
      console.warn("GaussDB: error de conexión al subir el comprobante ->", e);
      return { ok: false, motivo: String(e) };
    }
  }

  // El cliente avisa que pagó por transferencia/QR. El comprobante (foto) es opcional.
  async function avisarTransferencia(ids, archivo) {
    var db = obtenerCliente();
    if (!db) return { ok: false, motivo: "sin-configurar" };
    try {
      var url = null;
      if (archivo) {
        var extension = (archivo.name && archivo.name.split(".").pop()) || "jpg";
        var ruta = ids[0] + "/" + Date.now() + "." + extension;
        var subida = await db.storage.from("comprobantes").upload(ruta, archivo, { cacheControl: "3600", upsert: false });
        if (subida.error) return { ok: false, motivo: subida.error.message };
        url = db.storage.from("comprobantes").getPublicUrl(ruta).data.publicUrl;
      }
      var rpc = await db.rpc("avisar_transferencia", { pedido_ids: ids, url: url });
      if (rpc.error) return { ok: false, motivo: rpc.error.message };
      return { ok: true, url: url };
    } catch (e) {
      return { ok: false, motivo: String(e) };
    }
  }

  // Pide a la función del servidor el link de pago de Mercado Pago para estos pedidos.
  async function iniciarPagoOnline(ids) {
    var db = obtenerCliente();
    if (!db) return { ok: false, motivo: "sin-configurar" };
    try {
      var r = await db.functions.invoke("crear-pago", { body: { pedidos: ids } });
      if (r.error || !r.data || !r.data.url) {
        return { ok: false, motivo: (r.error && r.error.message) || (r.data && r.data.error) || "sin respuesta" };
      }
      return { ok: true, url: r.data.url };
    } catch (e) {
      return { ok: false, motivo: String(e) };
    }
  }

  return {
    iniciarPagoOnline: iniciarPagoOnline,
    avisarTransferencia: avisarTransferencia,
    configurado: configurado,
    crearPedido: crearPedido,
    chequearDisponibilidad: chequearDisponibilidad,
    buscarPedido: buscarPedido,
    subirComprobante: subirComprobante,
    listarVariantes: listarVariantes,
    actualizarStock: actualizarStock,
    obtenerCliente: obtenerCliente,
  };
})();
