/* ============================================================
   ADMIN.JS — Panel de administración de Gauss Ortopedia
   Requiere haber creado un usuario en Supabase (Authentication >
   Users > Add user) con el email/contraseña que vas a usar acá.
   ============================================================ */

(function () {
  "use strict";

  var DIAS_ANTES_DE_AVISAR = 3;

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

  function hoyISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function calcularFechaHasta(fechaDesdeStr, dias) {
    var fecha = new Date(fechaDesdeStr + "T00:00:00");
    fecha.setDate(fecha.getDate() + (dias - 1));
    return fecha.toISOString().slice(0, 10);
  }

  function diasHasta(fechaISO) {
    var hoy = new Date(hoyISO() + "T00:00:00");
    var fecha = new Date(fechaISO + "T00:00:00");
    return Math.round((fecha - hoy) / 86400000);
  }

  // Intenta armar un número en formato internacional para wa.me.
  // No es infalible (los códigos de área varían), así que en la UI
  // siempre mostramos también el número tal cual lo cargó el cliente.
  function normalizarTelefono(numero) {
    var limpio = (numero || "").replace(/\D/g, "");
    if (!limpio) return "";
    if (limpio.indexOf("54") === 0) return limpio;
    if (limpio.indexOf("15") === 0) limpio = limpio.slice(2);
    if (limpio.indexOf("0") === 0) limpio = limpio.slice(1);
    return "549" + limpio;
  }

  function linkWhatsApp(telefono, mensaje) {
    return "https://wa.me/" + normalizarTelefono(telefono) + "?text=" + encodeURIComponent(mensaje);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var pantallaLogin = document.getElementById("pantallaLogin");
    var pantallaPanel = document.getElementById("pantallaPanel");
    var formLogin = document.getElementById("formLogin");
    var errorLogin = document.getElementById("errorLogin");
    var avisoSinConfigurar = document.getElementById("avisoSinConfigurar");
    var tablaCuerpo = document.getElementById("cuerpoTablaPedidos");
    var selectFiltroEstado = document.getElementById("filtroEstado");
    var selectFiltroTipo = document.getElementById("filtroTipo");
    var btnLogout = document.getElementById("btnLogout");
    var emailUsuario = document.getElementById("emailUsuarioLogueado");
    var listaActivos = document.getElementById("listaActivos");
    var listaPorvencer = document.getElementById("listaPorvencer");
    var listaVencidos = document.getElementById("listaVencidos");
    var listaComprobantes = document.getElementById("listaComprobantes");
    var listaStock = document.getElementById("listaStock");
    var contadorActivos = document.getElementById("contadorActivos");
    var contadorPorvencer = document.getElementById("contadorPorvencer");
    var contadorVencidos = document.getElementById("contadorVencidos");
    var contadorComprobantes = document.getElementById("contadorComprobantes");

    if (!GaussDB.configurado()) {
      if (avisoSinConfigurar) avisoSinConfigurar.classList.remove("d-none");
      if (formLogin) formLogin.classList.add("d-none");
      return;
    }

    var db = GaussDB.obtenerCliente();
    var pedidosCache = [];
    var variantesCache = [];

    /* ---------------------- Pantallas ---------------------- */

    function mostrarPanel(sesion) {
      pantallaLogin.classList.add("d-none");
      pantallaPanel.classList.remove("d-none");
      if (emailUsuario) emailUsuario.textContent = sesion.user.email;
      cargarPedidos();
    }

    function mostrarLogin() {
      pantallaPanel.classList.add("d-none");
      pantallaLogin.classList.remove("d-none");
    }

    /* ---------------------- Pestañas ---------------------- */

    document.querySelectorAll(".tab-admin").forEach(function (boton) {
      boton.addEventListener("click", function () {
        document.querySelectorAll(".tab-admin").forEach(function (b) {
          b.classList.remove("activo");
        });
        boton.classList.add("activo");

        document.querySelectorAll(".panel-tab-admin").forEach(function (panel) {
          panel.classList.add("d-none");
        });
        var nombre = boton.getAttribute("data-tab");
        var destino = document.getElementById("tab" + nombre.charAt(0).toUpperCase() + nombre.slice(1));
        if (destino) destino.classList.remove("d-none");
      });
    });

    /* ---------------------- Carga de datos ---------------------- */

    async function cargarPedidos() {
      tablaCuerpo.innerHTML = '<tr><td colspan="10" class="text-center py-4">Cargando pedidos...</td></tr>';
      var resultado = await db.from("pedidos").select("*").order("creado_en", { ascending: false });

      if (resultado.error) {
        tablaCuerpo.innerHTML =
          '<tr><td colspan="10" class="text-center py-4 text-danger">Error al cargar: ' +
          resultado.error.message +
          "</td></tr>";
        return;
      }
      pedidosCache = resultado.data;
      renderizarTabla();
      renderizarActivos();
      renderizarPorVencer();
      renderizarVencidos();
      renderizarComprobantes();
      cargarStock();
    }

    async function cargarStock() {
      var resultado = await GaussDB.listarVariantes();
      if (!resultado.ok) {
        listaStock.innerHTML = '<p class="texto-vacio-admin">No se pudo cargar el stock: ' + resultado.motivo + "</p>";
        return;
      }
      variantesCache = resultado.variantes;
      renderizarStock();
    }

    function renderizarStock() {
      if (variantesCache.length === 0) {
        listaStock.innerHTML = '<p class="texto-vacio-admin">Todavía no cargaste el stock (correspondería correr de nuevo supabase-schema.sql).</p>';
        return;
      }

      var grupos = {};
      variantesCache.forEach(function (v) {
        if (!grupos[v.producto_nombre]) grupos[v.producto_nombre] = [];
        grupos[v.producto_nombre].push(v);
      });

      listaStock.innerHTML = Object.keys(grupos)
        .map(function (nombreProducto) {
          var filas = grupos[nombreProducto]
            .map(function (v) {
              var ocupadas = pedidosCache.filter(function (p) {
                return p.producto_id === v.id && p.estado === "activo";
              }).length;

              return (
                '<div class="tarjeta-stock">' +
                '<div class="info-stock">' +
                "<h4>" + v.variante + "</h4>" +
                "<p>" + ocupadas + " ocupada" + (ocupadas === 1 ? "" : "s") + " ahora mismo</p>" +
                "</div>" +
                '<div class="controles-stock">' +
                '<input type="number" min="0" class="form-control form-control-sm campo-alquiler input-stock" data-id="' + v.id + '" value="' + v.stock + '">' +
                '<button type="button" class="btn-accion-admin activar btn-guardar-stock" data-id="' + v.id + '">Guardar</button>' +
                "</div>" +
                "</div>"
              );
            })
            .join("");

          return (
            '<div class="grupo-stock">' +
            '<h3 class="titulo-grupo-stock">' + nombreProducto + "</h3>" +
            filas +
            "</div>"
          );
        })
        .join("");
    }

    /* ---------------------- Tabla de pedidos ---------------------- */

    function renderizarTabla() {
      var estadoFiltro = selectFiltroEstado.value;
      var tipoFiltro = selectFiltroTipo.value;

      var filas = pedidosCache.filter(function (p) {
        if (estadoFiltro !== "todos" && p.estado !== estadoFiltro) return false;
        if (tipoFiltro !== "todos" && p.tipo !== tipoFiltro) return false;
        return true;
      });

      if (filas.length === 0) {
        tablaCuerpo.innerHTML =
          '<tr><td colspan="10" class="text-center py-4">No hay pedidos con este filtro.</td></tr>';
        return;
      }

      tablaCuerpo.innerHTML = filas
        .map(function (p) {
          var fecha = new Date(p.creado_en).toLocaleString("es-AR");
          var periodo =
            p.tipo === "alquiler"
              ? formatearFecha(p.fecha_desde) + " → " + formatearFecha(p.fecha_hasta)
              : "-";
          var cliente = [p.nombre, p.apellido].filter(Boolean).join(" ") || "-";
          var badgeTipo = p.tipo === "alquiler" ? "badge-tipo-alquiler" : "badge-tipo-venta";

          var acciones = [];
          if (p.tipo === "alquiler" && (p.estado === "confirmado" || p.estado === "activo")) {
            acciones.push(
              p.aviso_retiro_enviado
                ? '<span class="text-secondary" style="font-size:12px;">✓ Avisado</span>'
                : '<button type="button" class="btn-accion-admin retiro btn-avisar-retiro" data-id="' + p.id + '">📦 Avisar retiro</button>'
            );
          }
          if (p.tipo === "alquiler" && p.estado === "confirmado") {
            acciones.push('<button type="button" class="btn-accion-admin activar btn-activar-alquiler" data-id="' + p.id + '">▶️ Activar alquiler</button>');
          }
          if (p.tipo === "alquiler" && p.estado === "activo") {
            acciones.push('<button type="button" class="btn-accion-admin baja btn-dar-de-baja" data-id="' + p.id + '">↩️ Dar de baja</button>');
          }

          return (
            "<tr>" +
            "<td>" + fecha + "</td>" +
            '<td><span class="badge-tipo ' + badgeTipo + '">' + p.tipo + "</span></td>" +
            "<td>" + p.producto_nombre + " x" + p.cantidad + "</td>" +
            "<td>" + periodo + "</td>" +
            "<td>" + cliente + (p.dni ? " (DNI " + p.dni + ")" : "") + "</td>" +
            "<td>" + (p.telefono || "-") + "</td>" +
            "<td>" + (p.direccion || "-") + (p.lesion ? "<br><small class='text-muted'>" + p.lesion + "</small>" : "") + "</td>" +
            "<td>" + formatearPrecio(p.total) + "</td>" +
            '<td><select class="form-select form-select-sm selector-estado" data-id="' + p.id + '">' +
            ["pendiente", "confirmado", "activo", "devuelto", "cancelado"]
              .map(function (e) {
                return '<option value="' + e + '"' + (e === p.estado ? " selected" : "") + ">" + e + "</option>";
              })
              .join("") +
            "</select></td>" +
            '<td><div class="acciones-fila-admin">' + acciones.join("") + "</div></td>" +
            "</tr>"
          );
        })
        .join("");
    }

    /* ---------------------- Listas de alquileres (Activos / Por vencer / Vencidos) ---------------------- */

    function textoDiasRestantes(fechaHasta) {
      var dias = diasHasta(fechaHasta);
      if (dias < 0) return "Venció hace " + Math.abs(dias) + " día" + (Math.abs(dias) === 1 ? "" : "s");
      if (dias === 0) return "Vence hoy";
      return "Vence en " + dias + " día" + (dias === 1 ? "" : "s");
    }

    function tarjetaAlquiler(p) {
      var dias = diasHasta(p.fecha_hasta);
      var badgeEstado =
        '<span class="badge-estado-pedido badge-estado-' + p.estado + '">' + p.estado + "</span>";

      return (
        '<div class="tarjeta-vencimiento' + (dias <= 0 ? " vencido" : "") + '">' +
        '<div class="info-vencimiento">' +
        "<h4>" + p.producto_nombre + " — " + [p.nombre, p.apellido].filter(Boolean).join(" ") + " " + badgeEstado + "</h4>" +
        "<p>" + textoDiasRestantes(p.fecha_hasta) + " (" + formatearFecha(p.fecha_hasta) + ") · Tel: " + (p.telefono || "sin cargar") + "</p>" +
        "</div>" +
        '<div class="acciones-vencimiento">' +
        '<button type="button" class="btn-accion-admin recordatorio btn-enviar-recordatorio" data-id="' + p.id + '">🔔 Enviar recordatorio</button>' +
        (p.estado === "activo"
          ? '<button type="button" class="btn-accion-admin baja btn-dar-de-baja" data-id="' + p.id + '">↩️ Dar de baja</button>'
          : "") +
        "</div>" +
        "</div>"
      );
    }

    function renderizarListaAlquileres(contenedor, contador, lista, textoVacio) {
      contador.textContent = lista.length;
      contador.classList.toggle("badge-tab-vacio", lista.length === 0);

      if (lista.length === 0) {
        contenedor.innerHTML = '<p class="texto-vacio-admin">' + textoVacio + "</p>";
        return;
      }

      contenedor.innerHTML = lista
        .slice()
        .sort(function (a, b) {
          return (a.fecha_hasta || "").localeCompare(b.fecha_hasta || "");
        })
        .map(tarjetaAlquiler)
        .join("");
    }

    function renderizarActivos() {
      var activos = pedidosCache.filter(function (p) {
        return p.tipo === "alquiler" && p.estado === "activo";
      });
      renderizarListaAlquileres(listaActivos, contadorActivos, activos, "No hay alquileres activos en este momento.");
    }

    function renderizarPorVencer() {
      var porVencer = pedidosCache.filter(function (p) {
        return (
          p.tipo === "alquiler" &&
          (p.estado === "confirmado" || p.estado === "activo") &&
          !p.pago_pendiente_revision &&
          p.fecha_hasta &&
          diasHasta(p.fecha_hasta) >= 0 &&
          diasHasta(p.fecha_hasta) <= DIAS_ANTES_DE_AVISAR
        );
      });
      renderizarListaAlquileres(listaPorvencer, contadorPorvencer, porVencer, "No hay alquileres por vencer en los próximos " + DIAS_ANTES_DE_AVISAR + " días.");
    }

    function renderizarVencidos() {
      var vencidos = pedidosCache.filter(function (p) {
        return (
          p.tipo === "alquiler" &&
          (p.estado === "confirmado" || p.estado === "activo") &&
          !p.pago_pendiente_revision &&
          p.fecha_hasta &&
          diasHasta(p.fecha_hasta) < 0
        );
      });
      renderizarListaAlquileres(listaVencidos, contadorVencidos, vencidos, "No hay alquileres vencidos sin devolver. 🎉");
    }

    /* ---------------------- Comprobantes por revisar ---------------------- */

    function renderizarComprobantes() {
      var pendientes = pedidosCache.filter(function (p) {
        return p.pago_pendiente_revision;
      });

      contadorComprobantes.textContent = pendientes.length;
      contadorComprobantes.classList.toggle("badge-tab-vacio", pendientes.length === 0);

      if (pendientes.length === 0) {
        listaComprobantes.innerHTML = '<p class="texto-vacio-admin">No hay comprobantes esperando revisión.</p>';
        return;
      }

      listaComprobantes.innerHTML = pendientes
        .map(function (p) {
          return (
            '<div class="tarjeta-comprobante">' +
            (p.comprobante_url
              ? '<a href="' + p.comprobante_url + '" target="_blank"><img class="imagen-comprobante" src="' + p.comprobante_url + '" alt="Comprobante"></a>'
              : "") +
            '<div class="info-comprobante" style="flex:1;">' +
            "<h4>" + p.producto_nombre + " — " + [p.nombre, p.apellido].filter(Boolean).join(" ") + "</h4>" +
            "<p>Renovación de " + (p.duracion_dias || "-") + " días · Monto: " + formatearPrecio(p.total) + "</p>" +
            "<p>Vencía: " + formatearFecha(p.fecha_hasta) + " · Tel: " + (p.telefono || "sin cargar") + "</p>" +
            "</div>" +
            '<div class="acciones-comprobante">' +
            '<button type="button" class="btn-accion-admin confirmar btn-confirmar-renovacion" data-id="' + p.id + '">✅ Confirmar y renovar</button>' +
            '<button type="button" class="btn-accion-admin rechazar btn-rechazar-comprobante" data-id="' + p.id + '">❌ Rechazar</button>' +
            "</div>" +
            "</div>"
          );
        })
        .join("");
    }

    /* ---------------------- Acciones ---------------------- */

    async function avisarRetiro(id) {
      var pedido = pedidosCache.find(function (p) {
        return p.id === id;
      });
      if (!pedido) return;

      var mensaje =
        "Hola " + (pedido.nombre || "") + "! Tu " + pedido.producto_nombre +
        " ya está listo para retirar en Gauss Ortopedia (27 de febrero 1724, Rosario). " +
        "Horarios: Lunes a Viernes de 9:30 a 13 hs. y de 15 a 18 hs, Sábados 9:30 a 13 hs. " +
        "Tu alquiler es por " + (pedido.duracion_dias || "-") + " días, hasta el " + formatearFecha(pedido.fecha_hasta) + ". ¡Te esperamos!";

      window.open(linkWhatsApp(pedido.telefono, mensaje), "_blank");
      await db.from("pedidos").update({ aviso_retiro_enviado: true }).eq("id", id);
      pedido.aviso_retiro_enviado = true;
      renderizarTabla();
    }

    function enviarRecordatorio(id) {
      var pedido = pedidosCache.find(function (p) {
        return p.id === id;
      });
      if (!pedido) return;

      var alias = typeof ALIAS_PAGO !== "undefined" ? ALIAS_PAGO : "(configurá tu alias en supabase-config.js)";
      var siteUrl = typeof SITE_URL !== "undefined" ? SITE_URL : "";
      var link = siteUrl ? siteUrl.replace(/\/$/, "") + "/renovar.html?pedido=" + id : "";

      var mensaje =
        "Hola " + (pedido.nombre || "") + "! Tu alquiler de " + pedido.producto_nombre +
        " vence el " + formatearFecha(pedido.fecha_hasta) + ". " +
        "Si querés renovarlo por " + (pedido.duracion_dias || "-") + " días más (" + formatearPrecio(pedido.total) + "), " +
        "transferí al alias " + alias + (link ? " y subí el comprobante acá: " + link : ", y avisanos por acá cuando lo hagas") +
        ". ¡Gracias!";

      window.open(linkWhatsApp(pedido.telefono, mensaje), "_blank");
    }

    async function confirmarRenovacion(id) {
      var pedido = pedidosCache.find(function (p) {
        return p.id === id;
      });
      if (!pedido || !pedido.duracion_dias) return;

      // Arranca el día siguiente al vencimiento anterior y suma la
      // misma duración del alquiler original.
      var diaSiguiente = new Date(pedido.fecha_hasta + "T00:00:00");
      diaSiguiente.setDate(diaSiguiente.getDate() + 1);
      var nuevaFechaHasta = calcularFechaHasta(diaSiguiente.toISOString().slice(0, 10), pedido.duracion_dias);

      var resultado = await db
        .from("pedidos")
        .update({
          fecha_hasta: nuevaFechaHasta,
          pago_pendiente_revision: false,
          aviso_retiro_enviado: false,
          veces_renovado: (pedido.veces_renovado || 0) + 1,
        })
        .eq("id", id);

      if (resultado.error) {
        alert("No se pudo confirmar la renovación: " + resultado.error.message);
        return;
      }

      cargarPedidos();
    }

    async function rechazarComprobante(id) {
      var resultado = await db.from("pedidos").update({ pago_pendiente_revision: false }).eq("id", id);
      if (resultado.error) {
        alert("No se pudo rechazar: " + resultado.error.message);
        return;
      }
      cargarPedidos();
    }

    function refrescarListasAlquiler() {
      renderizarActivos();
      renderizarPorVencer();
      renderizarVencidos();
    }

    async function activarAlquiler(id) {
      var resultado = await db.from("pedidos").update({ estado: "activo" }).eq("id", id);
      if (resultado.error) {
        alert("No se pudo activar el alquiler: " + resultado.error.message);
        return;
      }
      var pedido = pedidosCache.find(function (p) {
        return p.id === id;
      });
      if (pedido) pedido.estado = "activo";
      renderizarTabla();
      refrescarListasAlquiler();
    }

    async function darDeBaja(id) {
      var resultado = await db.from("pedidos").update({ estado: "devuelto" }).eq("id", id);
      if (resultado.error) {
        alert("No se pudo dar de baja el alquiler: " + resultado.error.message);
        return;
      }
      var pedido = pedidosCache.find(function (p) {
        return p.id === id;
      });
      if (pedido) pedido.estado = "devuelto";
      renderizarTabla();
      refrescarListasAlquiler();
    }

    /* ---------------------- Eventos ---------------------- */

    formLogin.addEventListener("submit", async function (evento) {
      evento.preventDefault();
      errorLogin.classList.add("d-none");
      var email = document.getElementById("campoEmailLogin").value;
      var password = document.getElementById("campoPasswordLogin").value;

      var resultado = await db.auth.signInWithPassword({ email: email, password: password });
      if (resultado.error) {
        errorLogin.textContent = "No pudimos iniciar sesión: " + resultado.error.message;
        errorLogin.classList.remove("d-none");
        return;
      }
      mostrarPanel(resultado.data.session);
    });

    if (btnLogout) {
      btnLogout.addEventListener("click", async function () {
        await db.auth.signOut();
        mostrarLogin();
      });
    }

    [selectFiltroEstado, selectFiltroTipo].forEach(function (el) {
      el.addEventListener("change", renderizarTabla);
    });

    tablaCuerpo.addEventListener("click", function (evento) {
      var id = evento.target.getAttribute("data-id");
      if (!id) return;
      if (evento.target.classList.contains("btn-avisar-retiro")) avisarRetiro(id);
      if (evento.target.classList.contains("btn-activar-alquiler")) activarAlquiler(id);
      if (evento.target.classList.contains("btn-dar-de-baja")) darDeBaja(id);
    });

    tablaCuerpo.addEventListener("change", async function (evento) {
      if (!evento.target.classList.contains("selector-estado")) return;
      var id = evento.target.getAttribute("data-id");
      var nuevoEstado = evento.target.value;
      await db.from("pedidos").update({ estado: nuevoEstado }).eq("id", id);
      var pedido = pedidosCache.find(function (p) {
        return p.id === id;
      });
      if (pedido) pedido.estado = nuevoEstado;
      renderizarTabla();
      refrescarListasAlquiler();
    });

    [listaActivos, listaPorvencer, listaVencidos].forEach(function (contenedor) {
      contenedor.addEventListener("click", function (evento) {
        var id = evento.target.getAttribute("data-id");
        if (!id) return;
        if (evento.target.classList.contains("btn-enviar-recordatorio")) enviarRecordatorio(id);
        if (evento.target.classList.contains("btn-dar-de-baja")) darDeBaja(id);
      });
    });

    listaComprobantes.addEventListener("click", function (evento) {
      var id = evento.target.getAttribute("data-id");
      if (!id) return;
      if (evento.target.classList.contains("btn-confirmar-renovacion")) confirmarRenovacion(id);
      if (evento.target.classList.contains("btn-rechazar-comprobante")) rechazarComprobante(id);
    });

    listaStock.addEventListener("click", async function (evento) {
      if (!evento.target.classList.contains("btn-guardar-stock")) return;
      var id = evento.target.getAttribute("data-id");
      var input = listaStock.querySelector('.input-stock[data-id="' + id + '"]');
      var nuevoStock = parseInt(input.value, 10);
      if (isNaN(nuevoStock) || nuevoStock < 0) {
        alert("Ingresá un número válido.");
        return;
      }

      var textoOriginal = evento.target.textContent;
      evento.target.textContent = "Guardando...";
      evento.target.classList.add("deshabilitado");

      var resultado = await GaussDB.actualizarStock(id, nuevoStock);

      evento.target.textContent = resultado.ok ? "Guardado ✓" : textoOriginal;
      evento.target.classList.remove("deshabilitado");

      if (resultado.ok) {
        var variante = variantesCache.find(function (v) {
          return v.id === id;
        });
        if (variante) variante.stock = nuevoStock;
        window.setTimeout(function () {
          evento.target.textContent = textoOriginal;
        }, 1500);
      } else {
        alert("No se pudo guardar: " + resultado.motivo);
      }
    });

    // Si ya había una sesión activa (recargó la página), la retomamos.
    db.auth.getSession().then(function (resultado) {
      if (resultado.data.session) mostrarPanel(resultado.data.session);
    });
  });
})();
