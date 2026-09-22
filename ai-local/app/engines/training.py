"""Motor de entrenamiento (fine-tuning) — orquestacion del subproceso YOLO.

v7 (Fase 8) — el objetivo final de la herramienta de anotacion.

POR QUE UN SUBPROCESO Y NO UN HILO
----------------------------------
YOLO.train() es CPU-bound y BLOQUEANTE durante minutos. Si corriera en el
event loop de FastAPI (o incluso en un hilo con el GIL), congelaria el motor
de IA entero: la voz y la deteccion dejarian de responder.

Por eso se lanza como SUBPROCESO independiente (python -m train.train_bakery).
El motor sigue sirviendo deteccion con el modelo ANTERIOR mientras entrena.

ESTADO COMPARTIDO
-----------------
`ESTADO_ENTRENAMIENTO` es un dict a nivel de modulo. El endpoint lo lee para
reportar progreso. Solo puede haber UN entrenamiento a la vez (flag `activo`).

HOT-RELOAD
----------
Al terminar, se recarga el modelo en memoria con vision.cargar_modelo(best.pt).
NO se reinicia el contenedor: el motor sigue vivo y empieza a usar el modelo
nuevo en la siguiente deteccion.

REGLA DE ORO (spec §1.2)
------------------------
Si el entrenamiento falla, el motor NO se cae: sigue con el modelo previo.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from . import vision

logger = logging.getLogger("rderico.ia.motor.training")

TRAINING_DIR = Path(os.getenv("TRAINING_DIR", "/training"))
DATASET_DIR = Path(os.getenv("DATASET_DIR", "/dataset"))
BEST_PT = TRAINING_DIR / "best.pt"

# ---------------------------------------------------------------------------
# Estado del entrenamiento (compartido con el endpoint /vision/train)
# ---------------------------------------------------------------------------
ESTADO_ENTRENAMIENTO: dict = {
    "activo": False,
    "iniciado_en": None,
    "terminado_en": None,
    "ok": None,
    "mensaje": "Sin entrenamientos en esta sesion.",
    "resumen": None,
    "error": None,
    "log_tail": [],
}


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()


def estado_actual() -> dict:
    """Devuelve una copia del estado (para el endpoint GET)."""
    return dict(ESTADO_ENTRENAMIENTO)


def _resumen_dataset() -> dict:
    """Cuenta imagenes y etiquetas por SKU. Util para pre-validar."""
    if not DATASET_DIR.exists():
        return {"disponible": False, "skus": {}, "total_imagenes": 0, "total_etiquetas": 0}

    skus: dict[str, dict] = {}
    total_img = 0
    total_lbl = 0
    for sku_dir in sorted(DATASET_DIR.iterdir()):
        if not sku_dir.is_dir():
            continue
        imgs = [f for f in sku_dir.iterdir() if f.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}]
        lbls = 0
        for img in imgs:
            label = img.with_suffix(".txt")
            if label.exists() and label.read_text(encoding="utf-8").strip():
                lbls += 1
        skus[sku_dir.name] = {"imagenes": len(imgs), "anotadas": lbls}
        total_img += len(imgs)
        total_lbl += lbls

    return {
        "disponible": True,
        "skus": skus,
        "total_imagenes": total_img,
        "total_etiquetas": total_lbl,
    }


def _leer_tail_log(log_path: Path, n: int = 20) -> list[str]:
    """Ultimas n lineas del log de entrenamiento (para diagnostico)."""
    try:
        lineas = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
        return lineas[-n:]
    except Exception:  # noqa: BLE001
        return []


async def _correr_subproceso(
    skus: list[str] | None,
    epochs: int,
    imgsz: int,
    batch: int,
    run_name: str,
) -> tuple[int, str, str]:
    """Lanza train_bakery como subproceso. Devuelve (rc, stdout, stderr)."""
    cmd = [
        sys.executable, "-m", "train.train_bakery",
        "--epochs", str(epochs),
        "--imgsz", str(imgsz),
        "--batch", str(batch),
        "--run-name", run_name,
    ]
    for sku in (skus or []):
        cmd += ["--sku", sku]

    logger.info("Lanzando entrenamiento: %s", " ".join(cmd))

    # cwd=/app para que `-m train.train_bakery` resuelva el paquete train/.
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd="/app",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env={**os.environ, "PYTHONUNBUFFERED": "1"},
    )
    stdout_b, stderr_b = await proc.communicate()
    return (
        proc.returncode or 0,
        stdout_b.decode("utf-8", errors="replace"),
        stderr_b.decode("utf-8", errors="replace"),
    )


async def entrenar(
    skus: list[str] | None = None,
    epochs: int = 50,
    imgsz: int = 640,
    batch: int = 8,
    run_name: str = "bakery",
) -> dict:
    """Ejecuta el pipeline completo y hace hot-reload del modelo.

    Es ASYNC pero internamente espera a un subproceso: el event loop sigue
    libre para atender /status, /vision/detect y /voice/* mientras entrena.
    """
    if ESTADO_ENTRENAMIENTO["activo"]:
        raise RuntimeError("Ya hay un entrenamiento en curso.")

    # Pre-validacion: sin etiquetas no hay nada que entrenar.
    resumen = _resumen_dataset()
    if resumen["total_etiquetas"] == 0:
        raise ValueError(
            "No hay imagenes anotadas. Anota al menos una imagen en la "
            "pestana Anotacion antes de entrenar."
        )

    ESTADO_ENTRENAMIENTO.update({
        "activo": True,
        "iniciado_en": _ahora(),
        "terminado_en": None,
        "ok": None,
        "mensaje": "Entrenando...",
        "resumen": None,
        "error": None,
        "log_tail": [],
    })

    try:
        rc, stdout, stderr = await _correr_subproceso(skus, epochs, imgsz, batch, run_name)

        # El script imprime un JSON en la ULTIMA linea de stdout.
        resumen_json = None
        for linea in reversed(stdout.strip().splitlines()):
            linea = linea.strip()
            if linea.startswith("{"):
                try:
                    resumen_json = json.loads(linea)
                    break
                except json.JSONDecodeError:
                    continue

        if rc != 0 or not resumen_json or not resumen_json.get("ok"):
            error = (resumen_json or {}).get("error") or stderr[-800:] or "Fallo desconocido"
            ESTADO_ENTRENAMIENTO.update({
                "activo": False,
                "terminado_en": _ahora(),
                "ok": False,
                "mensaje": "El entrenamiento fallo.",
                "error": error,
                "log_tail": stdout.strip().splitlines()[-20:],
            })
            return estado_actual()

        # --- HOT-RELOAD: recargar el modelo nuevo SIN reiniciar el contenedor ---
        if BEST_PT.exists():
            try:
                vision.cargar_modelo(str(BEST_PT))
                logger.info("Modelo recargado en caliente: %s", BEST_PT)
            except Exception as exc:  # noqa: BLE001
                logger.error("No se pudo recargar el modelo: %s", exc)
                ESTADO_ENTRENAMIENTO["error"] = f"Entreno OK pero fallo el hot-reload: {exc}"

        ESTADO_ENTRENAMIENTO.update({
            "activo": False,
            "terminado_en": _ahora(),
            "ok": True,
            "mensaje": "Entrenamiento completado. Modelo recargado.",
            "resumen": resumen_json,
            "log_tail": stdout.strip().splitlines()[-20:],
        })
        return estado_actual()

    except Exception as exc:  # noqa: BLE001
        logger.exception("Error inesperado en el entrenamiento")
        ESTADO_ENTRENAMIENTO.update({
            "activo": False,
            "terminado_en": _ahora(),
            "ok": False,
            "mensaje": "Error inesperado.",
            "error": str(exc),
        })
        return estado_actual()
