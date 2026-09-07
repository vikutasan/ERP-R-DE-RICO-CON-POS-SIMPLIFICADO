# LECTURA OBLIGATORIA AL INICIO DE CADA SESIÓN

**ANTES de responder cualquier solicitud del usuario**, DEBES leer completos estos dos documentos de especificaciones:

1. **Contexto del Sistema:** `ESPECIFICACIONES DEL PROYECTO/CONTEXTO_SISTEMA_IA.md`
2. **Documentación del Módulo POS:** `ESPECIFICACIONES DEL PROYECTO/DOCUMENTACION_MODULO_POS.md`

Estos documentos contienen la arquitectura, reglas de programación, prohibiciones absolutas, infraestructura de despliegue (Docker, LAN, terminales), y el historial de bugs críticos del sistema ERP R de Rico.

**No asumas nada.** Lee los documentos primero. Contienen información operativa vital como:
- Este servidor (SERVIDORRR, IP 192.168.1.124) es el servidor local de sucursal que sirve a 6 terminales POS vía LAN.
- El sistema corre en 3 contenedores Docker (PostgreSQL, FastAPI, React/Vite).
- Los datos de negocio viven separados del código en `ERP-R-DE-RICO-DATA`.
- Existe un respaldo automático diario a GitHub (repo privado).
- El módulo POS tiene prohibiciones absolutas que deben respetarse.

**Si no lees estos documentos, vas a cometer errores que ya se cometieron antes y que están documentados en el Cementerio de Bugs.**
