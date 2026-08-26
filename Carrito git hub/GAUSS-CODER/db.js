/* ============================================================
   DB.JS — Conexión con Supabase para Gauss Ortopedia
   Módulo compartido por carrito.js, reservas.js y admin.js.
   Requiere que supabase-config.js y el SDK de Supabase se
   carguen ANTES que este archivo.
   ============================================================ */

var GaussDB = (function () {
  "use strict";

  var listo = false;
  var cliente = null;

  function configurado() {
    return (
      typeof SUPABASE_URL !== "undefined" &&
      typeof SUPABASE_ANON_KEY !== "undefined" &&
      SUPABASE_URL.indexOf("PEGA_ACA") === -1 &&
      SUPABASE_ANON_KEY.indexOf("PEGA_ACA") === -1
    );
  }

  function obtenerCliente() {
    if (!configurado()) return null;
    if (!cliente && typeof supabase !== "undefined") {
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
   * Chequea si un producto está disponible entre fechaDesde y fechaHasta.
   * Devuelve { disponible: true } o { disponible:false, motivo }.
   * Si Supabase no está configurado, asume disponible (no bloquea al
   * cliente por un problema de configuración del sitio).
   */
  async function chequearDisponibilidad(productoId, fechaDesde, fechaHasta) {
    var db = obtenerCliente();
    if (!db) return { disponible: true, motivo: "sin-configurar" };

    try {
      var resultado = await db
        .from("disponibilidad_publica")
        .select("id")
        .eq("producto_id", productoId)
        .not("estado", "in", "(cancelado,devuelto)")
        .lte("fecha_desde", fechaHasta)
        .gte("fecha_hasta", fechaDesde);

      if (resultado.error) return { disponible: true, motivo: resultado.error.message };
      return { disponible: resultado.data.length === 0 };
    } catch (e) {
      return { disponible: true, motivo: String(e) };
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
          "id, producto_nombre, nombre, fecha_desde, fecha_hasta, duracion_dias, total, estado, pago_pendiente_revision"
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
  async function subirComprobante(pedidoId, archivo) {
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

      var rpc = await db.rpc("subir_comprobante", { pedido_id: pedidoId, url: url });
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

  return {
    configurado: configurado,
    crearPedido: crearPedido,
    chequearDisponibilidad: chequearDisponibilidad,
    buscarPedido: buscarPedido,
    subirComprobante: subirComprobante,
    obtenerCliente: obtenerCliente,
  };
})();
