from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from . import models, schemas
from fastapi import HTTPException
from core.timezone import tz_offset_hours
from zoneinfo import ZoneInfo

async def get_settings(db: AsyncSession):
    result = await db.execute(select(models.SystemSetting))
    return result.scalars().all()

async def get_setting_by_key(db: AsyncSession, key: str):
    result = await db.execute(select(models.SystemSetting).where(models.SystemSetting.key == key))
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(status_code=404, detail=f"Setting {key} not found")
    return setting

async def update_setting(db: AsyncSession, key: str, value: str):
    setting = await get_setting_by_key(db, key)
    setting.value = value
    await db.commit()
    await db.refresh(setting)
    return setting

async def seed_settings(db: AsyncSession):
    # V20 (Fase 20.1): el offset del KDS de Heladería debe derivarse de la zona
    # horaria del negocio (business_timezone), NO hardcodearse. Si el setting aún
    # no existe (primer arranque), se usa America/Mexico_City como fallback.
    # tz_offset_hours() devuelve el offset CON SIGNO (México = -6); el KDS usa la
    # convención POSITIVA (suma horas a la medianoche local para obtener UTC),
    # por eso se aplica abs().
    try:
        tz_result = await db.execute(
            select(models.SystemSetting).where(models.SystemSetting.key == "business_timezone")
        )
        tz_row = tz_result.scalar_one_or_none()
        tz_name = tz_row.value if tz_row and tz_row.value else "America/Mexico_City"
        kds_tz_offset = abs(tz_offset_hours(ZoneInfo(tz_name)))
    except Exception:
        kds_tz_offset = 6

    default_settings = [
        {
            "key": "pos_terminal_status_polling_ms",
            "value": "5000",
            "description": "Frecuencia de actualización del estado de las terminales (ms).",
            "category": "polling",
            "input_type": "number"
        },
        {
            "key": "pos_terminal_lock_ttl_m",
            "value": "60",
            "description": "Tiempo de expiración del bloqueo de terminal (minutos) si no hay latido.",
            "category": "security",
            "input_type": "number"
        },
        {
            "key": "pos_heartbeat_interval_ms",
            "value": "30000",
            "description": "Frecuencia de envío de latido de vida desde el POS (ms).",
            "category": "polling",
            "input_type": "number"
        },
        {
            "key": "pos_terminal_check_lock_interval_ms",
            "value": "15000",
            "description": "Frecuencia con la que el POS verifica si aún conserva su bloqueo (ms).",
            "category": "polling",
            "input_type": "number"
        },
        {
            "key": "ai_agent_start_word",
            "value": "VOY",
            "description": "Palabra para confirmar inicio de tarea.",
            "category": "ai_agent",
            "input_type": "text"
        },
        {
            "key": "ai_agent_completion_word",
            "value": "LISTO",
            "description": "Palabra para confirmar fin de tarea.",
            "category": "ai_agent",
            "input_type": "text"
        },
        {
            "key": "ai_agent_pause_word",
            "value": "PAUSA",
            "description": "Palabra para pausar o indicar contratiempo.",
            "category": "ai_agent",
            "input_type": "text"
        },
        {
            "key": "ai_agent_start_retry_mins",
            "value": "1.0",
            "description": "Tiempo para re-preguntar inicio en caso de pausa (minutos).",
            "category": "ai_agent",
            "input_type": "number"
        },
        {
            "key": "ai_agent_completion_retry_mins",
            "value": "2.0",
            "description": "Tiempo para re-preguntar cumplimiento en caso de pausa (minutos).",
            "category": "ai_agent",
            "input_type": "number"
        },
        {
            "key": "network_tz_offset_hours",
            "value": "6",
            "description": "Offset en horas de la zona horaria local respecto a UTC para el filtrado de incidentes de red (CST México = 6).",
            "category": "network",
            "input_type": "number"
        },
        {
            "key": "pos_terminals_config",
            "value": '[{"id":"T6","name":"Terminal 6","icon":"🖥️"},{"id":"T5","name":"Terminal 5","icon":"🖥️"},{"id":"T4","name":"Terminal 4","icon":"🖥️"},{"id":"T3","name":"Terminal 3","icon":"🖥️"},{"id":"T2","name":"Terminal 2","icon":"🖥️"},{"id":"CAJA","name":"CAJA","icon":"/assets/pos_register.png"}]',
            "description": "Configuración de terminales POS (JSON array con id, name, icon).",
            "category": "pos",
            "input_type": "json"
        },
        # V17 (Fase 17.0): configuración de presentación del Display de Precios de
        # Heladería. Entrada ADITIVA: el bucle de abajo solo inserta si la clave no
        # existe, por lo que no altera ninguna clave que lea el POS de Panadería.
        {
            "key": "heladeria_display_precios_config",
            "value": '{"groups":[],"columns":3,"theme":"LIGHT","showImages":true,"showUnavailable":true}',
            "description": "Configuración de presentación del Display de Precios de Heladería (V17).",
            "category": "heladeria",
            "input_type": "json"
        },
        # V16 (Fase 16.0): manifiesto de contenido del Display Tótem de Heladería.
        # Entrada ADITIVA: el bucle de abajo solo inserta si la clave no existe, por
        # lo que no altera ninguna clave que lea el POS de Panadería.
        {
            "key": "heladeria_totem_content",
            "value": '{"macros":[],"heroes":[],"config":{"macroCount":3,"macroDurationSec":4,"heroDurationSec":6,"transition":"fade","transitionMs":800,"format":"vertical","accentColor":"#fbbf24"}}',
            "description": "Manifiesto de contenido del Display Tótem de Heladería (V16).",
            "category": "heladeria",
            "input_type": "json"
        },
        # V15 (Fase 15.4): umbrales de urgencia visual del KDS de Heladería.
        # Entrada ADITIVA: el bucle de abajo solo inserta si la clave no existe,
        # por lo que no altera ninguna clave que lea el POS de Panadería.
        # warningSec/criticalSec son segundos transcurridos desde created_at.
        # tzOffsetHours es el offset local respecto a UTC (CST México = 6); si se
        # omite o es inválido, el frontend cae a 0 (created_at es naive local).
        {
            "key": "heladeria_kds_urgency_config",
            "value": '{"warningSec":180,"criticalSec":420,"tzOffsetHours":' + str(kds_tz_offset) + '}',
            "description": "Umbrales de urgencia visual del KDS de Heladería (V15). tzOffsetHours se deriva de business_timezone (V20).",
            "category": "heladeria",
            "input_type": "json"
        },
        # Branding editable del módulo Heladería (nombre + eslogan).
        # Se lee desde el Hub y se edita con el permiso `editar_ui_heladeria`.
        {
            "key": "heladeria_branding",
            "value": '{"nombre":"Heladería\\nR de Rico.","eslogan":"Haciendo tu vida más dulce."}',
            "description": "Nombre y eslogan editables del módulo Heladería.",
            "category": "heladeria",
            "input_type": "json"
        },
        # V8 (plan gestor de display): sub-suite multi-pantalla del Display de
        # Precios. Hasta 3 pantallas nombradas, cada una con su propia config.
        # Entrada ADITIVA: el bucle de abajo solo inserta si la clave no existe,
        # por lo que NO altera `heladeria_display_precios_config` (clave legacy,
        # que se conserva intacta para rollback, §2.4 del plan) ni ninguna clave
        # que lea el POS de Panadería. CERO migraciones Alembic.
        {
            "key": "heladeria_display_screens",
            "value": '{"version":1,"screens":[{"id":"screen_1","name":"Menú Completo","enabled":true,"config":{"groups":[],"columns":3,"theme":"LIGHT","showImages":true,"showUnavailable":true,"header":{"title":"","subtitle":"","logo":true,"align":"LEFT"},"fontFamily":"CLASSIC","images":{"enabled":true,"size":"MEDIUM","shape":"ROUNDED","fallback":"INITIALS"},"print":{"format":"LETTER","orientation":"PORTRAIT","footerNote":"","validUntil":null,"showQr":false,"showCropMarks":false}}},{"id":"screen_2","name":"Solo Helados","enabled":false,"config":{"groups":["RECIPIENTE","TAMAÑO","SABOR","EXTRA"],"columns":3,"theme":"LIGHT","showImages":true,"showUnavailable":true,"header":{"title":"","subtitle":"","logo":true,"align":"LEFT"},"fontFamily":"CLASSIC","images":{"enabled":true,"size":"MEDIUM","shape":"ROUNDED","fallback":"INITIALS"},"print":{"format":"LETTER","orientation":"PORTRAIT","footerNote":"","validUntil":null,"showQr":false,"showCropMarks":false}}},{"id":"screen_3","name":"Bebidas","enabled":false,"config":{"groups":["BEBIDA_BASE"],"columns":3,"theme":"LIGHT","showImages":true,"showUnavailable":true,"header":{"title":"","subtitle":"","logo":true,"align":"LEFT"},"fontFamily":"CLASSIC","images":{"enabled":true,"size":"MEDIUM","shape":"ROUNDED","fallback":"INITIALS"},"print":{"format":"LETTER","orientation":"PORTRAIT","footerNote":"","validUntil":null,"showQr":false,"showCropMarks":false}}}]}',
            "description": "Pantallas nombradas del Display de Precios de Heladería (sub-suite multi-pantalla, V8).",
            "category": "heladeria",
            "input_type": "json"
        }
    ]
    
    for s_data in default_settings:
        result = await db.execute(select(models.SystemSetting).where(models.SystemSetting.key == s_data["key"]))
        if not result.scalar_one_or_none():
            db.add(models.SystemSetting(**s_data))

    await db.commit()

    # v1.2 (BUG 4): repara filas historicas con NULL en columnas NOT NULL del
    # contrato de respuesta. Un solo registro con category/input_type NULL hacia
    # que GET /api/v1/settings/ devolviera HTTP 500 (ResponseValidationError),
    # rompiendo la carga de la Vista General.
    await db.execute(
        update(models.SystemSetting)
        .where(models.SystemSetting.category.is_(None))
        .values(category="general")
    )
    await db.execute(
        update(models.SystemSetting)
        .where(models.SystemSetting.input_type.is_(None))
        .values(input_type="text")
    )
    await db.commit()
