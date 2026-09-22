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
#
# v24 (VOZ-POS): el mismo motor atiende DOS contextos:
#   - "almacen" -> movimientos de inventario (registrar_entrada, contar_stock...)
#   - "pos"     -> venta al publico (agregar_item, quitar_item, cobrar, cancelar)
# El contexto llega en `payload.contexto` y se inyecta en el prompt del usuario.
# El LLM NUNCA ejecuta: solo propone. El operador confirma (human-in-the-loop).
PROMPT_SISTEMA = """Eres un interprete de comandos de un POS de panaderia.
Recibes una frase dictada por un cajero y devuelves UNICAMENTE un objeto JSON.

FORMATO EXACTO (siempre estas 6 llaves, sin texto fuera del JSON):
{
  "intencion": "agregar_item" | "quitar_item" | "cobrar" | "cancelar" | "registrar_entrada" | "contar_stock" | "consultar" | "desconocida",
  "items": [
    { "sku": "string o null", "cantidad": numero o null, "unidad": "kg" | "pieza" | "caja" | null }
  ],
  "sku": "string o null",
  "cantidad": numero o null,
  "unidad": "kg" | "pieza" | "caja" | null,
  "confianza": numero entre 0 y 1
}

REGLAS DE INTERPRETACION:
1. Si la frase menciona VARIOS productos ("agrega 3 conchas y 12 bolillos"), devuelve
   TODOS en el arreglo "items". Si menciona uno solo, "items" lleva un unico elemento.
2. Para compatibilidad, "sku"/"cantidad"/"unidad" repiten el PRIMER elemento de "items".
3. "agregar_item"  -> el cajero quiere sumar productos a la cuenta (venta).
4. "quitar_item"   -> el cajero quiere quitar productos de la cuenta.
5. "cobrar"        -> el cajero pide cerrar/cobrar la cuenta.
6. "cancelar"      -> el cajero pide cancelar la venta.
7. "registrar_entrada" / "contar_stock" / "consultar" -> contexto de ALMACEN.
8. Si no entiendes la frase, usa "desconocida" y confianza baja.
9. "confianza" refleja que tan seguro estas (0 = nada, 1 = totalmente seguro).
10. NUNCA inventes SKUs que no aparezcan en la lista de candidatos del contexto.

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

    # v24 (VOZ-POS): normalizacion del arreglo "items".
    # El LLM puede devolver 1..N items. Se filtran los que no tengan SKU ni
    # cantidad para no propagar ruido a la UI. Si el LLM no devolvio "items"
    # (contrato viejo de almacen), se sintetiza uno a partir de los campos
    # planos para mantener compatibilidad hacia atras.
    items_crudos = datos.get("items")
    items_normalizados: list[dict] = []
    if isinstance(items_crudos, list):
        for it in items_crudos:
            if not isinstance(it, dict):
                continue
            sku_it = it.get("sku")
            cant_it = it.get("cantidad")
            if sku_it in (None, "") and cant_it in (None, ""):
                continue
            items_normalizados.append(
                {
                    "sku": sku_it,
                    "cantidad": cant_it,
                    "unidad": it.get("unidad"),
                }
            )
    if not items_normalizados and datos.get("sku"):
        items_normalizados.append(
            {
                "sku": datos.get("sku"),
                "cantidad": datos.get("cantidad"),
                "unidad": datos.get("unidad"),
            }
        )

    # Validacion con Pydantic: si el LLM alucina campos, aqui se detecta.
    return schemas.VoiceParseIntentResponse(
        intencion=datos.get("intencion", "desconocida"),
        items=items_normalizados,
        sku=datos.get("sku"),
        # sku_resuelto lo decide el ERP contra su catalogo real, no el LLM.
        # Aqui solo se marca True si el LLM devolvio un SKU no vacio.
        sku_resuelto=bool(datos.get("sku")),
        cantidad=datos.get("cantidad"),
        unidad=datos.get("unidad"),
        confianza=float(datos.get("confianza", 0.0)),
    )


# ---------------------------------------------------------------------------
# Fase B (Ruta A) — estructura de un pedido leido por OCR
# ---------------------------------------------------------------------------
# Prompt del sistema para el parser de pedidos. Es DISTINTO al de voz: aqui
# la entrada es texto OCR (sucio, con ruido) y la salida es una lista de
# renglones producto+cantidad. El LLM NUNCA inventa productos: si un renglon
# no se parece a nada del catalogo, lo deja con el texto tal cual y confianza
# baja, para que el operador lo corrija en la UI.
PROMPT_PEDIDO = """Eres un asistente que lee capturas de pantalla de WhatsApp
de una panaderia. Recibes el TEXTO CRUDO extraido por OCR de una conversacion
donde un cliente escribe su pedido. Devuelves UNICAMENTE un objeto JSON.

FORMATO EXACTO (sin texto fuera del JSON):
{
  "items": [
    { "producto": "string", "cantidad": numero, "confianza": numero entre 0 y 1 }
  ],
  "notas": "string o null",
  "confianza": numero entre 0 y 1
}

REGLAS DE INTERPRETACION:
1. Extrae SOLO los productos que el CLIENTE pide. Ignora saludos, "gracias",
   confirmaciones del vendedor y mensajes del sistema ("en linea", horas).
2. Si el cliente escribe "20 bolillos y 15 conchas", devuelve DOS renglones.
3. Si un renglon no trae cantidad explicita, usa 1.
4. Si el texto menciona un producto que NO esta en la lista de candidatos,
   devuelvelo igual con el texto tal cual y confianza baja (<= 0.4). El
   operador lo corregira. NUNCA lo omitas en silencio.
5. Si no encuentras ningun producto, devuelve "items": [] y confianza baja.
6. "confianza" global refleja que tan seguro estas de la lectura completa.
7. NUNCA inventes productos que no aparezcan en el texto.
8. NUNCA sumes ni agrupes renglones distintos.

No expliques nada. No agregues texto fuera del JSON. No ejecutes acciones."""


async def parsear_pedido(
    texto_ocr: str,
    productos_catalogo: list[str] | None = None,
) -> dict:
    """Estructura el texto OCR de una captura en renglones producto+cantidad.

    Devuelve un dict con {items, notas, confianza}. NO valida contra el
    catalogo real del ERP: eso lo hace el Gateway (match en cascada). Aqui
    solo se traduce texto sucio a JSON limpio.

    Si Ollama no responde o devuelve JSON invalido, se lanza excepcion y
    main.py la convierte en 503 (el ERP degrada a captura manual).
    """
    catalogo = productos_catalogo or []
    lista_candidatos = ", ".join(catalogo[:80]) if catalogo else "(sin catalogo)"

    prompt_usuario = (
        f"[catalogo de productos: {lista_candidatos}]\n\n"
        f"TEXTO OCR DE LA CAPTURA:\n{texto_ocr}"
    )

    try:
        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as cliente:
            resp = await cliente.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": LLM_MODEL,
                    "prompt": prompt_usuario,
                    "system": PROMPT_PEDIDO,
                    "stream": False,
                    "format": "json",
                },
            )
            resp.raise_for_status()
            cuerpo = resp.json()
    except httpx.TimeoutException as exc:
        raise TimeoutError(
            f"Ollama no respondio en {OLLAMA_TIMEOUT}s (modelo {LLM_MODEL})."
        ) from exc
    except httpx.HTTPError as exc:
        raise ConnectionError(
            f"Ollama inalcanzable en {OLLAMA_URL}: {exc!r}"
        ) from exc

    try:
        datos = json.loads(cuerpo.get("response", "{}"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"El LLM devolvio JSON invalido: {exc}") from exc

    # Normalizacion: se descartan renglones sin nombre de producto.
    items_crudos = datos.get("items")
    items: list[dict] = []
    if isinstance(items_crudos, list):
        for it in items_crudos:
            if not isinstance(it, dict):
                continue
            nombre = (it.get("producto") or "").strip()
            if not nombre:
                continue
            try:
                cantidad = float(it.get("cantidad") or 0)
            except (TypeError, ValueError):
                cantidad = 0.0
            try:
                conf = float(it.get("confianza") or 0.0)
            except (TypeError, ValueError):
                conf = 0.0
            items.append(
                {
                    "producto": nombre,
                    "cantidad": max(cantidad, 0.0),
                    "confianza": min(max(conf, 0.0), 1.0),
                }
            )

    try:
        confianza = float(datos.get("confianza") or 0.0)
    except (TypeError, ValueError):
        confianza = 0.0

    logger.info("Parser de pedido: %d renglones, confianza %.2f", len(items), confianza)

    return {
        "items": items,
        "notas": datos.get("notas"),
        "confianza": min(max(confianza, 0.0), 1.0),
    }
