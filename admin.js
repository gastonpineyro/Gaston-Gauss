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
    var listaEquipos = document.getElementById("listaEquipos");
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

    async function cargarPedidos() {
      tablaCuerpo.innerHTML = '<tr><td colspan="11" class="text-center py-4">Cargando pedidos...</td></tr>';
      var resultado = await db.from("pedidos").select("*").order("creado_en", { ascending: false });

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
          return p.producto_id === v.id && p.estado === "activo";
        }).length;
        return esStockBajo(v, ocupadas);
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
                return p.producto_id === v.id && p.estado === "activo";
              }).length
            );
          }, 0);

          var tarjetas = variantes
            .map(function (v) {
              var ocupadas = pedidosCache.filter(function (p) {
                return p.producto_id === v.id && p.estado === "activo";
              }).length;
              var disponibles = v.stock - ocupadas;
              var claseAlerta = disponibles <= 0 ? " stock-agotado" : esStockBajo(v, ocupadas) ? " stock-bajo" : "";

              return (
                '<div class="tarjeta-stock' + claseAlerta + '">' +
                '<div class="info-stock">' +
                "<h4>" + v.variante + "</h4>" +
                "<p>" + ocupadas + " ocupada" + (ocupadas === 1 ? "" : "s") + " ahora</p>" +
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

    function renderizarResumen() {
      var hoy = new Date();
      var inicioMes = hoy.getFullYear() + "-" + String(hoy.getMonth() + 1).padStart(2, "0") + "-01";
      var hace30Dias = new Date(hoy.getTime() - 30 * 86400000).toISOString();

      var pedidosDelMes = pedidosCache.filter(function (p) {
        return p.creado_en >= inicioMes;
      });
      var totalFacturadoMes = pedidosDelMes.reduce(function (acc, p) {
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

      var tarjetas = [
        { titulo: "Pedidos este mes", valor: pedidosDelMes.length, nota: ventasMes + " ventas · " + alquileresMes + " alquileres" },
        { titulo: "Facturado este mes", valor: formatearPrecio(totalFacturadoMes), nota: "suma de todos los pedidos del mes" },
        { titulo: "Alquileres activos", valor: activosAhora, nota: "en la calle ahora mismo" },
        { titulo: "Vencidos sin devolver", valor: vencidosSinDevolver, nota: "necesitan seguimiento", alerta: vencidosSinDevolver > 0 },
        { titulo: "Comprobantes pendientes", valor: pendientesRevision, nota: "esperando tu revisión", alerta: pendientesRevision > 0 },
      ];

      grillaDashboard.innerHTML = tarjetas
        .map(function (t) {
          return (
            '<div class="tarjeta-dashboard' + (t.alerta ? " alerta" : "") + '">' +
            '<p class="titulo-tarjeta-dashboard">' + t.titulo + "</p>" +
            '<p class="valor-tarjeta-dashboard">' + t.valor + "</p>" +
            '<p class="nota-tarjeta-dashboard">' + t.nota + "</p>" +
            "</div>"
          );
        })
        .join("");

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
      var estadoFiltro = selectFiltroEstado.value;
      var tipoFiltro = selectFiltroTipo.value;
      var busqueda = (buscadorPedidos.value || "").trim().toLowerCase();

      var filas = pedidosCache.filter(function (p) {
        if (estadoFiltro !== "todos" && p.estado !== estadoFiltro) return false;
        if (tipoFiltro !== "todos" && p.tipo !== tipoFiltro) return false;
        if (busqueda) {
          var texto = [p.nombre, p.apellido, p.dni, p.telefono].filter(Boolean).join(" ").toLowerCase();
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
            "<tr>" +
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
        if (busqueda) {
          var texto = [p.nombre, p.apellido, p.dni, p.telefono].filter(Boolean).join(" ").toLowerCase();
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
            new Date(p.creado_en).toLocaleString("es-AR"),
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

      return (
        '<div class="tarjeta-vencimiento' + (dias <= 0 ? " vencido" : "") + '">' +
        '<div class="info-vencimiento" style="flex:1;">' +
        "<h4>" + p.producto_nombre + " — " + [p.nombre, p.apellido].filter(Boolean).join(" ") + " " + badgeEstado + "</h4>" +
        "<p>" + textoDiasRestantes(p.fecha_hasta) + " (" + formatearFecha(p.fecha_hasta) + ") · Tel: " + (p.telefono || "sin cargar") + textoAuto + "</p>" +
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
          var texto = [p.nombre, p.apellido, p.dni, p.telefono].filter(Boolean).join(" ").toLowerCase();
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
          var texto = [p.nombre, p.apellido, p.dni, p.telefono].filter(Boolean).join(" ").toLowerCase();
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
        "Tu alquiler es por " + (pedido.duracion_dias || "-") + " días, hasta el " + formatearFecha(pedido.fecha_hasta) + ". ¡Te esperamos!";

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
      var resultado = await actualizarPedido(id, { estado: "activo" });
      if (!resultado.ok) {
        alert("No se pudo activar el alquiler: " + resultado.motivo);
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
      var resultado = await db.from("equipos").select("*").order("id");
      if (resultado.error) {
        listaEquipos.innerHTML =
          '<p class="texto-vacio-admin">No se pudieron cargar los equipos: ' +
          escaparHtml(resultado.error.message) +
          " (¿ya corriste el SQL nuevo en Supabase?)</p>";
        return;
      }
      equiposCache = resultado.data;
      renderizarEquipos();
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
      resumenEquipos.textContent =
        "(" + equiposCache.length + " en total · " + enCalle + " alquilados · " + (equiposCache.length - enCalle) + " libres)";

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
            var estado = p
              ? '<span class="estado-equipo-alquilado">Alquilado</span>'
              : '<span class="estado-equipo-libre">Libre</span>';
            var cliente = p ? escaparHtml(nombreCliente(p)) + " · hasta " + formatearFecha(p.fecha_hasta) : "-";
            return (
              '<tr><td data-label="Código"><code>' + escaparHtml(e.id) + "</code></td>" +
              '<td data-label="Producto">' + escaparHtml(nombreVariante(e.variante_id)) + "</td>" +
              '<td data-label="Estado">' + estado + "</td>" +
              '<td data-label="Cliente / devuelve">' + cliente + "</td>" +
              '<td data-label="Acciones"><button type="button" class="btn-accion-admin retiro btn-etiqueta-equipo" data-equipo="' + escaparHtml(e.id) + '">QR</button> ' +
              '<button type="button" class="btn-accion-admin baja btn-eliminar-equipo" data-equipo="' + escaparHtml(e.id) + '">Eliminar</button></td></tr>'
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
          if (p.tipo !== "alquiler" || p.producto_id !== equipo.variante_id) return false;
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

      if (pedido) {
        resultadoEscaneo.innerHTML =
          '<div class="tarjeta-resultado-escaneo alquilado">' +
          "<div><code>" + escaparHtml(equipo.id) + "</code> · " + escaparHtml(nombreVariante(equipo.variante_id)) + "</div>" +
          '<div class="estado-equipo-alquilado my-1">Está ALQUILADO</div>' +
          "<div>Cliente: <strong>" + escaparHtml(nombreCliente(pedido)) + "</strong>" +
          (pedido.telefono ? " · " + escaparHtml(pedido.telefono) : "") + "</div>" +
          "<div>Período: " + formatearFecha(pedido.fecha_desde) + " → " + formatearFecha(pedido.fecha_hasta) + "</div>" +
          '<button type="button" class="btn-accion-admin baja mt-2 btn-baja-equipo" data-equipo="' + escaparHtml(equipo.id) + '">↩️ Dar de baja (devuelto)</button>' +
          "</div>";
        return;
      }

      var candidatos = pedidosCandidatos(equipo);
      var html =
        '<div class="tarjeta-resultado-escaneo libre">' +
        "<div><code>" + escaparHtml(equipo.id) + "</code> · " + escaparHtml(nombreVariante(equipo.variante_id)) + "</div>" +
        '<div class="estado-equipo-libre my-1">Está LIBRE — ¿a quién se lo entregás?</div>';

      if (candidatos.length === 0) {
        html +=
          '<p class="mb-0 text-secondary">No hay pedidos confirmados esperando este producto. ' +
          'Confirmá el pedido en la pestaña "Pedidos" y volvé a escanear.</p>';
      } else {
        if (candidatos.length > 3) {
          html +=
            '<input type="text" class="form-control form-control-sm campo-alquiler mb-2" id="buscadorCandidatos" ' +
            'placeholder="Buscar cliente por nombre, DNI o teléfono (' + candidatos.length + ' esperando)...">';
        }
        html += candidatos
          .map(function (p) {
            var textoBusqueda = [p.nombre, p.apellido, p.dni, p.telefono].filter(Boolean).join(" ").toLowerCase();
            return (
              '<div class="fila-candidato" data-texto="' + escaparHtml(textoBusqueda) + '"><div><strong>' + escaparHtml(nombreCliente(p)) + "</strong>" +
              (p.dni ? " · DNI " + escaparHtml(p.dni) : "") +
              (p.telefono ? " · " + escaparHtml(p.telefono) : "") +
              "<br><small>" + formatearFecha(p.fecha_desde) + " → " + formatearFecha(p.fecha_hasta) +
              (p.cantidad > 1 ? " · x" + p.cantidad : "") + "</small></div>" +
              '<button type="button" class="btn-accion-admin activar btn-alta-equipo" data-equipo="' + escaparHtml(equipo.id) +
              '" data-pedido="' + p.id + '">▶️ Entregar a este cliente</button></div>'
            );
          })
          .join("");
      }
      resultadoEscaneo.innerHTML = html + "</div>";
    }

    async function altaEquipo(codigo, pedidoId) {
      var resultado = await db.from("equipos").update({ pedido_id: pedidoId }).eq("id", codigo).select();
      if (resultado.error || !resultado.data || resultado.data.length === 0) {
        alert("No se pudo asignar el equipo" + (resultado.error ? ": " + resultado.error.message : "."));
        return;
      }
      var pedido = pedidosCache.find(function (p) {
        return p.id === pedidoId;
      });
      if (pedido && pedido.estado !== "activo") {
        var r = await actualizarPedido(pedidoId, { estado: "activo" });
        if (!r.ok) {
          await db.from("equipos").update({ pedido_id: null }).eq("id", codigo);
          alert("No se pudo activar el alquiler: " + r.motivo);
          await cargarPedidos();
          return;
        }
      }
      await cargarPedidos();
      resultadoEscaneo.innerHTML =
        '<div class="tarjeta-resultado-escaneo libre"><strong>✓ Alta hecha.</strong> ' + escaparHtml(codigo) +
        " quedó activo para " + escaparHtml(pedido ? nombreCliente(pedido) : "el cliente") + ".</div>";
    }

    async function bajaEquipo(codigo) {
      var equipo = equiposCache.find(function (e) {
        return e.id === codigo;
      });
      var pedidoId = equipo ? equipo.pedido_id : null;
      var pedido = pedidoId
        ? pedidosCache.find(function (p) {
            return p.id === pedidoId;
          })
        : null;

      var resultado = await db.from("equipos").update({ pedido_id: null }).eq("id", codigo).select();
      if (resultado.error || !resultado.data || resultado.data.length === 0) {
        alert("No se pudo dar de baja el equipo" + (resultado.error ? ": " + resultado.error.message : "."));
        return;
      }

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
      await cargarPedidos();
      resultadoEscaneo.innerHTML = '<div class="tarjeta-resultado-escaneo libre"><strong>' + escaparHtml(mensaje) + "</strong></div>";
    }

    async function liberarEquiposDePedido(pedidoId) {
      try {
        await db.from("equipos").update({ pedido_id: null }).eq("pedido_id", pedidoId);
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
      if (evento.target.classList.contains("btn-marcar-facturar")) marcarParaFacturar(id);
      if (evento.target.classList.contains("btn-quitar-facturar")) quitarParaFacturar(id);
    });

    listaParaFacturar.addEventListener("click", function (evento) {
      var id = evento.target.getAttribute("data-id");
      if (!id) return;
      if (evento.target.classList.contains("btn-quitar-facturar")) quitarParaFacturar(id);
    });


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
    if (listaEquipos) {
      listaEquipos.addEventListener("click", function (evento) {
        var codigo = evento.target.getAttribute("data-equipo");
        if (!codigo) return;
        if (evento.target.classList.contains("btn-etiqueta-equipo")) imprimirEtiquetas([codigo]);
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
        if (evento.target.classList.contains("btn-baja-equipo")) bajaEquipo(codigo);
      });
    }

    if (btnEnviarSheets) btnEnviarSheets.addEventListener("click", enviarAGoogleSheets);
    if (btnExportarFacturitas) btnExportarFacturitas.addEventListener("click", exportarFacturitas);
    if (btnConfirmarFacturados) btnConfirmarFacturados.addEventListener("click", confirmarFacturados);

    tablaCuerpo.addEventListener("change", async function (evento) {
      if (!evento.target.classList.contains("selector-estado")) return;
      var id = evento.target.getAttribute("data-id");
      var nuevoEstado = evento.target.value;
      var resultado = await actualizarPedido(id, { estado: nuevoEstado });
      if (!resultado.ok) {
        alert("No se pudo cambiar el estado: " + resultado.motivo);
        cargarPedidos();
        return;
      }
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
