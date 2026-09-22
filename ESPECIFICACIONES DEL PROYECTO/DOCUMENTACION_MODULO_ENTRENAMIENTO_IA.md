# DOCUMENTACIÓN — MÓDULO DE ENTRENAMIENTO IA (FINE-TUNING DE VISIÓN)

> **Versión:** v7 (Fase 8) — Fine-tuning de YOLO
> **Estado:** Implementado, validado con smoke test y en producción (commit `26c95eb`)
> **Última actualización:** 22 Sep 2026
> **Documentos relacionados:**
> - [`CONTEXTO_SISTEMA_IA.md`](CONTEXTO_SISTEMA_IA.md) — Arquitectura del AI Gateway y reglas de resiliencia
> - [`DOCUMENTACION_MODULO_POS.md`](DOCUMENTACION_MODULO_POS.md) — Módulo POS (donde vive la UI de captura/anotación)
> - [`../../docs/SPEC_AI_GATEWAY_TRANSVERSAL.md`](../../docs/SPEC_AI_GATEWAY_TRANSVERSAL.md) — Especificación del Gateway transversal

---

## 0. RESUMEN EJECUTIVO

El **Módulo de Entrenamiento IA** cierra el ciclo de la visión artificial del ERP: convierte las
imágenes que el operador captura y anota en el POS en un **modelo YOLO afinado** (fine-tuning)
que el motor de IA empieza a usar **sin reiniciar el contenedor** (hot-reload).

Es el **objetivo final** de la herramienta de anotación: el operador enseña al sistema a contar
pan (y cualquier otro producto) dibujando cajas sobre fotos reales de la panadería.

**Frase que resume el diseño:**

> *El ERP nunca entrena. El ERP pide. El motor entrena. El motor se recarga solo.*

---

## 1. PROBLEMA QUE RESUELVE

### 1.1 El problema de negocio

El conteo de pan en el POS requiere que la IA reconozca piezas en una charola. Un modelo
genérico (`yolov8n.pt`, entrenado con COCO) **no conoce el pan de R de Rico**: confunde
conchas con bolillos, no distingue piezas pegadas y falla con la iluminación del local.

### 1.2 El problema técnico

Entrenar YOLO es:

| Característica | Implicación |
|---|---|
| **Largo** | Minutos (decenas de minutos con datasets reales) |
| **Bloqueante** | Consume CPU/RAM al 100% durante todo el proceso |
| **Con estado** | Solo puede haber UN entrenamiento a la vez |
| **Falible** | Puede fallar por dataset vacío, OOM, error de ultralytics |

Si el entrenamiento corriera dentro del event loop de FastAPI, **congelaría el motor de IA
completo**: la voz (`/voice/*`) y la detección (`/vision/detect`) dejarían de responder, y el
POS perdería la IA en plena operación.

### 1.3 La restricción de arquitectura (Regla de Oro §1.2)

> **El ERP NUNCA importa `torch`, `whisper` ni `ultralytics`.**

El ERP solo conoce `AI_LOCAL_URL` y habla HTTP. Si el motor de IA se cae, el POS sigue operando
en modo manual. Esta regla es **inviolable** y condiciona todo el diseño del módulo.

---

## 2. ARQUITECTURA GENERAL

### 2.1 Diagrama de capas

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  NAVEGADOR (POS)                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  VisionTrainingUI.jsx  (pestaña "Anotación")                           │  │
│  │    · Selector de épocas (1..500)                                       │  │
│  │    · Botón "🧠 Entrenar con N imagen(es)"                              │  │
│  │    · iniciarEntrenamiento() → posService.trainVision({skus, epochs})   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ HTTP POST /api/v1/ai/vision/train
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  CONTENEDOR "api"  (ERP — FastAPI)                                           │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  apps/api/modules/ai/router.py                                         │  │
│  │    POST /vision/train          → service.entrenar_vision()             │  │
│  │    GET  /vision/train/status   → service.estado_entrenamiento()        │  │
│  │    GET  /vision/dataset-summary→ service.resumen_dataset()             │  │
│  ├────────────────────────────────────────────────────────────────────────┤  │
│  │  apps/api/modules/ai/service.py                                        │  │
│  │    · _timeout_entrenamiento()  (default 3600s, env AI_LOCAL_TRAIN_TIMEOUT)│
│  │    · _llamar_motor_get()       (proxy GET)                             │  │
│  │    · entrenar_vision()         (proxy POST con timeout largo)          │  │
│  │    · Traduce 400/409 → HTTPException; 5xx/timeout → 503 IA_NO_DISPONIBLE│ │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ⚠️  NO importa torch / ultralytics / whisper                                │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ HTTP (red interna rderico-ia-net)
                                    │ POST http://ia-local:9000/vision/train
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  CONTENEDOR "ia-local"  (Motor de IA — FastAPI)                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  ai-local/app/main.py                                                  │  │
│  │    POST /vision/train          → training.entrenar()                   │  │
│  │    GET  /vision/train/status   → training.estado_actual()              │  │
│  │    GET  /vision/dataset-summary→ training._resumen_dataset()           │  │
│  ├────────────────────────────────────────────────────────────────────────┤  │
│  │  ai-local/app/engines/training.py                                      │  │
│  │    · ESTADO_ENTRENAMIENTO (dict compartido, 1 entrenamiento a la vez)  │  │
│  │    · _resumen_dataset()   (pre-validación: ¿hay etiquetas?)            │  │
│  │    · _correr_subproceso() (asyncio.create_subprocess_exec)             │  │
│  │    · entrenar()           (orquesta + HOT-RELOAD)                      │  │
│  ├────────────────────────────────────────────────────────────────────────┤  │
│  │  ai-local/app/engines/vision.py                                        │  │
│  │    · cargar_modelo(ruta)  ← recarga el modelo en memoria (hot-reload)  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    │ subprocess (proceso SEPARADO)           │
│                                    ▼                                         │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  python -m train.train_bakery --epochs N --imgsz 640 --sku 10 ...      │  │
│  │  ai-local/train/train_bakery.py                                        │  │
│  │    1. descubrir_dataset()      lee /dataset/<sku>/                     │  │
│  │    2. construir_dataset_yolo() arma images/ + labels/ + data.yaml      │  │
│  │    3. entrenar()               YOLO.train()  ← CPU-bound, minutos      │  │
│  │    4. publicar_modelo()        copia best.pt → /training/best.pt       │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Flujo de datos (volúmenes compartidos)

El punto crítico del diseño es que **el dataset que el ERP escribe es el mismo directorio físico
que el motor de IA lee**. Se logra con un bind mount al MISMO directorio del host:

```
HOST (Windows)                                  CONTENEDOR "api"        CONTENEDOR "ia-local"
─────────────────────────────────────────────   ────────────────────    ─────────────────────
ERP-R-DE-RICO-DATA/vision_training/  ─────────► /app/static/training    /dataset  (read-only)
   └── 10/                                       (VISION_TRAINING_DIR)   (DATASET_DIR)
        ├── pan_001.jpg  ◄── escribe el ERP      ▲                       ▲
        ├── pan_001.txt  ◄── anota el operador   │                       │
        ├── pan_002.jpg                          │                       │
        └── pan_002.txt                          │                       │
                                                 │                       │
ERP-R-DE-RICO-DATA/ai_training/      ───────────┼───────────────────────┘
   ├── best.pt       ◄── modelo afinado          │        /training  (read-write)
   ├── dataset_yolo/ ◄── dataset YOLO temporal   │        (TRAINING_DIR)
   └── runs/         ◄── logs de ultralytics     │
```

| Variable de entorno | Contenedor | Valor | Propósito |
|---|---|---|---|
| `VISION_TRAINING_DIR` | `api` | `/app/static/training` | Raíz donde el ERP escribe imágenes + labels |
| `DATASET_DIR` | `ia-local` | `/dataset` | Raíz donde el motor LEE el dataset (ro) |
| `TRAINING_DIR` | `ia-local` | `/training` | Raíz donde el motor ESCRIBE el modelo |
| `YOLO_MODEL` | `ia-local` | `yolov8n.pt` | Pesos base para el fine-tuning |
| `AI_LOCAL_TRAIN_TIMEOUT` | `api` | `3600` | Timeout del proxy de entrenamiento (segundos) |

---

## 3. COMPONENTES EN DETALLE

### 3.1 Frontend — [`VisionTrainingUI.jsx`](../../apps/pos/VisionTrainingUI.jsx)

La UI de entrenamiento vive **dentro de la pestaña "Anotación"**, no en una pantalla aparte.
Esto es deliberado: el operador anota y entrena en el mismo contexto mental.

**Estado de entrenamiento (líneas 46-50):**

```javascript
// --- Estado de entrenamiento (v7 Fase 8) ---
const [training, setTraining] = useState(false);
const [trainMsg, setTrainMsg] = useState('');
const [trainError, setTrainError] = useState('');
const [epochs, setEpochs] = useState(50);
```

**Disparador (líneas 159-188):**

```javascript
const iniciarEntrenamiento = async () => {
    if (!selectedProduct) return;
    setTraining(true);
    setTrainMsg('');
    setTrainError('');
    try {
        // Entrena SOLO con el SKU seleccionado (el operador anota por producto).
        const res = await posService.trainVision({
            skus: [selectedProduct.sku],
            epochs,
        });
        if (res.ok) {
            setTrainMsg(
                `✅ Entrenamiento completado (${res.resumen?.imagenes ?? '?'} imágenes). Modelo recargado.`
            );
        } else {
            setTrainError(res.error || res.mensaje || 'El entrenamiento falló.');
        }
    } catch (error) {
        // 503 = motor de IA caído; 400/409 = dataset o concurrencia.
        setTrainError(
            error.status === 503
                ? 'El motor de IA Local no está disponible. Entrena más tarde.'
                : error.message || 'No se pudo iniciar el entrenamiento.'
        );
    } finally {
        setTraining(false);
    }
};
```

**Reglas de UX implementadas:**

1. **El botón solo aparece si hay etiquetas.** La condición es
   `{dataset && dataset.annotated > 0 && (...)}` (línea 422). Si no hay nada anotado, no se
   muestra el bloque de entrenamiento: no se puede entrenar con cero etiquetas.
2. **El botón se deshabilita mientras entrena** (`disabled={training}`) y cambia el texto a
   `🧠 Entrenando... (puede tardar minutos)`.
3. **El selector de épocas** está acotado a `min={1} max={500}` y se deshabilita durante el
   entrenamiento.
4. **El mensaje de éxito incluye el número de imágenes** usadas, para que el operador sepa
   con qué dataset se entrenó.
5. **Los errores se traducen a lenguaje humano**: `503` → "El motor de IA Local no está
   disponible. Entrena más tarde."

> **Nota de diseño:** el entrenamiento se lanza **por SKU** (`skus: [selectedProduct.sku]`),
> porque el operador anota producto por producto. El backend soporta entrenar varios SKUs a la
> vez (o todos si se omite `skus`), pero la UI actual entrena uno.

### 3.2 Cliente HTTP — [`POSService.js`](../../apps/pos/services/POSService.js)

Tres métodos nuevos (líneas 209-239):

```javascript
async getDatasetSummary() {
    const res = await fetch(`${CONFIG.API_BASE_URL}/ai/vision/dataset-summary`);
    // ...
}

async getTrainStatus() {
    const res = await fetch(`${CONFIG.API_BASE_URL}/ai/vision/train/status`);
    // ...
}

async trainVision({ skus = null, epochs = 50, imgsz = 640, batch = 8, runName = 'bakery' } = {}) {
    const res = await fetch(`${CONFIG.API_BASE_URL}/ai/vision/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus, epochs, imgsz, batch, run_name: runName }),
    });
    // ...
}
```

> **Ojo con el prefijo:** `CONFIG.API_BASE_URL` ya incluye `/api/v1`, por lo que la ruta final
> es `/api/v1/ai/vision/train`. El router del Gateway está montado en `/api/v1/ai`
> (ver [`apps/api/main.py`](../../apps/api/main.py:317)), **no** en `/ai`.

### 3.3 API Gateway — [`apps/api/modules/ai/router.py`](../../apps/api/modules/ai/router.py)

Tres endpoints (líneas 45-60):

```python
@router.get("/vision/dataset-summary", response_model=schemas.DatasetSummaryResponse)
async def dataset_summary():
    return await service.resumen_dataset()

@router.get("/vision/train/status", response_model=schemas.TrainStatusResponse)
async def train_status():
    return await service.estado_entrenamiento()

@router.post("/vision/train", response_model=schemas.TrainStatusResponse)
async def train(payload: schemas.TrainRequest):
    return await service.entrenar_vision(payload)
```

### 3.4 Servicio del Gateway — [`apps/api/modules/ai/service.py`](../../apps/api/modules/ai/service.py)

**Timeout dedicado (líneas 285-299):**

```python
# El entrenamiento tarda MINUTOS. El timeout por defecto (120s) no alcanza,
# asi que se usa uno dedicado y configurable (AI_LOCAL_TRAIN_TIMEOUT).
_TIMEOUT_ENTRENAMIENTO_DEFECTO = 3600.0  # 1 hora

def _timeout_entrenamiento() -> float:
    """Timeout (segundos) para el entrenamiento. Default 1h."""
    try:
        return float(os.getenv("AI_LOCAL_TRAIN_TIMEOUT", str(_TIMEOUT_ENTRENAMIENTO_DEFECTO)))
    except (TypeError, ValueError):
        return _TIMEOUT_ENTRENAMIENTO_DEFECTO
```

**Traducción de errores (líneas 321-368) — el corazón de la resiliencia:**

```python
async def entrenar_vision(payload: schemas.TrainRequest) -> schemas.TrainStatusResponse:
    _verificar_configuracion("entrenamiento")

    cuerpo_motor = {
        "skus": payload.skus,
        "epochs": payload.epochs,
        "imgsz": payload.imgsz,
        "batch": payload.batch,
        "run_name": payload.run_name,
    }

    url = f"{_url_motor_ia()}/vision/train"
    try:
        async with httpx.AsyncClient(timeout=_timeout_entrenamiento()) as cliente:
            respuesta = await cliente.post(url, json=cuerpo_motor)
    except httpx.TimeoutException:
        _lanzar_no_disponible("entrenamiento: timeout")
    except httpx.HTTPError as exc:
        _lanzar_no_disponible("entrenamiento: motor inalcanzable")

    # 409 (ya hay uno en curso) y 400 (dataset invalido) son errores del
    # CLIENTE, no de disponibilidad: se propagan tal cual para que la UI
    # muestre el mensaje correcto.
    if respuesta.status_code in (400, 409):
        detalle = {}
        try:
            detalle = respuesta.json().get("detail") or {}
        except ValueError:
            detalle = {"mensaje": respuesta.text[:200]}
        raise HTTPException(status_code=respuesta.status_code, detail=detalle)

    if respuesta.status_code >= 500:
        _lanzar_no_disponible("entrenamiento: motor no disponible")

    try:
        return schemas.TrainStatusResponse(**respuesta.json())
    except (ValueError, TypeError):
        _lanzar_no_disponible("entrenamiento: respuesta invalida")
```

**Tabla de traducción de errores:**

| Situación | Código motor | Respuesta del Gateway | Significado para la UI |
|---|---|---|---|
| Dataset sin etiquetas | 400 | **400** `DATASET_INVALIDO` | "Anota al menos una imagen" |
| Ya hay entrenamiento | 409 | **409** `ENTRENAMIENTO_EN_CURSO` | "Espera a que termine" |
| Motor caído / timeout | — | **503** `IA_NO_DISPONIBLE` | "Motor no disponible, entrena más tarde" |
| Error interno del motor | 5xx | **503** `IA_NO_DISPONIBLE` | "Motor no disponible" |
| Respuesta corrupta | 200 inválido | **503** `IA_NO_DISPONIBLE` | "Motor no disponible" |

> **Principio:** los errores **del cliente** (400/409) se propagan con su código; los errores
> **de disponibilidad** (timeout, 5xx, respuesta inválida) se normalizan a **503**. Así la UI
> puede distinguir "tú te equivocaste" de "el motor no está".

### 3.5 Endpoints del motor — [`ai-local/app/main.py`](../../ai-local/app/main.py)

```python
@app.get("/vision/dataset-summary", response_model=schemas.DatasetSummaryResponse)
async def dataset_summary() -> schemas.DatasetSummaryResponse:
    """Resumen del dataset anotado disponible para entrenar.

    Permite a la UI pre-validar ANTES de lanzar un entrenamiento largo:
    si no hay etiquetas, no tiene sentido empezar.
    """
    return schemas.DatasetSummaryResponse(**training._resumen_dataset())


@app.get("/vision/train/status", response_model=schemas.TrainStatusResponse)
async def train_status() -> schemas.TrainStatusResponse:
    """Estado del entrenamiento en curso (o del ultimo).

    NUNCA lanza error: siempre responde 200 con el estado real.
    """
    return schemas.TrainStatusResponse(**training.estado_actual())


@app.post("/vision/train", response_model=schemas.TrainStatusResponse)
async def train(payload: schemas.TrainRequest) -> schemas.TrainStatusResponse:
    """Lanza el fine-tuning de YOLO sobre el dataset anotado.

    BLOQUEANTE respecto al cliente (espera a que termine) pero NO respecto al
    motor: el entrenamiento corre en un SUBPROCESO, asi que /status, /vision/detect
    y /voice/* siguen respondiendo mientras entrena.

    Si ya hay un entrenamiento en curso -> 409.
    Si no hay etiquetas -> 400.
    """
    if training.ESTADO_ENTRENAMIENTO["activo"]:
        raise HTTPException(
            status_code=409,
            detail={"codigo": "ENTRENAMIENTO_EN_CURSO", "mensaje": "Ya hay un entrenamiento en curso."},
        )
    try:
        resultado = await training.entrenar(
            skus=payload.skus,
            epochs=payload.epochs,
            imgsz=payload.imgsz,
            batch=payload.batch,
            run_name=payload.run_name,
        )
    except ValueError as exc:
        # Pre-validacion fallida (sin etiquetas, etc.) -> error del cliente.
        raise HTTPException(
            status_code=400,
            detail={"codigo": "DATASET_INVALIDO", "mensaje": str(exc)},
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={"codigo": "MOTOR_ENTRENAMIENTO_ERROR", "mensaje": str(exc)},
        ) from exc

    return schemas.TrainStatusResponse(**resultado)
```

### 3.6 Orquestador — [`ai-local/app/engines/training.py`](../../ai-local/app/engines/training.py)

**Estado compartido (líneas 51-60):**

```python
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
```

**Lanzamiento del subproceso (líneas 110-143):**

```python
async def _correr_subproceso(skus, epochs, imgsz, batch, run_name) -> tuple[int, str, str]:
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
```

**Hot-reload (líneas 206-213):**

```python
# --- HOT-RELOAD: recargar el modelo nuevo SIN reiniciar el contenedor ---
if BEST_PT.exists():
    try:
        vision.cargar_modelo(str(BEST_PT))
        logger.info("Modelo recargado en caliente: %s", BEST_PT)
    except Exception as exc:
        logger.error("No se pudo recargar el modelo: %s", exc)
        ESTADO_ENTRENAMIENTO["error"] = f"Entreno OK pero fallo el hot-reload: {exc}"
```

### 3.7 Pipeline de entrenamiento — [`ai-local/train/train_bakery.py`](../../ai-local/train/train_bakery.py)

**Constantes (líneas 44-57):**

```python
DATASET_DIR = Path(os.getenv("DATASET_DIR", "/dataset"))
TRAINING_DIR = Path(os.getenv("TRAINING_DIR", "/training"))
WEIGHTS_BASE = os.getenv("YOLO_MODEL", "yolov8n.pt")

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

# Nombre de la clase unica. El dataset de panaderia es de UNA clase: "pan".
CLASE_NOMBRE = "pan"
```

**Las 4 etapas del pipeline:**

#### Etapa 1 — Descubrimiento (`_listar_pares`, `descubrir_dataset`)

```python
def _listar_pares(sku_dir: Path) -> list[tuple[Path, Path]]:
    """Devuelve [(imagen, etiqueta)] SOLO de imagenes con .txt no vacio.

    Una imagen sin etiqueta NO sirve para entrenar (YOLO la trataria como
    "fondo" y ensuciaria el modelo). Se descarta silenciosamente.
    """
    pares = []
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
```

> **Decisión de diseño clave:** las imágenes **sin etiqueta se descartan silenciosamente**.
> YOLO trataría una imagen sin cajas como "fondo" (negativo), lo que **ensuciaría** el modelo
> enseñándole que el pan NO está donde sí está. Es mejor ignorarlas que entrenar con ruido.

#### Etapa 2 — Construcción del dataset YOLO (`construir_dataset_yolo`)

```python
def construir_dataset_yolo(pares_por_sku, destino) -> tuple[Path, int]:
    """Crea la estructura YOLO en `destino` y devuelve (data.yaml, n_imagenes).

    Estructura generada:
        destino/
            images/  <sku>_<nombre>.jpg
            labels/  <sku>_<nombre>.txt
            data.yaml
    """
    images_dir = destino / "images"
    labels_dir = destino / "labels"
    images_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)

    total = 0
    for sku, pares in pares_por_sku.items():
        for img, label in pares:
            nombre = f"{sku}_{img.name}"   # prefijo SKU evita colisiones
            shutil.copy2(img, images_dir / nombre)
            shutil.copy2(label, labels_dir / f"{Path(nombre).stem}.txt")
            total += 1

    data_yaml = destino / "data.yaml"
    data_yaml.write_text(
        "# Generado por train_bakery.py — NO editar a mano.\n"
        f"path: {destino.resolve()}\n"
        "train: images\n"
        "val: images\n"   # dataset pequeno: validamos con lo mismo (solo smoke test)
        "names:\n"
        f"  0: {CLASE_NOMBRE}\n",
        encoding="utf-8",
    )
    return data_yaml, total
```

> **Por qué se copia y no se entrena in-place:** `/dataset` está montado **read-only** (el motor
> nunca debe modificar el trabajo del operador). El dataset YOLO se construye en `/training`
> (escribible). Además, el prefijo `<sku>_` evita colisiones si dos SKUs tienen una imagen con
> el mismo nombre (`pan_001.jpg`).

#### Etapa 3 — Entrenamiento (`entrenar`)

```python
def entrenar(data_yaml, epochs, imgsz, batch, run_name) -> Path:
    """Ejecuta YOLO.train() y devuelve la ruta de best.pt.

    Importa ultralytics DENTRO de la funcion: asi el modulo se puede importar
    (para tests) sin cargar torch.
    """
    from ultralytics import YOLO

    modelo = YOLO(WEIGHTS_BASE)
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

    save_dir = Path(resultados.save_dir)
    best = save_dir / "weights" / "best.pt"
    if not best.exists():
        raise RuntimeError(f"YOLO no genero best.pt en {best}")
    return best
```

> **Aumentaciones desactivadas a propósito:** `degrees=0.0` y `flipud=0.0` porque el pan tiene
> formas consistentes (redondas/ovaladas) y rotarlo o voltearlo verticalmente crearía ejemplos
> irreales. `fliplr=0.5` (espejo horizontal) sí se mantiene: un pan es simétrico.

#### Etapa 4 — Publicación (`publicar_modelo`)

```python
def publicar_modelo(best: Path, destino: Path) -> Path:
    """Copia best.pt a una ruta ESTABLE que el motor puede recargar.

    El motor hace hot-reload desde /training/best.pt. Usar una ruta fija
    (no runs/train_N/weights/best.pt) evita tener que adivinar el run.
    """
    destino.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(best, destino)
    return destino
```

> **Por qué una ruta fija:** ultralytics guarda cada run en `runs/<name>/weights/best.pt`. Si el
> motor tuviera que adivinar el nombre del run, sería frágil. Copiar a `/training/best.pt`
> (ruta estable) hace el hot-reload trivial y determinista.

**Contrato de salida del script (líneas 273-288):**

```python
def main(argv=None) -> int:
    logging.basicConfig(level=logging.INFO, ...)
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    try:
        resumen = ejecutar(args.sku, args.epochs, args.imgsz, args.batch, args.run_name)
    except Exception as exc:
        logger.error("Entrenamiento FALLIDO: %s", exc)
        # El endpoint lee esta linea para reportar el error al operador.
        print(json.dumps({"ok": False, "error": str(exc)}), flush=True)
        return 1
    print(json.dumps(resumen), flush=True)
    return 0
```

> **Contrato crítico:** el script imprime **un JSON en la última línea de stdout**. El
> orquestador (`training.py`) lo parsea buscando hacia atrás la primera línea que empiece con
> `{`. Esto permite que ultralytics imprima todo su log ruidoso sin romper el parseo.

---

## 4. FLUJO COMPLETO PASO A PASO

### 4.1 Camino feliz

```
1. El operador captura fotos de pan en la pestaña "Captura" y las sube al dataset.
   → POST /api/v1/pos/vision/training/upload
   → El ERP escribe en VISION_TRAINING_DIR/<sku>/*.jpg

2. El operador va a la pestaña "Anotación", elige el producto y dibuja cajas.
   → POST /api/v1/pos/vision/annotations
   → El ERP escribe <sku>/<imagen>.txt en formato YOLO

3. La UI muestra "Progreso de Anotación: N / M" y, si N > 0, el bloque de entrenamiento.

4. El operador ajusta las épocas (default 50) y pulsa "🧠 Entrenar con N imagen(es)".
   → POST /api/v1/ai/vision/train  {skus:["10"], epochs:50, imgsz:640, batch:8}

5. El Gateway valida configuración y proxya al motor con timeout de 1h.
   → POST http://ia-local:9000/vision/train

6. El motor:
   a. Verifica que no haya otro entrenamiento (si lo hay → 409).
   b. Pre-valida que haya etiquetas (si no → 400).
   c. Marca ESTADO_ENTRENAMIENTO["activo"] = True.
   d. Lanza el subproceso `python -m train.train_bakery ...`.
      ⚠️ El event loop queda LIBRE: /status, /vision/detect y /voice/* siguen respondiendo.

7. El subproceso:
   a. Lee /dataset/10/ y descarta imágenes sin etiqueta.
   b. Construye /training/dataset_yolo/ (images/ + labels/ + data.yaml).
   c. Ejecuta YOLO.train() durante N épocas (minutos).
   d. Copia el mejor modelo a /training/best.pt.
   e. Imprime {"ok":true, "imagenes":N, ...} en la última línea.

8. El motor parsea el JSON, hace HOT-RELOAD:
   → vision.cargar_modelo("/training/best.pt")
   → Marca ESTADO_ENTRENAMIENTO["activo"] = False, ok = True.

9. El Gateway devuelve TrainStatusResponse a la UI.

10. La UI muestra "✅ Entrenamiento completado (N imágenes). Modelo recargado."

11. La SIGUIENTE detección (/vision/detect) ya usa el modelo nuevo.
    ⚠️ NO se reinició ningún contenedor.
```

### 4.2 Camino de error — dataset vacío

```
1. El operador pulsa "Entrenar" sin haber anotado nada.
   (En la UI real el botón no aparece si dataset.annotated === 0, pero el
    endpoint puede invocarse por API o si el dataset se vació entre medias.)

2. El motor ejecuta la pre-validación en training.entrenar():
   resumen = _resumen_dataset()
   if resumen["total_etiquetas"] == 0:
       raise ValueError("No hay imagenes anotadas. Anota al menos una imagen...")

3. El endpoint del motor captura el ValueError y responde 400:
   {"detail": {"codigo": "DATASET_INVALIDO", "mensaje": "..."}}

4. El Gateway propaga el 400 tal cual (es error del CLIENTE, no de disponibilidad).

5. La UI muestra: "No hay imagenes anotadas. Anota al menos una imagen..."
```

### 4.3 Camino de error — entrenamiento concurrente

```
1. Ya hay un entrenamiento en curso (ESTADO_ENTRENAMIENTO["activo"] == True).

2. El endpoint del motor responde 409 ANTES de lanzar nada:
   {"detail": {"codigo": "ENTRENAMIENTO_EN_CURSO", "mensaje": "Ya hay un entrenamiento en curso."}}

3. El Gateway propaga el 409 tal cual.

4. La UI muestra el mensaje de concurrencia.
```

### 4.4 Camino de error — motor de IA caído

```
1. El contenedor ia-local está apagado (o la red no resuelve).

2. El Gateway intenta httpx.post() y captura httpx.HTTPError.

3. El Gateway responde 503 IA_NO_DISPONIBLE.

4. La UI muestra: "El motor de IA Local no está disponible. Entrena más tarde."

5. ⚠️ El POS sigue operando en modo manual. El ERP NO se cae.
```

### 4.5 Camino de error — fallo del entrenamiento (OOM, error de ultralytics)

```
1. El subproceso train_bakery.py falla (rc != 0) o no imprime JSON válido.

2. El orquestador marca:
   ESTADO_ENTRENAMIENTO["ok"] = False
   ESTADO_ENTRENAMIENTO["error"] = <mensaje del script o stderr[-800:]>
   ESTADO_ENTRENAMIENTO["log_tail"] = <últimas 20 líneas de stdout>

3. El endpoint devuelve 200 con ok=False (el motor NO lanza excepción:
   el entrenamiento falló, pero el motor sigue vivo).

4. La UI muestra res.error o res.mensaje.

5. ⚠️ CRÍTICO: el motor sigue usando el modelo ANTERIOR. No se perdió la IA.
```

---

## 5. DECISIONES DE DISEÑO Y SU JUSTIFICACIÓN

### 5.1 ¿Por qué un subproceso y no un hilo?

`YOLO.train()` es **CPU-bound y bloqueante durante minutos**. En Python, un hilo seguiría
compartiendo el GIL y, aunque `torch` libera el GIL en operaciones nativas, el proceso seguiría
compitiendo por CPU y memoria con el event loop. Un **subproceso independiente** garantiza:

- El event loop de FastAPI queda **totalmente libre** (`/status`, `/vision/detect`, `/voice/*`
  siguen respondiendo).
- Si el subproceso muere (OOM), **no arrastra** al motor.
- El aislamiento de memoria es real (no comparten heap).

### 5.2 ¿Por qué hot-reload y no reiniciar el contenedor?

Reiniciar `ia-local` implicaría:

- Recargar Whisper (~150 MB) y Ollama en RAM → **minutos de indisponibilidad**.
- Perder el estado de NLU (modelo caliente en Ollama).
- Cortar la detección en plena operación del POS.

El hot-reload (`vision.cargar_modelo(best.pt)`) recarga **solo el modelo YOLO** en memoria. El
resto del motor sigue intacto. La siguiente detección ya usa el modelo nuevo.

### 5.3 ¿Por qué el dataset se monta read-only en el motor?

**Principio de responsabilidad única:** el operador es el dueño del dataset (imágenes + cajas).
El motor solo lo **lee** para entrenar. Si el motor pudiera escribir, un bug podría corromper el
trabajo de anotación del operador. El flag `:ro` lo hace **imposible a nivel de kernel**.

### 5.4 ¿Por qué se descartan las imágenes sin etiqueta?

YOLO interpreta una imagen sin cajas como un **negativo** ("aquí no hay pan"). Si el operador
capturó 20 fotos pero solo anotó 8, las otras 12 **no son negativos reales**: simplemente no se
anotaron. Entrenar con ellas enseñaría al modelo que el pan visible NO es pan → **envenenaría**
el modelo. Descartarlas es la opción conservadora y correcta.

### 5.5 ¿Por qué una ruta fija `/training/best.pt`?

ultralytics guarda cada run en `runs/<name>/weights/best.pt`. Si el motor tuviera que adivinar
el nombre del run (o listar directorios y ordenar por fecha), sería frágil. Copiar a una ruta
**estable y determinista** hace el hot-reload trivial: siempre se recarga el mismo archivo.

### 5.6 ¿Por qué el timeout del Gateway es de 1 hora?

El timeout por defecto del Gateway es de 120s (para detección/voz, que son rápidos). El
entrenamiento tarda minutos u horas según el dataset. Se usa un timeout **dedicado y
configurable** (`AI_LOCAL_TRAIN_TIMEOUT`, default 3600s) para no acoplar ambos casos de uso.

### 5.7 ¿Por qué 400/409 se propagan pero 5xx se normaliza a 503?

- **400/409** son errores **del cliente**: el operador puede corregirlos (anotar más, esperar).
  La UI necesita el mensaje específico para guiar al operador.
- **5xx/timeout/respuesta inválida** son errores **de disponibilidad**: la UI solo puede decir
  "intenta más tarde". Normalizarlos a 503 unifica el manejo y respeta la Regla de Oro.

---

## 6. CONTRATOS DE DATOS (SCHEMAS)

### 6.1 `TrainRequest` — petición de entrenamiento

Definido en [`apps/api/modules/ai/schemas.py`](../../apps/api/modules/ai/schemas.py:99) y
[`ai-local/app/schemas.py`](../../ai-local/app/schemas.py:114):

```python
class TrainRequest(BaseModel):
    skus: Optional[List[str]] = None          # None = todos los SKUs disponibles
    epochs: int = Field(50, ge=1, le=500)     # épocas de entrenamiento
    imgsz: int = Field(640, ge=160, le=1280)  # tamaño de imagen (mínimo 160)
    batch: int = Field(8, ge=1, le=64)        # tamaño de lote
    run_name: str = Field("bakery")           # nombre del run en ultralytics
```

> **Validación importante:** `imgsz` tiene `ge=160`. Un valor menor (p. ej. 64) produce
> **422 Unprocessable Entity** en el Gateway. Esto se descubrió durante el smoke test.

### 6.2 `TrainStatusResponse` — estado del entrenamiento

```python
class TrainStatusResponse(BaseModel):
    activo: bool
    iniciado_en: Optional[str]
    terminado_en: Optional[str]
    ok: Optional[bool]
    mensaje: str
    resumen: Optional[dict]
    error: Optional[str]
    log_tail: List[str]
```

### 6.3 `DatasetSummaryResponse` — resumen del dataset

```python
class DatasetSummaryResponse(BaseModel):
    disponible: bool
    skus: dict            # {"10": {"imagenes": 8, "anotadas": 8}}
    total_imagenes: int
    total_etiquetas: int
```

**Ejemplo real de respuesta (smoke test):**

```json
{
  "disponible": true,
  "skus": {"10": {"imagenes": 8, "anotadas": 8}},
  "total_imagenes": 8,
  "total_etiquetas": 8
}
```

---

## 7. FORMATO YOLO DE LAS ETIQUETAS

Cada imagen anotada tiene un `.txt` hermano con **una línea por caja**:

```
<clase> <cx> <cy> <w> <h>
```

| Campo | Significado | Rango |
|---|---|---|
| `clase` | Índice de clase (0 = "pan") | entero ≥ 0 |
| `cx` | Centro X normalizado | 0.0 .. 1.0 |
| `cy` | Centro Y normalizado | 0.0 .. 1.0 |
| `w` | Ancho normalizado | 0.0 .. 1.0 |
| `h` | Alto normalizado | 0.0 .. 1.0 |

**Ejemplo** (`pan_001.txt` con 2 panes):

```
0 0.312500 0.450000 0.125000 0.180000
0 0.687500 0.460000 0.130000 0.175000
```

> **Coordenadas normalizadas y con origen en el CENTRO** (no en la esquina). El frontend
> ([`AnnotationCanvas.jsx`](../../apps/pos/components/AnnotationCanvas.jsx)) dibuja en píxeles y
> el backend ([`POSService.save_annotations`](../../apps/api/modules/pos/service.py:956)) convierte
> a este formato.

---

## 8. CONFIGURACIÓN Y DESPLIEGUE

### 8.1 Variables de entorno

| Variable | Contenedor | Default | Descripción |
|---|---|---|---|
| `VISION_TRAINING_DIR` | `api` | `/app/static/training` | Raíz del dataset (imágenes + labels) |
| `DATASET_DIR` | `ia-local` | `/dataset` | Raíz de lectura del dataset (ro) |
| `TRAINING_DIR` | `ia-local` | `/training` | Raíz de escritura del modelo |
| `YOLO_MODEL` | `ia-local` | `yolov8n.pt` | Pesos base del fine-tuning |
| `AI_LOCAL_TRAIN_TIMEOUT` | `api` | `3600` | Timeout del proxy (segundos) |

### 8.2 Volúmenes (bind mounts)

**`docker-compose.yml` (servicio `api`):**

```yaml
volumes:
  # v7 (Fase 8): dataset de entrenamiento de vision (imagenes + labels YOLO).
  # Se monta en una ruta ABSOLUTA y estable (/app/static/training) para que
  # el MISMO directorio fisico del host pueda montarse en el motor de IA
  # (ia-local) como /dataset.
  - ../ERP-R-DE-RICO-DATA/vision_training:/app/static/training
environment:
  - VISION_TRAINING_DIR=/app/static/training
```

**`docker-compose.ai.yml` (servicio `ia-local`):**

```yaml
volumes:
  - ../ERP-R-DE-RICO-DATA/ai_models:/models
  # Dataset: MISMO directorio fisico que el api usa como /app/static/training.
  # READ-ONLY: el motor solo lee; la anotacion es del operador.
  - ../ERP-R-DE-RICO-DATA/vision_training:/dataset:ro
  # Salida del entrenamiento: best.pt, runs/, dataset_yolo/.
  - ../ERP-R-DE-RICO-DATA/ai_training:/training
environment:
  - DATASET_DIR=/dataset
  - TRAINING_DIR=/training
```

### 8.3 Comandos de operación

```bash
# Levantar / reconstruir el motor de IA (tras cambiar ai-local/)
docker compose -f docker-compose.ai.yml up -d --build ia-local

# Recrear SOLO el api (tras cambiar docker-compose.yml o apps/api/)
docker compose up -d --no-deps api

# Verificar que el motor responde
curl http://localhost:9000/status
# → {"disponible":true,"whisper":true,"yolo":true,"ollama":true,"errores":[]}

# Ver el resumen del dataset (vía motor)
curl http://localhost:9000/vision/dataset-summary

# Ver el resumen del dataset (vía Gateway)
curl http://localhost:8000/api/v1/ai/vision/dataset-summary

# Lanzar un entrenamiento (vía Gateway)
curl -X POST http://localhost:8000/api/v1/ai/vision/train \
  -H "Content-Type: application/json" \
  -d '{"skus":["10"],"epochs":50,"imgsz":640,"batch":8}'

# Consultar el estado
curl http://localhost:8000/api/v1/ai/vision/train/status
```

---

## 9. VALIDACIÓN (SMOKE TEST)

### 9.1 Qué se validó

Se ejecutó un **smoke test sintético** con un dataset de prueba (8 imágenes + 8 etiquetas
generadas programáticamente) para validar el pipeline completo **sin esperar un entrenamiento
real de horas**:

| Parámetro | Valor |
|---|---|
| SKUs | `["10"]` |
| Imágenes | 8 |
| Épocas | 1 |
| `imgsz` | 160 (mínimo permitido) |
| `batch` | 4 |
| Run | `smoke` |

### 9.2 Resultado

```json
{
  "ok": true,
  "skus": ["10"],
  "imagenes": 8,
  "epochs": 1,
  "imgsz": 160,
  "modelo": "/training/best.pt",
  "run": "/training/runs/smoke"
}
```

- `best.pt` generado: **6,189,866 bytes** en `/training/best.pt`.
- Mensaje de estado: **"Entrenamiento completado. Modelo recargado."**
- Verificación del motor tras el entrenamiento:
  `{"disponible": true, "whisper": true, "yolo": true, "ollama": true, "errores": []}`
- **Hot-reload confirmado:** el motor recargó el modelo sin reiniciar el contenedor.

### 9.3 Limpieza

Tras el smoke test se **eliminaron las etiquetas sintéticas** para no contaminar el dataset real
del operador (`labels restantes: []`).

---

## 10. BUG RESUELTO — LA RUTA DOBLE `apps/api`

### 10.1 Síntoma

El motor `ia-local` veía `/dataset` **VACÍO**, aunque el contenedor `api` sí veía las 8 imágenes
en `/app/apps/api/static/training/10/`.

### 10.2 Causa raíz

El contenedor `api` monta el host `apps/api` → `/app`. El servicio usaba una ruta **relativa**:

```python
base_dir = Path("apps/api/static/training")   # ❌ relativa al CWD
```

Como el `WORKDIR` del contenedor es `/app`, la ruta resolvía a:

```
/app/apps/api/static/training   →   host: apps/api/apps/api/static/training
```

Es decir, **doble `apps/api`**. Pero el volumen de `ia-local` apuntaba a
`apps/api/static/training` (una sola vez) → **directorios distintos** → el motor veía vacío.

### 10.3 Solución

1. Se hizo la raíz **configurable y absoluta** vía `VISION_TRAINING_DIR`
   (default `/app/static/training`), eliminando la dependencia del CWD:

```python
@staticmethod
def _training_base_dir() -> "Path":
    """Directorio RAIZ del dataset de entrenamiento (imagenes + labels YOLO).

    v7 (Fase 8): la ruta es configurable via `VISION_TRAINING_DIR` para que
    el mismo directorio fisico pueda montarse en el motor de IA (`ia-local`)
    como `/dataset`. Si no se define, se usa una ruta ABSOLUTA por defecto
    (`/app/static/training`) para que NO dependa del CWD del proceso.
    """
    import os
    from pathlib import Path

    base = os.getenv("VISION_TRAINING_DIR", "/app/static/training")
    base_dir = Path(base)
    base_dir.mkdir(parents=True, exist_ok=True)
    return base_dir
```

2. Se unificó el directorio físico del host en `ERP-R-DE-RICO-DATA/vision_training`, y **ambos**
   contenedores apuntan ahí:

| Contenedor | Host | Contenedor |
|---|---|---|
| `api` | `ERP-R-DE-RICO-DATA/vision_training` | `/app/static/training` |
| `ia-local` | `ERP-R-DE-RICO-DATA/vision_training` | `/dataset` (ro) |

3. Se migraron las 8 imágenes existentes con `xcopy` al directorio canónico.

### 10.4 Verificación

```bash
# ia-local ve el dataset
docker exec rderico-ia-local ls -la /dataset/10
# → 8 archivos .jpg

# api ve el mismo dataset
docker exec rderico-api-dev ls -la /app/static/training/10
# → los mismos 8 archivos .jpg
```

### 10.5 Lección aprendida

> **En Windows + Docker Desktop, un bind mount puede parecer vacío si dos contenedores escriben
> y leen rutas que resuelven a directorios físicos distintos.** La causa más común es una ruta
> **relativa** que depende del `WORKDIR` del contenedor. **Regla:** las rutas de datos
> compartidos entre contenedores deben ser **absolutas y configurables por entorno**.

---

## 11. SEGURIDAD Y LÍMITES

### 11.1 Aislamiento

- El motor `ia-local` **no tiene autenticación** y solo se expone en `127.0.0.1:9000`
  (nunca a la LAN). El ERP lo alcanza por la red interna `rderico-ia-net`.
- El dataset se monta **read-only** en el motor.
- El ERP **nunca** importa `torch`/`ultralytics`/`whisper`.

### 11.2 Límite de memoria (crítico)

El servicio `ia-local` tiene `mem_limit: 6g` y `memswap_limit: 6g`. **NO QUITAR.** Sin este
límite, el entrenamiento puede consumir toda la RAM del host y **tumbar el POS**. Ajustar según
hardware:

| Hardware | `mem_limit` sugerido |
|---|---|
| Sucursal 8 GB | `3g` |
| Sucursal 16 GB | `6g` |
| Matriz 32 GB | `12g` |

### 11.3 Concurrencia

Solo puede haber **UN entrenamiento a la vez** (flag `ESTADO_ENTRENAMIENTO["activo"]`). Un
segundo intento recibe **409**. Esto protege la CPU/RAM del host.

### 11.4 Path traversal

`POSService._safe_sku()` sanitiza el SKU antes de usarlo como nombre de carpeta:

```python
@staticmethod
def _safe_sku(sku: str) -> str:
    """Sanitiza el SKU para usarlo como nombre de carpeta (anti path-traversal)."""
    return "".join(c for c in (sku or "") if c.isalnum() or c in ("-", "_")).rstrip()
```

---

## 12. ARCHIVOS INVOLUCRADOS

### 12.1 Motor de IA (`ia-local/`)

| Archivo | Rol |
|---|---|
| [`ai-local/train/train_bakery.py`](../../ai-local/train/train_bakery.py) | Pipeline de entrenamiento (subproceso) |
| [`ai-local/train/__init__.py`](../../ai-local/train/__init__.py) | Marca el paquete `train/` |
| [`ai-local/app/engines/training.py`](../../ai-local/app/engines/training.py) | Orquestación + estado + hot-reload |
| [`ai-local/app/engines/vision.py`](../../ai-local/app/engines/vision.py) | `cargar_modelo()` (hot-reload) |
| [`ai-local/app/main.py`](../../ai-local/app/main.py) | 3 endpoints de entrenamiento |
| [`ai-local/app/schemas.py`](../../ai-local/app/schemas.py) | `TrainRequest`, `TrainStatusResponse`, `DatasetSummaryResponse` |
| [`ai-local/Dockerfile`](../../ai-local/Dockerfile) | `COPY train/`, `mkdir /models /dataset /training` |

### 12.2 ERP / Gateway (`apps/api/`)

| Archivo | Rol |
|---|---|
| [`apps/api/modules/ai/router.py`](../../apps/api/modules/ai/router.py) | 3 endpoints del Gateway |
| [`apps/api/modules/ai/service.py`](../../apps/api/modules/ai/service.py) | Proxy + timeout + traducción de errores |
| [`apps/api/modules/ai/schemas.py`](../../apps/api/modules/ai/schemas.py) | Schemas del Gateway |
| [`apps/api/modules/pos/service.py`](../../apps/api/modules/pos/service.py) | `_training_base_dir()`, `_training_dir()`, `upload_training_images()`, `save_annotations()` |

### 12.3 Frontend (`apps/pos/`)

| Archivo | Rol |
|---|---|
| [`apps/pos/VisionTrainingUI.jsx`](../../apps/pos/VisionTrainingUI.jsx) | Pestaña Anotación + botón Entrenar |
| [`apps/pos/services/POSService.js`](../../apps/pos/services/POSService.js) | `getDatasetSummary()`, `getTrainStatus()`, `trainVision()` |
| [`apps/pos/components/AnnotationCanvas.jsx`](../../apps/pos/components/AnnotationCanvas.jsx) | Dibujo de cajas |

### 12.4 Infraestructura

| Archivo | Rol |
|---|---|
| [`docker-compose.yml`](../../docker-compose.yml) | Bind mount `vision_training` + `VISION_TRAINING_DIR` |
| [`docker-compose.ai.yml`](../../docker-compose.ai.yml) | Bind mounts `/dataset:ro` y `/training` |

---

## 13. ESTADO ACTUAL Y TRABAJO PENDIENTE

### 13.1 Estado

| Componente | Estado |
|---|---|
| Pipeline de entrenamiento | ✅ Implementado y validado (smoke test) |
| Endpoints del motor | ✅ Implementados |
| Endpoints del Gateway | ✅ Implementados |
| UI (botón Entrenar) | ✅ Implementada |
| Hot-reload | ✅ Confirmado |
| Bug de ruta doble `apps/api` | ✅ Resuelto |
| Commit + push | ✅ `26c95eb` |

### 13.2 Pendiente

- **Entrenamiento real:** el dataset actual tiene 8 imágenes anotadas (sintéticas, ya eliminadas).
  Para un modelo útil se necesitan **decenas o cientos de imágenes reales anotadas** por SKU.
- **Validación manual en navegador (FASE 3 v18):** ejecutar los 5 flujos del POS en el navegador,
  incluido el botón "Entrenar".
- **Métricas de calidad:** tras un entrenamiento real, revisar `runs/<name>/results.csv` para
  evaluar mAP/precisión y decidir si se necesitan más datos o más épocas.

### 13.3 Recomendaciones para el primer entrenamiento real

1. Anotar **al menos 50-100 imágenes por SKU** (más datos = mejor modelo).
2. Variar iluminación, ángulos y cantidad de pan por charola.
3. Empezar con `epochs: 50` e `imgsz: 640`.
4. Revisar `log_tail` y `runs/<name>/results.csv` tras el entrenamiento.
5. Si el modelo confunde piezas pegadas, anotar más ejemplos de piezas juntas.

---

## 14. GLOSARIO

| Término | Definición |
|---|---|
| **Fine-tuning** | Reentrenar un modelo preentrenado (YOLOv8n) con datos propios |
| **Hot-reload** | Recargar el modelo en memoria sin reiniciar el proceso |
| **YOLO** | "You Only Look Once" — detector de objetos en tiempo real |
| **best.pt** | Los mejores pesos generados por ultralytics durante el entrenamiento |
| **data.yaml** | Archivo de configuración del dataset YOLO (rutas + clases) |
| **Época** | Una pasada completa del modelo sobre todo el dataset |
| **imgsz** | Tamaño al que se redimensionan las imágenes para entrenar/inferir |
| **batch** | Número de imágenes procesadas juntas antes de actualizar pesos |
| **Subproceso** | Proceso independiente lanzado por el motor (aislamiento de CPU/RAM) |
| **Regla de Oro §1.2** | El ERP nunca importa torch/whisper/ultralytics; si la IA cae, el POS sigue |

---

## 15. HISTORIAL DE CAMBIOS

| Versión | Fecha | Cambio |
|---|---|---|
| v7 (Fase 8) | 22 Sep 2026 | Implementación completa del módulo de entrenamiento (commit `26c95eb`) |
| v7 (Fase 8.1) | 22 Sep 2026 | Corrección del bug de ruta doble `apps/api` + unificación de `VISION_TRAINING_DIR` |
| v7 (Fase 8.2) | 22 Sep 2026 | Smoke test sintético validado + hot-reload confirmado |
| v7 (Fase 8.3) | 22 Sep 2026 | Creación de esta documentación |

---

> **Documento mantenido por:** Equipo de Ingeniería R de Rico
> **Próxima revisión:** tras el primer entrenamiento real con dataset de producción