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

  // Precios por duración conocidos (para sugerir el nuevo total al cambiar de 15 a 30 días o al revés).
  var PRECIOS_POR_DURACION = {
    "magneto-placas": { 15: 25000, 30: 46000 },
    "magneto-tubos": { 15: 25000, 30: 46000 },
    "magneto-tubo-placas": { 15: 29000, 30: 50000 },
  };

  // El Magneto es un solo equipo (un QR, un stock): el modelo (placas, tubos,
  // tubo y placas) queda en el pedido. Un pedido "magneto-xxx" cuenta contra la
  // variante unificada "magneto".
  var MODELOS_MAGNETO = [
    { id: "magneto-placas", variante: "Con placas" },
    { id: "magneto-tubos", variante: "Con tubos" },
    { id: "magneto-tubo-placas", variante: "Tubo y placas" },
  ];

  function pedidoEsDeVariante(productoIdPedido, varianteId) {
    if (productoIdPedido === varianteId) return true;
    return varianteId === "magneto" && typeof productoIdPedido === "string" && productoIdPedido.indexOf("magneto-") === 0;
  }

  // Pedidos "pendientes" con más de 24 hs sin atender (la promesa al cliente es confirmar en 24 hs).
  var HORAS_PARA_RESPONDER = 24;

  function horasDesde(iso) {
    return (Date.now() - new Date(iso).getTime()) / 3600000;
  }

  function esSinResponder(p) {
    return p.estado === "pendiente" && horasDesde(p.creado_en) >= HORAS_PARA_RESPONDER;
  }

  function textoHaceCuanto(iso) {
    var h = Math.floor(horasDesde(iso));
    if (h < 48) return "hace " + h + " hs";
    return "hace " + Math.floor(h / 24) + " días";
  }

  var ZONA_AR = "America/Argentina/Buenos_Aires";

  // Fecha y hora exactas (hora de Argentina) en que se hizo el pedido.
  function fechaHoraPedido(iso) {
    return new Date(iso).toLocaleString("es-AR", { timeZone: ZONA_AR, hour12: false });
  }

  // Hoy según el reloj de Argentina (no UTC), en formato AAAA-MM-DD.
  function hoyLocalISO() {
    return new Date().toLocaleDateString("en-CA", { timeZone: ZONA_AR });
  }

  // Los pedidos que entran por formulario.html no traen fechas: se completan
  // cuando el cliente retira. Devuelve los campos a agregar si faltan.
  function fechasSiFaltan(pedido) {
    if (!pedido || pedido.tipo !== "alquiler" || pedido.fecha_desde) return {};
    var desde = hoyLocalISO();
    return { fecha_desde: desde, fecha_hasta: calcularFechaHasta(desde, pedido.duracion_dias || 30) };
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
    var buscadorPedidos = document.getElementById("buscadorPedidos");
    var buscadorActivos = document.getElementById("buscadorActivos");
    var buscadorVencidos = document.getElementById("buscadorVencidos");
    var btnExportarCsv = document.getElementById("btnExportarCsv");
    var selectFiltroEstado = document.getElementById("filtroEstado");
    var selectFiltroTipo = document.getElementById("filtroTipo");
    var btnLogout = document.getElementById("btnLogout");
    var emailUsuario = document.getElementById("emailUsuarioLogueado");
    var listaActivos = document.getElementById("listaActivos");
    var listaPorvencer = document.getElementById("listaPorvencer");
    var listaVencidos = document.getElementById("listaVencidos");
    var listaComprobantes = document.getElementById("listaComprobantes");
    var listaStock = document.getElementById("listaStock");
    var listaContactos = document.getElementById("listaContactos");
    var buscadorContactos = document.getElementById("buscadorContactos");
    var contadorContactos = document.getElementById("contadorContactos");
    var btnImportarContactos = document.getElementById("btnImportarContactos");
    var btnExportarContactos = document.getElementById("btnExportarContactos");
    var btnLimpiarFinalizados = document.getElementById("btnLimpiarFinalizados");
    var listaEquipos = document.getElementById("listaEquipos");
    var panelHistorialEquipo = document.getElementById("panelHistorialEquipo");
    var resumenEquipos = document.getElementById("resumenEquipos");
    var filtroEquipos = document.getElementById("filtroEquipos");
    var selectVarianteEquipo = document.getElementById("selectVarianteEquipo");
    var inputCantidadEquipo = document.getElementById("inputCantidadEquipo");
    var btnCrearEquipos = document.getElementById("btnCrearEquipos");
    var btnImprimirEtiquetas = document.getElementById("btnImprimirEtiquetas");
    var btnEscanear = document.getElementById("btnEscanear");
    var btnDetenerEscaner = document.getElementById("btnDetenerEscaner");
    var visorEscaner = document.getElementById("visorEscaner");
    var resultadoEscaneo = document.getElementById("resultadoEscaneo");
    var inputCodigoManual = document.getElementById("inputCodigoManual");
    var btnBuscarCodigo = document.getElementById("btnBuscarCodigo");
    var listaParaFacturar = document.getElementById("listaParaFacturar");
    var listaUltimosFacturados = document.getElementById("listaUltimosFacturados");
    var btnEnviarSheets = document.getElementById("btnEnviarSheets");
    var btnExportarFacturitas = document.getElementById("btnExportarFacturitas");
    var btnConfirmarFacturados = document.getElementById("btnConfirmarFacturados");
    var grillaDashboard = document.getElementById("grillaDashboard");
    var devolucionesResumen = document.getElementById("devolucionesResumen");
    var equiposResumen = document.getElementById("equiposResumen");
    var avisoStockBajoResumen = document.getElementById("avisoStockBajoResumen");
    var rankingProductos = document.getElementById("rankingProductos");
    var contadorActivos = document.getElementById("contadorActivos");
    var contadorPorvencer = document.getElementById("contadorPorvencer");
    var contadorVencidos = document.getElementById("contadorVencidos");
    var contadorComprobantes = document.getElementById("contadorComprobantes");
    var contadorStockBajo = document.getElementById("contadorStockBajo");
    var contadorFacturar = document.getElementById("contadorFacturar");

    if (!GaussDB.configurado()) {
      if (avisoSinConfigurar) avisoSinConfigurar.classList.remove("d-none");
      if (formLogin) formLogin.classList.add("d-none");
      return;
    }

    var db = GaussDB.obtenerCliente();
    var pedidosCache = [];
    var variantesCache = [];
    var equiposCache = [];
    var contactosCache = [];
    var codigoPendienteDeLink = new URLSearchParams(window.location.search).get("equipo");

    /* ---------------------- Pantallas ---------------------- */

    function mostrarPanel(sesion) {
      pantallaLogin.classList.add("d-none");
      pantallaPanel.classList.remove("d-none");
      if (emailUsuario) emailUsuario.textContent = sesion.user.email;
      cargarPedidos().then(function () {
        // Si entró desde el QR escaneado con la cámara del celu (admin.html?equipo=CODIGO)
        if (codigoPendienteDeLink) {
          var codigo = codigoPendienteDeLink;
          codigoPendienteDeLink = null;
          irATab("equipos");
          procesarCodigo(codigo);
        }
      });
    }

    function mostrarLogin() {
      pantallaPanel.classList.add("d-none");
      pantallaLogin.classList.remove("d-none");
    }

    /* ---------------------- Pestañas ---------------------- */

    function irATab(nombre) {
      var boton = document.querySelector('.tab-admin[data-tab="' + nombre + '"]');
      if (boton) boton.click();
    }

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

    // Supabase devuelve como máximo 1000 filas por consulta. Para que el panel
    // siga mostrando TODO aunque haya miles de pedidos, se lee de a tandas.
    async function leerTodas(tabla, orden) {
      var todas = [];
      var paso = 1000;
      for (var desde = 0; ; desde += paso) {
        var consulta = db.from(tabla).select("*");
        (orden || []).forEach(function (o) {
          consulta = consulta.order(o.col, { ascending: !!o.asc });
        });
        var r = await consulta.range(desde, desde + paso - 1);
        if (r.error) return { data: null, error: r.error };
        todas = todas.concat(r.data || []);
        if (!r.data || r.data.length < paso) break;
      }
      return { data: todas, error: null };
    }

    async function cargarPedidos() {
      tablaCuerpo.innerHTML = '<tr><td colspan="11" class="text-center py-4">Cargando pedidos...</td></tr>';
      var resultado = await leerTodas("pedidos", [{ col: "creado_en", asc: false }, { col: "id", asc: true }]);

      if (resultado.error) {
        tablaCuerpo.innerHTML =
          '<tr><td colspan="11" class="text-center py-4 text-danger">Error al cargar: ' +
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
      renderizarResumen();
      renderizarParaFacturar();
      await cargarStock();
      await cargarEquipos();
      await cargarContactos();
      await cargarPlantillas();
    }

    async function cargarStock() {
      var resultado = await GaussDB.listarVariantes();
      if (!resultado.ok) {
        listaStock.innerHTML = '<p class="texto-vacio-admin">No se pudo cargar el stock: ' + resultado.motivo + "</p>";
        return;
      }
      variantesCache = resultado.variantes;
      renderizarStock();
      renderizarEquipos();
    }

    var UMBRAL_STOCK_BAJO = 0.15; // menos del 15% disponible = alerta

    function esStockBajo(v, ocupadas) {
      var disponibles = v.stock - ocupadas;
      if (v.stock <= 0) return false;
      return disponibles <= Math.max(3, Math.round(v.stock * UMBRAL_STOCK_BAJO));
    }

    function renderizarStock() {
      if (variantesCache.length === 0) {
        listaStock.innerHTML = '<p class="texto-vacio-admin">Todavía no cargaste el stock (correspondería correr de nuevo supabase-schema.sql).</p>';
        return;
      }

      var bajos = variantesCache.filter(function (v) {
        var ocupadas = pedidosCache.filter(function (p) {
          return pedidoEsDeVariante(p.producto_id, v.id) && p.estado === "activo";
        }).length;
        return esStockBajo(v, ocupadas + (v.en_reparacion || 0));
      });
      contadorStockBajo.textContent = bajos.length;
      contadorStockBajo.classList.toggle("badge-tab-vacio", bajos.length === 0);

      if (avisoStockBajoResumen) {
        if (bajos.length === 0) {
          avisoStockBajoResumen.classList.add("d-none");
        } else {
          avisoStockBajoResumen.classList.remove("d-none");
          avisoStockBajoResumen.innerHTML =
            "⚠️ Quedan pocas unidades de: <strong>" +
            bajos.map(function (v) { return v.producto_nombre + " (" + v.variante + ")"; }).join(", ") +
            "</strong>. Revisá la pestaña Stock.";
        }
      }

      var grupos = {};
      variantesCache.forEach(function (v) {
        if (!grupos[v.producto_nombre]) grupos[v.producto_nombre] = [];
        grupos[v.producto_nombre].push(v);
      });

      listaStock.innerHTML = Object.keys(grupos)
        .map(function (nombreProducto) {
          var variantes = grupos[nombreProducto];
          var stockTotal = variantes.reduce(function (acc, v) {
            return acc + v.stock;
          }, 0);
          var ocupadasTotal = variantes.reduce(function (acc, v) {
            return (
              acc +
              pedidosCache.filter(function (p) {
                return pedidoEsDeVariante(p.producto_id, v.id) && p.estado === "activo";
              }).length
            );
          }, 0);

          var tarjetas = variantes
            .map(function (v) {
              var ocupadas = pedidosCache.filter(function (p) {
                return pedidoEsDeVariante(p.producto_id, v.id) && p.estado === "activo";
              }).length;
              var enReparacion = v.en_reparacion || 0;
              var disponibles = v.stock - ocupadas - enReparacion;
              var claseAlerta = disponibles <= 0 ? " stock-agotado" : esStockBajo(v, ocupadas + enReparacion) ? " stock-bajo" : "";

              return (
                '<div class="tarjeta-stock' + claseAlerta + '">' +
                '<div class="info-stock">' +
                "<h4>" + v.variante + "</h4>" +
                "<p>" + ocupadas + " ocupada" + (ocupadas === 1 ? "" : "s") + " ahora</p>" +
                (enReparacion > 0 ? "<p>🔧 " + enReparacion + " en reparación</p>" : "") +
                '<p class="disponibles-stock">' + Math.max(disponibles, 0) + " disponible" + (disponibles === 1 ? "" : "s") + "</p>" +
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
            '<div class="encabezado-grupo-stock">' +
            '<h3 class="titulo-grupo-stock">' + nombreProducto + "</h3>" +
            '<span class="resumen-grupo-stock">' + ocupadasTotal + " ocupadas de " + stockTotal + " en total</span>" +
            "</div>" +
            '<div class="grilla-stock">' + tarjetas + "</div>" +
            "</div>"
          );
        })
        .join("");
    }

    /* ---------------------- Resumen (dashboard) ---------------------- */

    function renderizarDevolucionesProximas() {
      if (!devolucionesResumen) return;
      var proximas = pedidosCache
        .filter(function (p) {
          if (p.tipo !== "alquiler" || p.estado !== "activo" || !p.fecha_hasta) return false;
          var d = diasHasta(p.fecha_hasta);
          return d === 0 || d === 1;
        })
        .sort(function (a, b) {
          return (a.fecha_hasta || "").localeCompare(b.fecha_hasta || "");
        });

      var html = '<h3 class="titulo-grupo-stock mb-3">Devoluciones de hoy y mañana</h3>';
      if (proximas.length === 0) {
        devolucionesResumen.innerHTML = html + '<p class="texto-vacio-admin">No hay devoluciones para hoy ni mañana.</p>';
        return;
      }
      devolucionesResumen.innerHTML =
        html +
        proximas
          .map(function (p) {
            var cuando = diasHasta(p.fecha_hasta) === 0 ? "hoy" : "mañana";
            var codigos = equiposCache
              .filter(function (e) {
                return e.pedido_id === p.id;
              })
              .map(function (e) {
                return e.id;
              });
            var mensaje =
              "Hola " + (p.nombre || "") + "! Te escribo por la devolución de " + p.producto_nombre +
              ", que vence " + cuando + ". ¿Coordinamos el horario? ¡Gracias!";
            return (
              '<div class="tarjeta-vencimiento' + (cuando === "hoy" ? " vencido" : "") + '">' +
              '<div class="info-vencimiento" style="flex:1;">' +
              "<h4>" + escaparHtml(p.producto_nombre) + " — " + escaparHtml(nombreCliente(p)) + "</h4>" +
              "<p>Vence <strong>" + cuando + "</strong> (" + formatearFecha(p.fecha_hasta) + ")" +
              (p.telefono ? " · Tel: " + escaparHtml(p.telefono) : "") +
              (p.direccion ? "<br>📍 " + escaparHtml(p.direccion) : "") +
              (codigos.length ? "<br>🔖 Equipo: <strong>" + escaparHtml(codigos.join(", ")) + "</strong>" : "") +
              "</p></div>" +
              '<div class="acciones-vencimiento">' +
              (p.telefono
                ? '<a class="btn-accion-admin recordatorio" target="_blank" rel="noopener" href="' +
                  escaparHtml(linkWhatsApp(p.telefono, mensaje)) + '">💬 WhatsApp</a>'
                : "") +
              "</div></div>"
            );
          })
          .join("");
    }

    function renderizarEquiposPorProducto() {
      if (!equiposResumen) return;
      if (equiposCache.length === 0) {
        equiposResumen.innerHTML = "";
        return;
      }
      var porVariante = {};
      equiposCache.forEach(function (e) {
        var g = porVariante[e.variante_id] || (porVariante[e.variante_id] = { libres: 0, alquilados: 0, reparacion: 0 });
        if (e.en_reparacion) g.reparacion++;
        else if (pedidoActivoDeEquipo(e)) g.alquilados++;
        else g.libres++;
      });
      equiposResumen.innerHTML =
        '<h3 class="titulo-grupo-stock mb-3">Equipos con QR por producto</h3>' +
        '<div class="grilla-stock">' +
        Object.keys(porVariante)
          .sort()
          .map(function (id) {
            var g = porVariante[id];
            return (
              '<div class="tarjeta-stock' + (g.libres === 0 ? " stock-agotado" : "") + '"><div class="info-stock">' +
              "<h4>" + escaparHtml(nombreVariante(id)) + "</h4>" +
              '<p class="disponibles-stock">' + g.libres + " libre" + (g.libres === 1 ? "" : "s") + "</p>" +
              "<p>" + g.alquilados + " alquilado" + (g.alquilados === 1 ? "" : "s") +
              (g.reparacion ? " · 🔧 " + g.reparacion + " en reparación" : "") + "</p>" +
              "</div></div>"
            );
          })
          .join("") +
        "</div>";
    }

    function actualizarContadorSinResponder() {
      var n = pedidosCache.filter(esSinResponder).length;
      var badge = document.getElementById("contadorSinResponder");
      if (badge) {
        badge.textContent = n;
        badge.classList.toggle("badge-tab-vacio", n === 0);
      }
      return n;
    }

    function renderizarResumen() {
      var sinResponder = actualizarContadorSinResponder();
      var hoy = new Date();
      var inicioMes = hoy.getFullYear() + "-" + String(hoy.getMonth() + 1).padStart(2, "0") + "-01";
      var hace30Dias = new Date(hoy.getTime() - 30 * 86400000).toISOString();

      var pedidosDelMes = pedidosCache.filter(function (p) {
        return p.creado_en >= inicioMes && p.estado !== "cancelado";
      });
      var ventasDelMesMonto = pedidosDelMes.reduce(function (acc, p) {
        return acc + (p.total || 0);
      }, 0);
      var ventasMes = pedidosDelMes.filter(function (p) {
        return p.tipo === "venta";
      }).length;
      var alquileresMes = pedidosDelMes.filter(function (p) {
        return p.tipo === "alquiler";
      }).length;
      var activosAhora = pedidosCache.filter(function (p) {
        return p.estado === "activo";
      }).length;
      var pendientesRevision = pedidosCache.filter(function (p) {
        return p.pago_pendiente_revision;
      }).length;
      var vencidosSinDevolver = pedidosCache.filter(function (p) {
        return (
          p.tipo === "alquiler" &&
          (p.estado === "confirmado" || p.estado === "activo") &&
          p.fecha_hasta &&
          diasHasta(p.fecha_hasta) < 0
        );
      }).length;
      var paraFacturar = pedidosCache.filter(function (p) {
        return p.pendiente_facturacion && !p.facturado_en;
      });
      var montoParaFacturar = paraFacturar.reduce(function (acc, p) {
        return acc + (p.total || 0);
      }, 0);
      var esperandoEntrega = pedidosCache.filter(function (p) {
        return p.tipo === "alquiler" && p.estado === "confirmado";
      }).length;
      var enReparacionTotal = equiposCache.filter(function (e) {
        return e.en_reparacion;
      }).length;

      var trabajosAbiertos = plantillasCache.filter(function (t) {
        return t.estado === "en_fabricacion" || t.estado === "lista";
      });
      var trabajosEnFab = trabajosAbiertos.filter(function (t) { return t.estado === "en_fabricacion"; }).length;
      var trabajosListos = trabajosAbiertos.length - trabajosEnFab;
      var trabajosAtrasados = trabajosAbiertos.filter(function (t) {
        return t.estado === "en_fabricacion" && t.entrega_hasta && hoyLocalISO() > t.entrega_hasta;
      }).length;

      var tarjetas = [
        { titulo: "Sin responder +24 hs", valor: sinResponder, nota: sinResponder > 0 ? "pendientes que esperan tu respuesta" : "todo al día 🎉", tab: "pedidos", estado: "pendiente", alerta: sinResponder > 0 },
        { titulo: "Plantillas en curso", valor: trabajosAbiertos.length, nota: trabajosEnFab + " en fabricación · " + trabajosListos + " listas" + (trabajosAtrasados ? " · " + trabajosAtrasados + " atrasadas" : ""), tab: "plantillas", alerta: trabajosAtrasados > 0 },
        { titulo: "Pedidos este mes", valor: pedidosDelMes.length, nota: ventasMes + " ventas · " + alquileresMes + " alquileres", tab: "pedidos" },
        { titulo: "Ventas del mes", valor: formatearPrecio(ventasDelMesMonto), nota: "sin contar los cancelados", tab: "pedidos" },
        { titulo: "Para facturar", valor: paraFacturar.length, nota: formatearPrecio(montoParaFacturar) + " sin facturar", tab: "facturar", alerta: paraFacturar.length > 0 },
        { titulo: "Esperando entrega", valor: esperandoEntrega, nota: "confirmados, aún sin entregar", tab: "pedidos", estado: "confirmado" },
        { titulo: "Alquileres activos", valor: activosAhora, nota: "en la calle ahora mismo", tab: "activos" },
        { titulo: "Vencidos sin devolver", valor: vencidosSinDevolver, nota: "necesitan seguimiento", tab: "vencidos", alerta: vencidosSinDevolver > 0 },
        { titulo: "Comprobantes pendientes", valor: pendientesRevision, nota: "esperando tu revisión", tab: "comprobantes", alerta: pendientesRevision > 0 },
        { titulo: "Equipos en reparación", valor: enReparacionTotal, nota: "no se pueden alquilar", tab: "equipos", alerta: enReparacionTotal > 0 },
      ];

      grillaDashboard.innerHTML = tarjetas
        .map(function (t) {
          return (
            '<div class="tarjeta-dashboard' + (t.alerta ? " alerta" : "") + '" data-tab="' + t.tab + '"' +
            (t.estado ? ' data-estado="' + t.estado + '"' : "") + ' title="Tocá para ir">' +
            '<p class="titulo-tarjeta-dashboard">' + t.titulo + "</p>" +
            '<p class="valor-tarjeta-dashboard">' + t.valor + "</p>" +
            '<p class="nota-tarjeta-dashboard">' + t.nota + "</p>" +
            "</div>"
          );
        })
        .join("");

      renderizarDevolucionesProximas();
      renderizarEquiposPorProducto();

      // Producto más pedido en los últimos 30 días
      var pedidosRecientes = pedidosCache.filter(function (p) {
        return p.creado_en >= hace30Dias;
      });
      var conteo = {};
      pedidosRecientes.forEach(function (p) {
        conteo[p.producto_nombre] = (conteo[p.producto_nombre] || 0) + (p.cantidad || 1);
      });
      var ranking = Object.keys(conteo)
        .map(function (nombre) {
          return { nombre: nombre, cantidad: conteo[nombre] };
        })
        .sort(function (a, b) {
          return b.cantidad - a.cantidad;
        })
        .slice(0, 5);

      if (ranking.length === 0) {
        rankingProductos.innerHTML = '<p class="texto-vacio-admin">Todavía no hay pedidos en los últimos 30 días.</p>';
      } else {
        var maximo = ranking[0].cantidad;
        rankingProductos.innerHTML = ranking
          .map(function (r) {
            var porcentaje = Math.round((r.cantidad / maximo) * 100);
            return (
              '<div class="fila-ranking">' +
              '<div class="fila-ranking-encabezado">' +
              '<span>' + r.nombre + "</span>" +
              '<span>' + r.cantidad + "</span>" +
              "</div>" +
              '<div class="barra-ranking-fondo"><div class="barra-ranking" style="width:' + porcentaje + '%"></div></div>' +
              "</div>"
            );
          })
          .join("");
      }
    }

    /* ---------------------- Tabla de pedidos ---------------------- */

    function renderizarTabla() {
      actualizarContadorSinResponder();
      var estadoFiltro = selectFiltroEstado.value;
      var tipoFiltro = selectFiltroTipo.value;
      var busqueda = (buscadorPedidos.value || "").trim().toLowerCase();

      var filas = pedidosCache.filter(function (p) {
        if (estadoFiltro !== "todos" && p.estado !== estadoFiltro) return false;
        if (tipoFiltro !== "todos" && p.tipo !== tipoFiltro) return false;
        // Los alquileres activos viven en la pestaña "Activos": acá solo se ven
        // si elegís Estado: Activo o si estás buscando a un cliente.
        if (estadoFiltro === "todos" && !busqueda && p.tipo === "alquiler" && p.estado === "activo") return false;
        if (busqueda) {
          var texto = [p.nombre, p.apellido, p.dni, p.telefono, p.direccion].filter(Boolean).join(" ").toLowerCase();
          if (texto.indexOf(busqueda) === -1) return false;
        }
        return true;
      });

      if (filas.length === 0) {
        tablaCuerpo.innerHTML =
          '<tr><td colspan="11" class="text-center py-4">No hay pedidos con este filtro.</td></tr>';
        return;
      }

      tablaCuerpo.innerHTML = filas
        .map(function (p) {
          var sinResponder = esSinResponder(p);
          var fecha = fechaHoraPedido(p.creado_en) +
            (sinResponder ? '<br><span class="etiqueta-sin-responder">⏰ Sin responder ' + textoHaceCuanto(p.creado_en) + "</span>" : "");
          var periodo =
            p.tipo === "alquiler"
              ? formatearFecha(p.fecha_desde) + " → " + formatearFecha(p.fecha_hasta)
              : "-";
          if (p.tipo === "alquiler" && !p.fecha_desde) {
            periodo = (p.estado === "devuelto" || p.estado === "cancelado")
              ? "Sin fecha"
              : '<small class="text-muted">Se completa al activar el alquiler</small>';
          }
          if (p.tipo === "alquiler" && p.estado !== "devuelto" && p.estado !== "cancelado") {
            var durActual = p.duracion_dias || 30;
            var opcionesDur = [15, 30];
            if (opcionesDur.indexOf(durActual) === -1) opcionesDur.push(durActual);
            periodo +=
              '<br><label class="text-muted" style="font-size:12px;">Duración: ' +
              '<select class="form-select form-select-sm selector-duracion" data-id="' + p.id + '" style="display:inline-block;width:auto;">' +
              opcionesDur.map(function (d) {
                return '<option value="' + d + '"' + (d === durActual ? " selected" : "") + ">" + d + " días</option>";
              }).join("") +
              "</select></label>";
          }
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
          acciones.push('<button type="button" class="btn-accion-admin baja btn-borrar-pedido" data-id="' + p.id + '">🗑 Borrar</button>');

          var clienteHtml = p.dni
            ? '<a href="#" class="link-historial-cliente" data-dni="' + p.dni + '">' + cliente + " (DNI " + p.dni + ")</a>"
            : cliente;

          var facturacionHtml;
          if (p.facturado_en) {
            facturacionHtml = "✓ Facturado el " + new Date(p.facturado_en).toLocaleDateString("es-AR");
          } else if (p.pendiente_facturacion) {
            facturacionHtml =
              '<span class="text-secondary" style="font-size:12px;">⏳ Para facturar</span><br>' +
              '<button type="button" class="btn-accion-admin baja btn-quitar-facturar" data-id="' + p.id + '" style="margin-top:4px;">Quitar</button>';
          } else {
            facturacionHtml =
              '<button type="button" class="btn-accion-admin activar btn-marcar-facturar" data-id="' + p.id + '">🧾 Marcar</button>';
          }

          return (
            "<tr" + (sinResponder ? ' class="fila-sin-responder"' : "") + ">" +
            '<td data-label="Fecha">' + fecha + "</td>" +
            '<td data-label="Tipo"><span class="badge-tipo ' + badgeTipo + '">' + p.tipo + "</span></td>" +
            '<td data-label="Producto">' + p.producto_nombre + " x" + p.cantidad + "</td>" +
            '<td data-label="Período">' + periodo + "</td>" +
            '<td data-label="Cliente">' + clienteHtml + "</td>" +
            '<td data-label="Teléfono">' + (p.telefono || "-") + "</td>" +
            '<td data-label="Dirección / Lesión">' + (p.direccion || "-") + (p.lesion ? "<br><small class='text-muted'>" + p.lesion + "</small>" : "") + "</td>" +
            '<td data-label="Total">' + formatearPrecio(p.total) + "</td>" +
            '<td data-label="Estado"><select class="form-select form-select-sm selector-estado" data-id="' + p.id + '">' +
            ["pendiente", "confirmado", "activo", "devuelto", "cancelado"]
              .map(function (e) {
                return '<option value="' + e + '"' + (e === p.estado ? " selected" : "") + ">" + e + "</option>";
              })
              .join("") +
            "</select></td>" +
            '<td data-label="Facturación">' + facturacionHtml + "</td>" +
            '<td data-label="Acciones"><div class="acciones-fila-admin">' + acciones.join("") + "</div></td>" +
            "</tr>"
          );
        })
        .join("");
    }

    function exportarCsv() {
      var estadoFiltro = selectFiltroEstado.value;
      var tipoFiltro = selectFiltroTipo.value;
      var busqueda = (buscadorPedidos.value || "").trim().toLowerCase();

      var filas = pedidosCache.filter(function (p) {
        if (estadoFiltro !== "todos" && p.estado !== estadoFiltro) return false;
        if (tipoFiltro !== "todos" && p.tipo !== tipoFiltro) return false;
        // Los alquileres activos viven en la pestaña "Activos": acá solo se ven
        // si elegís Estado: Activo o si estás buscando a un cliente.
        if (estadoFiltro === "todos" && !busqueda && p.tipo === "alquiler" && p.estado === "activo") return false;
        if (busqueda) {
          var texto = [p.nombre, p.apellido, p.dni, p.telefono, p.direccion].filter(Boolean).join(" ").toLowerCase();
          if (texto.indexOf(busqueda) === -1) return false;
        }
        return true;
      });

      var encabezados = [
        "Fecha", "Tipo", "Producto", "Cantidad", "Fecha desde", "Fecha hasta",
        "Nombre", "Apellido", "Telefono", "DNI", "Direccion", "Lesion", "Total", "Estado",
      ];

      function escaparCsv(valor) {
        var texto = valor === null || valor === undefined ? "" : String(valor);
        if (texto.indexOf(",") !== -1 || texto.indexOf('"') !== -1 || texto.indexOf("\n") !== -1) {
          texto = '"' + texto.replace(/"/g, '""') + '"';
        }
        return texto;
      }

      var lineas = [encabezados.join(",")];
      filas.forEach(function (p) {
        lineas.push(
          [
            fechaHoraPedido(p.creado_en),
            p.tipo,
            p.producto_nombre,
            p.cantidad,
            formatearFecha(p.fecha_desde),
            formatearFecha(p.fecha_hasta),
            p.nombre,
            p.apellido,
            p.telefono,
            p.dni,
            p.direccion,
            p.lesion,
            p.total,
            p.estado,
          ]
            .map(escaparCsv)
            .join(",")
        );
      });

      var contenido = "\uFEFF" + lineas.join("\n");
      var blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = "pedidos-gauss-" + hoyISO() + ".csv";
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      URL.revokeObjectURL(url);
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

      var textoAuto = p.recordatorio_vencimiento_enviado_en
        ? "<br>🤖 Recordatorio automático enviado el " +
          new Date(p.recordatorio_vencimiento_enviado_en).toLocaleString("es-AR")
        : "";

      var renovarEnLocalHtml = "";
      if (p.estado === "activo" || p.estado === "confirmado") {
        renovarEnLocalHtml =
          '<div class="d-flex flex-wrap gap-2 align-items-end mt-2">' +
          '<div>' +
          '<label class="etiqueta-campo-alquiler" style="margin-bottom:2px;">Duración</label><br>' +
          '<select class="form-select form-select-sm campo-alquiler selector-duracion-renovacion" data-id="' + p.id + '" style="width:130px;">' +
          '<option value="15"' + (p.duracion_dias === 15 ? " selected" : "") + ">15 días</option>" +
          '<option value="30"' + (p.duracion_dias !== 15 ? " selected" : "") + ">30 días</option>" +
          "</select>" +
          "</div>" +
          '<div>' +
          '<label class="etiqueta-campo-alquiler" style="margin-bottom:2px;">Monto</label><br>' +
          '<input type="number" class="form-control form-control-sm campo-alquiler input-monto-renovacion" data-id="' + p.id + '" value="' + p.total + '" style="width:130px;">' +
          "</div>" +
          '<button type="button" class="btn-accion-admin confirmar btn-renovar-en-local" data-id="' + p.id + '">🏪 Renovar en local</button>' +
          "</div>";
      }

      var codigosEquipo = equiposCache
        .filter(function (e) {
          return e.pedido_id === p.id;
        })
        .map(function (e) {
          return e.id;
        });
      var textoEquipo = codigosEquipo.length
        ? "<br>🔖 Equipo: <strong>" + escaparHtml(codigosEquipo.join(", ")) + "</strong>"
        : "";

      return (
        '<div class="tarjeta-vencimiento' + (dias <= 0 ? " vencido" : "") + '">' +
        '<div class="info-vencimiento" style="flex:1;">' +
        "<h4>" + p.producto_nombre + " — " + [p.nombre, p.apellido].filter(Boolean).join(" ") + " " + badgeEstado + "</h4>" +
        "<p>" + textoDiasRestantes(p.fecha_hasta) + " (" + formatearFecha(p.fecha_hasta) + ") · Tel: " + (p.telefono || "sin cargar") + textoEquipo + textoAuto + "</p>" +
        renovarEnLocalHtml +
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
      var busqueda = (buscadorActivos && buscadorActivos.value || "").trim().toLowerCase();

      var activos = pedidosCache.filter(function (p) {
        if (p.tipo !== "alquiler" || p.estado !== "activo") return false;
        if (busqueda) {
          var texto = [p.nombre, p.apellido, p.dni, p.telefono, p.direccion].filter(Boolean).join(" ").toLowerCase();
          if (texto.indexOf(busqueda) === -1) return false;
        }
        return true;
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
      var busqueda = (buscadorVencidos && buscadorVencidos.value || "").trim().toLowerCase();

      var vencidos = pedidosCache.filter(function (p) {
        if (
          p.tipo !== "alquiler" ||
          (p.estado !== "confirmado" && p.estado !== "activo") ||
          p.pago_pendiente_revision ||
          !p.fecha_hasta ||
          diasHasta(p.fecha_hasta) >= 0
        ) {
          return false;
        }
        if (busqueda) {
          var texto = [p.nombre, p.apellido, p.dni, p.telefono, p.direccion].filter(Boolean).join(" ").toLowerCase();
          if (texto.indexOf(busqueda) === -1) return false;
        }
        return true;
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
          var duracionPorDefecto = p.renovacion_duracion_dias || p.duracion_dias;
          var montoPorDefecto = p.renovacion_monto || p.total;
          return (
            '<div class="tarjeta-comprobante">' +
            (p.comprobante_url
              ? '<a href="' + p.comprobante_url + '" target="_blank"><img class="imagen-comprobante" src="' + p.comprobante_url + '" alt="Comprobante"></a>'
              : "") +
            '<div class="info-comprobante" style="flex:1;">' +
            "<h4>" + p.producto_nombre + " — " + [p.nombre, p.apellido].filter(Boolean).join(" ") + "</h4>" +
            "<p>Vencía: " + formatearFecha(p.fecha_hasta) + " · Tel: " + (p.telefono || "sin cargar") +
            (p.renovacion_duracion_dias ? " · <strong>El cliente eligió " + p.renovacion_duracion_dias + " días</strong>" : "") +
            "</p>" +
            '<div class="d-flex flex-wrap gap-2 mt-2">' +
            '<div>' +
            '<label class="etiqueta-campo-alquiler" style="margin-bottom:2px;">Duración a renovar</label><br>' +
            '<select class="form-select form-select-sm campo-alquiler selector-duracion-renovacion" data-id="' + p.id + '" style="width:140px;">' +
            '<option value="15"' + (duracionPorDefecto === 15 ? " selected" : "") + ">15 días</option>" +
            '<option value="30"' + (duracionPorDefecto !== 15 ? " selected" : "") + ">30 días</option>" +
            "</select>" +
            "</div>" +
            '<div>' +
            '<label class="etiqueta-campo-alquiler" style="margin-bottom:2px;">Monto a facturar</label><br>' +
            '<input type="number" class="form-control form-control-sm campo-alquiler input-monto-renovacion" data-id="' + p.id + '" value="' + montoPorDefecto + '" style="width:140px;">' +
            "</div>" +
            "</div>" +
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

    /* ---------------------- Para facturar ---------------------- */

    function renderizarParaFacturar() {
      var pendientes = pedidosCache.filter(function (p) {
        return p.pendiente_facturacion;
      });

      contadorFacturar.textContent = pendientes.length;
      contadorFacturar.classList.toggle("badge-tab-vacio", pendientes.length === 0);

      if (pendientes.length === 0) {
        listaParaFacturar.innerHTML = '<p class="texto-vacio-admin">No hay pedidos marcados para facturar todavía.</p>';
      } else {
        listaParaFacturar.innerHTML = pendientes
          .map(function (p) {
            var cliente = [p.nombre, p.apellido].filter(Boolean).join(" ") || "-";
            return (
              '<div class="tarjeta-vencimiento">' +
              '<div class="info-vencimiento">' +
              "<h4>" + p.producto_nombre + " — " + cliente + "</h4>" +
              "<p>" + formatearPrecio(p.total) + " · DNI " + (p.dni || "-") + " · " + new Date(p.creado_en).toLocaleDateString("es-AR") + "</p>" +
              "</div>" +
              '<div class="acciones-vencimiento">' +
              '<button type="button" class="btn-accion-admin baja btn-quitar-facturar" data-id="' + p.id + '">Quitar</button>' +
              "</div>" +
              "</div>"
            );
          })
          .join("");
      }

      var facturados = pedidosCache
        .filter(function (p) {
          return p.facturado_en;
        })
        .sort(function (a, b) {
          return new Date(b.facturado_en) - new Date(a.facturado_en);
        })
        .slice(0, 20);

      if (facturados.length === 0) {
        listaUltimosFacturados.innerHTML = '<p class="texto-vacio-admin">Todavía no facturaste nada desde acá.</p>';
      } else {
        listaUltimosFacturados.innerHTML = facturados
          .map(function (p) {
            var cliente = [p.nombre, p.apellido].filter(Boolean).join(" ") || "-";
            return (
              '<div class="tarjeta-vencimiento">' +
              '<div class="info-vencimiento">' +
              "<h4>" + p.producto_nombre + " — " + cliente + "</h4>" +
              "<p>" + formatearPrecio(p.total) + " · Facturado el " + new Date(p.facturado_en).toLocaleString("es-AR") + "</p>" +
              "</div>" +
              "</div>"
            );
          })
          .join("");
      }
    }

    async function marcarParaFacturar(id) {
      var resultado = await actualizarPedido(id, { pendiente_facturacion: true });
      if (!resultado.ok) {
        alert("No se pudo marcar: " + resultado.motivo);
        return;
      }
      var pedido = pedidosCache.find(function (p) {
        return p.id === id;
      });
      if (pedido) pedido.pendiente_facturacion = true;
      renderizarTabla();
      renderizarParaFacturar();
    }

    async function quitarParaFacturar(id) {
      var resultado = await actualizarPedido(id, { pendiente_facturacion: false });
      if (!resultado.ok) {
        alert("No se pudo quitar: " + resultado.motivo);
        return;
      }
      var pedido = pedidosCache.find(function (p) {
        return p.id === id;
      });
      if (pedido) pedido.pendiente_facturacion = false;
      renderizarTabla();
      renderizarParaFacturar();
    }

    function exportarFacturitas() {
      var pendientes = pedidosCache.filter(function (p) {
        return p.pendiente_facturacion;
      });

      if (pendientes.length === 0) {
        alert('No hay pedidos marcados. Marcá alguno con el botón "🧾 Marcar" en la pestaña Pedidos primero.');
        return;
      }

      // ------------------------------------------------------------
      // TODO: estas columnas son un formato razonable por defecto,
      // pero hay que ajustarlas a la plantilla EXACTA que pide
      // Facturitas (web.facturitas.app → Facturación Masiva →
      // descargar plantilla). Pasame esas columnas y las dejo iguales.
      // ------------------------------------------------------------
      var encabezados = [
        "Fecha", "Cliente", "DNI/CUIT", "Domicilio", "Concepto", "Cantidad", "Precio unitario", "Total",
      ];

      function escaparCsv(valor) {
        var texto = valor === null || valor === undefined ? "" : String(valor);
        if (texto.indexOf(",") !== -1 || texto.indexOf('"') !== -1 || texto.indexOf("\n") !== -1) {
          texto = '"' + texto.replace(/"/g, '""') + '"';
        }
        return texto;
      }

      var lineas = [encabezados.join(",")];
      pendientes.forEach(function (p) {
        lineas.push(
          [
            new Date(p.creado_en).toLocaleDateString("es-AR"),
            [p.nombre, p.apellido].filter(Boolean).join(" "),
            p.dni,
            p.direccion,
            p.producto_nombre + (p.tipo === "alquiler" ? " (alquiler)" : ""),
            p.cantidad,
            p.precio_unitario,
            p.total,
          ]
            .map(escaparCsv)
            .join(",")
        );
      });

      var contenido = "\uFEFF" + lineas.join("\n");
      var blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = "para-facturitas-" + hoyISO() + ".csv";
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      URL.revokeObjectURL(url);
    }

    async function enviarAGoogleSheets() {
      var pendientes = pedidosCache.filter(function (p) {
        return p.pendiente_facturacion;
      });

      if (pendientes.length === 0) {
        alert('No hay pedidos marcados. Marcá alguno con el botón "🧾 Marcar" en la pestaña Pedidos primero.');
        return;
      }

      if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_ANON_KEY === "undefined") {
        alert("Falta configurar Supabase (supabase-config.js).");
        return;
      }

      var textoOriginal = btnEnviarSheets.textContent;
      btnEnviarSheets.textContent = "Enviando...";
      btnEnviarSheets.classList.add("deshabilitado");

      try {
        var respuesta = await fetch(SUPABASE_URL + "/functions/v1/exportar-sheets", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + SUPABASE_ANON_KEY,
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            ids: pendientes.map(function (p) {
              return p.id;
            }),
          }),
        });

        var resultado = await respuesta.json();

        if (!respuesta.ok || !resultado.ok) {
          throw new Error(resultado.error || "Error desconocido (" + respuesta.status + ")");
        }

        // Si llegó bien a la planilla, ya los marcamos como facturados.
        var ahora = new Date().toISOString();
        for (var i = 0; i < pendientes.length; i++) {
          await actualizarPedido(pendientes[i].id, { pendiente_facturacion: false, facturado_en: ahora });
        }

        alert("Listo, se agregaron " + resultado.filas + " filas a la planilla.");
        cargarPedidos();
      } catch (e) {
        alert("No se pudo enviar a Google Sheets: " + e.message);
      }

      btnEnviarSheets.textContent = textoOriginal;
      btnEnviarSheets.classList.remove("deshabilitado");
    }

    async function confirmarFacturados() {
      var pendientes = pedidosCache.filter(function (p) {
        return p.pendiente_facturacion;
      });

      if (pendientes.length === 0) {
        alert("No hay nada pendiente de confirmar.");
        return;
      }

      if (!confirm("¿Ya subiste el Excel a Facturitas y se generaron las facturas de estos " + pendientes.length + " pedidos?")) {
        return;
      }

      var ahora = new Date().toISOString();
      for (var i = 0; i < pendientes.length; i++) {
        var resultado = await actualizarPedido(pendientes[i].id, {
          pendiente_facturacion: false,
          facturado_en: ahora,
        });
        if (!resultado.ok) {
          alert("Hubo un problema confirmando el pedido " + pendientes[i].id + ": " + resultado.motivo);
        }
      }

      cargarPedidos();
    }

    /* ---------------------- Acciones ---------------------- */

    // Update centralizado: si por sesión vencida u otro motivo Supabase
    // no llega a tocar ninguna fila, acá lo detectamos y avisamos, en vez
    // de dejar que la interfaz muestre "listo" sin haber guardado nada.
    async function actualizarPedido(id, cambios) {
      var resultado = await db.from("pedidos").update(cambios).eq("id", id).select();
      if (resultado.error) return { ok: false, motivo: resultado.error.message };
      if (!resultado.data || resultado.data.length === 0) {
        return {
          ok: false,
          motivo: "No se guardó ningún cambio (¿la sesión venció? probá cerrar sesión y volver a entrar).",
        };
      }
      return { ok: true };
    }

    async function avisarRetiro(id) {
      var pedido = pedidosCache.find(function (p) {
        return p.id === id;
      });
      if (!pedido) return;

      var mensaje =
        "Hola " + (pedido.nombre || "") + "! Tu " + pedido.producto_nombre +
        " ya está listo para retirar en Gauss Ortopedia (27 de febrero 1724, Rosario). " +
        "Horarios: Lunes a Viernes de 9:30 a 13 hs. y de 15 a 18 hs, Sábados 9:30 a 13 hs. " +
        "Tu alquiler es por " + (pedido.duracion_dias || "-") + " días" + (pedido.fecha_hasta ? ", hasta el " + formatearFecha(pedido.fecha_hasta) : "") + ". ¡Te esperamos!";

      window.open(linkWhatsApp(pedido.telefono, mensaje), "_blank");
      var resultado = await actualizarPedido(id, { aviso_retiro_enviado: true });
      if (!resultado.ok) {
        alert("Ojo: " + resultado.motivo);
        return;
      }
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

    // Lógica compartida: crea el pedido de la renovación y cierra el
    // anterior. La usan tanto "Confirmar y renovar" (con comprobante
    // revisado) como "Renovar en local" (pago en persona, sin comprobante).
    async function ejecutarRenovacion(pedido, duracionElegida, montoElegido) {
      if (!duracionElegida || isNaN(montoElegido)) {
        alert("Revisá la duración y el monto antes de confirmar.");
        return false;
      }

      // Arranca el día siguiente al vencimiento anterior y suma la
      // duración elegida (puede ser distinta a la del período anterior).
      var diaSiguiente = new Date(pedido.fecha_hasta + "T00:00:00");
      diaSiguiente.setDate(diaSiguiente.getDate() + 1);
      var nuevaFechaHasta = calcularFechaHasta(diaSiguiente.toISOString().slice(0, 10), duracionElegida);

      // La renovación es un pedido (y un cobro) nuevo, con su propia
      // fila: la marcamos directo como "pendiente_facturacion" para que
      // aparezca ya lista en la pestaña "Para facturar", sin un paso
      // manual extra. El historial de facturación del período anterior
      // no se pisa: el pedido viejo se cierra como "devuelto" (ese
      // período ya terminó), pero el equipo en sí sigue figurando activo
      // bajo el pedido nuevo, sin afectar el conteo de "Activos".
      var resultadoNuevo = await db
        .from("pedidos")
        .insert({
          tipo: "alquiler",
          producto_id: pedido.producto_id,
          producto_nombre: pedido.producto_nombre,
          cantidad: pedido.cantidad,
          precio_unitario: montoElegido,
          total: montoElegido,
          fecha_desde: diaSiguiente.toISOString().slice(0, 10),
          fecha_hasta: nuevaFechaHasta,
          duracion_dias: duracionElegida,
          nombre: pedido.nombre,
          apellido: pedido.apellido,
          telefono: pedido.telefono,
          dni: pedido.dni,
          direccion: pedido.direccion,
          lesion: pedido.lesion,
          estado: "activo",
          aviso_retiro_enviado: true,
          veces_renovado: (pedido.veces_renovado || 0) + 1,
          pendiente_facturacion: true,
        })
        .select();

      if (resultadoNuevo.error) {
        alert("No se pudo crear el pedido de la renovación: " + resultadoNuevo.error.message);
        return false;
      }

      var resultado = await actualizarPedido(pedido.id, {
        estado: "devuelto",
        pago_pendiente_revision: false,
      });

      if (!resultado.ok) {
        alert("El pedido nuevo se creó, pero no se pudo cerrar el anterior: " + resultado.motivo);
      }

      // Los equipos con QR que tenía el pedido viejo pasan al pedido nuevo
      // (siguen en la calle con el mismo cliente).
      if (resultadoNuevo.data && resultadoNuevo.data[0]) {
        try {
          await db.from("equipos").update({ pedido_id: resultadoNuevo.data[0].id }).eq("pedido_id", pedido.id);
        } catch (e) {
          /* si la tabla equipos todavía no existe, no pasa nada */
        }
      }

      return true;
    }

    async function confirmarRenovacion(id) {
      var pedido = pedidosCache.find(function (p) {
        return p.id === id;
      });
      if (!pedido) return;

      var selectDuracion = document.querySelector('.selector-duracion-renovacion[data-id="' + id + '"]');
      var inputMonto = document.querySelector('.input-monto-renovacion[data-id="' + id + '"]');
      var duracionElegida = selectDuracion ? parseInt(selectDuracion.value, 10) : pedido.duracion_dias;
      var montoElegido = inputMonto ? parseFloat(inputMonto.value) : pedido.total;

      var ok = await ejecutarRenovacion(pedido, duracionElegida, montoElegido);
      if (ok) cargarPedidos();
    }

    async function renovarEnLocal(id) {
      var pedido = pedidosCache.find(function (p) {
        return p.id === id;
      });
      if (!pedido) return;

      var selectDuracion = document.querySelector(
        '.selector-duracion-renovacion[data-id="' + id + '"]'
      );
      var inputMonto = document.querySelector('.input-monto-renovacion[data-id="' + id + '"]');
      var duracionElegida = selectDuracion ? parseInt(selectDuracion.value, 10) : pedido.duracion_dias;
      var montoElegido = inputMonto ? parseFloat(inputMonto.value) : pedido.total;

      if (
        !confirm(
          "¿Confirmás la renovación de " +
            duracionElegida +
            " días por " +
            formatearPrecio(montoElegido) +
            " para " +
            [pedido.nombre, pedido.apellido].filter(Boolean).join(" ") +
            "?"
        )
      ) {
        return;
      }

      var ok = await ejecutarRenovacion(pedido, duracionElegida, montoElegido);
      if (ok) cargarPedidos();
    }

    async function rechazarComprobante(id) {
      var resultado = await actualizarPedido(id, { pago_pendiente_revision: false });
      if (!resultado.ok) {
        alert("No se pudo rechazar: " + resultado.motivo);
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
      var pedidoPrevio = pedidosCache.find(function (p) {
        return p.id === id;
      });
      var cambiosActivar = Object.assign({ estado: "activo" }, fechasSiFaltan(pedidoPrevio));
      var resultado = await actualizarPedido(id, cambiosActivar);
      if (!resultado.ok) {
        alert("No se pudo activar el alquiler: " + resultado.motivo);
        return;
      }
      var pedido = pedidoPrevio;
      if (pedido) Object.assign(pedido, cambiosActivar);
      renderizarTabla();
      refrescarListasAlquiler();
    }

    async function darDeBaja(id) {
      var resultado = await actualizarPedido(id, { estado: "devuelto" });
      if (!resultado.ok) {
        alert("No se pudo dar de baja el alquiler: " + resultado.motivo);
        return;
      }
      await liberarEquiposDePedido(id);
      var pedido = pedidosCache.find(function (p) {
        return p.id === id;
      });
      if (pedido) pedido.estado = "devuelto";
      renderizarTabla();
      refrescarListasAlquiler();
    }


    /* ---------------------- Equipos con QR ---------------------- */

    var escanerQr = null;

    function nombreVariante(varianteId) {
      var v = variantesCache.find(function (x) {
        return x.id === varianteId;
      });
      return v ? v.producto_nombre + " – " + v.variante : varianteId;
    }

    function pedidoActivoDeEquipo(e) {
      if (!e.pedido_id) return null;
      var p = pedidosCache.find(function (x) {
        return x.id === e.pedido_id;
      });
      return p && (p.estado === "activo" || p.estado === "confirmado") ? p : null;
    }

    function nombreCliente(p) {
      return [p.nombre, p.apellido].filter(Boolean).join(" ") || "(sin nombre)";
    }

    function escaparHtml(texto) {
      return String(texto == null ? "" : texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    async function cargarEquipos() {
      var resultado = await leerTodas("equipos", [{ col: "id", asc: true }]);
      if (resultado.error) {
        listaEquipos.innerHTML =
          '<p class="texto-vacio-admin">No se pudieron cargar los equipos: ' +
          escaparHtml(resultado.error.message) +
          " (¿ya corriste el SQL nuevo en Supabase?)</p>";
        return;
      }
      equiposCache = resultado.data;
      renderizarEquipos();
      refrescarListasAlquiler();
      renderizarResumen();
    }

    function renderizarEquipos() {
      // Selectores de producto (alta de equipos y filtro de la lista)
      if (selectVarianteEquipo && variantesCache.length) {
        var opciones = variantesCache
          .map(function (v) {
            return '<option value="' + v.id + '">' + escaparHtml(v.producto_nombre + " – " + v.variante) + "</option>";
          })
          .join("");
        var valorSel = selectVarianteEquipo.value;
        var valorFil = filtroEquipos.value;
        selectVarianteEquipo.innerHTML = opciones;
        filtroEquipos.innerHTML = '<option value="todos">Todos</option>' + opciones;
        if (valorSel) selectVarianteEquipo.value = valorSel;
        if (valorFil) filtroEquipos.value = valorFil;
      }

      var filtro = filtroEquipos.value || "todos";
      var lista = equiposCache.filter(function (e) {
        return filtro === "todos" || e.variante_id === filtro;
      });

      var enCalle = equiposCache.filter(function (e) {
        return pedidoActivoDeEquipo(e);
      }).length;
      var enRep = equiposCache.filter(function (e) {
        return e.en_reparacion;
      }).length;
      resumenEquipos.textContent =
        "(" + equiposCache.length + " en total · " + enCalle + " alquilados · " + enRep + " en reparación · " +
        (equiposCache.length - enCalle - enRep) + " libres)";

      if (lista.length === 0) {
        listaEquipos.innerHTML =
          '<p class="texto-vacio-admin">Todavía no hay equipos cargados. Elegí un producto arriba y tocá "Crear equipos".</p>';
        return;
      }

      listaEquipos.innerHTML =
        '<div class="table-responsive"><table class="table table-bordered bg-white tabla-pedidos-admin">' +
        "<thead><tr><th>Código</th><th>Producto</th><th>Estado</th><th>Cliente / devuelve</th><th></th></tr></thead><tbody>" +
        lista
          .map(function (e) {
            var p = pedidoActivoDeEquipo(e);
            var estado = e.en_reparacion
              ? '<span class="estado-equipo-reparacion">🔧 En reparación</span>' +
                (e.reparacion_nota ? "<br><small>" + escaparHtml(e.reparacion_nota) + "</small>" : "")
              : p
              ? '<span class="estado-equipo-alquilado">Alquilado</span>'
              : '<span class="estado-equipo-libre">Libre</span>';
            var cliente = p ? escaparHtml(nombreCliente(p)) + " · hasta " + formatearFecha(p.fecha_hasta) : "-";
            return (
              '<tr><td data-label="Código"><code>' + escaparHtml(e.id) + "</code></td>" +
              '<td data-label="Producto">' + escaparHtml(nombreVariante(e.variante_id)) + "</td>" +
              '<td data-label="Estado">' + estado + "</td>" +
              '<td data-label="Cliente / devuelve">' + cliente + "</td>" +
              '<td data-label="Acciones"><div class="acciones-fila-admin"><button type="button" class="btn-accion-admin retiro btn-etiqueta-equipo" data-equipo="' + escaparHtml(e.id) + '">QR</button> ' +
              '<button type="button" class="btn-accion-admin recordatorio btn-historial-equipo" data-equipo="' + escaparHtml(e.id) + '">Historial</button> ' +
              '<button type="button" class="btn-accion-admin baja btn-eliminar-equipo" data-equipo="' + escaparHtml(e.id) + '">Eliminar</button></div></td></tr>'
            );
          })
          .join("") +
        "</tbody></table></div>";
    }

    async function crearEquipos() {
      var varianteId = selectVarianteEquipo.value;
      var cantidad = parseInt(inputCantidadEquipo.value, 10);
      if (!varianteId) {
        alert("Elegí un producto.");
        return;
      }
      if (isNaN(cantidad) || cantidad < 1 || cantidad > 200) {
        alert("Ingresá una cantidad entre 1 y 200.");
        return;
      }

      var prefijo = varianteId.toUpperCase();
      var maximo = 0;
      equiposCache.forEach(function (e) {
        if (e.variante_id !== varianteId) return;
        var m = e.id.match(/-(\d+)$/);
        if (m) maximo = Math.max(maximo, parseInt(m[1], 10));
      });

      var filas = [];
      for (var i = 1; i <= cantidad; i++) {
        filas.push({ id: prefijo + "-" + String(maximo + i).padStart(3, "0"), variante_id: varianteId });
      }

      var resultado = await db.from("equipos").insert(filas).select();
      if (resultado.error) {
        alert("No se pudieron crear los equipos: " + resultado.error.message);
        return;
      }
      await cargarEquipos();
      if (confirm("Se crearon " + filas.length + " equipos. ¿Querés imprimir sus etiquetas QR ahora?")) {
        imprimirEtiquetas(filas.map(function (f) { return f.id; }));
      }
    }

    async function eliminarEquipo(codigo) {
      if (!confirm("¿Eliminar el equipo " + codigo + "? Su QR dejará de funcionar.")) return;
      var resultado = await db.from("equipos").delete().eq("id", codigo).select();
      if (resultado.error || !resultado.data || resultado.data.length === 0) {
        alert("No se pudo eliminar" + (resultado.error ? ": " + resultado.error.message : "."));
        return;
      }
      await cargarEquipos();
    }

    function urlDeEquipo(codigo) {
      var base = typeof SITE_URL !== "undefined" ? SITE_URL.replace(/\/$/, "") : window.location.origin;
      return base + "/admin.html?equipo=" + encodeURIComponent(codigo);
    }

    async function imprimirEtiquetas(codigos) {
      if (typeof qrcode === "undefined") {
        alert("No se pudo cargar el generador de QR (revisá tu conexión a internet).");
        return;
      }
      if (!codigos) {
        var filtro = filtroEquipos.value || "todos";
        codigos = equiposCache
          .filter(function (e) {
            return filtro === "todos" || e.variante_id === filtro;
          })
          .map(function (e) {
            return e.id;
          });
      }
      if (codigos.length === 0) {
        alert("No hay equipos para imprimir.");
        return;
      }

      var ventana = window.open("", "_blank");
      if (!ventana) {
        alert("El navegador bloqueó la ventana de impresión. Permití ventanas emergentes para este sitio.");
        return;
      }

      var etiquetas = [];
      for (var i = 0; i < codigos.length; i++) {
        var codigo = codigos[i];
        var equipo = equiposCache.find(function (e) {
          return e.id === codigo;
        });
        var qr = qrcode(0, "M");
        qr.addData(urlDeEquipo(codigo));
        qr.make();
        var imagen = qr.createDataURL(6, 2);
        etiquetas.push(
          '<div class="et"><img src="' + imagen + '"><div class="cod">' + escaparHtml(codigo) + "</div>" +
          '<div class="prod">' + escaparHtml(equipo ? nombreVariante(equipo.variante_id) : "") + "</div></div>"
        );
      }

      ventana.document.write(
        "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Etiquetas QR</title><style>" +
        "body{font-family:Arial,sans-serif;margin:12px}" +
        ".grid{display:flex;flex-wrap:wrap;gap:10px}" +
        ".et{width:200px;border:1px dashed #999;padding:8px;text-align:center;page-break-inside:avoid}" +
        ".et img{width:170px;height:170px}.cod{font-weight:bold;font-size:12px;margin-top:4px}.prod{font-size:11px;color:#444}" +
        "</style></head><body><div class='grid'>" + etiquetas.join("") + "</div>" +
        "<script>window.onload=function(){window.print();}<\/script></body></html>"
      );
      ventana.document.close();
    }

    function extraerCodigo(texto) {
      texto = (texto || "").trim();
      var m = texto.match(/[?&]equipo=([^&#\s]+)/i);
      if (m) {
        try {
          return decodeURIComponent(m[1]).toUpperCase();
        } catch (e) {
          return m[1].toUpperCase();
        }
      }
      return texto.toUpperCase();
    }

    function pedidosCandidatos(equipo) {
      return pedidosCache
        .filter(function (p) {
          if (p.tipo !== "alquiler" || !pedidoEsDeVariante(p.producto_id, equipo.variante_id)) return false;
          if (p.estado === "confirmado") return true;
          // Pedido ya activo al que todavía le faltan equipos por entregar (cantidad > 1)
          if (p.estado === "activo") {
            var asignados = equiposCache.filter(function (e) {
              return e.pedido_id === p.id;
            }).length;
            return asignados > 0 && asignados < (p.cantidad || 1);
          }
          return false;
        })
        .sort(function (a, b) {
          return (a.fecha_desde || "").localeCompare(b.fecha_desde || "");
        });
    }

    async function procesarCodigo(textoLeido) {
      var codigo = extraerCodigo(textoLeido);
      if (!codigo) return;
      resultadoEscaneo.innerHTML = '<p class="text-secondary">Buscando ' + escaparHtml(codigo) + "...</p>";

      // Datos frescos (por si otro dispositivo cambió algo hace un rato)
      await cargarPedidos();

      var equipo = equiposCache.find(function (e) {
        return e.id === codigo;
      });

      if (!equipo) {
        resultadoEscaneo.innerHTML =
          '<div class="tarjeta-resultado-escaneo error"><strong>No existe ningún equipo con el código</strong> <code>' +
          escaparHtml(codigo) + "</code>.</div>";
        return;
      }

      var pedido = pedidoActivoDeEquipo(equipo);
      var historialHtml = await historialResumidoHtml(equipo.id);
      var cabecera = "<div><code>" + escaparHtml(equipo.id) + "</code> · " + escaparHtml(nombreVariante(equipo.variante_id)) + "</div>";
      var idAttr = escaparHtml(equipo.id);

      if (equipo.en_reparacion) {
        resultadoEscaneo.innerHTML =
          '<div class="tarjeta-resultado-escaneo error">' + cabecera +
          '<div class="estado-equipo-reparacion my-1">🔧 Está EN REPARACIÓN' +
          (equipo.reparacion_desde ? " desde el " + new Date(equipo.reparacion_desde).toLocaleDateString("es-AR") : "") + "</div>" +
          (equipo.reparacion_nota ? "<div>Falla: " + escaparHtml(equipo.reparacion_nota) + "</div>" : "") +
          '<button type="button" class="btn-accion-admin activar mt-2 btn-fin-reparacion" data-equipo="' + idAttr + '">✅ Volver a servicio</button>' +
          historialHtml + "</div>";
        return;
      }

      if (pedido) {
        resultadoEscaneo.innerHTML =
          '<div class="tarjeta-resultado-escaneo alquilado">' + cabecera +
          '<div class="estado-equipo-alquilado my-1">Está ALQUILADO</div>' +
          "<div>Cliente: <strong>" + escaparHtml(nombreCliente(pedido)) + "</strong>" +
          (pedido.telefono ? " · " + escaparHtml(pedido.telefono) : "") + "</div>" +
          "<div>Período: " + formatearFecha(pedido.fecha_desde) + " → " + formatearFecha(pedido.fecha_hasta) + "</div>" +
          '<div class="d-flex flex-wrap gap-2 mt-2">' +
          '<button type="button" class="btn-accion-admin baja btn-baja-equipo" data-equipo="' + idAttr + '">↩️ Dar de baja (devuelto)</button>' +
          '<button type="button" class="btn-accion-admin recordatorio btn-baja-reparacion" data-equipo="' + idAttr + '">🔧 Devuelto con falla: baja + reparación</button>' +
          "</div>" + historialHtml + "</div>";
        return;
      }

      var candidatos = pedidosCandidatos(equipo);
      var html =
        '<div class="tarjeta-resultado-escaneo libre">' + cabecera +
        '<div class="estado-equipo-libre my-1">Está LIBRE — ¿a quién se lo entregás?</div>';

      if (candidatos.length === 0) {
        html +=
          '<p class="mb-0 text-secondary">No hay pedidos confirmados esperando este producto. ' +
          'Confirmá el pedido en la pestaña "Pedidos" y volvé a escanear.</p>';
      } else {
        if (candidatos.length > 3) {
          html +=
            '<input type="text" class="form-control form-control-sm campo-alquiler mb-2" id="buscadorCandidatos" ' +
            'placeholder="Buscar cliente por nombre, DNI, teléfono o dirección (' + candidatos.length + ' esperando)...">';
        }
        html += candidatos
          .map(function (p) {
            var textoBusqueda = [p.nombre, p.apellido, p.dni, p.telefono, p.direccion].filter(Boolean).join(" ").toLowerCase();
            return (
              '<div class="fila-candidato" data-texto="' + escaparHtml(textoBusqueda) + '"><div><strong>' + escaparHtml(nombreCliente(p)) + "</strong>" +
              (p.dni ? " · DNI " + escaparHtml(p.dni) : "") +
              (p.telefono ? " · " + escaparHtml(p.telefono) : "") +
              "<br><small>" + escaparHtml(p.producto_nombre || "") +
              (p.duracion_dias ? " · " + p.duracion_dias + " días" : "") +
              (p.fecha_desde ? " · " + formatearFecha(p.fecha_desde) + " → " + formatearFecha(p.fecha_hasta) : "") +
              (p.cantidad > 1 ? " · x" + p.cantidad : "") + "</small></div>" +
              '<button type="button" class="btn-accion-admin activar btn-alta-equipo" data-equipo="' + escaparHtml(equipo.id) +
              '" data-pedido="' + p.id + '">▶️ Entregar a este cliente</button></div>'
            );
          })
          .join("");
      }
      html +=
        '<div class="mt-3"><button type="button" class="btn-accion-admin recordatorio btn-reparacion-equipo" data-equipo="' + idAttr +
        '">🔧 Poner en reparación</button></div>' + historialHtml;
      resultadoEscaneo.innerHTML = html + "</div>";
    }

    async function altaEquipo(codigo, pedidoId) {
      var equipoActual = equiposCache.find(function (e) {
        return e.id === codigo;
      });
      if (equipoActual && equipoActual.en_reparacion) {
        alert("Ese equipo está en reparación, no se puede entregar.");
        return;
      }
      var resultado = await db.from("equipos").update({ pedido_id: pedidoId }).eq("id", codigo).select();
      if (resultado.error || !resultado.data || resultado.data.length === 0) {
        alert("No se pudo asignar el equipo" + (resultado.error ? ": " + resultado.error.message : "."));
        return;
      }
      var pedido = pedidosCache.find(function (p) {
        return p.id === pedidoId;
      });
      var marcadoParaFacturar = false;
      if (pedido && pedido.estado !== "activo") {
        var cambios = Object.assign({ estado: "activo" }, fechasSiFaltan(pedido));
        // Al entregar el equipo, el pedido pasa solo a "Para facturar"
        // (salvo que ya esté facturado o ya esté marcado).
        if (!pedido.facturado_en && !pedido.pendiente_facturacion) {
          cambios.pendiente_facturacion = true;
          marcadoParaFacturar = true;
        }
        var r = await actualizarPedido(pedidoId, cambios);
        if (!r.ok) {
          await db.from("equipos").update({ pedido_id: null }).eq("id", codigo);
          alert("No se pudo activar el alquiler: " + r.motivo);
          await cargarPedidos();
          return;
        }
      }
      await registrarHistorial(codigo, "alta", "Entregado a " + (pedido ? nombreCliente(pedido) : "un cliente"));
      await cargarPedidos();
      resultadoEscaneo.innerHTML =
        '<div class="tarjeta-resultado-escaneo libre"><strong>✓ Alta hecha.</strong> ' + escaparHtml(codigo) +
        " quedó activo para " + escaparHtml(pedido ? nombreCliente(pedido) : "el cliente") + "." +
        (marcadoParaFacturar ? " 🧾 Quedó en \"Para facturar\"." : "") + "</div>";
    }

    async function bajaEquipo(codigo, conReparacion) {
      var equipo = equiposCache.find(function (e) {
        return e.id === codigo;
      });
      var pedidoId = equipo ? equipo.pedido_id : null;
      var pedido = pedidoId
        ? pedidosCache.find(function (p) {
            return p.id === pedidoId;
          })
        : null;

      var notaFalla = null;
      if (conReparacion) {
        notaFalla = window.prompt("¿Qué falla tiene el equipo? (podés dejarlo vacío)", "");
        if (notaFalla === null) return; // canceló todo
      }

      var resultado = await db.from("equipos").update({ pedido_id: null }).eq("id", codigo).select();
      if (resultado.error || !resultado.data || resultado.data.length === 0) {
        alert("No se pudo dar de baja el equipo" + (resultado.error ? ": " + resultado.error.message : "."));
        return;
      }
      await registrarHistorial(codigo, "baja", "Devuelto por " + (pedido ? nombreCliente(pedido) : "el cliente"));

      var mensaje = "✓ Baja hecha. " + codigo + " quedó libre.";
      if (pedido) {
        var quedan = equiposCache.filter(function (e) {
          return e.id !== codigo && e.pedido_id === pedido.id;
        }).length;
        if (quedan === 0) {
          var r = await actualizarPedido(pedido.id, { estado: "devuelto" });
          mensaje += r.ok
            ? " El pedido de " + nombreCliente(pedido) + " quedó como devuelto."
            : " Ojo: no se pudo marcar el pedido como devuelto (" + r.motivo + ").";
        } else {
          mensaje += " Al pedido de " + nombreCliente(pedido) + " todavía le quedan " + quedan + " equipo(s) sin devolver.";
        }
      }
      if (conReparacion) {
        var okRep = await ponerEnReparacionDirecto(codigo, notaFalla);
        mensaje += okRep ? " 🔧 Quedó EN REPARACIÓN." : " Ojo: no se pudo marcar en reparación.";
      }
      await cargarPedidos();
      resultadoEscaneo.innerHTML = '<div class="tarjeta-resultado-escaneo libre"><strong>' + escaparHtml(mensaje) + "</strong></div>";
    }

    async function liberarEquiposDePedido(pedidoId) {
      try {
        var liberados = equiposCache.filter(function (e) {
          return e.pedido_id === pedidoId;
        });
        await db.from("equipos").update({ pedido_id: null }).eq("pedido_id", pedidoId);
        for (var i = 0; i < liberados.length; i++) {
          await registrarHistorial(liberados[i].id, "baja", "Devuelto (dado de baja desde el pedido)");
        }
        equiposCache.forEach(function (e) {
          if (e.pedido_id === pedidoId) e.pedido_id = null;
        });
        renderizarEquipos();
      } catch (e) {
        /* si la tabla equipos todavía no existe, no pasa nada */
      }
    }

    async function detenerEscaner() {
      if (escanerQr) {
        try {
          await escanerQr.stop();
          await escanerQr.clear();
        } catch (e) {
          /* ya estaba detenido */
        }
        escanerQr = null;
      }
      visorEscaner.classList.add("d-none");
      btnDetenerEscaner.classList.add("d-none");
      btnEscanear.classList.remove("d-none");
    }

    async function iniciarEscaner() {
      if (typeof Html5Qrcode === "undefined") {
        alert("No se pudo cargar el escáner (revisá tu conexión a internet).");
        return;
      }
      visorEscaner.classList.remove("d-none");
      btnEscanear.classList.add("d-none");
      btnDetenerEscaner.classList.remove("d-none");
      escanerQr = new Html5Qrcode("visorEscaner");
      try {
        await escanerQr.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          function (texto) {
            detenerEscaner();
            procesarCodigo(texto);
          },
          function () {
            /* cuadros sin QR: se ignoran */
          }
        );
      } catch (e) {
        await detenerEscaner();
        alert("No se pudo abrir la cámara. Permití el acceso a la cámara en el navegador (o escribí el código a mano).");
      }
    }

    /* ---------------------- Contactos y borrado de pedidos ---------------------- */

    function claveCoincide(a, b) {
      if (a.dni && b.dni) return String(a.dni).trim() === String(b.dni).trim();
      if (a.telefono && b.telefono) return String(a.telefono).replace(/\D/g, "") === String(b.telefono).replace(/\D/g, "");
      return false;
    }

    function contactoDePedido(p) {
      return {
        nombre: p.nombre || null,
        apellido: p.apellido || null,
        dni: p.dni || null,
        telefono: p.telefono || null,
        direccion: p.direccion || null,
      };
    }

    // ---------- Copia de seguridad ----------
  function mostrarFechaBackup() {
    var t = document.getElementById("textoBackup");
    if (!t) return;
    var ultimo = null;
    try { ultimo = localStorage.getItem("gauss_ultimo_backup"); } catch (e) {}
    if (!ultimo) { t.textContent = "💾 Copia de seguridad: todavía no descargaste ninguna desde este navegador."; return; }
    var dias = Math.floor((Date.now() - new Date(ultimo).getTime()) / 86400000);
    t.textContent = "💾 Última copia de seguridad: " + (dias <= 0 ? "hoy" : "hace " + dias + " día" + (dias === 1 ? "" : "s")) + (dias >= 7 ? " — conviene descargar una nueva." : ".");
  }

  async function descargarBackup() {
    var btn = document.getElementById("btnBackup");
    var tablas = ["pedidos", "contactos", "equipos", "equipos_historial", "variantes_producto", "trabajos_plantillas"];
    var copia = { generado: new Date().toISOString(), tablas: {} };
    if (btn) { btn.disabled = true; btn.textContent = "Preparando..."; }
    try {
      for (var i = 0; i < tablas.length; i++) {
        var r = await leerTodas(tablas[i], [{ col: "id", asc: true }]);
        if (r.error && tablas[i] === "trabajos_plantillas") { copia.tablas[tablas[i]] = []; continue; } // todavía no se creó la tabla: no es un error
        if (r.error) { copia.tablas[tablas[i]] = []; copia.avisos = (copia.avisos || []).concat(tablas[i] + ": " + r.error.message); }
        else copia.tablas[tablas[i]] = r.data || [];
      }
      var blob = new Blob([JSON.stringify(copia, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "gauss-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      try { localStorage.setItem("gauss_ultimo_backup", new Date().toISOString()); } catch (e) {}
      mostrarFechaBackup();
      if (copia.avisos) alert("La copia se descargó, pero algunas tablas no se pudieron leer:\n" + copia.avisos.join("\n"));
    } catch (e) {
      alert("No se pudo generar la copia: " + e.message);
    }
    if (btn) { btn.disabled = false; btn.textContent = "Descargar copia de seguridad"; }
  }

  async function cargarContactos() {
      var resultado = await leerTodas("contactos", [{ col: "nombre", asc: true }, { col: "id", asc: true }]);
      if (resultado.error) {
        listaContactos.innerHTML =
          '<p class="texto-vacio-admin">No se pudieron cargar los contactos: ' + escaparHtml(resultado.error.message) +
          " (¿ya corriste el SQL nuevo de contactos en Supabase?)</p>";
        return;
      }
      contactosCache = resultado.data;
      renderizarContactos();
    }

    // Guarda (o actualiza) el contacto de un pedido. Devuelve true si quedó guardado.
    // Si archivar = true (el pedido se va a borrar), el alquiler queda anotado en
    // el historial del contacto para no perder cuántas veces y qué alquiló.
    async function guardarContactoDePedido(p, archivar) {
      var datos = contactoDePedido(p);
      if (!datos.nombre || (!datos.dni && !datos.telefono)) return true; // nada útil que guardar
      var existente = contactosCache.find(function (c) {
        return claveCoincide(c, datos);
      });
      if (archivar && p.tipo === "alquiler" && (p.estado === "devuelto" || p.estado === "activo")) {
        var previo = existente && Array.isArray(existente.historial) ? existente.historial : [];
        if (!previo.some(function (h) { return h.pid === p.id; })) {
          datos.historial = previo.concat([{
            pid: p.id,
            producto: p.producto_nombre,
            desde: p.fecha_desde || (p.creado_en || "").slice(0, 10),
            dias: p.duracion_dias || null,
          }]);
        }
      }
      var resultado;
      if (existente) {
        resultado = await db.from("contactos").update(datos).eq("id", existente.id).select();
      } else {
        resultado = await db.from("contactos").insert(datos).select();
      }
      if (resultado.error || !resultado.data || resultado.data.length === 0) return false;
      if (existente) Object.assign(existente, datos);
      else contactosCache.push(resultado.data[0]);
      return true;
    }

    // Cuántas veces alquiló un contacto y qué: los pedidos actuales + los ya borrados (historial guardado).
    function resumenAlquileresContacto(c) {
      var productos = {};
      var total = 0;
      function sumar(nombre) {
        total++;
        productos[nombre || "Equipo"] = (productos[nombre || "Equipo"] || 0) + 1;
      }
      var archivados = Array.isArray(c.historial) ? c.historial : [];
      archivados.forEach(function (h) {
        sumar(h.producto);
      });
      var idsArchivados = archivados.map(function (h) { return h.pid; });
      pedidosCache.forEach(function (p) {
        if (p.tipo !== "alquiler" || (p.estado !== "activo" && p.estado !== "devuelto")) return;
        if (idsArchivados.indexOf(p.id) !== -1) return;
        if (claveCoincide(c, contactoDePedido(p))) sumar(p.producto_nombre);
      });
      var detalle = Object.keys(productos).map(function (n) {
        return n + " ×" + productos[n];
      });
      return { total: total, detalle: detalle };
    }

    function renderizarContactos() {
      var q = (buscadorContactos.value || "").trim().toLowerCase();
      var lista = contactosCache.filter(function (c) {
        if (!q) return true;
        return [c.nombre, c.apellido, c.dni, c.telefono, c.direccion].filter(Boolean).join(" ").toLowerCase().indexOf(q) !== -1;
      });
      contadorContactos.textContent = contactosCache.length;
      contadorContactos.classList.toggle("badge-tab-vacio", contactosCache.length === 0);

      if (lista.length === 0) {
        listaContactos.innerHTML = '<p class="texto-vacio-admin">' +
          (contactosCache.length === 0
            ? 'Todavía no hay contactos guardados. Se guardan solos al borrar un pedido, o tocá "Guardar clientes de los pedidos actuales".'
            : "No hay contactos con esa búsqueda.") + "</p>";
        return;
      }

      listaContactos.innerHTML =
        '<div class="table-responsive"><table class="table table-bordered bg-white tabla-pedidos-admin">' +
        "<thead><tr><th>Nombre</th><th>DNI</th><th>Teléfono</th><th>Dirección</th><th>Alquileres</th><th></th></tr></thead><tbody>" +
        lista
          .map(function (c) {
            var nombre = [c.nombre, c.apellido].filter(Boolean).join(" ") || "-";
            var wa = c.telefono
              ? '<a class="btn-accion-admin activar" target="_blank" rel="noopener" href="' +
                escaparHtml(linkWhatsApp(c.telefono, "Hola " + (c.nombre || "") + "!")) + '">💬 WhatsApp</a> '
              : "";
            return (
              '<tr><td data-label="Nombre">' + escaparHtml(nombre) + "</td>" +
              '<td data-label="DNI">' + escaparHtml(c.dni || "-") + "</td>" +
              '<td data-label="Teléfono">' + escaparHtml(c.telefono || "-") + "</td>" +
              '<td data-label="Dirección">' + escaparHtml(c.direccion || "-") + "</td>" +
              '<td data-label="Alquileres">' + (function () {
                var res = resumenAlquileresContacto(c);
                return res.total === 0
                  ? "-"
                  : "<strong>" + res.total + (res.total === 1 ? " vez" : " veces") + "</strong><br><small class='text-muted'>" + escaparHtml(res.detalle.join(" · ")) + "</small>";
              })() + "</td>" +
              '<td data-label="Acciones"><div class="acciones-fila-admin">' + wa +
              '<button type="button" class="btn-accion-admin retiro btn-pedido-contacto" data-contacto="' + c.id + '">➕ Nuevo pedido</button> ' +
              '<button type="button" class="btn-accion-admin activar btn-editar-contacto" data-contacto="' + c.id + '">✏️ Editar</button> ' +
              '<button type="button" class="btn-accion-admin baja btn-borrar-contacto" data-contacto="' + c.id + '">Eliminar</button></div></td></tr>'
            );
          })
          .join("") +
        "</tbody></table></div>";
    }

    async function importarContactosDePedidos() {
      var nuevos = 0;
      for (var i = 0; i < pedidosCache.length; i++) {
        var p = pedidosCache[i];
        var datos = contactoDePedido(p);
        if (!datos.nombre || (!datos.dni && !datos.telefono)) continue;
        var yaEsta = contactosCache.some(function (c) {
          return claveCoincide(c, datos);
        });
        if (yaEsta) continue;
        if (await guardarContactoDePedido(p)) nuevos++;
      }
      renderizarContactos();
      alert(nuevos > 0 ? "Se guardaron " + nuevos + " contacto(s) nuevo(s)." : "No había contactos nuevos para guardar.");
    }

    async function eliminarContacto(id) {
      var c = contactosCache.find(function (x) {
        return x.id === id;
      });
      if (!c || !confirm("¿Eliminar a " + ([c.nombre, c.apellido].filter(Boolean).join(" ") || "este contacto") + " de la agenda?")) return;
      var resultado = await db.from("contactos").delete().eq("id", id).select();
      if (resultado.error || !resultado.data || resultado.data.length === 0) {
        alert("No se pudo eliminar el contacto" + (resultado.error ? ": " + resultado.error.message : "."));
        return;
      }
      contactosCache = contactosCache.filter(function (x) {
        return x.id !== id;
      });
      renderizarContactos();
    }

    function exportarContactosCsv() {
      if (contactosCache.length === 0) {
        alert("No hay contactos para exportar.");
        return;
      }
      var filas = [["Nombre", "Apellido", "DNI", "Telefono", "Direccion", "Veces que alquilo", "Productos"]].concat(
        contactosCache.map(function (c) {
          var res = resumenAlquileresContacto(c);
          return [c.nombre, c.apellido, c.dni, c.telefono, c.direccion, res.total, res.detalle.join(" | ")];
        })
      );
      var csv = filas
        .map(function (fila) {
          return fila
            .map(function (v) {
              return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
            })
            .join(",");
        })
        .join("\r\n");
      var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      var enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(blob);
      enlace.download = "contactos-gauss-" + hoyISO() + ".csv";
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
    }

    async function borrarPedido(id) {
      var p = pedidosCache.find(function (x) {
        return x.id === id;
      });
      if (!p) return;

      var aviso = "¿Borrar el pedido de " + nombreCliente(p) + " (" + p.producto_nombre + ")?\n\n";
      if (p.estado === "activo" || p.estado === "confirmado") {
        aviso += "⚠️ Este pedido figura como " + p.estado.toUpperCase() + ": el equipo puede seguir en la calle.\n";
      }
      if (p.pendiente_facturacion && !p.facturado_en) {
        aviso += "⚠️ Todavía está marcado \"Para facturar\" y no se facturó.\n";
      }
      aviso += "Sus datos de contacto se guardan en la pestaña Contactos. Esto no se puede deshacer.";
      if (!confirm(aviso)) return;

      if (!(await guardarContactoDePedido(p, true))) {
        alert("No se pudo guardar el contacto, así que no borré el pedido. (¿Corriste el SQL de contactos en Supabase, incluido el 7-historial-contactos?)");
        return;
      }
      var resultado = await db.from("pedidos").delete().eq("id", id).select();
      if (resultado.error || !resultado.data || resultado.data.length === 0) {
        alert("No se pudo borrar el pedido" + (resultado.error ? ": " + resultado.error.message : " (¿venció la sesión?)."));
        return;
      }
      await cargarPedidos();
    }

    async function limpiarFinalizados() {
      var candidatos = pedidosCache.filter(function (p) {
        var finalizado = p.estado === "devuelto" || p.estado === "cancelado";
        var sinFacturarPendiente = p.pendiente_facturacion && !p.facturado_en;
        return finalizado && !sinFacturarPendiente;
      });
      var salteados = pedidosCache.filter(function (p) {
        return (p.estado === "devuelto" || p.estado === "cancelado") && p.pendiente_facturacion && !p.facturado_en;
      }).length;

      if (candidatos.length === 0) {
        alert("No hay pedidos devueltos o cancelados para limpiar." + (salteados ? "\n(" + salteados + " están pendientes de facturar y no se tocan.)" : ""));
        return;
      }
      if (
        !confirm(
          "Se van a borrar " + candidatos.length + " pedido(s) devueltos o cancelados." +
            (salteados ? "\nLos " + salteados + " que están pendientes de facturar NO se borran." : "") +
            "\n\nLos datos de contacto de esos clientes se guardan en Contactos. Esto no se puede deshacer. ¿Seguir?"
        )
      ) {
        return;
      }

      for (var i = 0; i < candidatos.length; i++) {
        if (!(await guardarContactoDePedido(candidatos[i], true))) {
          alert("No se pudo guardar un contacto, así que frené antes de borrar. (¿Corriste el SQL de contactos en Supabase, incluido el 7-historial-contactos?)");
          return;
        }
      }
      var ids = candidatos.map(function (p) {
        return p.id;
      });
      var resultado = await db.from("pedidos").delete().in("id", ids).select();
      if (resultado.error) {
        alert("No se pudieron borrar: " + resultado.error.message);
        return;
      }
      alert("Se borraron " + (resultado.data ? resultado.data.length : 0) + " pedido(s).");
      await cargarPedidos();
    }

    /* ---------------------- Reparación e historial de equipos ---------------------- */

    // Anota un movimiento del equipo. Si la tabla todavía no existe, no frena nada.
    async function registrarHistorial(equipoId, accion, detalle) {
      try {
        await db.from("equipos_historial").insert({ equipo_id: equipoId, accion: accion, detalle: detalle || null });
      } catch (e) {
        /* sin historial no pasa nada */
      }
    }

    var ETIQUETAS_HISTORIAL = {
      alta: "▶️ Entregado",
      baja: "↩️ Devuelto",
      reparacion: "🔧 A reparación",
      fin_reparacion: "✅ Volvió a servicio",
    };

    function filaHistorialHtml(h) {
      return (
        "<li><strong>" + (ETIQUETAS_HISTORIAL[h.accion] || escaparHtml(h.accion)) + "</strong> · " +
        new Date(h.creado_en).toLocaleString("es-AR") +
        (h.detalle ? " — " + escaparHtml(h.detalle) : "") + "</li>"
      );
    }

    async function traerHistorial(equipoId, limite) {
      try {
        var r = await db
          .from("equipos_historial")
          .select("*")
          .eq("equipo_id", equipoId)
          .order("creado_en", { ascending: false })
          .limit(limite);
        return r.error ? null : r.data;
      } catch (e) {
        return null;
      }
    }

    async function historialResumidoHtml(equipoId) {
      var datos = await traerHistorial(equipoId, 5);
      if (!datos || datos.length === 0) return "";
      return (
        '<div class="mt-3"><small class="text-secondary">Últimos movimientos</small>' +
        '<ul class="mb-0 ps-3" style="font-size:13px;">' + datos.map(filaHistorialHtml).join("") + "</ul></div>"
      );
    }

    async function mostrarHistorialEquipo(codigo) {
      var datos = await traerHistorial(codigo, 50);
      var cuerpo;
      if (datos === null) {
        cuerpo = '<p class="mb-0 text-secondary">No se pudo leer el historial (¿corriste el SQL de reparación e historial?).</p>';
      } else if (datos.length === 0) {
        cuerpo = '<p class="mb-0 text-secondary">Todavía no hay movimientos de este equipo.</p>';
      } else {
        cuerpo = '<ul class="mb-0 ps-3" style="font-size:13px;">' + datos.map(filaHistorialHtml).join("") + "</ul>";
      }
      panelHistorialEquipo.innerHTML =
        '<div class="tarjeta-resultado-escaneo"><div class="d-flex justify-content-between align-items-center mb-2">' +
        "<strong>Historial de <code>" + escaparHtml(codigo) + "</code></strong>" +
        '<button type="button" class="btn-accion-admin baja btn-cerrar-historial">Cerrar</button></div>' + cuerpo + "</div>";
      panelHistorialEquipo.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // Actualiza en la variante cuántos equipos están en reparación (lo lee el sitio público).
    async function sincronizarReparacionVariante(varianteId) {
      var cantidad = equiposCache.filter(function (e) {
        return e.variante_id === varianteId && e.en_reparacion;
      }).length;
      var r = await db.from("variantes_producto").update({ en_reparacion: cantidad }).eq("id", varianteId).select();
      if (r.error || !r.data || r.data.length === 0) return false;
      var v = variantesCache.find(function (x) {
        return x.id === varianteId;
      });
      if (v) v.en_reparacion = cantidad;
      return true;
    }

    async function ponerEnReparacionDirecto(codigo, nota) {
      var datos = { en_reparacion: true, reparacion_desde: new Date().toISOString(), reparacion_nota: nota || null };
      var r = await db.from("equipos").update(datos).eq("id", codigo).select();
      if (r.error || !r.data || r.data.length === 0) return false;
      var eq = equiposCache.find(function (e) {
        return e.id === codigo;
      });
      if (eq) Object.assign(eq, datos);
      var ok = await sincronizarReparacionVariante(r.data[0].variante_id);
      await registrarHistorial(codigo, "reparacion", nota || "Sin detalle");
      return ok;
    }

    async function ponerEnReparacion(codigo) {
      var nota = window.prompt("¿Qué falla tiene el equipo? (podés dejarlo vacío)", "");
      if (nota === null) return;
      var ok = await ponerEnReparacionDirecto(codigo, nota);
      if (!ok) {
        alert("No se pudo poner en reparación. ¿Corriste el SQL de reparación e historial en Supabase?");
        return;
      }
      await cargarPedidos();
      resultadoEscaneo.innerHTML =
        '<div class="tarjeta-resultado-escaneo error"><strong>🔧 ' + escaparHtml(codigo) +
        " quedó en reparación.</strong> Ya no se descuenta como disponible para alquilar.</div>";
    }

    async function volverAServicio(codigo) {
      var datos = { en_reparacion: false, reparacion_desde: null, reparacion_nota: null };
      var r = await db.from("equipos").update(datos).eq("id", codigo).select();
      if (r.error || !r.data || r.data.length === 0) {
        alert("No se pudo volver a servicio" + (r.error ? ": " + r.error.message : "."));
        return;
      }
      var eq = equiposCache.find(function (e) {
        return e.id === codigo;
      });
      if (eq) Object.assign(eq, datos);
      await sincronizarReparacionVariante(r.data[0].variante_id);
      await registrarHistorial(codigo, "fin_reparacion", "Volvió a estar disponible");
      await cargarPedidos();
      resultadoEscaneo.innerHTML =
        '<div class="tarjeta-resultado-escaneo libre"><strong>✅ ' + escaparHtml(codigo) + " volvió a servicio y está libre.</strong></div>";
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

    if (buscadorPedidos) {
      buscadorPedidos.addEventListener("input", renderizarTabla);
    }

    if (buscadorActivos) {
      buscadorActivos.addEventListener("input", renderizarActivos);
    }

    if (buscadorVencidos) {
      buscadorVencidos.addEventListener("input", renderizarVencidos);
    }

    if (btnExportarCsv) {
      btnExportarCsv.addEventListener("click", exportarCsv);
    }

    tablaCuerpo.addEventListener("click", function (evento) {
      if (evento.target.classList.contains("link-historial-cliente")) {
        evento.preventDefault();
        buscadorPedidos.value = evento.target.getAttribute("data-dni");
        renderizarTabla();
        return;
      }
      var id = evento.target.getAttribute("data-id");
      if (!id) return;
      if (evento.target.classList.contains("btn-avisar-retiro")) avisarRetiro(id);
      if (evento.target.classList.contains("btn-activar-alquiler")) activarAlquiler(id);
      if (evento.target.classList.contains("btn-dar-de-baja")) darDeBaja(id);
      if (evento.target.classList.contains("btn-borrar-pedido")) borrarPedido(id);
      if (evento.target.classList.contains("btn-marcar-facturar")) marcarParaFacturar(id);
      if (evento.target.classList.contains("btn-quitar-facturar")) quitarParaFacturar(id);
    });

    listaParaFacturar.addEventListener("click", function (evento) {
      var id = evento.target.getAttribute("data-id");
      if (!id) return;
      if (evento.target.classList.contains("btn-quitar-facturar")) quitarParaFacturar(id);
    });


    if (grillaDashboard) {
      grillaDashboard.addEventListener("click", function (evento) {
        var tarjeta = evento.target.closest(".tarjeta-dashboard[data-tab]");
        if (!tarjeta) return;
        var estado = tarjeta.getAttribute("data-estado");
        if (estado) {
          selectFiltroEstado.value = estado;
          buscadorPedidos.value = "";
          renderizarTabla();
        }
        irATab(tarjeta.getAttribute("data-tab"));
      });
    }

    if (btnEscanear) btnEscanear.addEventListener("click", iniciarEscaner);
    if (btnDetenerEscaner) btnDetenerEscaner.addEventListener("click", detenerEscaner);
    if (btnCrearEquipos) btnCrearEquipos.addEventListener("click", crearEquipos);
    if (btnImprimirEtiquetas) btnImprimirEtiquetas.addEventListener("click", function () { imprimirEtiquetas(); });
    if (filtroEquipos) filtroEquipos.addEventListener("change", renderizarEquipos);
    if (btnBuscarCodigo) {
      btnBuscarCodigo.addEventListener("click", function () {
        procesarCodigo(inputCodigoManual.value);
      });
    }
    if (inputCodigoManual) {
      inputCodigoManual.addEventListener("keydown", function (evento) {
        if (evento.key === "Enter") procesarCodigo(inputCodigoManual.value);
      });
    }
    if (panelHistorialEquipo) {
      panelHistorialEquipo.addEventListener("click", function (evento) {
        if (evento.target.classList.contains("btn-cerrar-historial")) panelHistorialEquipo.innerHTML = "";
      });
    }
    if (listaEquipos) {
      listaEquipos.addEventListener("click", function (evento) {
        var codigo = evento.target.getAttribute("data-equipo");
        if (!codigo) return;
        if (evento.target.classList.contains("btn-etiqueta-equipo")) imprimirEtiquetas([codigo]);
        if (evento.target.classList.contains("btn-historial-equipo")) mostrarHistorialEquipo(codigo);
        if (evento.target.classList.contains("btn-eliminar-equipo")) eliminarEquipo(codigo);
      });
    }
    if (resultadoEscaneo) {
      resultadoEscaneo.addEventListener("input", function (evento) {
        if (evento.target.id !== "buscadorCandidatos") return;
        var q = evento.target.value.trim().toLowerCase();
        resultadoEscaneo.querySelectorAll(".fila-candidato").forEach(function (fila) {
          fila.style.display = !q || fila.getAttribute("data-texto").indexOf(q) !== -1 ? "" : "none";
        });
      });
      resultadoEscaneo.addEventListener("click", function (evento) {
        var codigo = evento.target.getAttribute("data-equipo");
        if (!codigo) return;
        if (evento.target.classList.contains("btn-alta-equipo")) {
          altaEquipo(codigo, evento.target.getAttribute("data-pedido"));
        }
        if (evento.target.classList.contains("btn-baja-equipo")) bajaEquipo(codigo, false);
        if (evento.target.classList.contains("btn-baja-reparacion")) bajaEquipo(codigo, true);
        if (evento.target.classList.contains("btn-reparacion-equipo")) ponerEnReparacion(codigo);
        if (evento.target.classList.contains("btn-fin-reparacion")) volverAServicio(codigo);
      });
    }


    var btnBackup = document.getElementById("btnBackup");
    if (btnBackup) btnBackup.addEventListener("click", descargarBackup);
    mostrarFechaBackup();
    if (btnImportarContactos) btnImportarContactos.addEventListener("click", importarContactosDePedidos);
    if (btnExportarContactos) btnExportarContactos.addEventListener("click", exportarContactosCsv);
    if (btnLimpiarFinalizados) btnLimpiarFinalizados.addEventListener("click", limpiarFinalizados);
    if (buscadorContactos) buscadorContactos.addEventListener("input", renderizarContactos);
    if (listaContactos) {
      listaContactos.addEventListener("click", function (evento) {
        var id = evento.target.getAttribute("data-contacto");
        if (id && evento.target.classList.contains("btn-borrar-contacto")) eliminarContacto(id);
        if (id && evento.target.classList.contains("btn-editar-contacto")) abrirEditarContacto(id);
        if (id && evento.target.classList.contains("btn-pedido-contacto")) nuevoPedidoDeContacto(id);
      });
    }

    if (btnEnviarSheets) btnEnviarSheets.addEventListener("click", enviarAGoogleSheets);
    if (btnExportarFacturitas) btnExportarFacturitas.addEventListener("click", exportarFacturitas);
    if (btnConfirmarFacturados) btnConfirmarFacturados.addEventListener("click", confirmarFacturados);

    async function cambiarDuracion(id, nuevosDias) {
      var pedido = pedidosCache.find(function (p) {
        return p.id === id;
      });
      if (!pedido) return;
      var tabla = PRECIOS_POR_DURACION[pedido.producto_id];
      var sugerido = tabla && tabla[nuevosDias] ? tabla[nuevosDias] * (pedido.cantidad || 1) : pedido.total;
      var total;
      if (tabla && tabla[nuevosDias]) {
        // Equipos con tarifa conocida (Magneto): se aplica directo, sin preguntar.
        total = sugerido;
      } else {
        var respuesta = window.prompt(
          "Cambiar a " + nuevosDias + " días. Este equipo no tiene tarifa cargada para esa duración.\nTotal a cobrar ($):",
          String(sugerido)
        );
        if (respuesta === null) {
          renderizarTabla();
          return;
        }
        total = parseInt(String(respuesta).replace(/\D/g, ""), 10);
        if (isNaN(total) || total < 0) {
          alert("El total no es válido.");
          renderizarTabla();
          return;
        }
      }
      var cambios = {
        duracion_dias: nuevosDias,
        total: total,
        precio_unitario: Math.round(total / (pedido.cantidad || 1)),
      };
      if (pedido.fecha_desde) cambios.fecha_hasta = calcularFechaHasta(pedido.fecha_desde, nuevosDias);
      var resultado = await actualizarPedido(id, cambios);
      if (!resultado.ok) {
        alert("No se pudo cambiar la duración: " + resultado.motivo);
        cargarPedidos();
        return;
      }
      Object.assign(pedido, cambios);
      renderizarTabla();
      refrescarListasAlquiler();
    }

    /* ---------------------- Nuevo pedido desde el admin ---------------------- */
    var PRECIOS_ALQUILER_BASE = {
      muletas: { 30: 18000 },
      "bota-walker": { 30: 16000 },
      "silla-de-ruedas": { 30: 40000 },
      andador: { 30: 25000 },
      "roll-out": { 30: 40000 },
      "eleva-inodoro": { 30: 25000 },
    };

    var opcionesNuevoPedido = [];

    function precioSugeridoNuevoPedido() {
      var idVar = document.getElementById("npProducto").value;
      var v = opcionesNuevoPedido.find(function (x) {
        return x.id === idVar;
      });
      if (!v || document.getElementById("npTipo").value !== "alquiler") return "";
      var dias = parseInt(document.getElementById("npDuracion").value, 10);
      var tabla = PRECIOS_POR_DURACION[v.id] || PRECIOS_ALQUILER_BASE[v.producto_id] || null;
      if (!tabla) return "";
      var unitario = tabla[dias] || tabla[30];
      var cant = parseInt(document.getElementById("npCantidad").value, 10) || 1;
      return unitario ? unitario * cant : "";
    }

    function actualizarTotalNuevoPedido() {
      var sug = precioSugeridoNuevoPedido();
      document.getElementById("npTotal").value = sug === "" ? "" : sug;
      document.getElementById("npCajaDuracion").classList.toggle("d-none", document.getElementById("npTipo").value !== "alquiler");
    }

    var contactoEnEdicion = null;

    function abrirEditarContacto(id) {
      var c = contactosCache.find(function (x) {
        return x.id === id;
      });
      if (!c) return;
      contactoEnEdicion = id;
      document.getElementById("ecNombre").value = c.nombre || "";
      document.getElementById("ecApellido").value = c.apellido || "";
      document.getElementById("ecDni").value = c.dni || "";
      document.getElementById("ecTelefono").value = c.telefono || "";
      document.getElementById("ecDireccion").value = c.direccion || "";
      document.getElementById("ecAviso").classList.add("d-none");
      var panel = document.getElementById("panelEditarContacto");
      panel.classList.remove("d-none");
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
      document.getElementById("ecNombre").focus();
    }

    async function guardarContactoEditado() {
      var aviso = document.getElementById("ecAviso");
      var c = contactosCache.find(function (x) {
        return x.id === contactoEnEdicion;
      });
      if (!c) return;
      var datos = {
        nombre: document.getElementById("ecNombre").value.trim() || null,
        apellido: document.getElementById("ecApellido").value.trim() || null,
        dni: document.getElementById("ecDni").value.trim() || null,
        telefono: document.getElementById("ecTelefono").value.trim() || null,
        direccion: document.getElementById("ecDireccion").value.trim() || null,
      };
      if (!datos.nombre) {
        aviso.textContent = "El nombre no puede quedar vacío.";
        aviso.classList.remove("d-none");
        return;
      }
      var r = await db.from("contactos").update(datos).eq("id", c.id).select();
      if (r.error || !r.data || r.data.length === 0) {
        aviso.textContent = "No se pudo guardar: " + (r.error ? r.error.message : "no se guardó ningún dato (¿la sesión venció?).");
        aviso.classList.remove("d-none");
        return;
      }
      Object.assign(c, datos);
      document.getElementById("panelEditarContacto").classList.add("d-none");
      contactoEnEdicion = null;
      renderizarContactos();
    }

    function nuevoPedidoDeContacto(id) {
      var c = contactosCache.find(function (x) {
        return x.id === id;
      });
      if (!c) return;
      irATab("pedidos");
      abrirNuevoPedido(c);
      document.getElementById("panelNuevoPedido").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function abrirNuevoPedido(contacto) {
      var sel = document.getElementById("npProducto");
      opcionesNuevoPedido = [];
      variantesCache.forEach(function (v) {
        if (v.id === "magneto") {
          MODELOS_MAGNETO.forEach(function (m) {
            opcionesNuevoPedido.push({ id: m.id, producto_id: "magneto", producto_nombre: v.producto_nombre, variante: m.variante });
          });
        } else {
          opcionesNuevoPedido.push(v);
        }
      });
      sel.innerHTML = opcionesNuevoPedido
        .map(function (v) {
          return '<option value="' + escaparHtml(v.id) + '">' + escaparHtml(v.producto_nombre + " - " + v.variante) + "</option>";
        })
        .join("");
      ["npNombre", "npApellido", "npTelefono", "npDni", "npDireccion", "npLesion"].forEach(function (id) {
        document.getElementById(id).value = "";
      });
      if (contacto) {
        document.getElementById("npNombre").value = contacto.nombre || "";
        document.getElementById("npApellido").value = contacto.apellido || "";
        document.getElementById("npTelefono").value = contacto.telefono || "";
        document.getElementById("npDni").value = contacto.dni || "";
        document.getElementById("npDireccion").value = contacto.direccion || "";
      }
      document.getElementById("npCantidad").value = 1;
      document.getElementById("npTipo").value = "alquiler";
      document.getElementById("npDuracion").value = "30";
      document.getElementById("npEstado").value = "confirmado";
      document.getElementById("npAviso").classList.add("d-none");
      actualizarTotalNuevoPedido();
      document.getElementById("panelNuevoPedido").classList.remove("d-none");
      document.getElementById("npProducto").focus();
    }

    async function guardarNuevoPedido() {
      var aviso = document.getElementById("npAviso");
      function error(msg) {
        aviso.textContent = msg;
        aviso.classList.remove("d-none");
      }
      var idVar = document.getElementById("npProducto").value;
      var v = opcionesNuevoPedido.find(function (x) {
        return x.id === idVar;
      });
      if (!v) return error("Elegí un producto.");
      var nombre = document.getElementById("npNombre").value.trim();
      var apellido = document.getElementById("npApellido").value.trim();
      if (!nombre || !apellido) return error("Completá nombre y apellido.");
      var total = parseInt(document.getElementById("npTotal").value, 10);
      if (isNaN(total) || total < 0) return error("Completá el total.");
      var cantidad = Math.max(parseInt(document.getElementById("npCantidad").value, 10) || 1, 1);
      var tipo = document.getElementById("npTipo").value;
      var estado = document.getElementById("npEstado").value;

      var fila = {
        tipo: tipo,
        estado: estado,
        producto_id: v.id,
        producto_nombre: v.producto_nombre + " - " + v.variante,
        cantidad: cantidad,
        precio_unitario: Math.round(total / cantidad),
        total: total,
        duracion_dias: tipo === "alquiler" ? parseInt(document.getElementById("npDuracion").value, 10) : null,
        nombre: nombre,
        apellido: apellido,
        telefono: document.getElementById("npTelefono").value.trim() || null,
        dni: document.getElementById("npDni").value.trim() || null,
        direccion: document.getElementById("npDireccion").value.trim() || null,
        lesion: document.getElementById("npLesion").value.trim() || null,
      };
      if (estado === "activo") Object.assign(fila, fechasSiFaltan(fila));

      var btn = document.getElementById("btnGuardarNuevoPedido");
      btn.disabled = true;
      var r = await db.from("pedidos").insert(fila).select();
      btn.disabled = false;
      if (r.error || !r.data || r.data.length === 0) {
        return error("No se pudo guardar: " + (r.error ? r.error.message : "no se guardó ningún dato (¿la sesión venció?)."));
      }
      document.getElementById("panelNuevoPedido").classList.add("d-none");
      await cargarPedidos();
    }

    document.getElementById("btnNuevoPedido").addEventListener("click", function () {
      abrirNuevoPedido();
    });
    document.getElementById("btnGuardarContacto").addEventListener("click", guardarContactoEditado);
    document.getElementById("btnCancelarContacto").addEventListener("click", function () {
      document.getElementById("panelEditarContacto").classList.add("d-none");
      contactoEnEdicion = null;
    });
    document.getElementById("btnCancelarNuevoPedido").addEventListener("click", function () {
      document.getElementById("panelNuevoPedido").classList.add("d-none");
    });
    document.getElementById("btnGuardarNuevoPedido").addEventListener("click", guardarNuevoPedido);
    ["npProducto", "npTipo", "npDuracion", "npCantidad"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", actualizarTotalNuevoPedido);
    });


    /* ---------------------- Plantillas: seguimiento de trabajos ---------------------- */
    var plantillasCache = [];
    var listaPlantillas = document.getElementById("listaPlantillas");

    var ETIQUETA_TRABAJO = {
      en_fabricacion: "🛠 En fabricación",
      lista: "✅ Lista para retirar",
      entregada: "📦 Entregada",
      cancelada: "✖ Cancelada",
    };

    async function cargarPlantillas() {
      var resultado = await leerTodas("trabajos_plantillas", [{ col: "creado_en", asc: false }, { col: "id", asc: true }]);
      if (resultado.error) {
        plantillasCache = [];
        listaPlantillas.innerHTML =
          '<p class="texto-vacio-admin">No se pudieron cargar los trabajos: ' + escaparHtml(resultado.error.message) +
          " (¿ya corriste el SQL 8-plantillas en Supabase?)</p>";
        actualizarContadorPlantillas();
        return;
      }
      plantillasCache = resultado.data;
      renderizarPlantillas();
    }

    function actualizarContadorPlantillas() {
      var abiertos = plantillasCache.filter(function (t) {
        return t.estado === "en_fabricacion" || t.estado === "lista";
      }).length;
      var badge = document.getElementById("contadorPlantillas");
      if (badge) {
        badge.textContent = abiertos;
        badge.classList.toggle("badge-tab-vacio", abiertos === 0);
      }
    }

    function nombreTrabajo(t) {
      return [t.nombre, t.apellido].filter(Boolean).join(" ") || "Sin nombre";
    }

    function renderizarPlantillas() {
      actualizarContadorPlantillas();
      var filtro = document.getElementById("filtroPlantillas").value;
      var q = (document.getElementById("buscadorPlantillas").value || "").trim().toLowerCase();
      var hoy = hoyLocalISO();

      var lista = plantillasCache.filter(function (t) {
        if (filtro === "abiertos" && t.estado !== "en_fabricacion" && t.estado !== "lista") return false;
        if (filtro !== "abiertos" && filtro !== "todos" && t.estado !== filtro) return false;
        if (q && [t.nombre, t.apellido, t.dni, t.telefono, t.descripcion].filter(Boolean).join(" ").toLowerCase().indexOf(q) === -1) return false;
        return true;
      });

      if (lista.length === 0) {
        listaPlantillas.innerHTML = '<p class="texto-vacio-admin">' +
          (plantillasCache.length === 0 ? 'Todavía no cargaste trabajos. Tocá "Nuevo trabajo" o guardalos desde un presupuesto.' : "No hay trabajos con este filtro.") + "</p>";
        return;
      }

      // Primero los que antes se tienen que entregar
      lista.sort(function (a1, b1) {
        return (a1.entrega_hasta || "9999").localeCompare(b1.entrega_hasta || "9999");
      });

      listaPlantillas.innerHTML = lista
        .map(function (t) {
          var saldo = Math.max((t.total || 0) - (t.sena || 0), 0);
          var abierto = t.estado === "en_fabricacion" || t.estado === "lista";
          var aviso = "";
          if (t.estado === "en_fabricacion" && t.entrega_hasta && hoy > t.entrega_hasta) {
            aviso = '<span class="etiqueta-sin-responder">⚠️ Pasó la fecha estimada de entrega</span>';
          } else if (t.estado === "en_fabricacion" && t.entrega_desde && hoy >= t.entrega_desde) {
            aviso = '<span class="text-warning fw-bold" style="font-size:12px;">📅 Ya puede estar lista</span>';
          }
          var botones = [];
          if (t.estado === "en_fabricacion") {
            botones.push('<button type="button" class="btn-accion-admin activar" data-accion="lista" data-id="' + t.id + '">✅ Lista para retirar</button>');
          }
          if (t.estado === "lista") {
            botones.push(
              t.telefono
                ? '<button type="button" class="btn-accion-admin retiro" data-accion="avisar" data-id="' + t.id + '">📲 ' + (t.avisado_listo ? "Avisar de nuevo" : "Avisar por WhatsApp") + "</button>"
                : ""
            );
            botones.push('<button type="button" class="btn-accion-admin activar" data-accion="entregada" data-id="' + t.id + '">📦 Marcar entregada</button>');
          }
          if (abierto && saldo > 0) {
            botones.push('<button type="button" class="btn-accion-admin retiro" data-accion="pago" data-id="' + t.id + '">💵 Registrar pago</button>');
          }
          if (abierto) {
            botones.push('<button type="button" class="btn-accion-admin baja" data-accion="cancelar" data-id="' + t.id + '">Cancelar trabajo</button>');
          }
          botones.push('<button type="button" class="btn-accion-admin baja" data-accion="borrar" data-id="' + t.id + '">🗑 Borrar</button>');

          return (
            '<div class="tarjeta-trabajo estado-trabajo-' + t.estado + '">' +
            '<div class="d-flex flex-wrap justify-content-between gap-2">' +
            "<div><strong>" + escaparHtml(nombreTrabajo(t)) + "</strong>" +
            (t.dni ? " · DNI " + escaparHtml(t.dni) : "") + (t.telefono ? " · " + escaparHtml(t.telefono) : "") + "</div>" +
            '<span class="estado-trabajo">' + ETIQUETA_TRABAJO[t.estado] + (t.estado === "lista" && t.avisado_listo ? " · avisado" : "") + "</span></div>" +
            '<div class="mt-1">' + escaparHtml(t.descripcion) + "</div>" +
            (t.notas ? '<div class="text-muted" style="font-size:12px;">' + escaparHtml(t.notas) + "</div>" : "") +
            '<div class="datos-trabajo">' +
            "<div><small>Total</small><br><strong>" + formatearPrecio(t.total) + "</strong></div>" +
            "<div><small>Seña</small><br><strong>" + formatearPrecio(t.sena) + "</strong></div>" +
            "<div><small>Falta abonar</small><br><strong" + (saldo > 0 && abierto ? ' class="text-danger"' : "") + ">" + formatearPrecio(saldo) + "</strong></div>" +
            "<div><small>Entrega estimada</small><br><strong>" +
            (t.entrega_desde ? formatearFecha(t.entrega_desde) + " → " + formatearFecha(t.entrega_hasta) : "-") + "</strong></div></div>" +
            (aviso ? "<div class='mt-1'>" + aviso + "</div>" : "") +
            '<div class="acciones-fila-admin mt-2">' + botones.join("") + "</div></div>"
          );
        })
        .join("");
    }

    async function actualizarTrabajo(id, cambios) {
      var r = await db.from("trabajos_plantillas").update(cambios).eq("id", id).select();
      if (r.error || !r.data || r.data.length === 0) {
        alert("No se pudo guardar el cambio" + (r.error ? ": " + r.error.message : " (¿venció la sesión?)."));
        return false;
      }
      var t = plantillasCache.find(function (x) {
        return x.id === id;
      });
      if (t) Object.assign(t, cambios);
      renderizarPlantillas();
      renderizarResumen();
      return true;
    }

    async function accionTrabajo(accion, id) {
      var t = plantillasCache.find(function (x) {
        return x.id === id;
      });
      if (!t) return;
      var saldo = Math.max((t.total || 0) - (t.sena || 0), 0);

      if (accion === "lista") {
        await actualizarTrabajo(id, { estado: "lista" });
      } else if (accion === "avisar") {
        var msg =
          "Hola " + (t.nombre || "") + "! Tus plantillas ya están listas para retirar en Gauss Ortopedia (27 de febrero 1724, Rosario). " +
          "Horarios: Lunes a Viernes de 9:30 a 13 hs. y de 15 a 18 hs, Sábados 9:30 a 13 hs. " +
          (saldo > 0 ? "Saldo a abonar: " + formatearPrecio(saldo) + ". " : "") + "¡Te esperamos!";
        window.open(linkWhatsApp(t.telefono, msg), "_blank");
        await actualizarTrabajo(id, { avisado_listo: true });
      } else if (accion === "pago") {
        var resp = window.prompt("Falta abonar " + formatearPrecio(saldo) + ".\n¿Cuánto pagó ahora? ($)", String(saldo));
        if (resp === null) return;
        var monto = parseInt(String(resp).replace(/\D/g, ""), 10);
        if (isNaN(monto) || monto <= 0) {
          alert("El monto no es válido.");
          return;
        }
        await actualizarTrabajo(id, { sena: Math.min((t.sena || 0) + monto, t.total || 0) });
      } else if (accion === "entregada") {
        var cambios = { estado: "entregada", entregada_en: new Date().toISOString() };
        if (saldo > 0) {
          if (!confirm("Todavía falta abonar " + formatearPrecio(saldo) + ".\n\nAceptar = lo cobraste ahora y se marca como entregada y pagada.\nCancelar = no marcar como entregada.")) return;
          cambios.sena = t.total;
        }
        await actualizarTrabajo(id, cambios);
      } else if (accion === "cancelar") {
        if (!confirm("¿Cancelar el trabajo de " + nombreTrabajo(t) + "?")) return;
        await actualizarTrabajo(id, { estado: "cancelada" });
      } else if (accion === "borrar") {
        if (!confirm("¿Borrar el trabajo de " + nombreTrabajo(t) + "? No se puede deshacer.")) return;
        var rb = await db.from("trabajos_plantillas").delete().eq("id", id).select();
        if (rb.error || !rb.data || rb.data.length === 0) {
          alert("No se pudo borrar" + (rb.error ? ": " + rb.error.message : "."));
          return;
        }
        plantillasCache = plantillasCache.filter(function (x) {
          return x.id !== id;
        });
        renderizarPlantillas();
        renderizarResumen();
      }
    }

    // Crea un trabajo (desde el formulario de la pestaña o desde un presupuesto)
    async function crearTrabajo(datos) {
      datos.estado = datos.estado || "en_fabricacion";
      var r = await db.from("trabajos_plantillas").insert(datos).select();
      if (r.error || !r.data || r.data.length === 0) {
        return { ok: false, motivo: r.error ? r.error.message : "no se guardó ningún dato (¿venció la sesión?)." };
      }
      plantillasCache.unshift(r.data[0]);
      try {
        await guardarContactoDePedido(datos);
      } catch (e) {
        /* el contacto es un extra: si falla, el trabajo igual quedó guardado */
      }
      renderizarPlantillas();
      renderizarResumen();
      return { ok: true };
    }

    function recalcularEntregaNuevoTrabajo() {
      var ini = document.getElementById("ntInicio").value;
      var e = window.GaussPresupuesto ? window.GaussPresupuesto.calcularEntrega(ini) : null;
      document.getElementById("ntEntrega").textContent = e ? "Entrega estimada: " + formatearFecha(e.desdeISO) + " al " + formatearFecha(e.hastaISO) : "";
    }

    function abrirNuevoTrabajo() {
      ["ntNombre", "ntApellido", "ntDni", "ntTelefono", "ntDescripcion", "ntTotal", "ntSena", "ntNotas"].forEach(function (id) {
        document.getElementById(id).value = "";
      });
      document.getElementById("ntInicio").value = hoyLocalISO();
      document.getElementById("ntAviso").classList.add("d-none");
      recalcularEntregaNuevoTrabajo();
      document.getElementById("panelNuevoTrabajo").classList.remove("d-none");
      document.getElementById("ntNombre").focus();
    }

    async function guardarNuevoTrabajo() {
      var aviso = document.getElementById("ntAviso");
      function error(m) {
        aviso.textContent = m;
        aviso.classList.remove("d-none");
      }
      var nombre = document.getElementById("ntNombre").value.trim();
      var descripcion = document.getElementById("ntDescripcion").value.trim();
      var total = parseInt(document.getElementById("ntTotal").value, 10);
      var sena = parseInt(document.getElementById("ntSena").value, 10) || 0;
      if (!nombre) return error("Completá el nombre.");
      if (!descripcion) return error("Completá la descripción del trabajo.");
      if (isNaN(total) || total < 0) return error("Completá el total.");
      if (sena < 0 || sena > total) return error("La seña no puede ser mayor que el total.");
      var inicio = document.getElementById("ntInicio").value || hoyLocalISO();
      var e = window.GaussPresupuesto.calcularEntrega(inicio);
      var res = await crearTrabajo({
        nombre: nombre,
        apellido: document.getElementById("ntApellido").value.trim() || null,
        dni: document.getElementById("ntDni").value.trim() || null,
        telefono: document.getElementById("ntTelefono").value.trim() || null,
        descripcion: descripcion,
        total: total,
        sena: sena,
        fecha_inicio: inicio,
        entrega_desde: e.desdeISO,
        entrega_hasta: e.hastaISO,
        notas: document.getElementById("ntNotas").value.trim() || null,
      });
      if (!res.ok) return error("No se pudo guardar: " + res.motivo);
      document.getElementById("panelNuevoTrabajo").classList.add("d-none");
    }

    async function guardarPresupuestoComoTrabajo() {
      var aviso = document.getElementById("ppAviso");
      var ok = document.getElementById("ppOk");
      aviso.classList.add("d-none");
      ok.classList.add("d-none");
      var datos = window.GaussPresupuesto.datosParaTrabajo();
      if (datos.error) {
        aviso.textContent = datos.error;
        aviso.classList.remove("d-none");
        return;
      }
      if (!datos.nombre) {
        aviso.textContent = "Completá el nombre del cliente para guardar el trabajo.";
        aviso.classList.remove("d-none");
        return;
      }
      if (datos.sena > datos.total) {
        aviso.textContent = "La seña es mayor que el total de las plantillas del presupuesto.";
        aviso.classList.remove("d-none");
        return;
      }
      var res = await crearTrabajo(datos);
      if (!res.ok) {
        aviso.textContent = "No se pudo guardar el trabajo: " + res.motivo + " (¿corriste el SQL 8-plantillas?)";
        aviso.classList.remove("d-none");
        return;
      }
      ok.textContent = "✓ Trabajo guardado. Lo ves en la pestaña Plantillas.";
      ok.classList.remove("d-none");
      irATab("plantillas");
    }

    document.getElementById("btnNuevoTrabajo").addEventListener("click", abrirNuevoTrabajo);
    document.getElementById("btnCancelarTrabajo").addEventListener("click", function () {
      document.getElementById("panelNuevoTrabajo").classList.add("d-none");
    });
    document.getElementById("btnGuardarTrabajo").addEventListener("click", guardarNuevoTrabajo);
    document.getElementById("ntInicio").addEventListener("change", recalcularEntregaNuevoTrabajo);
    document.getElementById("filtroPlantillas").addEventListener("change", renderizarPlantillas);
    document.getElementById("buscadorPlantillas").addEventListener("input", renderizarPlantillas);
    document.getElementById("ppGuardarTrabajo").addEventListener("click", guardarPresupuestoComoTrabajo);
    listaPlantillas.addEventListener("click", function (evento) {
      var accion = evento.target.getAttribute("data-accion");
      var id = evento.target.getAttribute("data-id");
      if (accion && id) accionTrabajo(accion, id);
    });

    tablaCuerpo.addEventListener("change", async function (evento) {
      if (evento.target.classList.contains("selector-duracion")) {
        cambiarDuracion(evento.target.getAttribute("data-id"), parseInt(evento.target.value, 10));
        return;
      }
      if (!evento.target.classList.contains("selector-estado")) return;
      var id = evento.target.getAttribute("data-id");
      var nuevoEstado = evento.target.value;
      var pedido = pedidosCache.find(function (p) {
        return p.id === id;
      });
      var cambiosEstado = { estado: nuevoEstado };
      if (nuevoEstado === "activo") Object.assign(cambiosEstado, fechasSiFaltan(pedido));
      var resultado = await actualizarPedido(id, cambiosEstado);
      if (!resultado.ok) {
        alert("No se pudo cambiar el estado: " + resultado.motivo);
        cargarPedidos();
        return;
      }
      if (pedido) Object.assign(pedido, cambiosEstado);
      renderizarTabla();
      refrescarListasAlquiler();
    });

    [listaActivos, listaPorvencer, listaVencidos].forEach(function (contenedor) {
      contenedor.addEventListener("click", function (evento) {
        var id = evento.target.getAttribute("data-id");
        if (!id) return;
        if (evento.target.classList.contains("btn-enviar-recordatorio")) enviarRecordatorio(id);
        if (evento.target.classList.contains("btn-dar-de-baja")) darDeBaja(id);
        if (evento.target.classList.contains("btn-renovar-en-local")) renovarEnLocal(id);
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
