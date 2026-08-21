/* ============================================================
   RESERVAS.JS — Página de Alquileres de Gauss Ortopedia
   Independiente de carrito.js: esta página no agrega productos
   al carrito, arma una reserva y la envía por WhatsApp.
   ============================================================ */

(function () {
  "use strict";

  var NUMERO_WHATSAPP = "543415641488";

  // Para modificar el precio mensual de cada equipo: cambiá el valor
  // de "precioMes" acá abajo.
  var EQUIPOS = [
    {
      id: "muletas",
      nombre: "Muletas de Aluminio Regulables (par)",
      precioMes: 12000,
      imagen: "Muletas.webp",
    },
    {
      id: "bota-walker",
      nombre: "Bota Walker Inmovilizadora",
      precioMes: 18000,
      imagen: "Bota-walker.webp",
    },
    {
      id: "magneto",
      nombre: "Equipo de Magnetoterapia",
      precioMes: 35000,
      imagen: "magneto.png",
    },
  ];

  var CAMPOS_RESERVA = [
    { id: "campoNombreReserva", etiqueta: "Nombre" },
    { id: "campoApellidoReserva", etiqueta: "Apellido" },
    { id: "campoDniReserva", etiqueta: "DNI" },
    { id: "campoDireccionReserva", etiqueta: "Dirección" },
    { id: "campoLesionReserva", etiqueta: "Lesión / motivo de uso" },
  ];

  function formatearPrecio(numero) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(numero);
  }

  function hoyISO(offsetDias) {
    var fecha = new Date();
    fecha.setDate(fecha.getDate() + (offsetDias || 0));
    return fecha.toISOString().slice(0, 10);
  }

  function diasEntre(desdeStr, hastaStr) {
    var desde = new Date(desdeStr + "T00:00:00");
    var hasta = new Date(hastaStr + "T00:00:00");
    var diff = Math.round((hasta - desde) / 86400000) + 1; // inclusive
    return diff > 0 ? diff : 1;
  }

  function equipoPorId(id) {
    for (var i = 0; i < EQUIPOS.length; i++) {
      if (EQUIPOS[i].id === id) return EQUIPOS[i];
    }
    return EQUIPOS[0];
  }

  function poblarSelect() {
    var select = document.getElementById("selectEquipo");
    if (!select) return;
    EQUIPOS.forEach(function (equipo) {
      var opcion = document.createElement("option");
      opcion.value = equipo.id;
      opcion.textContent = equipo.nombre;
      select.appendChild(opcion);
    });
  }

  function actualizarResumen() {
    var select = document.getElementById("selectEquipo");
    var fechaDesde = document.getElementById("fechaDesdeReserva");
    var fechaHasta = document.getElementById("fechaHastaReserva");
    if (!select || !fechaDesde || !fechaHasta) return;

    var equipo = equipoPorId(select.value);

    // Si la fecha de devolución quedó antes que la de retiro, la corregimos.
    if (fechaHasta.value && fechaDesde.value && fechaHasta.value < fechaDesde.value) {
      fechaHasta.value = fechaDesde.value;
    }

    var dias = diasEntre(fechaDesde.value || hoyISO(), fechaHasta.value || hoyISO(7));
    var totalEstimado = Math.round(((equipo.precioMes / 30) * dias) / 100) * 100;

    var imagenEl = document.getElementById("resumenImagen");
    var nombreEl = document.getElementById("resumenNombreEquipo");
    var precioMesEl = document.getElementById("resumenPrecioMes");
    var diasEl = document.getElementById("resumenDias");
    var totalEl = document.getElementById("resumenTotalReserva");

    if (imagenEl) imagenEl.src = equipo.imagen;
    if (imagenEl) imagenEl.alt = equipo.nombre;
    if (nombreEl) nombreEl.textContent = equipo.nombre;
    if (precioMesEl) precioMesEl.textContent = formatearPrecio(equipo.precioMes) + " / mes";
    if (diasEl) diasEl.textContent = dias + (dias === 1 ? " día" : " días");
    if (totalEl) totalEl.textContent = formatearPrecio(totalEstimado);
  }

  function validarDatosReserva() {
    var faltante = null;
    CAMPOS_RESERVA.forEach(function (campo) {
      var el = document.getElementById(campo.id);
      if (!el) return;
      if (!el.value.trim()) {
        el.classList.add("campo-invalido");
        if (!faltante) faltante = el;
      } else {
        el.classList.remove("campo-invalido");
      }
    });
    return faltante;
  }

  function construirMensajeReserva() {
    var select = document.getElementById("selectEquipo");
    var fechaDesde = document.getElementById("fechaDesdeReserva");
    var fechaHasta = document.getElementById("fechaHastaReserva");
    var equipo = equipoPorId(select.value);
    var dias = diasEntre(fechaDesde.value, fechaHasta.value);
    var totalEstimado = Math.round(((equipo.precioMes / 30) * dias) / 100) * 100;

    var mensaje =
      "Hola! Quiero reservar un alquiler en Gauss Ortopedia:\n" +
      "Equipo: " +
      equipo.nombre +
      "\n" +
      "Retiro: " +
      fechaDesde.value +
      "\n" +
      "Devolución: " +
      fechaHasta.value +
      " (" +
      dias +
      (dias === 1 ? " día" : " días") +
      ")\n" +
      "Total estimado: " +
      formatearPrecio(totalEstimado) +
      "\n\nDatos del cliente:";

    CAMPOS_RESERVA.forEach(function (campo) {
      var el = document.getElementById(campo.id);
      mensaje += "\n" + campo.etiqueta + ": " + (el ? el.value : "-");
    });

    return "https://wa.me/" + NUMERO_WHATSAPP + "?text=" + encodeURIComponent(mensaje);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var select = document.getElementById("selectEquipo");
    var fechaDesde = document.getElementById("fechaDesdeReserva");
    var fechaHasta = document.getElementById("fechaHastaReserva");
    var btnReservar = document.getElementById("btnReservarWhatsApp");
    var aviso = document.getElementById("avisoDatosReserva");

    if (!select) return; // esta página no tiene el formulario, no hacemos nada

    poblarSelect();

    var hoy = hoyISO();
    var enUnaSemana = hoyISO(7);
    if (fechaDesde) {
      fechaDesde.min = hoy;
      fechaDesde.value = hoy;
    }
    if (fechaHasta) {
      fechaHasta.min = hoy;
      fechaHasta.value = enUnaSemana;
    }

    actualizarResumen();

    [select, fechaDesde, fechaHasta].forEach(function (el) {
      if (el) el.addEventListener("change", actualizarResumen);
    });

    document.querySelectorAll(".campo-reserva").forEach(function (el) {
      el.addEventListener("input", function () {
        if (el.value.trim()) el.classList.remove("campo-invalido");
      });
    });

    document.querySelectorAll(".btn-reservar-equipo").forEach(function (boton) {
      boton.addEventListener("click", function () {
        select.value = boton.getAttribute("data-equipo");
        actualizarResumen();
        var destino = document.getElementById("formulario-reserva");
        if (destino) destino.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    if (btnReservar) {
      btnReservar.addEventListener("click", async function () {
        var faltante = validarDatosReserva();
        if (faltante) {
          if (aviso) aviso.classList.remove("d-none");
          faltante.focus();
          return;
        }
        if (aviso) aviso.classList.add("d-none");

        var equipo = equipoPorId(select.value);
        var textoOriginal = btnReservar.textContent;
        var avisoDisp = document.getElementById("avisoDisponibilidadReserva");
        if (avisoDisp) avisoDisp.classList.add("d-none");

        if (window.GaussDB) {
          btnReservar.textContent = "Verificando disponibilidad...";
          btnReservar.classList.add("deshabilitado");

          var resultado = await GaussDB.chequearDisponibilidad(
            equipo.id,
            fechaDesde.value,
            fechaHasta.value
          );

          if (resultado.disponible === false) {
            btnReservar.textContent = textoOriginal;
            btnReservar.classList.remove("deshabilitado");
            if (avisoDisp) {
              avisoDisp.textContent =
                '"' + equipo.nombre + '" ya está reservado en esas fechas. Probá con otro rango.';
              avisoDisp.classList.remove("d-none");
            }
            return;
          }

          btnReservar.textContent = "Guardando reserva...";
          var dias = diasEntre(fechaDesde.value, fechaHasta.value);
          var totalEstimado = Math.round(((equipo.precioMes / 30) * dias) / 100) * 100;

          await GaussDB.crearPedido({
            tipo: "alquiler",
            productoId: equipo.id,
            productoNombre: equipo.nombre,
            cantidad: 1,
            precioUnitario: equipo.precioMes,
            total: totalEstimado,
            fechaDesde: fechaDesde.value,
            fechaHasta: fechaHasta.value,
            nombre: document.getElementById("campoNombreReserva").value,
            apellido: document.getElementById("campoApellidoReserva").value,
            dni: document.getElementById("campoDniReserva").value,
            direccion: document.getElementById("campoDireccionReserva").value,
            lesion: document.getElementById("campoLesionReserva").value,
          });

          btnReservar.textContent = textoOriginal;
          btnReservar.classList.remove("deshabilitado");
        }

        window.open(construirMensajeReserva(), "_blank");
      });
    }
  });
})();
