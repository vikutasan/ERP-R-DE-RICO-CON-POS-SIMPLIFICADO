from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from . import models, schemas
from fastapi import HTTPException

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
