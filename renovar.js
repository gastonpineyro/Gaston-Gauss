/* ============================================================
   RENOVAR.JS — Página pública donde el cliente sube el
   comprobante de pago para renovar su alquiler.
   ============================================================ */

(function () {
  "use strict";

  // Para modificar precios de renovación: editá esto. Si un producto no
  // aparece acá, se usa su duración y precio de siempre (sin selector).
  var DURACIONES_POR_PRODUCTO = {
    magneto: [
      { dias: 15, precio: 25000 },
      { dias: 30, precio: 46000 },
    ],
  };

  function duracionesDisponibles(productoId) {
    if (!productoId) return null;
    if (productoId.indexOf("magneto") === 0) return DURACIONES_POR_PRODUCTO.magneto;
    return null;
  }

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
    var contenedorDuracion = document.getElementById("contenedorDuracionRenovar");
    var montoEl = document.getElementById("renovarMonto");

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
    document.getElementById("renovarAlias").textContent =
      typeof ALIAS_PAGO !== "undefined" ? ALIAS_PAGO : "-";

    var opciones = duracionesDisponibles(pedido.producto_id);
    var selectDuracion = null;

    function montoDeDuracion(dias) {
      if (!opciones) return pedido.total;
      var encontrada = opciones.filter(function (o) {
        return o.dias === dias;
      })[0];
      return encontrada ? encontrada.precio : pedido.total;
    }

    function actualizarMonto() {
      var dias = selectDuracion ? parseInt(selectDuracion.value, 10) : pedido.duracion_dias;
      montoEl.textContent = formatearPrecio(montoDeDuracion(dias));
    }

    if (opciones && opciones.length > 1) {
      selectDuracion = document.createElement("select");
      selectDuracion.className = "form-select form-select-sm";
      selectDuracion.id = "selectDuracionRenovar";
      selectDuracion.style.width = "auto";
      selectDuracion.style.display = "inline-block";
      opciones.forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o.dias;
        opt.textContent = o.dias + " días — " + formatearPrecio(o.precio);
        if (o.dias === pedido.duracion_dias) opt.selected = true;
        selectDuracion.appendChild(opt);
      });
      contenedorDuracion.innerHTML = "";
      contenedorDuracion.appendChild(selectDuracion);
      selectDuracion.addEventListener("change", actualizarMonto);
    } else {
      contenedorDuracion.textContent = (pedido.duracion_dias || "-") + " días";
    }

    actualizarMonto();

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

      var diasElegidos = selectDuracion ? parseInt(selectDuracion.value, 10) : pedido.duracion_dias;
      var montoElegido = montoDeDuracion(diasElegidos);

      var subida = await GaussDB.subirComprobante(id, archivo, diasElegidos, montoElegido);

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
