/* Buscador de productos: filtra las tarjetas de la grilla mientras se escribe.
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

    var caja = document.createElement("div");
    caja.className = "caja-buscador-productos";
    caja.innerHTML =
      '<input type="search" id="buscadorProductos" class="form-control" placeholder="🔍 Buscar producto (ej: rodillera, muletas, silla)..." aria-label="Buscar producto" autocomplete="off">' +
      '<p class="sin-resultados-productos d-none" id="sinResultadosProductos">No encontramos ese producto. Escribinos por WhatsApp y te ayudamos.</p>';
    grilla.parentNode.insertBefore(caja, grilla);

    var textos = tarjetas.map(function (t) {
      var img = t.querySelector("img");
      return normalizar(t.textContent + " " + (img ? img.alt : ""));
    });
    var input = document.getElementById("buscadorProductos");
    var vacio = document.getElementById("sinResultadosProductos");

    function filtrar() {
      var q = normalizar(input.value);
      var palabras = q ? q.split(/\s+/) : [];
      var visibles = 0;
      tarjetas.forEach(function (t, i) {
        var ok = palabras.every(function (p) { return textos[i].indexOf(p) !== -1; });
        t.classList.toggle("d-none", !ok);
        if (ok) visibles++;
      });
      vacio.classList.toggle("d-none", visibles > 0);
    }
    input.addEventListener("input", filtrar);
  });
})();
