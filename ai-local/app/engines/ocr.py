"""Motor de OCR — lectura de texto en capturas de pantalla.

Este motor resuelve un problema DISTINTO al de vision.py:

    vision.py (YOLO) -> "¿CUANTOS panes hay?"      (conteo de objetos)
    ocr.py (Tesseract) -> "¿QUE DICE el texto?"    (lectura de caracteres)

Se usa para leer capturas de pantalla de WhatsApp: el encabezado (nombre o
telefono del cliente) y el cuerpo (el pedido escrito por el cliente).

REGLA (spec §5.2): este motor PROPONE. Nunca registra pedidos ni stock.
La IA extrae texto; el humano confirma en la UI antes de guardar.
"""

import base64
import io
import logging
import re
from typing import Optional

from PIL import Image

logger = logging.getLogger("rderico.ia.motor.ocr")

# Idioma: español. El binario tesseract-ocr-spa lo provee (Dockerfile).
IDIOMA_OCR = "spa"


def _decodificar_imagen(imagen_base64: str) -> Image.Image:
    """Convierte base64 -> objeto PIL Image en escala de grises.

    El OCR funciona mejor en escala de grises; el color no aporta y
    triplica el tiempo de proceso.
    """
    datos = base64.b64decode(imagen_base64)
    imagen = Image.open(io.BytesIO(datos)).convert("L")
    return imagen


def _preprocesar(imagen: Image.Image) -> Image.Image:
    """Mejora la legibilidad para el OCR.

    Las capturas de WhatsApp pueden venir en dos variantes:
      - Tema CLARO: texto oscuro sobre fondo blanco.
      - Tema OSCURO: texto claro sobre fondo casi negro.

    Tesseract asume SIEMPRE texto oscuro sobre fondo claro. Si la captura
    viene en tema oscuro y no se invierte, el OCR devuelve basura o nada.
    Por eso se detecta el brillo promedio y se invierte cuando hace falta.

    Pasos:
      1. Escalar x2 si la imagen es pequena (Tesseract lee mejor letras grandes).
      2. Detectar tema (oscuro/claro) por brillo promedio y normalizar a
         texto oscuro sobre fondo claro.
      3. Autocontraste para separar el texto del fondo.
      4. Binarizar (umbral) para eliminar el ruido de compresion JPEG.
    """
    from PIL import ImageOps

    ancho, alto = imagen.size
    # Escalar x2 si la imagen es pequena (evita perder detalle).
    if ancho < 1200:
        imagen = imagen.resize((ancho * 2, alto * 2), Image.LANCZOS)

    # --- Deteccion de tema ---
    # El histograma de una captura de chat es bimodal: fondo + texto.
    # Si la MEDIANA de brillo es baja (<128), el fondo es oscuro y hay que
    # invertir para que Tesseract vea texto oscuro sobre fondo claro.
    histograma = imagen.histogram()
    total_px = sum(histograma) or 1
    acumulado = 0
    mediana = 128
    for valor, cuenta in enumerate(histograma):
        acumulado += cuenta
        if acumulado >= total_px / 2:
            mediana = valor
            break
    if mediana < 128:
        imagen = ImageOps.invert(imagen)

    imagen = ImageOps.autocontrast(imagen)

    # --- Binarizacion ---
    # Umbral fijo 160: por debajo -> negro (texto), por encima -> blanco.
    # Elimina el ruido de compresion de WhatsApp, que es lo que mas confunde
    # a Tesseract en capturas de pantalla.
    imagen = imagen.point(lambda px: 255 if px > 160 else 0, mode="1")
    return imagen


def extraer_texto(imagen_base64: str) -> dict:
    """Extrae el texto crudo de una imagen.

    Devuelve un dict con:
        - texto: el texto completo detectado (saltos de linea preservados)
        - lineas: lista de lineas no vacias
        - confianza: confianza promedio del OCR (0..1)
        - motor: "tesseract"

    NO interpreta el pedido. Eso lo hace el LLM (nlu.py) en un paso aparte.
    """
    try:
        import pytesseract
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "pytesseract no instalado. Revisar requirements.txt del motor de IA."
        ) from exc

    imagen = _decodificar_imagen(imagen_base64)
    imagen = _preprocesar(imagen)

    # --- Estrategia multi-PSM ---
    # No existe un unico --psm que funcione para todas las capturas:
    #   --psm 6 : bloque uniforme de texto (chat tipico)
    #   --psm 4 : columnas de texto de tamano variable (burbujas)
    #   --psm 3 : segmentacion automatica (fallback general)
    # Se prueban los tres y se elige el que devuelva MAS texto util.
    # Esto es lo que convierte "no reconocio nada" en "leyo el pedido".
    configuraciones = ("--psm 6", "--psm 4", "--psm 3")

    mejor_texto = ""
    mejor_lineas: list[str] = []
    mejor_confianza = 0.0

    for config in configuraciones:
        try:
            texto = pytesseract.image_to_string(
                imagen, lang=IDIOMA_OCR, config=config
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("OCR fallo con %s: %s", config, exc)
            continue

        lineas = [ln.strip() for ln in texto.splitlines() if ln.strip()]

        # Confianza promedio por palabra para esta configuracion.
        confianza = 0.0
        try:
            datos = pytesseract.image_to_data(
                imagen, lang=IDIOMA_OCR, config=config,
                output_type=pytesseract.Output.DICT,
            )
            confs = [
                float(c) for c in datos.get("conf", [])
                if str(c).strip() not in ("", "-1")
            ]
            if confs:
                confianza = round(sum(confs) / len(confs) / 100.0, 3)
        except Exception as exc:  # noqa: BLE001
            logger.warning("No se pudo calcular confianza OCR (%s): %s", config, exc)

        # Criterio de seleccion: primero cantidad de lineas utiles, luego
        # confianza. Una captura de chat con 8 lineas legibles es mejor que
        # una con 2 lineas de alta confianza.
        puntaje = (len(lineas), confianza)
        mejor_puntaje = (len(mejor_lineas), mejor_confianza)
        if puntaje > mejor_puntaje:
            mejor_texto = texto
            mejor_lineas = lineas
            mejor_confianza = confianza

    logger.info(
        "OCR: %d lineas, confianza %.2f (mejor de %d configuraciones)",
        len(mejor_lineas), mejor_confianza, len(configuraciones),
    )

    return {
        "texto": mejor_texto,
        "lineas": mejor_lineas,
        "confianza": mejor_confianza,
        "motor": "tesseract",
    }


# ─── Heuristica de encabezado (cliente) ───────────────────────────────────────
# El encabezado de un chat de WhatsApp muestra el nombre o el telefono.
# Esta heuristica PROPONE un candidato; el match definitivo lo hace el backend
# contra el directorio de clientes (cascada D-10).

_RE_TELEFONO = re.compile(r"(\+?\d[\d\s\-()]{8,}\d)")


def extraer_candidato_cliente(lineas: list[str]) -> dict:
    """Propone un cliente a partir de las primeras lineas del OCR.

    Devuelve {nombre: str|None, telefono: str|None}. Es una PROPUESTA:
    el backend la valida contra el directorio (telefono -> nombre exacto ->
    fuzzy -> manual).
    """
    if not lineas:
        return {"nombre": None, "telefono": None}

    # Buscar un telefono en las primeras 5 lineas (el encabezado).
    telefono = None
    for linea in lineas[:5]:
        m = _RE_TELEFONO.search(linea)
        if m:
            digitos = "".join(ch for ch in m.group(1) if ch.isdigit())
            if len(digitos) >= 10:
                telefono = digitos[-10:]
                break

    # El nombre suele ser la primera linea que no sea hora ni telefono.
    nombre = None
    for linea in lineas[:5]:
        limpia = linea.strip()
        if not limpia:
            continue
        if _RE_TELEFONO.search(limpia):
            continue
        # Descartar lineas que son solo hora ("12:34") o estado ("en linea").
        if re.fullmatch(r"\d{1,2}:\d{2}", limpia):
            continue
        if limpia.lower() in ("en linea", "escribiendo...", "online"):
            continue
        nombre = limpia
        break

    return {"nombre": nombre, "telefono": telefono}
