/* ============================================================
   CARRITO.JS — Carrito de compras de Gauss Ortopedia
   Guarda el carrito y los datos del cliente en localStorage para
   que se mantengan al navegar entre páginas. No requiere ningún
   build step: se incluye tal cual con
   <script src="carrito.js" defer></script>
   ============================================================ */

(function () {
  "use strict";

  var STORAGE_KEY_CARRITO = "gauss-carrito";
  var STORAGE_KEY_DATOS = "gauss-datos-alquiler";
  var NUMERO_WHATSAPP = "543415641488";

  var CAMPOS_ALQUILER = [
    { id: "campoFechaDesde", etiqueta: "Fecha desde" },
    { id: "campoFechaHasta", etiqueta: "Fecha hasta" },
    { id: "campoNombre", etiqueta: "Nombre" },
    { id: "campoApellido", etiqueta: "Apellido" },
    { id: "campoDni", etiqueta: "DNI" },
    { id: "campoDireccion", etiqueta: "Dirección" },
    { id: "campoLesion", etiqueta: "Lesión / motivo de uso" },
  ];

  /* ---------------------- Utilidades ---------------------- */

  function leerCarrito() {
    try {
      var datos = JSON.parse(localStorage.getItem(STORAGE_KEY_CARRITO));
      return Array.isArray(datos) ? datos : [];
    } catch (e) {
      return [];
    }
  }

  function guardarCarrito(carrito) {
    localStorage.setItem(STORAGE_KEY_CARRITO, JSON.stringify(carrito));
  }

  function leerDatosAlquiler() {
    try {
      var datos = JSON.parse(localStorage.getItem(STORAGE_KEY_DATOS));
      return datos && typeof datos === "object" ? datos : {};
    } catch (e) {
      return {};
    }
  }

  function guardarDatosAlquiler(datos) {
    localStorage.setItem(STORAGE_KEY_DATOS, JSON.stringify(datos));
  }

  function formatearPrecio(numero) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(numero);
  }

  function calcularTotal(carrito) {
    return carrito.reduce(function (acc, item) {
      return acc + item.precio * item.cantidad;
    }, 0);
  }

  function hayAlquilerEnCarrito(carrito) {
    return carrito.some(function (item) {
      return !!item.alquiler;
    });
  }

  /* ---------------------- Acciones sobre el carrito ---------------------- */

  function agregarAlCarrito(producto) {
    var carrito = leerCarrito();
    var existente = null;
    for (var i = 0; i < carrito.length; i++) {
      if (carrito[i].id === producto.id) {
        existente = carrito[i];
        break;
      }
    }
    if (existente) {
      existente.cantidad += 1;
    } else {
      producto.cantidad = 1;
      carrito.push(producto);
    }
    guardarCarrito(carrito);
    renderizarCarrito();
    abrirCarrito();
  }

  function cambiarCantidad(id, nuevaCantidad) {
    var carrito = leerCarrito();
    if (nuevaCantidad <= 0) {
      carrito = carrito.filter(function (item) {
        return item.id !== id;
      });
    } else {
      carrito = carrito.map(function (item) {
        if (item.id === id) {
          item.cantidad = nuevaCantidad;
        }
        return item;
      });
    }
    guardarCarrito(carrito);
    renderizarCarrito();
  }

  function quitarDelCarrito(id) {
    var carrito = leerCarrito().filter(function (item) {
      return item.id !== id;
    });
    guardarCarrito(carrito);
    renderizarCarrito();
  }

  function vaciarCarrito() {
    guardarCarrito([]);
    renderizarCarrito();
  }

  /* ---------------------- Panel lateral (abrir / cerrar) ---------------------- */

  function abrirCarrito() {
    var panel = document.getElementById("panelCarrito");
    var overlay = document.getElementById("overlayCarrito");
    if (!panel || !overlay) return;
    panel.classList.add("activo");
    overlay.classList.add("activo");
    document.body.style.overflow = "hidden";
    var btn = document.getElementById("btnAbrirCarrito");
    if (btn) btn.setAttribute("aria-expanded", "true");
  }

  function cerrarCarrito() {
    var panel = document.getElementById("panelCarrito");
    var overlay = document.getElementById("overlayCarrito");
    if (!panel || !overlay) return;
    panel.classList.remove("activo");
    overlay.classList.remove("activo");
    document.body.style.overflow = "";
    var btn = document.getElementById("btnAbrirCarrito");
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  /* ---------------------- Render ---------------------- */

  function actualizarBadge() {
    var badge = document.getElementById("badgeCarrito");
    if (!badge) return;
    var totalItems = leerCarrito().reduce(function (acc, item) {
      return acc + item.cantidad;
    }, 0);
    badge.textContent = totalItems;
    badge.classList.toggle("badge-carrito-oculta", totalItems === 0);
  }

  function crearLineaHTML(item) {
    var imagen = item.imagen
      ? '<img src="' + item.imagen + '" alt="' + item.nombre + '">'
      : "";
    return (
      '<div class="item-carrito" data-id="' +
      item.id +
      '">' +
      imagen +
      '<div class="item-carrito-info">' +
      '<div class="item-carrito-nombre">' +
      item.nombre +
      "</div>" +
      (item.detalle
        ? '<div class="item-carrito-detalle">' + item.detalle + "</div>"
        : "") +
      '<div class="item-carrito-precio">' +
      formatearPrecio(item.precio) +
      "</div>" +
      '<div class="item-carrito-acciones">' +
      '<div class="selector-cantidad">' +
      '<button type="button" class="btn-restar" aria-label="Restar unidad">−</button>' +
      '<span>' +
      item.cantidad +
      "</span>" +
      '<button type="button" class="btn-sumar" aria-label="Sumar unidad">+</button>' +
      "</div>" +
      '<button type="button" class="btn-quitar-item">Quitar</button>' +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function construirMensajeWhatsApp(carrito) {
    var total = calcularTotal(carrito);
    var lineas = carrito.map(function (item) {
      return (
        "- " +
        item.nombre +
        (item.detalle ? " (" + item.detalle + ")" : "") +
        " x" +
        item.cantidad +
        ": " +
        formatearPrecio(item.precio * item.cantidad)
      );
    });

    var mensaje =
      "Hola! Quiero consultar por este pedido de Gauss Ortopedia:\n" +
      lineas.join("\n") +
      "\nTotal estimado: " +
      formatearPrecio(total);

    if (hayAlquilerEnCarrito(carrito)) {
      var datos = leerDatosAlquiler();
      mensaje += "\n\nDatos para el alquiler:";
      CAMPOS_ALQUILER.forEach(function (campo) {
        mensaje += "\n" + campo.etiqueta + ": " + (datos[campo.id] || "-");
      });
    }

    return "https://wa.me/" + NUMERO_WHATSAPP + "?text=" + encodeURIComponent(mensaje);
  }

  function renderizarCarrito() {
    actualizarBadge();

    var cuerpo = document.getElementById("cuerpoCarrito");
    var pie = document.getElementById("pieCarrito");
    var acciones = document.getElementById("accionesCarrito");
    if (!cuerpo || !pie) return;

    var carrito = leerCarrito();

    if (carrito.length === 0) {
      cuerpo.innerHTML =
        '<div class="carrito-vacio">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="currentColor" viewBox="0 0 16 16"><path d="M0 1.5A.5.5 0 0 1 .5 1H2a.5.5 0 0 1 .485.379L2.89 3H14.5a.5.5 0 0 1 .491.592l-1.5 8A.5.5 0 0 1 13 12H4a.5.5 0 0 1-.491-.408L2.01 3.607 1.61 2H.5a.5.5 0 0 1-.5-.5M3.102 4l1.313 7h8.17l1.313-7zM5 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4m7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4m-7 1a1 1 0 1 1 0 2 1 1 0 0 1 0-2m7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/></svg>' +
        "<p>Tu carrito está vacío.</p>" +
        '<a href="index.html" class="btn-ver-productos">Ver productos</a>' +
        "</div>";
      pie.classList.add("d-none");
      if (acciones) acciones.classList.add("d-none");
      return;
    }

    pie.classList.remove("d-none");
    if (acciones) acciones.classList.remove("d-none");
    cuerpo.innerHTML = carrito.map(crearLineaHTML).join("");

    var total = calcularTotal(carrito);
    var totalEl = document.getElementById("totalCarrito");
    if (totalEl) totalEl.textContent = formatearPrecio(total);

    var datosAlquiler = document.getElementById("datosAlquiler");
    if (datosAlquiler) {
      datosAlquiler.classList.toggle("d-none", !hayAlquilerEnCarrito(carrito));
    }

    var enlaceWsp = document.getElementById("btnFinalizarCarrito");
    if (enlaceWsp) {
      enlaceWsp.href = construirMensajeWhatsApp(carrito);
    }
  }

  /* ---------------------- Datos del cliente (alquiler) ---------------------- */

  function precargarDatosAlquiler() {
    var datos = leerDatosAlquiler();
    CAMPOS_ALQUILER.forEach(function (campo) {
      var el = document.getElementById(campo.id);
      if (el && datos[campo.id]) el.value = datos[campo.id];
    });
  }

  function guardarCampoAlquiler(evento) {
    var el = evento.target;
    if (!el.classList || !el.classList.contains("campo-alquiler")) return;
    var datos = leerDatosAlquiler();
    datos[el.id] = el.value;
    guardarDatosAlquiler(datos);
    if (el.value.trim()) el.classList.remove("campo-invalido");
  }

  function validarDatosAlquiler() {
    var faltante = null;
    CAMPOS_ALQUILER.forEach(function (campo) {
      var el = document.getElementById(campo.id);
      if (!el) return;
      if (!el.value.trim()) {
        el.classList.add("campo-invalido");
        if (!faltante) faltante = el;
      } else {
        el.classList.remove("campo-invalido");
      }
    });

    var desde = document.getElementById("campoFechaDesde");
    var hasta = document.getElementById("campoFechaHasta");
    if (desde && hasta && desde.value && hasta.value && hasta.value < desde.value) {
      hasta.classList.add("campo-invalido");
      if (!faltante) faltante = hasta;
    }

    return faltante;
  }

  /* ---------------------- Precio dinámico según modalidad ---------------------- */

  function actualizarPrecioSegunModalidad(radio) {
    var precio = parseFloat(radio.getAttribute("data-precio"));
    if (isNaN(precio)) return;

    var contenedor = radio.closest(".bloque-compra") || document;

    var valorEl = contenedor.querySelector("#precioValor") || contenedor.querySelector(".precio-producto");
    if (valorEl) valorEl.textContent = formatearPrecio(precio);

    var unidadEl = contenedor.querySelector("#precioUnidad");
    if (unidadEl) {
      var esAlquiler = radio.getAttribute("data-alquiler") === "1";
      unidadEl.classList.toggle("d-none", !esAlquiler);
    }

    var boton = contenedor.querySelector(".btn-agregar-carrito");
    if (boton) boton.setAttribute("data-precio", precio);
  }

  /* ---------------------- Eventos ---------------------- */

  function manejarClickEnCuerpo(evento) {
    var linea = evento.target.closest(".item-carrito");
    if (!linea) return;
    var id = linea.getAttribute("data-id");
    var carrito = leerCarrito();
    var item = carrito.find(function (i) {
      return i.id === id;
    });
    if (!item) return;

    if (evento.target.classList.contains("btn-sumar")) {
      cambiarCantidad(id, item.cantidad + 1);
    } else if (evento.target.classList.contains("btn-restar")) {
      cambiarCantidad(id, item.cantidad - 1);
    } else if (evento.target.classList.contains("btn-quitar-item")) {
      quitarDelCarrito(id);
    }
  }

  function manejarClickAgregar(boton) {
    var detalle = boton.getAttribute("data-detalle") || "";
    var alquiler = boton.getAttribute("data-alquiler") === "1";

    var modalidadName = boton.getAttribute("data-modalidad-name");
    if (modalidadName) {
      var radioSeleccionado = document.querySelector(
        'input[name="' + modalidadName + '"]:checked'
      );
      if (radioSeleccionado) {
        detalle = radioSeleccionado.value;
        alquiler = radioSeleccionado.getAttribute("data-alquiler") === "1";
      }
    }

    var idBase = boton.getAttribute("data-id");
    var idCarrito = modalidadName
      ? idBase + (alquiler ? "-alquiler" : "-venta")
      : idBase;

    var producto = {
      id: idCarrito,
      nombre: boton.getAttribute("data-nombre"),
      precio: parseFloat(boton.getAttribute("data-precio")),
      imagen: boton.getAttribute("data-imagen") || "",
      detalle: detalle,
      alquiler: alquiler,
    };
    agregarAlCarrito(producto);

    var textoOriginal = boton.textContent;
    boton.classList.add("agregado");
    boton.textContent = "Agregado ✓";
    window.setTimeout(function () {
      boton.classList.remove("agregado");
      boton.textContent = textoOriginal;
    }, 1400);
  }

  function idProductoBase(idCarrito) {
    return idCarrito.replace(/-alquiler$/, "").replace(/-venta$/, "");
  }

  async function manejarClickFinalizar(evento) {
    evento.preventDefault();
    var carrito = leerCarrito();
    if (carrito.length === 0) return;

    var avisoDatos = document.getElementById("avisoDatosAlquiler");
    var avisoDisp = document.getElementById("avisoDisponibilidad");
    if (avisoDisp) avisoDisp.classList.add("d-none");

    if (hayAlquilerEnCarrito(carrito)) {
      var faltante = validarDatosAlquiler();
      if (faltante) {
        if (avisoDatos) avisoDatos.classList.remove("d-none");
        faltante.focus();
        return;
      }
      if (avisoDatos) avisoDatos.classList.add("d-none");
    }

    var boton = evento.currentTarget;
    var textoOriginal = boton.textContent;
    var datos = leerDatosAlquiler();

    if (hayAlquilerEnCarrito(carrito) && window.GaussDB) {
      boton.textContent = "Verificando disponibilidad...";
      boton.classList.add("deshabilitado");

      for (var i = 0; i < carrito.length; i++) {
        var item = carrito[i];
        if (!item.alquiler) continue;
        var resultado = await GaussDB.chequearDisponibilidad(
          idProductoBase(item.id),
          datos.campoFechaDesde,
          datos.campoFechaHasta
        );
        if (resultado.disponible === false) {
          boton.textContent = textoOriginal;
          boton.classList.remove("deshabilitado");
          if (avisoDisp) {
            avisoDisp.textContent =
              '"' + item.nombre + '" ya está reservado en esas fechas. Probá con otro rango.';
            avisoDisp.classList.remove("d-none");
          }
          return;
        }
      }

      boton.textContent = "Guardando pedido...";
      for (var j = 0; j < carrito.length; j++) {
        var linea = carrito[j];
        await GaussDB.crearPedido({
          tipo: linea.alquiler ? "alquiler" : "venta",
          productoId: idProductoBase(linea.id),
          productoNombre: linea.nombre,
          cantidad: linea.cantidad,
          precioUnitario: linea.precio,
          total: linea.precio * linea.cantidad,
          fechaDesde: linea.alquiler ? datos.campoFechaDesde : null,
          fechaHasta: linea.alquiler ? datos.campoFechaHasta : null,
          nombre: datos.campoNombre,
          apellido: datos.campoApellido,
          dni: datos.campoDni,
          direccion: datos.campoDireccion,
          lesion: datos.campoLesion,
        });
      }

      boton.textContent = textoOriginal;
      boton.classList.remove("deshabilitado");
    } else if (window.GaussDB) {
      // Solo ventas (sin alquiler): igual quedan registradas.
      for (var k = 0; k < carrito.length; k++) {
        var lineaVenta = carrito[k];
        await GaussDB.crearPedido({
          tipo: "venta",
          productoId: idProductoBase(lineaVenta.id),
          productoNombre: lineaVenta.nombre,
          cantidad: lineaVenta.cantidad,
          precioUnitario: lineaVenta.precio,
          total: lineaVenta.precio * lineaVenta.cantidad,
        });
      }
    }

    window.open(construirMensajeWhatsApp(carrito), "_blank");
  }

  document.addEventListener("DOMContentLoaded", function () {
    precargarDatosAlquiler();
    renderizarCarrito();

    var hoy = new Date().toISOString().slice(0, 10);
    var campoDesde = document.getElementById("campoFechaDesde");
    var campoHasta = document.getElementById("campoFechaHasta");
    if (campoDesde) campoDesde.min = hoy;
    if (campoHasta) campoHasta.min = hoy;

    var btnAbrir = document.getElementById("btnAbrirCarrito");
    var btnCerrar = document.getElementById("btnCerrarCarrito");
    var overlay = document.getElementById("overlayCarrito");
    var btnVaciar = document.getElementById("btnVaciarCarrito");
    var cuerpo = document.getElementById("cuerpoCarrito");
    var datosAlquiler = document.getElementById("datosAlquiler");
    var btnFinalizar = document.getElementById("btnFinalizarCarrito");

    if (btnAbrir) btnAbrir.addEventListener("click", abrirCarrito);
    if (btnCerrar) btnCerrar.addEventListener("click", cerrarCarrito);
    if (overlay) overlay.addEventListener("click", cerrarCarrito);
    if (btnVaciar) btnVaciar.addEventListener("click", vaciarCarrito);
    if (cuerpo) cuerpo.addEventListener("click", manejarClickEnCuerpo);
    if (datosAlquiler) datosAlquiler.addEventListener("input", guardarCampoAlquiler);
    if (btnFinalizar) btnFinalizar.addEventListener("click", manejarClickFinalizar);

    document.addEventListener("keydown", function (evento) {
      if (evento.key === "Escape") cerrarCarrito();
    });

    document.querySelectorAll(".btn-agregar-carrito").forEach(function (boton) {
      boton.addEventListener("click", function () {
        manejarClickAgregar(boton);
      });
    });

    document
      .querySelectorAll('.selector-modalidad input[type="radio"]')
      .forEach(function (radio) {
        radio.addEventListener("change", function () {
          actualizarPrecioSegunModalidad(radio);
        });
        if (radio.checked) actualizarPrecioSegunModalidad(radio);
      });
  });
})();
