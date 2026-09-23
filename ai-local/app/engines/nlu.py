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
import re
import unicodedata

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
PROMPT_PEDIDO = """Eres un asistente experto que lee capturas de pantalla de
WhatsApp de una panaderia mexicana. Recibes el TEXTO CRUDO extraido por OCR de
una conversacion donde un cliente escribe su pedido. Devuelves UNICAMENTE un
objeto JSON.

FORMATO EXACTO (sin texto fuera del JSON):
{
  "items": [
    { "producto": "string", "cantidad": numero, "confianza": numero entre 0 y 1 }
  ],
  "notas": "string o null",
  "confianza": numero entre 0 y 1
}

EJEMPLOS DE ENTRADA -> SALIDA:

Entrada:
"Juan Perez
12:30
Hola buenas tardes
me manda 20 bolillos y 15 conchas
y 3 kilos de telera
gracias"

Salida:
{"items":[{"producto":"bolillos","cantidad":20,"confianza":0.95},{"producto":"conchas","cantidad":15,"confianza":0.95},{"producto":"telera","cantidad":3,"confianza":0.9}],"notas":null,"confianza":0.93}

Entrada:
"Maria
10:15
buenos dias
quiero 50 pz de bolillo
10 concha
5 rosca de reyes"

Salida:
{"items":[{"producto":"bolillo","cantidad":50,"confianza":0.95},{"producto":"concha","cantidad":10,"confianza":0.95},{"producto":"rosca de reyes","cantidad":5,"confianza":0.9}],"notas":null,"confianza":0.93}

REGLAS DE INTERPRETACION:
1. Extrae SOLO los productos que el CLIENTE pide. Ignora saludos ("hola",
   "buenas tardes"), cortesia ("gracias"), confirmaciones del vendedor,
   nombres de personas, horas ("12:30") y mensajes del sistema ("en linea").
2. Un renglon puede traer VARIOS productos: "20 bolillos y 15 conchas" son
   DOS renglones separados. Separa SIEMPRE por "y", "e", comas o saltos.
3. La cantidad puede venir ANTES ("20 bolillos") o DESPUES ("bolillos 20").
   Acepta "20 pz", "20x", "3 kg", "3 kilos", "2 cajas".
4. Si un renglon NO trae cantidad explicita, usa 1.
5. Si el texto menciona un producto que NO esta en la lista de candidatos,
   devuelvelo igual con el texto tal cual y confianza baja (<= 0.4). El
   operador lo corregira. NUNCA lo omitas en silencio.
6. Si NO encuentras ningun producto, devuelve "items": [] y confianza baja.
7. "confianza" global refleja que tan seguro estas de la lectura completa.
8. NUNCA inventes productos que no aparezcan en el texto.
9. NUNCA sumes ni agrupes renglones distintos.
10. Corrige errores obvios de OCR en nombres de producto comunes
    ("bo1illos" -> "bolillos", "c0nchas" -> "conchas").

No expliques nada. No agregues texto fuera del JSON. No ejecutes acciones."""


# ---------------------------------------------------------------------------
# Parser DETERMINISTA de respaldo (sin LLM)
# ---------------------------------------------------------------------------
# Por que existe: el LLM local (qwen2.5:3b en CPU) puede tardar, fallar o
# devolver items vacios. Si eso pasa, el operador veia "no reconocio nada"
# aunque el OCR SI hubiera leido el texto. Este parser por regex garantiza
# que SIEMPRE se proponga algo cuando el OCR devolvio texto util.
#
# Es deliberadamente simple y conservador: extrae "cantidad + producto" de
# cada linea. El match contra el catalogo real lo hace el Gateway despues.
# El operador corrige en la UI. Nunca inventa: solo lee lo que esta escrito.

# Palabras que NO son productos (saludos, cortesia, ruido de chat).
_RUIDO = {
    "hola", "buenas", "buenos", "dias", "tardes", "noches", "gracias",
    "por", "favor", "ok", "okay", "si", "no", "listo", "en", "linea",
    "escribiendo", "hoy", "manana", "ayer", "pedido", "favor.", "saludos",
    "buen", "dia", "que", "tal", "como", "estas", "nos", "vemos", "cliente",
    "vendedor", "am", "pm", "el", "la", "los", "las", "de", "del", "y",
}

# "20 bolillos", "20x conchas", "20 bolillos y 15 conchas", "3 kg de pan"
_RE_CANTIDAD_PRODUCTO = re.compile(
    r"(?P<cant>\d{1,4}(?:[.,]\d{1,2})?)\s*"
    r"(?:x|pz|pza|piezas?|kg|kilos?|cajas?|charolas?|bolsas?)?\s*"
    r"(?:de\s+)?"
    r"(?P<prod>[a-záéíóúñü][a-záéíóúñü\s]{2,40})",
    re.IGNORECASE,
)

# "bolillos 20" (producto primero, cantidad despues)
_RE_PRODUCTO_CANTIDAD = re.compile(
    r"(?P<prod>[a-záéíóúñü][a-záéíóúñü\s]{2,40}?)\s*"
    r"(?:x|:)?\s*"
    r"(?P<cant>\d{1,4}(?:[.,]\d{1,2})?)\s*$",
    re.IGNORECASE,
)


def _sin_acentos(texto: str) -> str:
    """Normaliza para comparar: minusculas y sin acentos."""
    normal = unicodedata.normalize("NFKD", texto.lower())
    return "".join(c for c in normal if not unicodedata.combining(c))


def _limpiar_producto(nombre: str) -> str:
    """Quita conectores y ruido del final del nombre del producto."""
    limpio = nombre.strip(" .,;:-")
    # Cortar en conectores que suelen unir dos renglones.
    for conector in (" y ", " e ", " mas ", " tambien ", " ademas "):
        if conector in f" {limpio} ":
            limpio = f" {limpio} ".split(conector)[0].strip()
    palabras = [p for p in limpio.split() if _sin_acentos(p) not in _RUIDO]
    return " ".join(palabras).strip(" .,;:-")


def parsear_pedido_determinista(texto_ocr: str) -> dict:
    """Extrae renglones producto+cantidad SIN LLM (respaldo por regex).

    Devuelve el mismo contrato que `parsear_pedido`: {items, notas, confianza}.
    Se usa cuando el LLM falla o devuelve cero items pero el OCR SI leyo texto.
    """
    items: list[dict] = []
    vistos: set[str] = set()

    for linea in (texto_ocr or "").splitlines():
        limpia = linea.strip()
        if len(limpia) < 3:
            continue

        # Intento 1: "20 bolillos"
        for m in _RE_CANTIDAD_PRODUCTO.finditer(limpia):
            producto = _limpiar_producto(m.group("prod"))
            if not producto or len(producto) < 3:
                continue
            clave = _sin_acentos(producto)
            if clave in vistos:
                continue
            vistos.add(clave)
            try:
                cantidad = float(m.group("cant").replace(",", "."))
            except ValueError:
                cantidad = 1.0
            items.append(
                {"producto": producto, "cantidad": cantidad, "confianza": 0.45}
            )

        # Intento 2: "bolillos 20" (solo si el intento 1 no encontro nada).
        if not items:
            m2 = _RE_PRODUCTO_CANTIDAD.search(limpia)
            if m2:
                producto = _limpiar_producto(m2.group("prod"))
                if producto and len(producto) >= 3:
                    clave = _sin_acentos(producto)
                    if clave not in vistos:
                        vistos.add(clave)
                        try:
                            cantidad = float(m2.group("cant").replace(",", "."))
                        except ValueError:
                            cantidad = 1.0
                        items.append(
                            {
                                "producto": producto,
                                "cantidad": cantidad,
                                "confianza": 0.4,
                            }
                        )

    logger.info("Parser determinista: %d renglones (respaldo sin LLM)", len(items))
    return {
        "items": items,
        "notas": "Lectura por respaldo (sin IA). Revisa las cantidades.",
        "confianza": 0.4 if items else 0.0,
    }


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

    # --- Respaldo determinista ---
    # Si el LLM no devolvio NINGUN renglon pero el OCR SI leyo texto, se
    # aplica el parser por regex. Esto evita el sintoma "no reconocio nada"
    # cuando en realidad el texto estaba bien y solo fallo el LLM.
    if not items and (texto_ocr or "").strip():
        respaldo = parsear_pedido_determinista(texto_ocr)
        if respaldo["items"]:
            logger.warning(
                "LLM devolvio 0 renglones; se usa respaldo determinista (%d renglones)",
                len(respaldo["items"]),
            )
            return respaldo

    logger.info("Parser de pedido: %d renglones, confianza %.2f", len(items), confianza)

    return {
        "items": items,
        "notas": datos.get("notas"),
        "confianza": min(max(confianza, 0.0), 1.0),
    }
