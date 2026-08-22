/* ============================================================
   RENOVAR.JS — Página pública donde el cliente sube el
   comprobante de pago para renovar su alquiler.
   ============================================================ */

(function () {
  "use strict";

  function formatearPrecio(numero) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(numero || 0);
  }

  function formatearFecha(fechaISO) {
    if (!fechaISO) return "-";
    var partes = fechaISO.split("-");
    return partes[2] + "/" + partes[1] + "/" + partes[0];
  }

  function obtenerIdDeUrl() {
    var params = new URLSearchParams(window.location.search);
    return params.get("pedido");
  }

  document.addEventListener("DOMContentLoaded", async function () {
    var cargando = document.getElementById("cargandoRenovar");
    var error = document.getElementById("errorRenovar");
    var contenido = document.getElementById("contenidoRenovar");
    var formulario = document.getElementById("formularioRenovar");
    var pendiente = document.getElementById("pendienteRenovar");
    var exito = document.getElementById("exitoRenovar");

    var id = obtenerIdDeUrl();
    if (!id || !GaussDB.configurado()) {
      cargando.classList.add("d-none");
      error.classList.remove("d-none");
      return;
    }

    var resultado = await GaussDB.buscarPedido(id);
    cargando.classList.add("d-none");

    if (!resultado.ok || !resultado.pedido) {
      error.classList.remove("d-none");
      return;
    }

    var pedido = resultado.pedido;
    contenido.classList.remove("d-none");

    document.getElementById("tituloRenovar").textContent = pedido.producto_nombre;
    document.getElementById("renovarFechaHasta").textContent = formatearFecha(pedido.fecha_hasta);
    document.getElementById("renovarDuracion").textContent = (pedido.duracion_dias || "-") + " días";
    document.getElementById("renovarMonto").textContent = formatearPrecio(pedido.total);
    document.getElementById("renovarAlias").textContent =
      typeof ALIAS_PAGO !== "undefined" ? ALIAS_PAGO : "-";

    if (pedido.pago_pendiente_revision) {
      formulario.classList.add("d-none");
      pendiente.classList.remove("d-none");
      return;
    }

    var btnSubir = document.getElementById("btnSubirComprobante");
    var aviso = document.getElementById("avisoRenovar");

    btnSubir.addEventListener("click", async function () {
      var input = document.getElementById("archivoComprobante");
      var archivo = input.files && input.files[0];
      aviso.classList.add("d-none");

      if (!archivo) {
        aviso.textContent = "Elegí primero una foto del comprobante.";
        aviso.classList.remove("d-none");
        return;
      }

      var textoOriginal = btnSubir.textContent;
      btnSubir.textContent = "Subiendo...";
      btnSubir.classList.add("deshabilitado");

      var subida = await GaussDB.subirComprobante(id, archivo);

      if (!subida.ok) {
        btnSubir.textContent = textoOriginal;
        btnSubir.classList.remove("deshabilitado");
        aviso.textContent = "No pudimos subir el comprobante. Probá de nuevo o escribinos por WhatsApp.";
        aviso.classList.remove("d-none");
        return;
      }

      formulario.classList.add("d-none");
      exito.classList.remove("d-none");
    });
  });
})();
