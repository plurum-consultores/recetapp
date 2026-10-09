"use strict";

const ARCHIVO = "data/precios.csv";
const COLUMNAS = [
  "fecha", "farmacia", "principio_activo", "concentracion", "producto", "marca",
  "presentacion", "unidades", "precio", "precio_lista", "precio_unidad", "url",
];
const MINIMO_LETRAS = 2;

const $busqueda = document.getElementById("busqueda");
const $estado = document.getElementById("estado");
const $resultados = document.getElementById("resultados");
const $fechaDatos = document.getElementById("fecha-datos");
const $sugerencias = document.getElementById("sugerencias");

let productos = [];
let grupos = new Map();

// ---------- Lectura del CSV ----------

// Respeta campos entre comillas con comas, comillas escapadas ("") y saltos de línea.
function leerCSV(texto) {
  const filas = [];
  let fila = [];
  let campo = "";
  let entreComillas = false;
  texto = texto.replace(/^\uFEFF/, "");

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else entreComillas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === ",") {
      fila.push(campo); campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      filas.push(fila); fila = [];
    } else {
      campo += c;
    }
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((v) => v.trim() !== ""));
}

function aObjetos(filas) {
  const [encabezado, ...datos] = filas;
  const faltan = COLUMNAS.filter((c) => !encabezado.includes(c));
  if (faltan.length) throw new Error(`Al archivo de precios le faltan columnas: ${faltan.join(", ")}`);
  return datos.map((valores) => Object.fromEntries(encabezado.map((c, i) => [c, (valores[i] || "").trim()])));
}

// ---------- Utilidades ----------

function normalizar(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function numero(valor) {
  const n = parseFloat(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pesos(n) {
  return "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function fechaLarga(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d) return iso;
  return new Date(a, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}

// Pasa la concentración a miligramos para ordenar los grupos de menor a mayor.
function valorConcentracion(texto) {
  const m = /^([\d.]+)\s*(MCG|MG|G|UI|%)$/i.exec(texto);
  if (!m) return Infinity;
  const factor = { MCG: 0.001, MG: 1, G: 1000 }[m[2].toUpperCase()];
  return factor ? parseFloat(m[1]) * factor : 1e9 + parseFloat(m[1]);
}

function elemento(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

// ---------- Datos ----------

function prepararDatos(filas) {
  productos = filas.map((p) => ({
    ...p,
    precioNum: numero(p.precio),
    unidadNum: numero(p.precio_unidad),
    clave: `${p.principio_activo}|${p.concentracion}`,
    texto: normalizar([p.producto, p.marca, p.principio_activo, p.concentracion].join(" ")),
  }));

  grupos = new Map();
  for (const p of productos) {
    if (!grupos.has(p.clave)) grupos.set(p.clave, []);
    grupos.get(p.clave).push(p);
  }
  for (const lista of grupos.values()) {
    lista.sort((a, b) => (a.unidadNum ?? Infinity) - (b.unidadNum ?? Infinity));
  }

  const fechas = [...new Set(productos.map((p) => p.fecha).filter(Boolean))].sort();
  $fechaDatos.textContent = !fechas.length
    ? "Fecha de los precios no disponible"
    : fechas.length === 1
      ? `Precios del ${fechaLarga(fechas[0])}`
      : `Precios del ${fechaLarga(fechas[0])} al ${fechaLarga(fechas[fechas.length - 1])}`;
}

// ---------- Búsqueda y resultados ----------

function buscar(consulta) {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  const coinciden = new Set(productos.filter((p) => palabras.every((w) => p.texto.includes(w))));

  const claves = [...new Set([...coinciden].map((p) => p.clave))];
  claves.sort((a, b) => {
    const [pa, ca] = a.split("|");
    const [pb, cb] = b.split("|");
    return pa.localeCompare(pb, "es") || valorConcentracion(ca) - valorConcentracion(cb);
  });
  return { coinciden, claves };
}

function tarjeta(p, { masBarata, coincide }) {
  const li = elemento("li", "tarjeta" + (masBarata ? " mas-barata" : ""));

  if (masBarata || coincide) {
    const etiquetas = elemento("div", "etiquetas");
    if (masBarata) etiquetas.append(elemento("span", "etiqueta barata", "Más barata"));
    if (coincide) etiquetas.append(elemento("span", "etiqueta coincide", "Coincide con tu búsqueda"));
    li.append(etiquetas);
  }

  li.append(
    elemento("p", "farmacia", p.farmacia),
    elemento("p", "producto", p.producto),
    elemento("p", "detalle", [p.marca && `Marca: ${p.marca}`, p.presentacion].filter(Boolean).join(" · ")),
  );

  const precios = elemento("div", "precios");
  const unidad = elemento("span", "precio-unidad");
  if (p.unidadNum) {
    unidad.append(pesos(p.unidadNum), " ", elemento("small", "", "por unidad"));
  } else {
    unidad.append(elemento("small", "", "Sin precio por unidad"));
  }
  precios.append(unidad, elemento("span", "precio-total", p.precioNum ? `${pesos(p.precioNum)} la presentación` : "Precio no disponible"));
  li.append(precios);

  const pie = elemento("div", "pie-tarjeta");
  pie.append(elemento("span", "", `${p.farmacia} · precio del ${fechaLarga(p.fecha)}`));
  if (/^https?:\/\//.test(p.url)) {
    const enlace = elemento("a", "", "Ver en la farmacia");
    enlace.href = p.url;
    enlace.target = "_blank";
    enlace.rel = "noopener noreferrer";
    pie.append(enlace);
  }
  li.append(pie);
  return li;
}

function grupoHTML(clave, coinciden) {
  const [principio, concentracion] = clave.split("|");
  const lista = grupos.get(clave);
  const comparable = concentracion !== "";
  // Solo hay "más barata" si al menos dos productos tienen precio por unidad.
  const conPrecio = lista.filter((p) => p.unidadNum !== null);
  const minimo = comparable && conPrecio.length > 1 ? Math.min(...conPrecio.map((p) => p.unidadNum)) : Infinity;

  const seccion = elemento("section", "grupo");
  const titulo = elemento("h2", "grupo-titulo", principio + " · ");
  titulo.append(elemento("span", "concentracion", concentracion || "Concentración no indicada"));
  seccion.append(titulo);

  const farmacias = new Set(lista.map((p) => p.farmacia)).size;
  seccion.append(elemento("p", "grupo-nota", comparable
    ? `${lista.length} ${lista.length === 1 ? "producto" : "productos"} en ${farmacias} ${farmacias === 1 ? "farmacia" : "farmacias"}, de menor a mayor precio por unidad.`
    : "Los datos no indican la concentración de estos productos, así que no se comparan entre sí."));

  // La etiqueta "Coincide" solo aporta si el grupo mezcla productos buscados y alternativas.
  const todasCoinciden = lista.every((p) => coinciden.has(p));
  const ul = elemento("ul", "tarjetas");
  for (const p of lista) {
    // Empates: se resaltan todas las que tienen el precio por unidad más bajo.
    const masBarata = Number.isFinite(minimo) && p.unidadNum !== null && Math.abs(p.unidadNum - minimo) < 0.005;
    ul.append(tarjeta(p, { masBarata, coincide: !todasCoinciden && coinciden.has(p) }));
  }
  seccion.append(ul);
  return seccion;
}

function mostrar() {
  const consulta = $busqueda.value.trim();
  $resultados.replaceChildren();
  $estado.classList.remove("error");

  if (normalizar(consulta).replace(/\s/g, "").length < MINIMO_LETRAS) {
    $estado.textContent = `Escribe al menos ${MINIMO_LETRAS} letras para buscar entre ${productos.length} productos.`;
    $sugerencias.hidden = false;
    return;
  }
  $sugerencias.hidden = true;

  const { coinciden, claves } = buscar(consulta);
  if (!claves.length) {
    $estado.textContent = `No encontramos «${consulta}». Prueba con el principio activo, por ejemplo «acetaminofén».`;
    return;
  }

  $estado.textContent = `${coinciden.size} ${coinciden.size === 1 ? "producto coincide" : "productos coinciden"} · ` +
    `${claves.length} ${claves.length === 1 ? "grupo" : "grupos"} por principio activo y concentración`;
  const fragmento = document.createDocumentFragment();
  for (const clave of claves) fragmento.append(grupoHTML(clave, coinciden));
  $resultados.append(fragmento);
}

// ---------- Inicio ----------

let espera;
$busqueda.addEventListener("input", () => {
  clearTimeout(espera);
  espera = setTimeout(mostrar, 150);
});
document.getElementById("buscador").addEventListener("submit", (e) => {
  e.preventDefault();
  mostrar();
});
$sugerencias.addEventListener("click", (e) => {
  const boton = e.target.closest("button[data-busqueda]");
  if (!boton) return;
  $busqueda.value = boton.dataset.busqueda;
  mostrar();
  $busqueda.focus();
});

async function iniciar() {
  try {
    const respuesta = await fetch(ARCHIVO, { cache: "no-cache" });
    if (!respuesta.ok) throw new Error(`No se pudo leer ${ARCHIVO} (error ${respuesta.status}).`);
    prepararDatos(aObjetos(leerCSV(await respuesta.text())));
    $busqueda.disabled = false;
    $busqueda.focus();
    mostrar();
  } catch (error) {
    $fechaDatos.textContent = "No se pudieron cargar los precios.";
    $estado.classList.add("error");
    $estado.textContent = location.protocol === "file:"
      ? "Abre RecetApp desde un servidor (por ejemplo, python3 -m http.server); el navegador no deja leer el archivo de precios con doble clic."
      : `No se pudieron cargar los precios. ${error.message}`;
  }
}

iniciar();
