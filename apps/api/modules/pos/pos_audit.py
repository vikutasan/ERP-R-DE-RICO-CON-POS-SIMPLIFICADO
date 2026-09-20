"""
pos_audit.py — Sistema de Auditoría POS (v5.1)

Registra todas las operaciones de escritura del POS con trazabilidad completa.
Se integra directamente en el router como dependency de FastAPI.

Modo actual: AUDITOR (registra sin bloquear).
Cambiar pos_audit_mode a 'bloqueante' en system_settings para rechazar requests sin sesión válida.
"""
import logging
from fastapi import Request
# v17 (H2): usar el helper UTC centralizado en lugar de datetime.now() (hora local naive).
# Mismo criterio que occupancy.py (v15). El contenedor corre en UTC, por lo que el
# valor es idéntico; el cambio hace EXPLÍCITA la intención y elimina la dependencia
# accidental de la TZ del host.
from core.timestamps import utcnow

logger = logging.getLogger("pos.audit")
logger.setLevel(logging.INFO)

# Crear handler de archivo si no existe
if not logger.handlers:
    import os
    log_dir = "/app/logs"
    os.makedirs(log_dir, exist_ok=True)
    fh = logging.FileHandler(f"{log_dir}/pos_audit.log", encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(fh)
    # También mantener en stdout para docker logs
    sh = logging.StreamHandler()
    sh.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(sh)


def audit_pos_write(request: Request, endpoint: str, payload: dict = None, response_code: int = 200, extra: str = ""):
    """
    Registra una operación de escritura del POS.
    Llamar desde cada endpoint de escritura DESPUÉS de la operación exitosa.
    
    Formato de log:
    POS_AUDIT | 2026-05-06T15:30:00 | POST /tickets | ip=192.168.1.50 | 
    session=42 | employee=9 | terminal=T3 | account=V17902 | status=DRAFT | 
    http=200 | audit=OK
    """
    # Extraer IP
    client_ip = "unknown"
    if request.client:
        client_ip = request.client.host
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    
    # Extraer datos del payload
    session_id = None
    captured_by_id = None
    terminal_id = None
    account_num = None
    status = None
    
    if payload:
        if hasattr(payload, 'dict'):
            # Pydantic model
            pd = payload.dict() if hasattr(payload, 'dict') else {}
            session_id = pd.get("session_id")
            captured_by_id = pd.get("captured_by_id")
            terminal_id = pd.get("terminal_id")
            account_num = pd.get("account_num")
            status = pd.get("status")
        elif isinstance(payload, dict):
            session_id = payload.get("session_id")
            captured_by_id = payload.get("captured_by_id")
            terminal_id = payload.get("terminal_id")
            account_num = payload.get("account_num")
            status = payload.get("status")
    
    # Clasificar
    audit_flags = []
    if not session_id and "reserve" not in endpoint:
        audit_flags.append("NO_SESSION")
    if not captured_by_id:
        audit_flags.append("NO_EMPLOYEE")
    
    audit_result = "OK" if not audit_flags else "|".join(audit_flags)
    
    log_entry = (
        f"POS_AUDIT | {utcnow().isoformat()} | {endpoint} | "
        f"ip={client_ip} | session={session_id} | employee={captured_by_id} | "
        f"terminal={terminal_id} | account={account_num} | req_status={status} | "
        f"http={response_code} | audit={audit_result}"
    )
    if extra:
        log_entry += f" | {extra}"
    
    if audit_flags:
        logger.warning(f"⚠️ {log_entry}")
    else:
        logger.info(f"✅ {log_entry}")
