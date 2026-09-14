"""
totem_storage.py — Almacenamiento de imágenes del Display Tótem (V16, Fase 16.2).

Guardián AUTORITATIVO de la validación de archivos (Decisión 3): el frontend
solo da UX temprana; aquí se valida tipo MIME, peso y se sanea el nombre para
evitar path traversal.

El directorio destino es `media/totem`, montado como bind mount externo
(`../ERP-R-DE-RICO-DATA/totem_media`) y servido por FastAPI en `/media/totem`.

NO se realiza conversión WebP en el MVP (Decisión 1): se aceptan JPEG/PNG/WebP
tal cual, evitando añadir Pillow y por ende un rebuild de Docker.
"""
import os
import re
import uuid
import logging

logger = logging.getLogger(__name__)

# Directorio destino (relativo al WORKDIR del contenedor, /app).
TOTEM_MEDIA_DIR = "media/totem"

# Límite de peso por imagen (8 MB) — espejo de MAX_IMAGE_BYTES del frontend.
MAX_IMAGE_BYTES = 8 * 1024 * 1024

# Tipos MIME aceptados y su extensión canónica.
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

# Patrón de saneo: solo letras, dígitos, punto, guion y guion bajo.
_SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def ensure_totem_dir() -> str:
    """Garantiza que el directorio destino exista. Devuelve su ruta absoluta."""
    os.makedirs(TOTEM_MEDIA_DIR, exist_ok=True)
    return os.path.abspath(TOTEM_MEDIA_DIR)


def sanitize_filename(filename: str) -> str:
    """
    Sanea un nombre de archivo para evitar path traversal.

    - Toma solo el basename (descarta cualquier ruta).
    - Rechaza nombres con separadores o `..`.
    - Si el resultado no es seguro, genera un nombre aleatorio.

    Devuelve SIEMPRE un nombre seguro (sin rutas).
    """
    if not filename or not isinstance(filename, str):
        return f"totem_{uuid.uuid4().hex}.bin"

    # Solo el basename, sin rutas.
    base = os.path.basename(filename.replace("\\", "/").strip())

    # Rechaza cualquier intento de traversal o caracteres raros.
    if not base or base in (".", "..") or not _SAFE_NAME_RE.match(base):
        return f"totem_{uuid.uuid4().hex}.bin"

    return base


def save_totem_image(content: bytes, original_filename: str, content_type: str) -> dict:
    """
    Valida y guarda una imagen del tótem.

    Args:
        content: bytes del archivo.
        original_filename: nombre original (se sanea).
        content_type: MIME declarado por el cliente.

    Returns:
        dict con `filename` y `url` (ruta pública `/media/totem/<filename>`).

    Raises:
        ValueError: si el tipo no está permitido o el peso excede el límite.
    """
    # 1. Validar tipo MIME (guardián autoritativo).
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise ValueError(
            f"Tipo no permitido: {content_type}. Usa JPEG, PNG o WebP."
        )

    # 2. Validar peso.
    if len(content) > MAX_IMAGE_BYTES:
        raise ValueError("La imagen supera el límite de 8 MB.")

    if len(content) == 0:
        raise ValueError("El archivo está vacío.")

    # 3. Saneo del nombre + extensión canónica según MIME.
    safe_name = sanitize_filename(original_filename)
    stem, _ext = os.path.splitext(safe_name)
    canonical_ext = ALLOWED_IMAGE_TYPES[content_type]
    # Prefijo único para evitar colisiones.
    final_name = f"{stem}_{uuid.uuid4().hex[:8]}{canonical_ext}"

    # 4. Escritura en disco.
    ensure_totem_dir()
    dest_path = os.path.join(TOTEM_MEDIA_DIR, final_name)
    with open(dest_path, "wb") as fh:
        fh.write(content)

    logger.info("V16: imagen de tótem guardada en %s", dest_path)

    return {
        "filename": final_name,
        "url": f"/media/totem/{final_name}",
    }


def delete_totem_image(filename: str) -> bool:
    """
    Borra una imagen del tótem del disco. Sanea el nombre para evitar
    path traversal. Devuelve True si se borró, False si no existía.
    """
    safe_name = sanitize_filename(filename)
    dest_path = os.path.join(TOTEM_MEDIA_DIR, safe_name)

    # Defensa extra: la ruta resuelta debe estar DENTRO del directorio destino.
    abs_dir = os.path.abspath(TOTEM_MEDIA_DIR)
    abs_path = os.path.abspath(dest_path)
    if not abs_path.startswith(abs_dir + os.sep):
        logger.warning("V16: intento de borrado fuera del directorio: %s", filename)
        return False

    if os.path.isfile(abs_path):
        os.remove(abs_path)
        logger.info("V16: imagen de tótem borrada: %s", abs_path)
        return True
    return False
