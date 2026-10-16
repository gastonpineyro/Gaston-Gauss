/* ============================================================
   Pestaña "Presupuesto" del panel de admin.
   Arma el presupuesto, calcula la entrega estimada de las plantillas
   (7 a 10 días hábiles) y descarga el PDF (con jsPDF).
   ============================================================ */
(function () {
  "use strict";

  var DIAS_MIN_PLANTILLAS = 7;
  var DIAS_MAX_PLANTILLAS = 10;

  // Feriados y días no laborables (AAAA-MM-DD) que no cuentan como días hábiles.
  // Actualizá esta lista cuando salga el calendario del año siguiente.
  var FERIADOS = [
    "2026-10-12", // Día de la Raza
    "2026-11-23", // Soberanía Nacional (trasladado)
    "2026-12-07", // Día no laborable con fines turísticos
    "2026-12-08", // Inmaculada Concepción
    "2026-12-25", // Navidad
    "2027-01-01", // Año Nuevo
  ];

  var DATOS_LOCAL = {
    nombre: "GAUSS Ortopedia",
    direccion: "27 de febrero 1724, Rosario",
    telefono: "+54 341 5641488",
    horarios: "Lun a Vie 9:30 a 13 y 15 a 18 hs · Sáb 9:30 a 13 hs",
  };

  var SUGERENCIAS = [
    "Plantillas ortopédicas (par)",
    "Equipo de Magnetoterapia - Con placas",
    "Equipo de Magnetoterapia - Con tubos",
    "Equipo de Magnetoterapia - Tubo y placas",
    "Muletas de aluminio regulables (par)",
    "Bota Walker inmovilizadora",
    "Silla de ruedas",
    "Andador",
    "Roll Out",
    "Eleva inodoro",
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function aISO(fecha) {
    var m = fecha.getMonth() + 1;
    var d = fecha.getDate();
    return fecha.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (d < 10 ? "0" : "") + d;
  }

  function hoyISO() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  }

  function fechaDeISO(iso) {
    var p = iso.split("-");
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), 12, 0, 0);
  }

  function formatearFecha(fecha) {
    var d = fecha.getDate();
    var m = fecha.getMonth() + 1;
    return (d < 10 ? "0" : "") + d + "/" + (m < 10 ? "0" : "") + m + "/" + fecha.getFullYear();
  }

  var DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

  function esHabil(fecha) {
    var dia = fecha.getDay();
    if (dia === 0 || dia === 6) return false;
    return FERIADOS.indexOf(aISO(fecha)) === -1;
  }

  // Suma N días hábiles (el día de inicio no cuenta; el 1.º hábil es el siguiente).
  function sumarDiasHabiles(inicio, n) {
    var f = new Date(inicio.getTime());
    var contados = 0;
    while (contados < n) {
      f.setDate(f.getDate() + 1);
      if (esHabil(f)) contados++;
    }
    return f;
  }

  function sumarDias(inicio, n) {
    var f = new Date(inicio.getTime());
    f.setDate(f.getDate() + n);
    return f;
  }

  function dinero(n) {
    return "$ " + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n || 0).replace(/ /g, " ");
  }

  function escaparHtml(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------------------- Items ---------------------- */

  var contenedorItems;

  function filaItem(datos) {
    datos = datos || {};
    var div = document.createElement("div");
    div.className = "fila-item-presupuesto";
    div.innerHTML =
      '<input type="text" class="form-control form-control-sm campo-alquiler pp-desc" list="ppSugerencias" placeholder="Producto o servicio" value="' + escaparHtml(datos.desc || "") + '">' +
      '<input type="number" min="1" class="form-control form-control-sm campo-alquiler pp-cant" value="' + (datos.cant || 1) + '" title="Cantidad">' +
      '<input type="number" min="0" class="form-control form-control-sm campo-alquiler pp-precio" placeholder="Precio unit. $" value="' + (datos.precio != null ? datos.precio : "") + '">' +
      '<label class="pp-plantilla"><input type="checkbox" class="pp-es-plantilla"' + (datos.plantilla ? " checked" : "") + "> Plantilla</label>" +
      '<span class="pp-subtotal">$ 0</span>' +
      '<button type="button" class="btn-accion-admin baja pp-quitar" title="Quitar">✕</button>';
    return div;
  }

  function leerItems() {
    var items = [];
    contenedorItems.querySelectorAll(".fila-item-presupuesto").forEach(function (fila) {
      var desc = fila.querySelector(".pp-desc").value.trim();
      var cant = Math.max(parseInt(fila.querySelector(".pp-cant").value, 10) || 1, 1);
      var precio = parseFloat(fila.querySelector(".pp-precio").value);
      if (isNaN(precio)) precio = 0;
      items.push({
        desc: desc,
        cant: cant,
        precio: precio,
        subtotal: cant * precio,
        plantilla: fila.querySelector(".pp-es-plantilla").checked,
        fila: fila,
      });
    });
    return items;
  }

  function leerSena() {
    var n = parseFloat($("ppSena").value);
    return isNaN(n) || n < 0 ? 0 : n;
  }

  function entregaEstimada() {
    var inicioISO = $("ppInicio").value || hoyISO();
    var inicio = fechaDeISO(inicioISO);
    return { desde: sumarDiasHabiles(inicio, DIAS_MIN_PLANTILLAS), hasta: sumarDiasHabiles(inicio, DIAS_MAX_PLANTILLAS) };
  }

  function textoEntrega(e) {
    return (
      "entre el " + DIAS_SEMANA[e.desde.getDay()] + " " + formatearFecha(e.desde) +
      " y el " + DIAS_SEMANA[e.hasta.getDay()] + " " + formatearFecha(e.hasta)
    );
  }

  function recalcular() {
    var items = leerItems();
    var total = 0;
    var hayPlantilla = false;
    items.forEach(function (it) {
      total += it.subtotal;
      it.fila.querySelector(".pp-subtotal").textContent = dinero(it.subtotal);
      if (it.plantilla) hayPlantilla = true;
    });
    $("ppTotal").textContent = dinero(total);
    var sena = leerSena();
    var cajaSaldo = $("ppSaldoCaja");
    if (sena > 0) {
      cajaSaldo.classList.remove("d-none");
      $("ppSenaTexto").textContent = dinero(sena);
      $("ppSaldo").textContent = dinero(Math.max(total - sena, 0));
    } else {
      cajaSaldo.classList.add("d-none");
    }
    var cajaEntrega = $("ppEntrega");
    if (hayPlantilla) {
      cajaEntrega.classList.remove("d-none");
      cajaEntrega.innerHTML = "📅 Entrega estimada de las plantillas: <strong>" + textoEntrega(entregaEstimada()) + "</strong> (" + DIAS_MIN_PLANTILLAS + " a " + DIAS_MAX_PLANTILLAS + " días hábiles).";
    } else {
      cajaEntrega.classList.add("d-none");
    }
    $("ppInicioCaja").classList.toggle("d-none", !hayPlantilla);
  }

  /* ---------------------- PDF ---------------------- */

  function generarPdf() {
    var aviso = $("ppAviso");
    aviso.classList.add("d-none");
    var items = leerItems().filter(function (it) {
      return it.desc;
    });
    if (items.length === 0) {
      aviso.textContent = "Agregá al menos un producto con su descripción.";
      aviso.classList.remove("d-none");
      return null;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      aviso.textContent = "No se pudo cargar el generador de PDF (revisá la conexión a internet y recargá la página).";
      aviso.classList.remove("d-none");
      return null;
    }

    var doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
    var W = 210;
    var M = 18;
    var rojo = [208, 79, 94];
    var gris = [90, 98, 106];
    var y = 20;

    // Encabezado: mismo logo que la página (GAUSS rojo en negrita y ORTOPEDIA gris azulado con letras separadas)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(25);
    doc.setTextColor(rojo[0], rojo[1], rojo[2]);
    doc.text("GAUSS", M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(115, 138, 155);
    doc.text("ORTOPEDIA", M + 0.3, y + 5.6, { charSpace: 1.1 });
    doc.setFontSize(8.5);
    doc.setTextColor(gris[0], gris[1], gris[2]);
    doc.text(DATOS_LOCAL.direccion + " · Tel. " + DATOS_LOCAL.telefono, M, y + 12);
    doc.text(DATOS_LOCAL.horarios, M, y + 16.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(40, 40, 40);
    doc.text("PRESUPUESTO", W - M, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(gris[0], gris[1], gris[2]);
    var fechaPres = $("ppFecha").value ? fechaDeISO($("ppFecha").value) : new Date();
    doc.text("Fecha: " + formatearFecha(fechaPres), W - M, y + 6, { align: "right" });
    var validez = parseInt($("ppValidez").value, 10);
    if (validez > 0) doc.text("Válido por " + validez + " días (hasta el " + formatearFecha(sumarDias(fechaPres, validez)) + ")", W - M, y + 10.5, { align: "right" });

    y += 23;
    doc.setDrawColor(rojo[0], rojo[1], rojo[2]);
    doc.setLineWidth(0.7);
    doc.line(M, y, W - M, y);
    y += 8;

    // Cliente
    var cliente = [$("ppNombre").value.trim(), $("ppApellido").value.trim()].filter(Boolean).join(" ");
    var datosCliente = [];
    if (cliente) datosCliente.push(["Cliente", cliente]);
    if ($("ppDni").value.trim()) datosCliente.push(["DNI", $("ppDni").value.trim()]);
    if ($("ppTelefono").value.trim()) datosCliente.push(["Teléfono", $("ppTelefono").value.trim()]);
    if ($("ppDireccion").value.trim()) datosCliente.push(["Dirección", $("ppDireccion").value.trim()]);
    doc.setFontSize(10);
    datosCliente.forEach(function (par) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 60);
      doc.text(par[0] + ":", M, y);
      doc.setFont("helvetica", "normal");
      doc.text(doc.splitTextToSize(par[1], W - 2 * M - 28), M + 24, y);
      y += 5.5;
    });
    if (datosCliente.length) y += 3;

    // Tabla
    var xCant = M + 100;
    var xPrecio = W - M - 38;
    var xSub = W - M;

    function encabezadoTabla() {
      doc.setFillColor(rojo[0], rojo[1], rojo[2]);
      doc.rect(M, y - 5, W - 2 * M, 7.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(255, 255, 255);
      doc.text("Descripción", M + 2, y);
      doc.text("Cant.", xCant, y, { align: "center" });
      doc.text("Precio unit.", xPrecio, y, { align: "right" });
      doc.text("Subtotal", xSub - 2, y, { align: "right" });
      y += 8;
    }
    encabezadoTabla();

    var total = 0;
    doc.setFontSize(10);
    items.forEach(function (it, i) {
      var lineas = doc.splitTextToSize(it.desc, 92);
      var alto = Math.max(lineas.length * 4.8, 6) + 3;
      if (y + alto > 262) {
        doc.addPage();
        y = 22;
        encabezadoTabla();
      }
      if (i % 2 === 0) {
        doc.setFillColor(247, 248, 250);
        doc.rect(M, y - 4.5, W - 2 * M, alto, "F");
      }
      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);
      doc.text(lineas, M + 2, y);
      doc.text(String(it.cant), xCant, y, { align: "center" });
      doc.text(dinero(it.precio), xPrecio, y, { align: "right" });
      doc.text(dinero(it.subtotal), xSub - 2, y, { align: "right" });
      total += it.subtotal;
      y += alto;
    });

    // Total
    y += 2;
    if (y > 250) {
      doc.addPage();
      y = 22;
    }
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(M, y - 3, W - M, y - 3);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(40, 40, 40);
    doc.text("TOTAL", xPrecio - 34, y + 3);
    doc.setTextColor(rojo[0], rojo[1], rojo[2]);
    doc.text(dinero(total), xSub - 2, y + 3, { align: "right" });
    y += 9;

    // Seña y saldo
    var sena = leerSena();
    if (sena > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(60, 60, 60);
      doc.text("Seña abonada", xPrecio - 34, y + 2);
      doc.text("- " + dinero(sena), xSub - 2, y + 2, { align: "right" });
      y += 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(rojo[0], rojo[1], rojo[2]);
      doc.text("FALTA ABONAR", xPrecio - 34, y + 2);
      doc.text(dinero(Math.max(total - sena, 0)), xSub - 2, y + 2, { align: "right" });
      y += 8;
    }
    y += 5;

    // Entrega estimada de plantillas
    if (items.some(function (it) { return it.plantilla; })) {
      if (y > 245) {
        doc.addPage();
        y = 22;
      }
      var e = entregaEstimada();
      var texto =
        "Entrega estimada de las plantillas: " + textoEntrega(e) + " (" + DIAS_MIN_PLANTILLAS + " a " + DIAS_MAX_PLANTILLAS + " días hábiles" +
        ($("ppInicioCaja").classList.contains("d-none") ? "" : ", contados desde el " + formatearFecha(fechaDeISO($("ppInicio").value || hoyISO()))) + ").";
      var lineasE = doc.splitTextToSize(texto, W - 2 * M - 8);
      var altoE = lineasE.length * 5 + 6;
      doc.setFillColor(253, 240, 242);
      doc.setDrawColor(rojo[0], rojo[1], rojo[2]);
      doc.setLineWidth(0.4);
      doc.roundedRect(M, y - 4, W - 2 * M, altoE, 2, 2, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      doc.text(lineasE, M + 4, y + 1.5);
      y += altoE + 4;
    }

    // Notas
    var notas = $("ppNotas").value.trim();
    if (notas) {
      if (y > 250) {
        doc.addPage();
        y = 22;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      doc.text("Observaciones", M, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(gris[0], gris[1], gris[2]);
      var lineasN = doc.splitTextToSize(notas, W - 2 * M);
      doc.text(lineasN, M, y);
    }

    // Pie en todas las páginas
    var paginas = doc.getNumberOfPages();
    for (var p = 1; p <= paginas; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("Presupuesto sujeto a disponibilidad de stock. Gauss Ortopedia · " + DATOS_LOCAL.direccion + " · " + DATOS_LOCAL.telefono, W / 2, 287, { align: "center" });
      if (paginas > 1) doc.text("Página " + p + " de " + paginas, W - M, 287, { align: "right" });
    }

    var nombreArchivo = "presupuesto" + (cliente ? "-" + cliente.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "") + "-" + aISO(fechaPres) + ".pdf";
    return { doc: doc, nombre: nombreArchivo };
  }

  function descargar() {
    var r = generarPdf();
    if (r) r.doc.save(r.nombre);
  }

  /* ---------------------- API para el resto del panel ---------------------- */

  // Entrega estimada (7 a 10 días hábiles) desde una fecha AAAA-MM-DD.
  function calcularEntrega(inicioISO) {
    var inicio = fechaDeISO(inicioISO || hoyISO());
    return {
      desdeISO: aISO(sumarDiasHabiles(inicio, DIAS_MIN_PLANTILLAS)),
      hastaISO: aISO(sumarDiasHabiles(inicio, DIAS_MAX_PLANTILLAS)),
    };
  }

  // Datos del presupuesto actual para guardarlos como trabajo de plantillas
  // (solo cuentan los productos marcados como "Plantilla").
  function datosParaTrabajo() {
    var items = leerItems().filter(function (it) {
      return it.desc && it.plantilla;
    });
    if (items.length === 0) return { error: "Marcá al menos un producto como \"Plantilla\" (con su descripción) para guardarlo como trabajo." };
    var inicioISO = $("ppInicio").value || hoyISO();
    var entrega = calcularEntrega(inicioISO);
    return {
      nombre: $("ppNombre").value.trim() || null,
      apellido: $("ppApellido").value.trim() || null,
      dni: $("ppDni").value.trim() || null,
      telefono: $("ppTelefono").value.trim() || null,
      direccion: $("ppDireccion").value.trim() || null,
      descripcion: items.map(function (it) { return it.cant + " × " + it.desc; }).join("; "),
      total: Math.round(items.reduce(function (a, it) { return a + it.subtotal; }, 0)),
      sena: Math.round(leerSena()),
      fecha_inicio: inicioISO,
      entrega_desde: entrega.desdeISO,
      entrega_hasta: entrega.hastaISO,
      notas: $("ppNotas").value.trim() || null,
    };
  }

  window.GaussPresupuesto = { calcularEntrega: calcularEntrega, datosParaTrabajo: datosParaTrabajo };

  /* ---------------------- Inicio ---------------------- */

  function limpiar() {
    ["ppNombre", "ppApellido", "ppDni", "ppTelefono", "ppDireccion", "ppNotas", "ppSena"].forEach(function (id) {
      $(id).value = "";
    });
    contenedorItems.innerHTML = "";
    contenedorItems.appendChild(filaItem());
    $("ppFecha").value = hoyISO();
    $("ppInicio").value = hoyISO();
    $("ppValidez").value = 7;
    $("ppAviso").classList.add("d-none");
    recalcular();
  }

  document.addEventListener("DOMContentLoaded", function () {
    contenedorItems = $("ppItems");
    if (!contenedorItems) return;

    var lista = $("ppSugerencias");
    lista.innerHTML = SUGERENCIAS.map(function (s) {
      return '<option value="' + escaparHtml(s) + '"></option>';
    }).join("");

    contenedorItems.addEventListener("input", function (e) {
      // Si el nombre dice "plantilla", se tilda sola la casilla (se puede destildar).
      if (e.target.classList.contains("pp-desc")) {
        var fila = e.target.closest(".fila-item-presupuesto");
        if (/plantilla/i.test(e.target.value)) fila.querySelector(".pp-es-plantilla").checked = true;
      }
      recalcular();
    });
    contenedorItems.addEventListener("change", recalcular);
    contenedorItems.addEventListener("click", function (e) {
      if (!e.target.classList.contains("pp-quitar")) return;
      var filas = contenedorItems.querySelectorAll(".fila-item-presupuesto");
      if (filas.length <= 1) {
        filas[0].querySelectorAll("input[type=text],input[type=number]").forEach(function (i) { i.value = ""; });
        filas[0].querySelector(".pp-cant").value = 1;
        filas[0].querySelector(".pp-es-plantilla").checked = false;
      } else {
        e.target.closest(".fila-item-presupuesto").remove();
      }
      recalcular();
    });

    $("ppAgregarItem").addEventListener("click", function () {
      contenedorItems.appendChild(filaItem());
      recalcular();
    });
    $("ppInicio").addEventListener("change", recalcular);
    $("ppSena").addEventListener("input", recalcular);
    $("ppDescargar").addEventListener("click", descargar);
    $("ppLimpiar").addEventListener("click", limpiar);

    limpiar();
  });
})();
