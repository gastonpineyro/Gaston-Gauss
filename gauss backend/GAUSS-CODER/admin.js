/* ============================================================
   ADMIN.JS — Panel de administración de Gauss Ortopedia
   Requiere haber creado un usuario en Supabase (Authentication >
   Users > Add user) con el email/contraseña que vas a usar acá.
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

    if (!GaussDB.configurado()) {
      if (avisoSinConfigurar) avisoSinConfigurar.classList.remove("d-none");
      if (formLogin) formLogin.classList.add("d-none");
      return;
    }

    var db = GaussDB.obtenerCliente();
    var pedidosCache = [];

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

    async function cargarPedidos() {
      tablaCuerpo.innerHTML = '<tr><td colspan="8" class="text-center py-4">Cargando pedidos...</td></tr>';
      var resultado = await db
        .from("pedidos")
        .select("*")
        .order("creado_en", { ascending: false });

      if (resultado.error) {
        tablaCuerpo.innerHTML =
          '<tr><td colspan="8" class="text-center py-4 text-danger">Error al cargar: ' +
          resultado.error.message +
          "</td></tr>";
        return;
      }
      pedidosCache = resultado.data;
      renderizarTabla();
    }

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
          '<tr><td colspan="8" class="text-center py-4">No hay pedidos con este filtro.</td></tr>';
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

          return (
            "<tr>" +
            "<td>" + fecha + "</td>" +
            '<td><span class="badge-tipo ' + badgeTipo + '">' + p.tipo + "</span></td>" +
            "<td>" + p.producto_nombre + " x" + p.cantidad + "</td>" +
            "<td>" + periodo + "</td>" +
            "<td>" + cliente + (p.dni ? " (DNI " + p.dni + ")" : "") + "</td>" +
            "<td>" + (p.direccion || "-") + (p.lesion ? "<br><small class='text-muted'>" + p.lesion + "</small>" : "") + "</td>" +
            "<td>" + formatearPrecio(p.total) + "</td>" +
            '<td><select class="form-select form-select-sm selector-estado" data-id="' + p.id + '">' +
            ['pendiente', 'confirmado', 'cancelado']
              .map(function (e) {
                return '<option value="' + e + '"' + (e === p.estado ? " selected" : "") + ">" + e + "</option>";
              })
              .join("") +
            "</select></td>" +
            "</tr>"
          );
        })
        .join("");
    }

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

    tablaCuerpo.addEventListener("change", async function (evento) {
      if (!evento.target.classList.contains("selector-estado")) return;
      var id = evento.target.getAttribute("data-id");
      var nuevoEstado = evento.target.value;
      await db.from("pedidos").update({ estado: nuevoEstado }).eq("id", id);
      var pedido = pedidosCache.find(function (p) {
        return p.id === id;
      });
      if (pedido) pedido.estado = nuevoEstado;
    });

    // Si ya había una sesión activa (recargó la página), la retomamos.
    db.auth.getSession().then(function (resultado) {
      if (resultado.data.session) mostrarPanel(resultado.data.session);
    });
  });
})();
