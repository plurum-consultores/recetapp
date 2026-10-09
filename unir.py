#!/usr/bin/env python3
"""Une data/base.csv y data/scrapeado-hoy.csv en data/precios.csv.

Si un producto de La Rebaja (misma url) está en los dos archivos, se queda
el de hoy. Si scrapeado-hoy.csv no existe, se usa solo base.csv.
"""

import csv
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
BASE = DATA / "base.csv"
HOY = DATA / "scrapeado-hoy.csv"
SALIDA = DATA / "precios.csv"
COLUMNAS = [
    "fecha", "farmacia", "principio_activo", "concentracion", "producto", "marca",
    "presentacion", "unidades", "precio", "precio_lista", "precio_unidad", "url",
]


def leer(ruta):
    with ruta.open(newline="", encoding="utf-8") as f:
        lector = csv.DictReader(f)
        if lector.fieldnames != COLUMNAS:
            raise SystemExit(f"{ruta.name} no tiene las columnas esperadas: {lector.fieldnames}")
        return list(lector)


def orden(fila):
    # Las filas sin precio por unidad van al final de su grupo.
    precio = fila["precio_unidad"]
    return (fila["principio_activo"], fila["concentracion"], precio == "", float(precio or 0))


def main():
    filas = leer(BASE)
    if HOY.exists():
        hoy = leer(HOY)
        urls_hoy = {f["url"] for f in hoy if f["farmacia"] == "La Rebaja"}
        reemplazadas = sum(1 for f in filas if f["farmacia"] == "La Rebaja" and f["url"] in urls_hoy)
        filas = [f for f in filas if not (f["farmacia"] == "La Rebaja" and f["url"] in urls_hoy)] + hoy
        print(f"base: {len(filas) - len(hoy) + reemplazadas} filas, hoy: {len(hoy)} filas, "
              f"{reemplazadas} de La Rebaja reemplazadas por las de hoy")
    else:
        print(f"No existe {HOY.name}; se usa solo {BASE.name}")

    filas.sort(key=orden)
    with SALIDA.open("w", newline="", encoding="utf-8") as f:
        escritor = csv.DictWriter(f, fieldnames=COLUMNAS)
        escritor.writeheader()
        escritor.writerows(filas)
    print(f"{len(filas)} filas guardadas en data/{SALIDA.name}")


if __name__ == "__main__":
    main()
