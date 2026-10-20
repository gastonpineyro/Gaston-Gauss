/* Buscador de productos: filtra las tarjetas mientras se escribe, con botón para borrar
   y (cuando hay ventas y alquileres juntos) botones Todo / Venta / Alquiler.
   Se activa solo en las páginas que tienen una .grilla-especialidades. */
(function () {
  "use strict";
  function normalizar(t) {
    return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  }
  document.addEventListener("DOMContentLoaded", function () {
    var grilla = document.querySelector(".grilla-especialidades");
    if (!grilla) return;
    var tarjetas = Array.prototype.slice.call(grilla.querySelectorAll(".tarjeta-producto"));
    if (tarjetas.length < 4) return;

    var tipos = tarjetas.map(function (t) {
      var e = t.querySelector(".etiqueta-modo");
      return e ? normalizar(e.textContent) : "";
    });
    var hayVenta = tipos.some(function (t) { return t.indexOf("venta") !== -1; });
    var hayAlquiler = tipos.some(function (t) { return t.indexOf("alquiler") !== -1; });
    var conChips = hayVenta && hayAlquiler;

    var caja = document.createElement("div");
    caja.className = "caja-buscador-productos";
    caja.innerHTML =
      '<div class="campo-buscador">' +
      '<svg class="icono-buscador" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
      '<input type="text" id="buscadorProductos" placeholder="¿Qué producto buscás?" aria-label="Buscar producto" autocomplete="off" enterkeyhint="search">' +
      '<button type="button" class="borrar-buscador d-none" id="borrarBuscador" aria-label="Borrar búsqueda">✕</button>' +
      '<ul class="sugerencias-buscador d-none" id="sugerenciasBuscador" role="listbox"></ul>' +
      "</div>" +
      (conChips
        ? '<div class="chips-buscador" role="group" aria-label="Filtrar por tipo">' +
          '<button type="button" class="chip-buscador activo" data-tipo="">Todo</button>' +
          '<button type="button" class="chip-buscador" data-tipo="venta">🛒 Venta</button>' +
          '<button type="button" class="chip-buscador" data-tipo="alquiler">🔁 Alquiler</button></div>'
        : "") +
      '<p class="resultado-buscador" id="resultadoBuscador" aria-live="polite"></p>' +
      '<p class="sin-resultados-productos d-none" id="sinResultadosProductos">No encontramos ese producto. <a href="Contacto.html">Escribinos</a> y te ayudamos.</p>';
    grilla.parentNode.insertBefore(caja, grilla);

    var textos = tarjetas.map(function (t) {
      var img = t.querySelector("img");
      return normalizar(t.textContent + " " + (img ? img.alt : ""));
    });
    var input = document.getElementById("buscadorProductos");
    var borrar = document.getElementById("borrarBuscador");
    var vacio = document.getElementById("sinResultadosProductos");
    var resultado = document.getElementById("resultadoBuscador");
    var tipoActivo = "";
    var lista = document.getElementById("sugerenciasBuscador");
    var indiceActivo = -1;
    var enlacesLista = [];

    function cerrarSugerencias() {
      lista.classList.add("d-none");
      lista.innerHTML = "";
      indiceActivo = -1;
      enlacesLista = [];
    }

    function resaltar(i) {
      enlacesLista.forEach(function (a, n) { a.classList.toggle("activa", n === i); });
      indiceActivo = i;
    }

    function mostrarSugerencias() {
      if (normalizar(input.value) === "") { cerrarSugerencias(); return; }
      var coincidencias = tarjetas.filter(function (t) { return !t.classList.contains("d-none"); }).slice(0, 6);
      if (coincidencias.length === 0) { cerrarSugerencias(); return; }
      lista.innerHTML = coincidencias.map(function (t) {
        var img = t.querySelector("img");
        var nombre = t.querySelector("h3");
        var etq = t.querySelector(".etiqueta-modo");
        return '<li role="option"><a href="' + t.getAttribute("href") + '">' +
          (img ? '<img src="' + img.getAttribute("src") + '" alt="">' : "") +
          '<span class="nombre-sugerencia">' + (nombre ? nombre.textContent : "") + "</span>" +
          (etq ? '<span class="etiqueta-sugerencia">' + etq.textContent + "</span>" : "") +
          "</a></li>";
      }).join("");
      enlacesLista = Array.prototype.slice.call(lista.querySelectorAll("a"));
      indiceActivo = -1;
      lista.classList.remove("d-none");
    }

    function filtrar() {
      var q = normalizar(input.value);
      var palabras = q ? q.split(/\s+/) : [];
      var visibles = 0;
      tarjetas.forEach(function (t, i) {
        var ok = palabras.every(function (p) { return textos[i].indexOf(p) !== -1; });
        if (ok && tipoActivo && tipos[i].indexOf(tipoActivo) === -1) ok = false;
        t.classList.toggle("d-none", !ok);
        if (ok) visibles++;
      });
      borrar.classList.toggle("d-none", input.value === "");
      vacio.classList.toggle("d-none", visibles > 0);
      mostrarSugerencias();
      resultado.textContent = q || tipoActivo ? (visibles > 0 ? visibles + (visibles === 1 ? " producto" : " productos") : "") : "";
    }

    // Los productos que se venden Y se alquilan abren la página mostrando solo la modalidad elegida
    var hrefs = tarjetas.map(function (t) { return t.getAttribute("href"); });
    function actualizarLinks() {
      tarjetas.forEach(function (t, i) {
        var ambos = tipos[i].indexOf("venta") !== -1 && tipos[i].indexOf("alquiler") !== -1;
        var base = hrefs[i].split("?")[0];
        t.setAttribute("href", ambos && tipoActivo ? base + "?modo=" + tipoActivo : base);
      });
    }

    input.addEventListener("input", filtrar);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { input.value = ""; filtrar(); return; }
      if (enlacesLista.length === 0) return;
      if (e.key === "ArrowDown") { e.preventDefault(); resaltar((indiceActivo + 1) % enlacesLista.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); resaltar((indiceActivo - 1 + enlacesLista.length) % enlacesLista.length); }
      else if (e.key === "Enter") {
        e.preventDefault();
        window.location.href = enlacesLista[indiceActivo >= 0 ? indiceActivo : 0].getAttribute("href");
      }
    });
    input.addEventListener("focus", function () { if (input.value) mostrarSugerencias(); });
    document.addEventListener("click", function (e) {
      if (!caja.contains(e.target)) cerrarSugerencias();
    });
    borrar.addEventListener("click", function () {
      input.value = "";
      filtrar();
      input.focus();
    });
    caja.addEventListener("click", function (e) {
      var chip = e.target.closest ? e.target.closest(".chip-buscador") : null;
      if (!chip) return;
      tipoActivo = chip.getAttribute("data-tipo") || "";
      caja.querySelectorAll(".chip-buscador").forEach(function (c) { c.classList.toggle("activo", c === chip); });
      filtrar();
      actualizarLinks();
    });

    // Si llegan con ?tipo=venta o ?tipo=alquiler, ese botón queda elegido
    var pedido = new URLSearchParams(window.location.search).get("tipo");
    if (conChips && (pedido === "venta" || pedido === "alquiler")) {
      var chipPedido = caja.querySelector('.chip-buscador[data-tipo="' + pedido + '"]');
      if (chipPedido) chipPedido.click();
    }
  });
})();
