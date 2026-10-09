#!/usr/bin/env python3
"""Consulta el catálogo público de La Rebaja y guarda data/scrapeado-hoy.csv.

Solo usa la biblioteca estándar. Revisa robots.txt antes de consultar,
se identifica con un User-Agent propio y espera 1,5 s entre consultas.
"""

import csv
import datetime
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from pathlib import Path

USER_AGENT = "RecetAppBot/0.1 (comparador de precios; jose.caro@plurum.co)"
BASE = "https://www.larebajavirtual.com"
BUSQUEDA = BASE + "/api/catalog_system/pub/products/search?ft={termino}&_from=0&_to=49"
FARMACIA = "La Rebaja"
PAUSA = 1.5
TERMINOS = [
    "losartan", "acetaminofen", "ibuprofeno", "atorvastatina", "metformina",
    "omeprazol", "loratadina", "amlodipino", "dolex", "advil",
]
SALIDA = Path(__file__).resolve().parent / "data" / "scrapeado-hoy.csv"
COLUMNAS = [
    "fecha", "farmacia", "principio_activo", "concentracion", "producto", "marca",
    "presentacion", "unidades", "precio", "precio_lista", "precio_unidad", "url",
]

# Combinaciones de sustancias en el nombre: "+", "/" o "HCT".
COMBINACION = re.compile(r"[+/]|\bHCT\b")
# Formas líquidas, por palabra en el nombre, el contenido o la unidad de medida.
LIQUIDO = re.compile(
    r"\b(JARABE|SUSPENSI[OÓ]N|SOLUCI[OÓ]N|GOTAS|ELIXIR|EMULSI[OÓ]N|"
    r"INYECTABLE|AMPOLLAS?|VIAL|ML|CC)\b",
    re.IGNORECASE,
)
CONCENTRACION = re.compile(r"(\d+(?:[.,]\d+)?)\s*(MCG|MG|G|UI|%)(?![A-Z])", re.IGNORECASE)
UNIDADES_EN_TEXTO = re.compile(r"\bX\s*(\d+)\b", re.IGNORECASE)


def descargar(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def cargar_robots():
    rp = urllib.robotparser.RobotFileParser()
    rp.parse(descargar(BASE + "/robots.txt").splitlines())
    return rp


def primero(producto, campo):
    """Los campos de especificación de VTEX vienen como listas; devuelve el primer valor."""
    valor = producto.get(campo)
    if isinstance(valor, list):
        return valor[0].strip() if valor else ""
    return (valor or "").strip()


def motivo_descarte(producto, principios):
    nombre = producto.get("productName", "")
    if len(principios) != 1:
        return "sin principio activo" if not principios else "combinación (principio activo)"
    if COMBINACION.search(nombre):
        return "combinación (nombre)"
    formas = " ".join([nombre, primero(producto, "Contenido"), primero(producto, "Unidadmedida"),
                       primero(producto, "Presentacionunidadmedida")])
    if LIQUIDO.search(formas):
        return "forma líquida"
    return None


def principios_activos(producto):
    # Viene como lista, pero las combinaciones llegan en un solo texto: ["LOSARTAN, HIDROCLOROTIAZIDA"].
    partes = []
    for valor in producto.get("Principio activo") or []:
        partes += [p.strip().upper() for p in re.split(r"[,;]| Y ", valor) if p.strip()]
    return partes


def unidades(producto, presentacion):
    cantidad = primero(producto, "Cantidadunidadesmedida")
    try:
        n = float(cantidad.replace(",", "."))
        if n > 0:
            return int(n) if n.is_integer() else n
    except ValueError:
        pass
    for texto in (presentacion, producto.get("productName", "")):
        m = UNIDADES_EN_TEXTO.search(texto)
        if m:
            return int(m.group(1))
    return None


def concentracion(nombre):
    m = CONCENTRACION.search(nombre)
    return f"{m.group(1).replace(',', '.')} {m.group(2).upper()}" if m else ""


def filas_de(producto, fecha):
    principios = principios_activos(producto)
    motivo = motivo_descarte(producto, principios)
    if motivo:
        return [], motivo

    nombre = producto["productName"].strip()
    presentacion = primero(producto, "Presentacionunidadmedida")
    n = unidades(producto, presentacion)
    if not n:
        return [], "sin unidades"

    filas = []
    for item in producto.get("items", []):
        if not item.get("sellers"):
            continue
        oferta = item["sellers"][0]["commertialOffer"]
        precio = oferta.get("Price") or 0
        if not oferta.get("IsAvailable") or precio <= 0:
            continue
        filas.append({
            "fecha": fecha,
            "farmacia": FARMACIA,
            "principio_activo": principios[0],
            "concentracion": concentracion(nombre),
            "producto": nombre,
            "marca": (producto.get("brand") or "").strip(),
            "presentacion": presentacion,
            "unidades": n,
            "precio": round(precio),
            "precio_lista": round(oferta.get("ListPrice") or 0),
            "precio_unidad": round(precio / n, 2),
            "url": producto.get("link", ""),
        })
    return filas, (None if filas else "no disponible")


def main():
    fecha = datetime.date.today().isoformat()
    robots = cargar_robots()
    filas, vistos, descartes = [], set(), {}

    for i, termino in enumerate(TERMINOS):
        url = BUSQUEDA.format(termino=urllib.parse.quote(termino))
        if not robots.can_fetch(USER_AGENT, url):
            print(f"robots.txt no permite consultar {url}; se omite.", file=sys.stderr)
            continue
        if i:
            time.sleep(PAUSA)
        try:
            productos = json.loads(descargar(url))
        except (urllib.error.URLError, json.JSONDecodeError) as e:
            print(f"Error consultando «{termino}»: {e}", file=sys.stderr)
            continue

        nuevas = 0
        for producto in productos:
            # La misma referencia puede salir en varias búsquedas (p. ej. «dolex» y «acetaminofen»).
            if producto.get("productId") in vistos:
                continue
            vistos.add(producto.get("productId"))
            encontradas, motivo = filas_de(producto, fecha)
            filas += encontradas
            nuevas += len(encontradas)
            if motivo:
                descartes.setdefault(motivo, []).append(producto.get("productName", "?"))
        aviso = " (tope de 50: puede haber más)" if len(productos) >= 50 else ""
        print(f"{termino}: {len(productos)} resultados, {nuevas} filas nuevas{aviso}")

    filas.sort(key=lambda f: (f["principio_activo"], f["concentracion"], f["precio_unidad"]))
    SALIDA.parent.mkdir(exist_ok=True)
    with SALIDA.open("w", newline="", encoding="utf-8") as f:
        escritor = csv.DictWriter(f, fieldnames=COLUMNAS)
        escritor.writeheader()
        escritor.writerows(filas)

    print(f"\n{len(filas)} filas guardadas en {SALIDA.relative_to(SALIDA.parent.parent)}")
    for motivo, nombres in sorted(descartes.items()):
        print(f"Descartados por {motivo}: {len(nombres)}")
        if "--detalle" in sys.argv:
            for nombre in nombres:
                print(f"   {nombre}")


if __name__ == "__main__":
    main()
