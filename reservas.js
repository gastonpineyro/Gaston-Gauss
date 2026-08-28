/* ============================================================
   RESERVAS.JS — Página de Alquileres de Gauss Ortopedia
   Independiente de carrito.js: esta página no agrega productos
   al carrito, arma una reserva y la envía por WhatsApp.

   Cada equipo tiene duraciones fijas (no fechas libres). Para
   modificar precios o duraciones, editá el array EQUIPOS de abajo.
   ============================================================ */

(function () {
  "use strict";

  var NUMERO_WHATSAPP = "543415641488";

  var EQUIPOS = [
    {
      id: "muletas",
      nombre: "Muletas de Aluminio Regulables (par)",
      imagen: "Muletas.webp",
      variantes: [
        { id: "muletas-chica", nombre: "Chica" },
        { id: "muletas-mediana", nombre: "Mediana" },
        { id: "muletas-grande", nombre: "Grande" },
      ],
      duraciones: [{ dias: 30, precio: 18000 }],
    },
    {
      id: "bota-walker",
      nombre: "Bota Walker Inmovilizadora",
      imagen: "Bota-walker.webp",
      variantes: [
        { id: "bota-walker-chica", nombre: "Chica" },
        { id: "bota-walker-mediana", nombre: "Mediana" },
        { id: "bota-walker-grande", nombre: "Grande" },
      ],
      duraciones: [{ dias: 30, precio: 16000 }],
    },
    {
      id: "magneto",
      nombre: "Equipo de Magnetoterapia",
      imagen: "magneto.png",
      variantes: [
        { id: "magneto-placas", nombre: "Con placas" },
        { id: "magneto-tubos", nombre: "Con tubos" },
        { id: "magneto-tubo-placas", nombre: "Tubo y placas" },
      ],
      duraciones: [
        { dias: 15, precio: 25000 },
        { dias: 30, precio: 46000 },
      ],
    },
  ];

  var CAMPOS_RESERVA = [
    { id: "campoNombreReserva", etiqueta: "Nombre" },
    { id: "campoApellidoReserva", etiqueta: "Apellido" },
    { id: "campoTelefonoReserva", etiqueta: "Teléfono" },
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

  function formatearFecha(fechaISO) {
    if (!fechaISO) return "-";
    var partes = fechaISO.split("-");
    return partes[2] + "/" + partes[1] + "/" + partes[0];
  }

  function hoyISO(offsetDias) {
    var fecha = new Date();
    fecha.setDate(fecha.getDate() + (offsetDias || 0));
    return fecha.toISOString().slice(0, 10);
  }

  function calcularFechaHasta(fechaDesdeStr, dias) {
    var fecha = new Date(fechaDesdeStr + "T00:00:00");
    fecha.setDate(fecha.getDate() + (dias - 1));
    return fecha.toISOString().slice(0, 10);
  }

  function equipoPorId(id) {
    for (var i = 0; i < EQUIPOS.length; i++) {
      if (EQUIPOS[i].id === id) return EQUIPOS[i];
    }
    return EQUIPOS[0];
  }

  function duracionElegida(equipo, dias) {
    var encontrada = null;
    equipo.duraciones.forEach(function (d) {
      if (d.dias === dias) encontrada = d;
    });
    return encontrada || equipo.duraciones[0];
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

  function poblarDuraciones() {
    var selectEquipo = document.getElementById("selectEquipo");
    var selectDuracion = document.getElementById("selectDuracion");
    if (!selectEquipo || !selectDuracion) return;

    var equipo = equipoPorId(selectEquipo.value);
    selectDuracion.innerHTML = "";
    equipo.duraciones.forEach(function (d) {
      var opcion = document.createElement("option");
      opcion.value = d.dias;
      opcion.textContent = d.dias + " días — " + formatearPrecio(d.precio);
      selectDuracion.appendChild(opcion);
    });
  }

  function poblarVariantes() {
    var selectEquipo = document.getElementById("selectEquipo");
    var selectVariante = document.getElementById("selectVariante");
    if (!selectEquipo || !selectVariante) return;

    var equipo = equipoPorId(selectEquipo.value);
    selectVariante.innerHTML = "";
    (equipo.variantes || []).forEach(function (v) {
      var opcion = document.createElement("option");
      opcion.value = v.id;
      opcion.textContent = v.nombre;
      selectVariante.appendChild(opcion);
    });
  }

  function varianteSeleccionada(equipo) {
    var selectVariante = document.getElementById("selectVariante");
    if (!equipo.variantes || !equipo.variantes.length) return null;
    var id = selectVariante ? selectVariante.value : equipo.variantes[0].id;
    var encontrada = null;
    equipo.variantes.forEach(function (v) {
      if (v.id === id) encontrada = v;
    });
    return encontrada || equipo.variantes[0];
  }

  function actualizarResumen() {
    var select = document.getElementById("selectEquipo");
    var selectDuracion = document.getElementById("selectDuracion");
    var fechaDesde = document.getElementById("fechaDesdeReserva");
    if (!select || !selectDuracion || !fechaDesde) return;

    var equipo = equipoPorId(select.value);
    var dias = parseInt(selectDuracion.value, 10) || equipo.duraciones[0].dias;
    var duracion = duracionElegida(equipo, dias);
    var desde = fechaDesde.value || hoyISO();
    var hasta = calcularFechaHasta(desde, duracion.dias);

    var imagenEl = document.getElementById("resumenImagen");
    var nombreEl = document.getElementById("resumenNombreEquipo");
    var precioEl = document.getElementById("resumenPrecioMes");
    var diasEl = document.getElementById("resumenDias");
    var hastaEl = document.getElementById("resumenFechaHasta");
    var totalEl = document.getElementById("resumenTotalReserva");

    if (imagenEl) {
      imagenEl.src = equipo.imagen;
      imagenEl.alt = equipo.nombre;
    }
    if (nombreEl) nombreEl.textContent = equipo.nombre + (varianteSeleccionada(equipo) ? " — " + varianteSeleccionada(equipo).nombre : "");
    if (precioEl) precioEl.textContent = formatearPrecio(duracion.precio);
    if (diasEl) diasEl.textContent = duracion.dias + " días";
    if (hastaEl) hastaEl.textContent = formatearFecha(hasta);
    if (totalEl) totalEl.textContent = formatearPrecio(duracion.precio);
  }

  function soloDigitos(valor) {
    return (valor || "").replace(/\D/g, "");
  }

  function dniValido(valor) {
    var digitos = soloDigitos(valor);
    return digitos.length >= 7 && digitos.length <= 8;
  }

  function telefonoValido(valor) {
    var digitos = soloDigitos(valor);
    return digitos.length >= 8 && digitos.length <= 13;
  }

  function direccionValida(valor) {
    var texto = (valor || "").trim();
    if (texto.length < 5) return false;
    return /[a-zA-ZÀ-ÿ]/.test(texto) && /\d/.test(texto);
  }

  function validarDatosReserva() {
    var faltante = null;
    var mensaje = "Completá nombre, apellido, DNI, dirección y lesión para continuar.";

    CAMPOS_RESERVA.forEach(function (campo) {
      var el = document.getElementById(campo.id);
      if (!el) return;
      var invalido = false;

      if (!el.value.trim()) {
        invalido = true;
      } else if (campo.id === "campoDniReserva" && !dniValido(el.value)) {
        invalido = true;
        if (!faltante) mensaje = "El DNI no parece válido: revisá que tenga 7 u 8 números, sin puntos.";
      } else if (campo.id === "campoTelefonoReserva" && !telefonoValido(el.value)) {
        invalido = true;
        if (!faltante) mensaje = "El teléfono no parece válido: revisá que no le sobren ni falten números.";
      } else if (campo.id === "campoDireccionReserva" && !direccionValida(el.value)) {
        invalido = true;
        if (!faltante) mensaje = "La dirección parece incompleta: necesita calle y número (ej: Mitre 900).";
      }

      if (invalido) {
        el.classList.add("campo-invalido");
        if (!faltante) faltante = el;
      } else {
        el.classList.remove("campo-invalido");
      }
    });

    var fechaDesde = document.getElementById("fechaDesdeReserva");
    if (fechaDesde && !fechaDesde.value) {
      fechaDesde.classList.add("campo-invalido");
      if (!faltante) {
        faltante = fechaDesde;
        mensaje = "Elegí una fecha de retiro para continuar.";
      }
    }

    return { elemento: faltante, mensaje: mensaje };
  }

  function construirMensajeReserva() {
    var select = document.getElementById("selectEquipo");
    var selectDuracion = document.getElementById("selectDuracion");
    var fechaDesde = document.getElementById("fechaDesdeReserva");
    var equipo = equipoPorId(select.value);
    var dias = parseInt(selectDuracion.value, 10) || equipo.duraciones[0].dias;
    var duracion = duracionElegida(equipo, dias);
    var hasta = calcularFechaHasta(fechaDesde.value, duracion.dias);

    var mensaje =
      "Hola! Quiero reservar un alquiler en Gauss Ortopedia:\n" +
      "Equipo: " +
      equipo.nombre +
      (varianteSeleccionada(equipo) ? " (" + varianteSeleccionada(equipo).nombre + ")" : "") +
      "\n" +
      "Duración: " +
      duracion.dias +
      " días\n" +
      "Retiro: " +
      formatearFecha(fechaDesde.value) +
      "\n" +
      "Devolución: " +
      formatearFecha(hasta) +
      "\n" +
      "Total: " +
      formatearPrecio(duracion.precio) +
      "\n\nDatos del cliente:";

    CAMPOS_RESERVA.forEach(function (campo) {
      var el = document.getElementById(campo.id);
      mensaje += "\n" + campo.etiqueta + ": " + (el ? el.value : "-");
    });

    return "https://wa.me/" + NUMERO_WHATSAPP + "?text=" + encodeURIComponent(mensaje);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var selectVariante = document.getElementById("selectVariante");
    var select = document.getElementById("selectEquipo");
    var selectDuracion = document.getElementById("selectDuracion");
    var fechaDesde = document.getElementById("fechaDesdeReserva");
    var btnReservar = document.getElementById("btnReservarWhatsApp");
    var aviso = document.getElementById("avisoDatosReserva");

    if (!select) return; // esta página no tiene el formulario, no hacemos nada

    poblarSelect();
    poblarVariantes();
    poblarDuraciones();

    if (fechaDesde) {
      var hoy = hoyISO();
      fechaDesde.min = hoy;
      fechaDesde.value = hoy;
    }

    actualizarResumen();

    select.addEventListener("change", function () {
      poblarVariantes();
      poblarDuraciones();
      actualizarResumen();
    });
    if (selectVariante) selectVariante.addEventListener("change", actualizarResumen);
    if (selectDuracion) selectDuracion.addEventListener("change", actualizarResumen);
    if (fechaDesde) fechaDesde.addEventListener("change", actualizarResumen);

    document.querySelectorAll(".campo-reserva").forEach(function (el) {
      el.addEventListener("input", function () {
        var valido = el.value.trim() !== "";
        if (el.id === "campoDniReserva") valido = dniValido(el.value);
        if (el.id === "campoTelefonoReserva") valido = telefonoValido(el.value);
        if (el.id === "campoDireccionReserva") valido = direccionValida(el.value);
        if (valido) el.classList.remove("campo-invalido");
      });
    });

    document.querySelectorAll(".btn-reservar-equipo").forEach(function (boton) {
      boton.addEventListener("click", function () {
        select.value = boton.getAttribute("data-equipo");
        poblarVariantes();
        poblarDuraciones();
        actualizarResumen();
        var destino = document.getElementById("formulario-reserva");
        if (destino) destino.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    if (btnReservar) {
      btnReservar.addEventListener("click", async function () {
        var validacion = validarDatosReserva();
        if (validacion.elemento) {
          if (aviso) {
            aviso.textContent = validacion.mensaje;
            aviso.classList.remove("d-none");
          }
          validacion.elemento.focus();
          return;
        }
        if (aviso) aviso.classList.add("d-none");

        var equipo = equipoPorId(select.value);
        var variante = varianteSeleccionada(equipo);
        var idParaStock = variante ? variante.id : equipo.id;
        var dias = parseInt(selectDuracion.value, 10) || equipo.duraciones[0].dias;
        var duracion = duracionElegida(equipo, dias);
        var hasta = calcularFechaHasta(fechaDesde.value, duracion.dias);

        var textoOriginal = btnReservar.textContent;
        var avisoDisp = document.getElementById("avisoDisponibilidadReserva");
        if (avisoDisp) avisoDisp.classList.add("d-none");

        if (window.GaussDB) {
          btnReservar.textContent = "Verificando disponibilidad...";
          btnReservar.classList.add("deshabilitado");

          var resultado = await GaussDB.chequearDisponibilidad(idParaStock, fechaDesde.value, hasta);

          if (resultado.disponible === false) {
            btnReservar.textContent = textoOriginal;
            btnReservar.classList.remove("deshabilitado");
            if (avisoDisp) {
              avisoDisp.textContent =
                '"' + equipo.nombre + (variante ? " (" + variante.nombre + ")" : "") + '" ya está reservado en esas fechas. Probá con otro rango.';
              avisoDisp.classList.remove("d-none");
            }
            return;
          }

          btnReservar.textContent = "Guardando reserva...";
          await GaussDB.crearPedido({
            tipo: "alquiler",
            productoId: idParaStock,
            productoNombre: equipo.nombre + (variante ? " - " + variante.nombre : ""),
            cantidad: 1,
            precioUnitario: duracion.precio,
            total: duracion.precio,
            fechaDesde: fechaDesde.value,
            fechaHasta: hasta,
            duracionDias: duracion.dias,
            nombre: document.getElementById("campoNombreReserva").value,
            apellido: document.getElementById("campoApellidoReserva").value,
            telefono: document.getElementById("campoTelefonoReserva").value,
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
