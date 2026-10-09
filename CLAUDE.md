# RecetApp

Web que compara precios de medicamentos entre farmacias de Colombia y muestra la opción más barata con la misma sustancia (principio activo).

## Reglas del proyecto

### Tecnología
- Sitio estático: solo HTML, CSS y JavaScript.
- Sin frameworks, sin librerías de build, sin paso de compilación, sin `npm`.
- Debe funcionar tal cual en GitHub Pages: rutas relativas, nada que dependa de un servidor.

### Idioma y moneda
- Todo el texto visible en español de Colombia.
- Precios en pesos colombianos (COP), con formato colombiano: `$12.500` (punto como separador de miles, sin decimales).

### Diseño
- Diseñado primero para celular (mobile-first); el escritorio es una mejora progresiva.

### Datos
- Los datos viven en `data/precios.csv` y se leen en el navegador (con `fetch`).
- Nunca inventes ni edites precios a mano. Si faltan datos, se muestra que faltan; no se rellenan.
- Cada precio que se muestre debe indicar la farmacia y la fecha del precio.

### Comparación
- Se compara por precio por unidad (tableta, cápsula, ml, etc.), no por precio de caja.
- Solo se comparan productos con la misma sustancia.

### Aviso obligatorio
Este texto debe estar siempre visible en el sitio:

> RecetApp compara precios; no reemplaza la indicación de tu médico o farmacéutico
