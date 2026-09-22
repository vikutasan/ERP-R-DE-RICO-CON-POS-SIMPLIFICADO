"""Pipeline de fine-tuning de YOLO sobre el dataset de panaderia.

v7 (Fase 8) — el objetivo final de la herramienta de anotacion.

QUE HACE
--------
1. Lee el dataset anotado por el operador en /dataset/<sku>/ (imagenes .jpg
   + etiquetas YOLO .txt).
2. Construye un dataset YOLO temporal con la estructura que ultralytics exige
   (images/ + labels/ + data.yaml).
3. Ejecuta model.train() partiendo de los pesos base (yolov8n.pt).
4. Copia el mejor modelo (best.pt) a /training/best.pt (ruta estable).

POR QUE UN SCRIPT Y NO UN ENDPOINT DIRECTO
------------------------------------------
El entrenamiento es LARGO (minutos) y BLOQUEANTE (usa CPU/RAM). Si corriera
en el event loop de FastAPI, congelaria el motor de IA entero (voz incluida).
Por eso el endpoint lo lanza como SUBPROCESO y reporta progreso por estado.

REGLA DE ORO (spec §1.2)
------------------------
Este script NUNCA toca el ERP. Solo lee el dataset (read-only) y escribe en
/training. Si falla, el motor sigue sirviendo deteccion con el modelo previo.

USO
---
    python -m train.train_bakery --sku 10 --epochs 50 --imgsz 640

o programaticamente desde el endpoint /vision/train.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import sys
from pathlib import Path

logger = logging.getLogger("rderico.ia.train")

# ---------------------------------------------------------------------------
# Rutas (configurables por env, con defaults del compose)
# ---------------------------------------------------------------------------
DATASET_DIR = Path(os.getenv("DATASET_DIR", "/dataset"))
TRAINING_DIR = Path(os.getenv("TRAINING_DIR", "/training"))
WEIGHTS_BASE = os.getenv("YOLO_MODEL", "yolov8n.pt")

# Extensiones de imagen aceptadas (espejo de POSService.list_training_dataset)
IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

# Nombre de la clase unica. El dataset de panaderia es de UNA clase: "pan".
# Si en el futuro hay varias clases, esto se vuelve una lista y el .txt ya
# trae el indice correcto (POSService.save_annotations escribe el indice).
CLASE_NOMBRE = "pan"


# ---------------------------------------------------------------------------
# 1. Descubrimiento del dataset
# ---------------------------------------------------------------------------
def _listar_pares(sku_dir: Path) -> list[tuple[Path, Path]]:
    """Devuelve [(imagen, etiqueta)] SOLO de imagenes con .txt no vacio.

    Una imagen sin etiqueta NO sirve para entrenar (YOLO la trataria como
    "fondo" y ensuciaria el modelo). Se descarta silenciosamente.
    """
    pares: list[tuple[Path, Path]] = []
    for img in sorted(sku_dir.iterdir()):
        if img.suffix.lower() not in IMG_EXTS:
            continue
        label = img.with_suffix(".txt")
        if not label.exists():
            continue
        # Un .txt vacio = imagen sin cajas = no aporta. Se descarta.
        if not label.read_text(encoding="utf-8").strip():
            continue
        pares.append((img, label))
    return pares


def descubrir_dataset(skus: list[str] | None = None) -> dict[str, list[tuple[Path, Path]]]:
    """Recorre /dataset/<sku>/ y devuelve {sku: [(img, label)]}.

    Si `skus` es None, entrena con TODOS los SKUs disponibles.
    """
    if not DATASET_DIR.exists():
        raise FileNotFoundError(
            f"El directorio de dataset no existe: {DATASET_DIR}. "
            "Verifica el volumen /dataset en docker-compose.ai.yml."
        )

    disponibles = [d.name for d in sorted(DATASET_DIR.iterdir()) if d.is_dir()]
    objetivo = skus if skus else disponibles

    resultado: dict[str, list[tuple[Path, Path]]] = {}
    for sku in objetivo:
        sku_dir = DATASET_DIR / sku
        if not sku_dir.is_dir():
            logger.warning("SKU '%s' no existe en el dataset. Se omite.", sku)
            continue
        pares = _listar_pares(sku_dir)
        if pares:
            resultado[sku] = pares
        else:
            logger.warning("SKU '%s' no tiene imagenes anotadas. Se omite.", sku)

    return resultado


# ---------------------------------------------------------------------------
# 2. Construccion del dataset YOLO
# ---------------------------------------------------------------------------
def construir_dataset_yolo(
    pares_por_sku: dict[str, list[tuple[Path, Path]]],
    destino: Path,
) -> tuple[Path, int]:
    """Crea la estructura YOLO en `destino` y devuelve (data.yaml, n_imagenes).

    Estructura generada:
        destino/
            images/  <sku>_<nombre>.jpg
            labels/  <sku>_<nombre>.txt
            data.yaml

    Se prefija el nombre con el SKU para evitar colisiones entre SKUs.
    """
    images_dir = destino / "images"
    labels_dir = destino / "labels"
    images_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)

    total = 0
    for sku, pares in pares_por_sku.items():
        for img, label in pares:
            nombre = f"{sku}_{img.name}"
            shutil.copy2(img, images_dir / nombre)
            shutil.copy2(label, labels_dir / f"{Path(nombre).stem}.txt")
            total += 1

    # data.yaml — formato ultralytics. Rutas ABSOLUTAS para evitar ambiguedad.
    data_yaml = destino / "data.yaml"
    data_yaml.write_text(
        "# Generado por train_bakery.py — NO editar a mano.\n"
        f"path: {destino.resolve()}\n"
        "train: images\n"
        "val: images\n"  # dataset pequeno: validamos con lo mismo (solo smoke test)
        "names:\n"
        f"  0: {CLASE_NOMBRE}\n",
        encoding="utf-8",
    )

    return data_yaml, total


# ---------------------------------------------------------------------------
# 3. Entrenamiento
# ---------------------------------------------------------------------------
def entrenar(
    data_yaml: Path,
    epochs: int,
    imgsz: int,
    batch: int,
    run_name: str,
) -> Path:
    """Ejecuta YOLO.train() y devuelve la ruta de best.pt.

    Importa ultralytics DENTRO de la funcion: asi el modulo se puede importar
    (para tests) sin cargar torch.
    """
    from ultralytics import YOLO

    logger.info("Cargando pesos base: %s", WEIGHTS_BASE)
    modelo = YOLO(WEIGHTS_BASE)

    logger.info(
        "Entrenando: epochs=%s imgsz=%s batch=%s run=%s",
        epochs, imgsz, batch, run_name,
    )
    resultados = modelo.train(
        data=str(data_yaml),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        project=str(TRAINING_DIR / "runs"),
        name=run_name,
        exist_ok=True,
        verbose=True,
        # Dataset pequeno: desactivamos aumentaciones agresivas que
        # distorsionarian pan (formas redondas/ovaladas consistentes).
        degrees=0.0,
        fliplr=0.5,
        flipud=0.0,
    )

    # ultralytics expone la ruta del mejor modelo en save_dir/weights/best.pt
    save_dir = Path(resultados.save_dir)
    best = save_dir / "weights" / "best.pt"
    if not best.exists():
        raise RuntimeError(f"YOLO no genero best.pt en {best}")

    return best


# ---------------------------------------------------------------------------
# 4. Publicacion del modelo
# ---------------------------------------------------------------------------
def publicar_modelo(best: Path, destino: Path) -> Path:
    """Copia best.pt a una ruta ESTABLE que el motor puede recargar.

    El motor hace hot-reload desde /training/best.pt. Usar una ruta fija
    (no runs/train_N/weights/best.pt) evita tener que adivinar el run.
    """
    destino.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(best, destino)
    logger.info("Modelo publicado en %s", destino)
    return destino


# ---------------------------------------------------------------------------
# Orquestacion
# ---------------------------------------------------------------------------
def ejecutar(
    skus: list[str] | None,
    epochs: int,
    imgsz: int,
    batch: int,
    run_name: str,
) -> dict:
    """Pipeline completo. Devuelve un resumen serializable (para el endpoint)."""
    pares = descubrir_dataset(skus)
    if not pares:
        raise ValueError(
            "No hay imagenes anotadas para entrenar. "
            "Anota al menos una imagen en la pestana Anotacion."
        )

    n_imgs = sum(len(v) for v in pares.values())
    logger.info("Dataset: %s imagenes en %s SKU(s).", n_imgs, len(pares))

    # El dataset YOLO se construye en /training (escribible), NO en /dataset (ro).
    dataset_yolo = TRAINING_DIR / "dataset_yolo"
    if dataset_yolo.exists():
        shutil.rmtree(dataset_yolo)
    data_yaml, total = construir_dataset_yolo(pares, dataset_yolo)

    best = entrenar(data_yaml, epochs, imgsz, batch, run_name)
    publicado = publicar_modelo(best, TRAINING_DIR / "best.pt")

    return {
        "ok": True,
        "skus": list(pares.keys()),
        "imagenes": total,
        "epochs": epochs,
        "imgsz": imgsz,
        "modelo": str(publicado),
        "run": str(best.parent.parent),
    }


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Fine-tuning YOLO — panaderia")
    p.add_argument("--sku", action="append", default=None,
                   help="SKU a entrenar (repetible). Si se omite, todos.")
    p.add_argument("--epochs", type=int, default=50)
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--batch", type=int, default=8)
    p.add_argument("--run-name", default="bakery")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    try:
        resumen = ejecutar(args.sku, args.epochs, args.imgsz, args.batch, args.run_name)
    except Exception as exc:  # noqa: BLE001
        logger.error("Entrenamiento FALLIDO: %s", exc)
        # El endpoint lee esta linea para reportar el error al operador.
        print(json.dumps({"ok": False, "error": str(exc)}), flush=True)
        return 1
    print(json.dumps(resumen), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
