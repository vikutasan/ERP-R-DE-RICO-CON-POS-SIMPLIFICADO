"""Motor de NLU — interpretacion de intencion con LLM local (Ollama).

El LLM NO se carga en este contenedor: corre en Ollama (contenedor aparte).
Aqui solo se le habla por HTTP. Esto mantiene este contenedor ligero.

CONTRATO CRITICO (spec §8 — mitigacion de prompt injection):
    El LLM SOLO devuelve JSON validado por Pydantic. NUNCA ejecuta acciones.
    Si el LLM alucina un SKU inexistente, `sku_resuelto=False` y la UI
    obliga al operador a elegir manualmente.

REGLA (spec §5.2): este motor PROPONE. Nunca registra stock.
"""

import json
import logging
import os

import httpx

from .. import schemas

logger = logging.getLogger("rderico.ia.motor.nlu")

# URL de Ollama (contenedor aparte en docker-compose.ai.yml)
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen2.5:3b")

# Timeout de inferencia. Un LLM de 3B en CPU tarda >30s en la PRIMERA
# inferencia (carga del modelo en RAM). 30s provocaba ReadTimeout con
# mensaje vacio. Se sube a 120s y se hace warm-up al arrancar.
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "120"))

# Prompt del sistema: instruye al LLM a devolver SOLO JSON.
# El vocabulario de SKUs se inyecta desde system_settings (cero listas hardcodeadas).
PROMPT_SISTEMA = """Eres un interprete de comandos de un POS de panaderia.
Devuelve UNICAMENTE un objeto JSON con esta forma exacta:
{
  "intencion": "registrar_entrada" | "contar_stock" | "consultar" | "desconocida",
  "sku": "string o null",
  "cantidad": numero o null,
  "unidad": "kg" | "pieza" | "caja" | null,
  "confianza": numero entre 0 y 1
}
No expliques nada. No agregues texto fuera del JSON. No ejecutes acciones."""


async def verificar_ollama() -> bool:
    """Verifica que Ollama responde."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as cliente:
            resp = await cliente.get(f"{OLLAMA_URL}/api/tags")
            return resp.status_code == 200
    except Exception:  # noqa: BLE001
        return False


async def calentar_modelo() -> bool:
    """Carga el modelo en RAM con una inferencia trivial.

    Sin esto, la PRIMERA peticion real del operador paga la carga del modelo
    (>30s en CPU) y suele morir por timeout. El warm-up mueve ese costo al
    arranque del contenedor, donde nadie esta esperando.

    Devuelve True si el modelo quedo caliente. Nunca lanza: si falla, el
    motor arranca igual y la primera peticion pagara el costo.
    """
    try:
        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as cliente:
            resp = await cliente.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": LLM_MODEL,
                    "prompt": "hola",
                    "stream": False,
                    "options": {"num_predict": 1},  # 1 token: solo cargar
                },
            )
            resp.raise_for_status()
        logger.info("Modelo %s caliente.", LLM_MODEL)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("Warm-up de %s fallo: %r", LLM_MODEL, exc)
        return False


async def interpretar(payload: schemas.VoiceParseIntentRequest) -> schemas.VoiceParseIntentResponse:
    """Interpreta texto libre y devuelve una intencion estructurada.

    El LLM solo devuelve JSON. Si el JSON es invalido, se lanza excepcion
    y main.py la convierte en 503 (el ERP degrada a manual).
    """
    prompt_usuario = payload.texto
    if payload.contexto:
        prompt_usuario = f"[contexto: {payload.contexto}] {payload.texto}"

    try:
        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as cliente:
            resp = await cliente.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": LLM_MODEL,
                    "prompt": prompt_usuario,
                    "system": PROMPT_SISTEMA,
                    "stream": False,
                    "format": "json",  # fuerza salida JSON valida
                },
            )
            resp.raise_for_status()
            cuerpo = resp.json()
    except httpx.TimeoutException as exc:
        # str() de ReadTimeout es vacio: se construye un mensaje util.
        raise TimeoutError(
            f"Ollama no respondio en {OLLAMA_TIMEOUT}s (modelo {LLM_MODEL})."
        ) from exc
    except httpx.HTTPError as exc:
        raise ConnectionError(
            f"Ollama inalcanzable en {OLLAMA_URL}: {exc!r}"
        ) from exc

    # El LLM devuelve el JSON como string en "response"
    try:
        datos = json.loads(cuerpo.get("response", "{}"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"El LLM devolvio JSON invalido: {exc}") from exc

    # Validacion con Pydantic: si el LLM alucina campos, aqui se detecta.
    return schemas.VoiceParseIntentResponse(
        intencion=datos.get("intencion", "desconocida"),
        sku=datos.get("sku"),
        # sku_resuelto lo decide el ERP contra su catalogo real, no el LLM.
        # Aqui solo se marca True si el LLM devolvio un SKU no vacio.
        sku_resuelto=bool(datos.get("sku")),
        cantidad=datos.get("cantidad"),
        unidad=datos.get("unidad"),
        confianza=float(datos.get("confianza", 0.0)),
    )
