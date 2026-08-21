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
        nombre: pedido.nombre || null,
        apellido: pedido.apellido || null,
        dni: pedido.dni || null,
        direccion: pedido.direccion || null,
        lesion: pedido.lesion || null,
      };
      var resultado = await db.from("pedidos").insert(fila).select().single();
      if (resultado.error) return { ok: false, motivo: resultado.error.message };
      return { ok: true, pedido: resultado.data };
    } catch (e) {
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
        .neq("estado", "cancelado")
        .lte("fecha_desde", fechaHasta)
        .gte("fecha_hasta", fechaDesde);

      if (resultado.error) return { disponible: true, motivo: resultado.error.message };
      return { disponible: resultado.data.length === 0 };
    } catch (e) {
      return { disponible: true, motivo: String(e) };
    }
  }

  return {
    configurado: configurado,
    crearPedido: crearPedido,
    chequearDisponibilidad: chequearDisponibilidad,
    obtenerCliente: obtenerCliente,
  };
})();
