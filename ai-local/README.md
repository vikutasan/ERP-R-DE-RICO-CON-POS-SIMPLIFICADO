# Motor de IA Local — Guía de despliegue

> **Estado:** Archivos listos. **NO levantados.** Pendiente de ejecutar cuando el POS esté tranquilo.
> **Spec:** [`ESPECIFICACION_IA_LOCAL_Y_MULTIMODAL.md`](../../PLANOS-ARQUITECTONICOS-DEL-NUEVO-POS/07-ia-local/ESPECIFICACION_IA_LOCAL_Y_MULTIMODAL.md:1)

---

## Qué hay aquí

| Archivo | Qué es |
|---|---|
| [`Dockerfile`](Dockerfile:1) | Imagen del motor (Whisper + YOLO) |
| [`requirements.txt`](requirements.txt:1) | Dependencias del motor (aisladas del ERP) |
| [`app/main.py`](app/main.py:1) | FastAPI con 4 endpoints |
| [`app/schemas.py`](app/schemas.py:1) | Contratos Pydantic (espejo del gateway) |
| [`app/engines/vision.py`](app/engines/vision.py:1) | YOLO — conteo de objetos |
| [`app/engines/voice.py`](app/engines/voice.py:1) | Whisper — transcripción |
| [`app/engines/nlu.py`](app/engines/nlu.py:1) | LLM vía Ollama — intención |
| [`../docker-compose.ai.yml`](../docker-compose.ai.yml:1) | Compose independiente (NO toca el ERP) |

---

## Regla de oro

> **Si este motor no está levantado, el ERP sigue operando en modo manual.**
> El ERP **nunca** importa `torch`, `whisper` ni `ultralytics`. Solo conoce una URL.

---

## Despliegue (3 pasos, cuando el POS esté tranquilo)

### Paso 1 — Levantar el motor (NO toca el ERP)

```bash
docker compose -f docker-compose.ai.yml up -d
```

Esto levanta 2 contenedores: `rderico-ia-local` y `rderico-ia-ollama`.
**El ERP sigue corriendo exactamente igual.** El POS no se interrumpe.

### Paso 2 — Descargar el LLM (una sola vez)

```bash
docker exec rderico-ia-ollama ollama pull qwen2.5:3b
```

### Paso 3 — Verificar que el motor responde

```bash
curl http://localhost:9000/status
```

Respuesta esperada:
```json
{"disponible":true,"whisper":true,"yolo":true,"ollama":true,"errores":[]}
```

---

## Cablear el ERP (esto SÍ requiere recrear el API)

**Solo hacerlo cuando el POS esté cerrado.** Recrear el API = el POS deja de responder unos segundos.

1. Agregar al servicio `api` de [`docker-compose.yml`](../docker-compose.yml:15):
   ```yaml
   environment:
     - AI_LOCAL_ENABLED=true
     - AI_LOCAL_URL=http://ia-local:9000
   networks:
     - default
     - rderico-ia-net
   ```

2. Recrear **solo** el API (no la db, no el pos):
   ```bash
   docker compose up -d --no-deps api
   ```

3. Verificar:
   ```bash
   curl http://localhost:5001/api/v1/ai/status
   ```

---

## Apagar la IA sin desplegar código

```bash
# En .env
AI_LOCAL_ENABLED=false
```

El ERP vuelve a modo manual puro. Cero riesgo.

---

## Si el motor se cae

El ERP devuelve **503 `IA_NO_DISPONIBLE`** y el operador sigue a mano.
**El POS no se ve afectado.** Esta es la regla de oro.

---

## Modos de topología (spec D-2)

| Modo | `AI_LOCAL_URL` | Dónde corre este compose |
|---|---|---|
| **M1** Local por sucursal | `http://ia-local:9000` | En cada sucursal |
| **M2** Local central | `http://ia-matriz:9000` | En la matriz |
| **M3** Nube | `https://api.proveedor.com/v1` | **No se corre** |

Cambiar de modo = cambiar una variable. **Cero código.**

---

## Límites de memoria (CRÍTICO)

El riesgo #1 del spec es que el motor consuma toda la RAM y tumbe el POS.
Por eso [`docker-compose.ai.yml`](../docker-compose.ai.yml:1) fija `mem_limit`:

| Hardware | `ia-local` | `ollama` |
|---|---|---|
| 8 GB | 3g | 2g |
| 16 GB | 6g | 4g |
| 32 GB | 12g | 8g |

**NO QUITAR estos límites.**

---

## Verificación previa (sin levantar nada)

```bash
# Validar que el compose es sintácticamente correcto
docker compose -f docker-compose.ai.yml config

# Ver qué construiría (sin construir)
docker compose -f docker-compose.ai.yml build --dry-run
```
