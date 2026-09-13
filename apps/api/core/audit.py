"""v7 (Fase 2): auditoria de operaciones sensibles y RBAC (secciones 13 y 14
del Contexto Maestro).

Reglas absolutas:
  - Toda operacion sensible (merma, traspaso, ajuste, eliminacion) inserta un
    registro en la tabla `auditoria` EN LA MISMA TRANSACCION SQL que la operacion.
    Si la operacion hace rollback, la auditoria desaparece con ella (coherencia).
  - El backend valida permisos de forma independiente. Nunca se confia en que el
    frontend oculte el boton (Defensa en Profundidad, seccion 4.4).

Este modulo NO hace commit: el llamador es dueno de la transaccion.
"""
import datetime
import json
import logging

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from modules.security import models as security_models

logger = logging.getLogger(__name__)


def _utcnow_naive() -> datetime.datetime:
    """UTC naive: las columnas DateTime son TIMESTAMP WITHOUT TIME ZONE."""
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _serializar(valor):
    """Convierte valores no JSON-serializables (Decimal, datetime) a texto."""
    if valor is None:
        return None
    if isinstance(valor, (str, int, float, bool)):
        return valor
    if isinstance(valor, datetime.datetime):
        return valor.isoformat()
    try:
        return json.loads(json.dumps(valor, default=str))
    except (TypeError, ValueError):
        return str(valor)


async def registrar_auditoria(
    db: AsyncSession,
    *,
    usuario_id,
    accion: str,
    entidad: str,
    entidad_id=None,
    valores_antes=None,
    valores_despues=None,
    detalle: str = None,
) -> security_models.Auditoria:
    """Inserta un registro de auditoria SIN hacer commit.

    El llamador debe invocar `await db.commit()` despues, dentro de la misma
    transaccion que la operacion auditada. Si la operacion falla y se hace
    rollback, el registro de auditoria tambien se revierte (correcto: no se
    audita una operacion que no ocurrio).
    """
    # v7 (Fase 2.3): auditoria.usuario_id es INTEGER; los schemas del modulo
    # warehouse envian usuario_id como str. Coercionamos para evitar DataError.
    usuario_id_int = None
    if usuario_id is not None and usuario_id != "":
        try:
            usuario_id_int = int(usuario_id)
        except (TypeError, ValueError):
            logger.warning("Auditoria: usuario_id invalido (no numerico): %r", usuario_id)

    registro = security_models.Auditoria(
        usuario_id=usuario_id_int,
        accion=accion,
        entidad=entidad,
        entidad_id=str(entidad_id) if entidad_id is not None else None,
        valores_antes=_serializar(valores_antes),
        valores_despues=_serializar(valores_despues),
        detalle=detalle,
        created_at=_utcnow_naive(),
    )
    db.add(registro)
    return registro


async def verificar_permiso(
    db: AsyncSession,
    usuario_id,
    permiso: str,
) -> None:
    """Valida que el usuario tenga el permiso indicado. Lanza HTTP 403 si no.

    Patron obligatorio (seccion 13.2): `verificar_permiso(usuario, permiso=...)`.

    Reglas:
      - El perfil ADMIN (permissions {"all": "full"}) tiene acceso total.
      - El permiso se busca como clave plana ("almacenes.merma") o como
        modulo/submodulo ("almacenes": {"merma": "full"}).
      - Un usuario sin perfil o inactivo no tiene permisos.
    """
    if usuario_id is None or usuario_id == "":
        raise HTTPException(
            status_code=403,
            detail=f"Permiso denegado: se requiere '{permiso}' (usuario no identificado).",
        )

    # v7 (Fase 2.3): Employee.id es Integer, pero los schemas del modulo
    # warehouse tipan usuario_id como str. Coercionamos a int para evitar
    # "operator does not exist: integer = character varying" en PostgreSQL.
    try:
        usuario_id_int = int(usuario_id)
    except (TypeError, ValueError):
        logger.warning("RBAC: usuario_id invalido (no numerico): %r", usuario_id)
        raise HTTPException(
            status_code=403,
            detail=f"Permiso denegado: se requiere '{permiso}' (usuario no identificado).",
        )

    resultado = await db.execute(
        select(security_models.Employee).where(
            security_models.Employee.id == usuario_id_int,
            security_models.Employee.is_active == True,  # noqa: E712
        )
    )
    empleado = resultado.scalar_one_or_none()
    if not empleado or not empleado.profile_id:
        raise HTTPException(
            status_code=403,
            detail=f"Permiso denegado: se requiere '{permiso}'.",
        )

    res_perfil = await db.execute(
        select(security_models.SecurityProfile).where(
            security_models.SecurityProfile.id == empleado.profile_id
        )
    )
    perfil = res_perfil.scalar_one_or_none()
    permisos = (perfil.permissions if perfil else None) or {}

    if not _tiene_permiso(permisos, permiso):
        logger.warning(
            "RBAC: usuario_id=%s (perfil=%s) sin permiso '%s'",
            usuario_id, getattr(perfil, "name", None), permiso,
        )
        raise HTTPException(
            status_code=403,
            detail=f"Permiso denegado: se requiere '{permiso}'.",
        )


def _tiene_permiso(permisos: dict, permiso: str) -> bool:
    """Evalua un permiso contra el dict de permisos del perfil."""
    if not isinstance(permisos, dict):
        return False
    # Acceso total
    if permisos.get("all") == "full":
        return True
    # Clave plana: {"almacenes.merma": "full"}
    if permisos.get(permiso) in ("full", "write", True):
        return True
    # Anidado: {"almacenes": {"merma": "full"}}
    if "." in permiso:
        modulo, sub = permiso.split(".", 1)
        nodo = permisos.get(modulo)
        if isinstance(nodo, dict):
            if nodo.get("all") == "full":
                return True
            if nodo.get(sub) in ("full", "write", True):
                return True
        elif nodo == "full":
            return True
    return False
