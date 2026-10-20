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
    { id: "campoFechaDesde", etiqueta: "Fecha de retiro" },
    { id: "campoNombre", etiqueta: "Nombre" },
    { id: "campoApellido", etiqueta: "Apellido" },
    { id: "campoTelefono", etiqueta: "Teléfono" },
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

  function calcularFechaHasta(fechaDesdeStr, dias) {
    if (!fechaDesdeStr || !dias) return fechaDesdeStr;
    var fecha = new Date(fechaDesdeStr + "T00:00:00");
    fecha.setDate(fecha.getDate() + (parseInt(dias, 10) - 1));
    return fecha.toISOString().slice(0, 10);
  }

  function formatearFecha(fechaISO) {
    if (!fechaISO) return "-";
    var partes = fechaISO.split("-");
    return partes[2] + "/" + partes[1] + "/" + partes[0];
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
    var datos = leerDatosAlquiler();
    var lineas = carrito.map(function (item) {
      var periodo = "";
      if (item.alquiler && item.dias && datos.campoFechaDesde) {
        var hasta = calcularFechaHasta(datos.campoFechaDesde, item.dias);
        periodo =
          " [" +
          formatearFecha(datos.campoFechaDesde) +
          " a " +
          formatearFecha(hasta) +
          "]";
      }
      return (
        "- " +
        item.nombre +
        (item.detalle ? " (" + item.detalle + ")" : "") +
        periodo +
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

    var valido = el.value.trim() !== "";
    if (el.id === "campoDni") valido = dniValido(el.value);
    if (el.id === "campoTelefono") valido = telefonoValido(el.value);
    if (el.id === "campoDireccion") valido = direccionValida(el.value);
    if (valido) el.classList.remove("campo-invalido");
  }

  /* ---------------------- Validadores de formato ---------------------- */

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

  function validarDatosAlquiler() {
    var faltante = null;
    var mensaje = "Completá la fecha de retiro, nombre, apellido, DNI, dirección y lesión para continuar.";

    CAMPOS_ALQUILER.forEach(function (campo) {
      var el = document.getElementById(campo.id);
      if (!el) return;
      var invalido = false;

      if (!el.value.trim()) {
        invalido = true;
      } else if (campo.id === "campoDni" && !dniValido(el.value)) {
        invalido = true;
        if (!faltante) mensaje = "El DNI no parece válido: revisá que tenga 7 u 8 números, sin puntos.";
      } else if (campo.id === "campoTelefono" && !telefonoValido(el.value)) {
        invalido = true;
        if (!faltante) mensaje = "El teléfono no parece válido: revisá que no le sobren ni falten números.";
      } else if (campo.id === "campoDireccion" && !direccionValida(el.value)) {
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

    return { elemento: faltante, mensaje: mensaje };
  }

  /* ---------------------- Precio dinámico según modalidad ---------------------- */

  // Si un modelo tiene precios propios (data-precio-<id-del-modelo>), se aplican a las duraciones.
  function aplicarPreciosDeVariante() {
    var v = document.querySelector("[data-variante]:checked");
    var id = v ? v.getAttribute("data-variante") : null;
    var elegido = null;
    document.querySelectorAll('.selector-modalidad input[data-alquiler]').forEach(function (r) {
      if (!r.hasAttribute("data-precio-base")) r.setAttribute("data-precio-base", r.getAttribute("data-precio"));
      var propio = id ? r.getAttribute("data-precio-" + id) : null;
      r.setAttribute("data-precio", propio || r.getAttribute("data-precio-base"));
      if (r.checked) elegido = r;
    });
    if (elegido) actualizarPrecioSegunModalidad(elegido);
  }

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
      var diasRadio = parseInt(radio.getAttribute("data-dias"), 10);
      if (esAlquiler && diasRadio) unidadEl.textContent = diasRadio === 30 ? " / mes" : " / " + diasRadio + " días";
    }

    var boton = contenedor.querySelector(".btn-agregar-carrito");
    if (boton) boton.setAttribute("data-precio", precio);
  }

  function actualizarImagenSegunSeleccion(radio) {
    var imagen = radio.getAttribute("data-imagen");
    if (!imagen) return;

    var contenedor = radio.closest(".bloque-compra") || document;

    var imagenProducto = document.getElementById("imagenProducto");
    if (imagenProducto) imagenProducto.src = imagen;

    var boton = contenedor.querySelector(".btn-agregar-carrito");
    if (boton) boton.setAttribute("data-imagen", imagen);
  }

  /* ---------------------- Disponibilidad en la ficha del producto ---------------------- */

  var sinStockProducto = false;

  // Si no hay stock y se eligió alquiler, el botón "Agregar al carrito" se bloquea.
  function refrescarBotonAgregar() {
    var boton = document.querySelector(".bloque-compra .btn-agregar-carrito") || document.querySelector(".btn-agregar-carrito");
    if (!boton) return;
    if (!boton.hasAttribute("data-html-original")) boton.setAttribute("data-html-original", boton.innerHTML);
    var modalidadName = boton.getAttribute("data-modalidad-name");
    var radioMod = modalidadName ? document.querySelector('input[name="' + modalidadName + '"]:checked') : null;
    var esAlquiler = radioMod ? radioMod.getAttribute("data-alquiler") === "1" : boton.getAttribute("data-alquiler") === "1";
    var bloquear = sinStockProducto && esAlquiler;
    if (bloquear) {
      boton.textContent = "Sin stock";
      boton.disabled = true;
      boton.classList.add("sin-stock-boton");
    } else {
      // Los alquileres no van al carrito: se reservan en el formulario de "Reservar alquiler".
      boton.innerHTML = esAlquiler ? "📅 Reservar este equipo" : boton.getAttribute("data-html-original");
      boton.disabled = false;
      boton.classList.remove("sin-stock-boton");
    }
  }

  async function actualizarDisponibilidadProducto() {
    var contenedor = document.getElementById("disponibilidadProducto");
    if (!contenedor) return;
    sinStockProducto = false;
    refrescarBotonAgregar();
    if (!window.GaussDB || !GaussDB.configurado()) {
      contenedor.classList.add("d-none");
      return;
    }

    var radioVariante = document.querySelector("[data-variante]:checked");
    if (!radioVariante) {
      contenedor.classList.add("d-none");
      return;
    }

    var varianteId = radioVariante.getAttribute("data-variante");
    var hoy = new Date().toISOString().slice(0, 10);

    contenedor.classList.remove("d-none");
    contenedor.className = "disponibilidad-producto consultando";
    contenedor.textContent = "Consultando disponibilidad...";

    var resultado = await GaussDB.chequearDisponibilidad(varianteId, hoy, hoy);

    if (resultado.motivo === "sin-configurar") {
      contenedor.classList.add("d-none");
      return;
    }

    sinStockProducto = resultado.disponible === false;
    refrescarBotonAgregar();

    if (resultado.disponible) {
      contenedor.className = "disponibilidad-producto ok";
      contenedor.textContent =
        "✓ Disponible ahora" +
        (typeof resultado.stock === "number" ? " (" + Math.max(resultado.stock - (resultado.ocupadas || 0), 0) + " unidades)" : "");
    } else {
      contenedor.className = "disponibilidad-producto sin-stock";
      contenedor.textContent = "Sin stock disponible en este momento. Consultanos por WhatsApp para ver cuándo se libera.";
    }
  }

  /* ---------------------- Link al formulario de pedido ---------------------- */
  function agregarLinkFormulario() {
    var link = typeof LINK_FORMULARIO !== "undefined" ? LINK_FORMULARIO : "";
    if (!link) return;
    var destinos = [];
    var finalizar = document.getElementById("btnFinalizarCarrito");
    if (finalizar) destinos.push({ el: finalizar, clase: "btn-formulario-pedido" });
    var paso = document.querySelector("[data-formulario-paso]");
    if (paso) destinos.push({ el: paso, clase: "btn-formulario-pedido btn-formulario-paso", dentro: true });
    destinos.forEach(function (d) {
      var a = document.createElement("a");
      a.href = link;
      a.target = "_blank";
      a.rel = "noopener";
      a.className = d.clase;
      a.textContent = "📝 Completar formulario de pedido";
      if (d.dentro) d.el.appendChild(a);
      else d.el.insertAdjacentElement("afterend", a);
    });
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
    if (boton.disabled || boton.classList.contains("sin-stock-boton")) return;
    var detalle = boton.getAttribute("data-detalle") || "";
    var alquiler = boton.getAttribute("data-alquiler") === "1";
    var dias = boton.getAttribute("data-dias") ? parseInt(boton.getAttribute("data-dias"), 10) : null;
    var varianteId = boton.getAttribute("data-id");
    var talleLabel = "";

    var modalidadName = boton.getAttribute("data-modalidad-name");
    if (modalidadName) {
      var radioSeleccionado = document.querySelector(
        'input[name="' + modalidadName + '"]:checked'
      );
      if (radioSeleccionado) {
        detalle = radioSeleccionado.value;
        alquiler = radioSeleccionado.getAttribute("data-alquiler") === "1";
        dias = radioSeleccionado.getAttribute("data-dias")
          ? parseInt(radioSeleccionado.getAttribute("data-dias"), 10)
          : null;
      }
    }

    var talleName = boton.getAttribute("data-talle-name");
    if (talleName) {
      var talleSeleccionado = document.querySelector('input[name="' + talleName + '"]:checked');
      if (talleSeleccionado) {
        talleLabel = talleSeleccionado.value;
        varianteId = talleSeleccionado.getAttribute("data-variante") || varianteId;
      }
    }

    var detalleFinal = [talleLabel, detalle].filter(Boolean).join(" · ");

    // Alquiler: se reserva en la página "Reservar alquiler" (con el equipo, modelo y duración ya elegidos).
    if (alquiler && boton.getAttribute("data-id")) {
      var checkedVariante = document.querySelector("[data-variante]:checked");
      var destino = "alquileres.html?equipo=" + encodeURIComponent(boton.getAttribute("data-id"));
      if (checkedVariante) destino += "&variante=" + encodeURIComponent(checkedVariante.getAttribute("data-variante"));
      if (dias) destino += "&dias=" + dias;
      window.location.href = destino;
      return;
    }

    var idBase = boton.getAttribute("data-id");
    var idCarrito = modalidadName || talleName
      ? varianteId + "-" + (alquiler ? "alquiler-" + dias : "venta")
      : idBase;

    var producto = {
      id: idCarrito,
      varianteId: varianteId,
      nombre: boton.getAttribute("data-nombre"),
      precio: parseFloat(boton.getAttribute("data-precio")),
      imagen: boton.getAttribute("data-imagen") || "",
      detalle: detalleFinal,
      alquiler: alquiler,
      dias: alquiler ? dias : null,
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
    return idCarrito.replace(/-alquiler-\d+$/, "").replace(/-venta$/, "");
  }

  /* ---------------------- Pago por transferencia / QR ---------------------- */

  function escaparTexto(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function mostrarDatosTransferencia(ids, total, opciones) {
    opciones = opciones || {};
    var previo = document.getElementById("modalTransferencia");
    if (previo) previo.remove();
    var alias = typeof ALIAS_PAGO !== "undefined" ? ALIAS_PAGO : "";
    var titular = typeof TITULAR_PAGO !== "undefined" ? TITULAR_PAGO : "";
    var cbu = typeof CBU_PAGO !== "undefined" ? CBU_PAGO : "";
    var qr = typeof QR_PAGO !== "undefined" ? QR_PAGO : "";

    var modal = document.createElement("div");
    modal.id = "modalTransferencia";
    modal.className = "modal-transferencia";
    modal.innerHTML =
      '<div class="caja-transferencia" role="dialog" aria-modal="true">' +
      '<h2>Pagá por transferencia o QR</h2>' +
      '<p class="monto-transferencia">Total a pagar: <strong>' + formatearPrecio(total) + "</strong></p>" +
      (qr ? '<img class="qr-transferencia" src="' + escaparTexto(qr) + '" alt="QR para pagar">' : "") +
      '<p class="mb-1">Alias: <strong id="textoAlias">' + escaparTexto(alias) + '</strong> <button type="button" class="btn-copiar" data-copiar="' + escaparTexto(alias) + '">Copiar</button></p>' +
      (cbu ? '<p class="mb-1">CBU/CVU: <strong>' + escaparTexto(cbu) + '</strong> <button type="button" class="btn-copiar" data-copiar="' + escaparTexto(cbu) + '">Copiar</button></p>' : "") +
      (titular ? '<p class="mb-1">Titular: <strong>' + escaparTexto(titular) + "</strong></p>" : "") +
      '<hr><label for="archivoComprobante" class="d-block mb-1">Subí la foto del comprobante (opcional):</label>' +
      '<input type="file" id="archivoComprobante" accept="image/*,application/pdf" class="form-control form-control-sm mb-2">' +
      '<p class="text-danger d-none" id="errorTransferencia" style="font-size:13px;"></p>' +
      '<button type="button" class="btn-pagar-online" id="btnYaTransferi">✅ Ya transferí</button>' +
      '<button type="button" class="btn-vaciar-carrito" id="btnCerrarTransferencia">Cerrar</button>' +
      '<p class="nota-pago-online">Tu pedido ya quedó registrado. Verificamos la transferencia y te confirmamos por WhatsApp.</p>' +
      "</div>";
    document.body.appendChild(modal);

    modal.addEventListener("click", function (e) {
      var copiar = e.target.getAttribute && e.target.getAttribute("data-copiar");
      if (copiar) {
        if (navigator.clipboard) navigator.clipboard.writeText(copiar).catch(function () {});
        e.target.textContent = "¡Copiado!";
        return;
      }
      if (e.target.id === "btnCerrarTransferencia" || e.target === modal) modal.remove();
    });

    document.getElementById("btnYaTransferi").addEventListener("click", async function (e) {
      var btn = e.currentTarget;
      var error = document.getElementById("errorTransferencia");
      var archivo = document.getElementById("archivoComprobante").files[0] || null;
      error.classList.add("d-none");
      btn.classList.add("deshabilitado");
      btn.textContent = "Enviando...";
      var res = await GaussDB.avisarTransferencia(ids, archivo);
      if (!res.ok) {
        btn.classList.remove("deshabilitado");
        btn.textContent = "✅ Ya transferí";
        error.textContent = "No pudimos registrar el aviso. Probá de nuevo o mandanos el comprobante por WhatsApp.";
        error.classList.remove("d-none");
        return;
      }
      if (opciones.limpiarCarrito !== false) { try { localStorage.removeItem(STORAGE_KEY_CARRITO); } catch (err) {} }
      var caja = modal.querySelector(".caja-transferencia");
      var msg = encodeURIComponent("Hola! Hice un pedido en la web y ya transferí " + formatearPrecio(total) + ". " + (res.url ? "Subí el comprobante en la página." : "Te mando el comprobante por acá."));
      caja.innerHTML = '<div style="font-size:44px;text-align:center;">✅</div><h2 class="text-center">¡Gracias!</h2>' +
        '<p class="text-center">Recibimos tu aviso. Verificamos el pago y te escribimos por WhatsApp entre 24 y 48 hs para coordinar.</p>' +
        '<a class="btn-finalizar-carrito" target="_blank" rel="noopener" href="https://wa.me/' + NUMERO_WHATSAPP + '?text=' + msg + '">Escribirnos por WhatsApp</a>' +
        '<button type="button" class="btn-vaciar-carrito" id="btnFinTransferencia">Cerrar</button>';
      document.getElementById("btnFinTransferencia").addEventListener("click", function () { window.location.reload(); });
    });
  }

  /* Si el link trae ?modo=venta o ?modo=alquiler, la página muestra solo esa modalidad
     (el menú Ventas / Alquileres del sitio). Sin el parámetro, no cambia nada. */
  function aplicarModoDePagina() {
    var modo = new URLSearchParams(window.location.search).get("modo");
    if (modo !== "venta" && modo !== "alquiler") return;
    var quiereAlquiler = modo === "alquiler";
    var avisado = false;
    document.querySelectorAll(".selector-modalidad").forEach(function (grupo) {
      var radios = Array.prototype.slice.call(grupo.querySelectorAll('input[type="radio"][data-alquiler]'));
      if (radios.length === 0) return;
      var deseados = radios.filter(function (r) {
        return (r.getAttribute("data-alquiler") === "1") === quiereAlquiler;
      });
      if (deseados.length === 0 || deseados.length === radios.length) return;
      radios.forEach(function (r) {
        if (deseados.indexOf(r) === -1) r.closest("label").classList.add("d-none");
      });
      if (!deseados.some(function (r) { return r.checked; })) {
        deseados[0].checked = true;
        deseados[0].dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (deseados.length === 1) grupo.classList.add("d-none");
      if (!avisado) {
        avisado = true;
        var nota = document.createElement("p");
        nota.className = "nota-modo-pagina";
        nota.innerHTML = (quiereAlquiler ? "🔁 Alquiler" : "🛒 Venta") + ' · <a href="?modo=' + (quiereAlquiler ? "venta" : "alquiler") + '">Ver ' + (quiereAlquiler ? "la opción de compra" : "la opción de alquiler") + "</a>";
        grupo.insertAdjacentElement("beforebegin", nota);
      }
    });
  }

  window.GaussPagoTransferencia = { mostrar: function (ids, total, opciones) { mostrarDatosTransferencia(ids, total, opciones); } };

  async function manejarClickFinalizar(evento, online) {
    evento.preventDefault();
    var pedidosCreados = [];
    var carrito = leerCarrito();
    if (carrito.length === 0) return;

    var avisoDatos = document.getElementById("avisoDatosAlquiler");
    var avisoDisp = document.getElementById("avisoDisponibilidad");
    if (avisoDisp) avisoDisp.classList.add("d-none");

    if (hayAlquilerEnCarrito(carrito)) {
      var validacion = validarDatosAlquiler();
      if (validacion.elemento) {
        if (avisoDatos) {
          avisoDatos.textContent = validacion.mensaje;
          avisoDatos.classList.remove("d-none");
        }
        validacion.elemento.focus();
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
          item.varianteId || idProductoBase(item.id),
          datos.campoFechaDesde,
          calcularFechaHasta(datos.campoFechaDesde, item.dias)
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
        var guardadoLinea = await GaussDB.crearPedido({
          tipo: linea.alquiler ? "alquiler" : "venta",
          productoId: linea.varianteId || idProductoBase(linea.id),
          productoNombre: linea.nombre,
          cantidad: linea.cantidad,
          precioUnitario: linea.precio,
          total: linea.precio * linea.cantidad,
          fechaDesde: linea.alquiler ? datos.campoFechaDesde : null,
          fechaHasta: linea.alquiler ? calcularFechaHasta(datos.campoFechaDesde, linea.dias) : null,
          duracionDias: linea.alquiler ? linea.dias : null,
          nombre: datos.campoNombre,
          apellido: datos.campoApellido,
          telefono: datos.campoTelefono,
          dni: datos.campoDni,
          direccion: datos.campoDireccion,
          lesion: datos.campoLesion,
        });
        if (guardadoLinea && guardadoLinea.ok) pedidosCreados.push(guardadoLinea.pedido.id);
      }

      boton.textContent = textoOriginal;
      boton.classList.remove("deshabilitado");
    } else if (window.GaussDB) {
      // Solo ventas (sin alquiler): igual quedan registradas.
      for (var k = 0; k < carrito.length; k++) {
        var lineaVenta = carrito[k];
        var guardadoVenta = await GaussDB.crearPedido({
          tipo: "venta",
          productoId: lineaVenta.varianteId || idProductoBase(lineaVenta.id),
          productoNombre: lineaVenta.nombre,
          cantidad: lineaVenta.cantidad,
          precioUnitario: lineaVenta.precio,
          total: lineaVenta.precio * lineaVenta.cantidad,
        });
        if (guardadoVenta && guardadoVenta.ok) pedidosCreados.push(guardadoVenta.pedido.id);
      }
    }

    if (online === "transferencia") {
      if (pedidosCreados.length !== carrito.length) {
        boton.textContent = textoOriginal;
        boton.classList.remove("deshabilitado");
        var avisoT = document.getElementById("avisoDisponibilidad");
        if (avisoT) {
          avisoT.textContent = "No pudimos registrar el pedido. Probá de nuevo o finalizá por WhatsApp.";
          avisoT.classList.remove("d-none");
        }
        return;
      }
      boton.textContent = textoOriginal;
      mostrarDatosTransferencia(pedidosCreados, calcularTotal(carrito));
      return;
    }

    if (online) {
      var aviso = document.getElementById("avisoDisponibilidad");
      var falla = function (texto) {
        boton.textContent = textoOriginal;
        boton.classList.remove("deshabilitado");
        if (aviso) {
          aviso.textContent = texto;
          aviso.classList.remove("d-none");
        }
      };
      if (pedidosCreados.length !== carrito.length) {
        return falla("No pudimos registrar el pedido. Probá de nuevo o finalizá por WhatsApp.");
      }
      boton.textContent = "Abriendo Mercado Pago...";
      boton.classList.add("deshabilitado");
      var pago = await GaussDB.iniciarPagoOnline(pedidosCreados);
      if (!pago.ok) {
        return falla("No pudimos abrir el pago online. Tu pedido quedó registrado: finalizalo por WhatsApp o probá de nuevo en un rato.");
      }
      window.location.href = pago.url;
      return;
    }

    window.open(construirMensajeWhatsApp(carrito), "_blank");
  }

  document.addEventListener("DOMContentLoaded", function () {
    precargarDatosAlquiler();
    renderizarCarrito();

    var hoy = new Date().toISOString().slice(0, 10);
    var campoDesde = document.getElementById("campoFechaDesde");
    if (campoDesde) campoDesde.min = hoy;

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
    if (btnFinalizar) btnFinalizar.addEventListener("click", function (e) { manejarClickFinalizar(e, false); });

    // Botón opcional de transferencia / QR (solo si PAGO_TRANSFERENCIA = true en supabase-config.js)
    if (btnFinalizar && typeof PAGO_TRANSFERENCIA !== "undefined" && PAGO_TRANSFERENCIA) {
      var btnTransf = document.createElement("button");
      btnTransf.type = "button";
      btnTransf.className = "btn-pagar-transferencia";
      btnTransf.id = "btnPagarTransferencia";
      btnTransf.textContent = "🏦 Pagar por transferencia o QR";
      btnFinalizar.insertAdjacentElement("afterend", btnTransf);
      btnTransf.addEventListener("click", function (e) { manejarClickFinalizar(e, "transferencia"); });
    }

    // Botón opcional de pago online (se muestra solo si PAGOS_ONLINE = true en supabase-config.js)
    if (btnFinalizar && typeof PAGOS_ONLINE !== "undefined" && PAGOS_ONLINE) {
      var btnOnline = document.createElement("button");
      btnOnline.type = "button";
      btnOnline.className = "btn-pagar-online";
      btnOnline.id = "btnPagarOnline";
      btnOnline.textContent = "💳 Pagar ahora con tarjeta o Mercado Pago";
      var nota = document.createElement("p");
      nota.className = "nota-pago-online";
      nota.textContent = "Pago seguro por Mercado Pago. También podés pagar en el local al retirar.";
      btnFinalizar.insertAdjacentElement("afterend", nota);
      btnFinalizar.insertAdjacentElement("afterend", btnOnline);
      btnOnline.addEventListener("click", function (e) { manejarClickFinalizar(e, true); });
    }

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
          actualizarImagenSegunSeleccion(radio);
          if (radio.hasAttribute("data-variante")) { aplicarPreciosDeVariante(); actualizarDisponibilidadProducto(); }
          else refrescarBotonAgregar();
        });
        if (radio.checked) {
          actualizarPrecioSegunModalidad(radio);
          actualizarImagenSegunSeleccion(radio);
        }
      });

      aplicarModoDePagina();
      refrescarBotonAgregar();
      aplicarPreciosDeVariante();
      agregarLinkFormulario();
      actualizarDisponibilidadProducto();
    });
})();
