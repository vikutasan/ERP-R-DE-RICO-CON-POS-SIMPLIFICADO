"""Motor de vision — conteo de objetos con YOLOv8.

Este motor resuelve el problema P2 del spec §3.2: "¿CUANTOS hay?".
El motor ORB del ERP resuelve P1: "¿QUE producto es?".

Son problemas distintos y viven en lugares distintos:
    P1 (identificacion) -> apps/api/modules/pos/service.py (ORB, ya existe)
    P2 (conteo)         -> este archivo (YOLO, nuevo)

REGLA (spec §5.2): este motor PROPONE. Nunca registra stock.
"""

import base64
import io
import logging
from typing import Optional

import numpy as np
from PIL import Image

from .. import schemas

logger = logging.getLogger("rderico.ia.motor.vision")

# Modelo cargado una sola vez (lo hace main.py en el lifespan)
_modelo = None


def cargar_modelo(nombre: str) -> None:
    """Carga el modelo YOLO en memoria.

    Se llama UNA vez al arrancar el contenedor. Cargarlo por request
    seria un desastre de rendimiento.
    """
    global _modelo  # noqa: PLW0603
    from ultralytics import YOLO

    _modelo = YOLO(nombre)
    logger.info("YOLO '%s' cargado.", nombre)


def _decodificar_imagen(imagen_base64: str) -> np.ndarray:
    """Convierte base64 -> array numpy RGB."""
    datos = base64.b64decode(imagen_base64)
    imagen = Image.open(io.BytesIO(datos)).convert("RGB")
    return np.array(imagen)


async def detectar(payload: schemas.VisionDetectRequest) -> schemas.VisionDetectResponse:
    """Detecta y cuenta objetos en la imagen.

    Devuelve `cantidad` (el conteo real) y `requiere_revision` si la
    confianza promedio cae bajo el umbral (spec §5.1: UI resalta en ambar).
    """
    if _modelo is None:
        raise RuntimeError("Modelo YOLO no cargado.")

    imagen = _decodificar_imagen(payload.imagen_base64)

    # inferencia
    resultados = _modelo.predict(imagen, verbose=False)
    if not resultados:
        return schemas.VisionDetectResponse()

    cajas = resultados[0].boxes
    detecciones: list[schemas.Deteccion] = []

    if cajas is not None and len(cajas) > 0:
        alto, ancho = imagen.shape[:2]
        for caja in cajas:
            conf = float(caja.conf[0])
            clase_id = int(caja.cls[0])
            etiqueta = _modelo.names.get(clase_id, str(clase_id))
            x1, y1, x2, y2 = (float(v) for v in caja.xyxy[0])
            detecciones.append(
                schemas.Deteccion(
                    etiqueta=etiqueta,
                    confianza=conf,
                    bbox=[x1 / ancho, y1 / alto, x2 / ancho, y2 / alto],
                )
            )

    cantidad = len(detecciones)
    confianza_promedio = (
        sum(d.confianza for d in detecciones) / cantidad if cantidad else 0.0
    )

    return schemas.VisionDetectResponse(
        detecciones=detecciones,
        cantidad=cantidad,
        confianza_promedio=confianza_promedio,
        requiere_revision=confianza_promedio < payload.umbral_confianza,
    )
