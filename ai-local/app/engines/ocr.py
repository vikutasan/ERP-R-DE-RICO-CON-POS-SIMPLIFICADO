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

    Las capturas de WhatsApp suelen tener texto claro sobre fondo oscuro.
    Se escala x2 (Tesseract lee mejor letras grandes) y se aplica
    autocontraste para separar el texto del fondo.
    """
    from PIL import ImageOps

    ancho, alto = imagen.size
    # Escalar x2 si la imagen es pequena (evita perder detalle).
    if ancho < 1200:
        imagen = imagen.resize((ancho * 2, alto * 2), Image.LANCZOS)

    imagen = ImageOps.autocontrast(imagen)
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

    # --psm 6: asume un bloque uniforme de texto (el caso de un chat).
    config = "--psm 6"
    texto = pytesseract.image_to_string(imagen, lang=IDIOMA_OCR, config=config)

    # Confianza promedio por palabra.
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
        logger.warning("No se pudo calcular confianza OCR: %s", exc)

    lineas = [ln.strip() for ln in texto.splitlines() if ln.strip()]

    logger.info("OCR: %d lineas, confianza %.2f", len(lineas), confianza)

    return {
        "texto": texto,
        "lineas": lineas,
        "confianza": confianza,
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
