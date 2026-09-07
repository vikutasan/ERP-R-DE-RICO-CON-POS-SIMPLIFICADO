# 🍦 CONTROL DE FASES — Módulo Heladería ERP R de Rico
# Última actualización: 2026-09-06 23:34
# Plan completo: ESPECIFICACIONES DEL PROYECTO/PLAN_MODULO_HELADERIA.md

## INSTRUCCIONES PARA REANUDAR EN NUEVA SESIÓN

Si se cortó la sesión, pega este mensaje al iniciar una nueva conversación:

---
Estamos implementando el módulo de Heladería del ERP R de Rico.
El plan completo está en: https://github.com/vikutasan/ERP-R-DE-RICO-CON-POS-SIMPLIFICADO/blob/main/ESPECIFICACIONES%20DEL%20PROYECTO/PLAN_MODULO_HELADERIA.md
El control de fases está en: https://github.com/vikutasan/ERP-R-DE-RICO-CON-POS-SIMPLIFICADO/blob/main/ESPECIFICACIONES%20DEL%20PROYECTO/CONTROL_FASES_HELADERIA.md
Lee ambos documentos y continúa desde la fase marcada como "EN PROGRESO".
El código fuente está en: C:\Users\servidor1\.gemini\antigravity\scratch\ERP-R-DE-RICO
---

## OLEADA 1 — MVP

### FASE 1: Backup + Migración de BD
- [ ] 1.1 Backup de PostgreSQL (pg_dump)
- [ ] 1.2 Commit + tag git v_pre_heladeria
- [ ] 1.3 Crear apps/api/modules/heladeria/__init__.py
- [ ] 1.4 Crear apps/api/modules/heladeria/models.py (HeladeriaProductConfig + TicketItemComponent)
- [ ] 1.5 Crear apps/api/migrations/add_heladeria_support.py
- [ ] 1.6 Ejecutar migración (ALTER TABLE + CREATE TABLE)
- [ ] 1.7 Verificar POS panadería sigue funcionando post-migración

### FASE 2: Backend API Heladería
- [ ] 2.1 Crear apps/api/modules/heladeria/schemas.py
- [ ] 2.2 Crear apps/api/modules/heladeria/service.py
- [ ] 2.3 Crear apps/api/modules/heladeria/router.py (6 endpoints)
- [ ] 2.4 Probar import en aislamiento (python -c "from modules.heladeria...")
- [ ] 2.5 Registrar en main.py (import + include_router)
- [ ] 2.6 Reiniciar API y verificar /health + /heladeria/menu
- [ ] 2.7 Verificar POS panadería sigue funcionando post-registro

### FASE 3: Frontend Services + Hooks
- [ ] 3.1 Crear apps/heladeria/services/heladeriaService.js
- [ ] 3.2 Crear apps/heladeria/services/heladeriaOfflineStore.js
- [ ] 3.3 Crear apps/heladeria/services/heladeriaTerminals.js
- [ ] 3.4 Crear apps/heladeria/hooks/useHeladeriaMenu.js
- [ ] 3.5 Crear apps/heladeria/hooks/useQuickBuilder.js
- [ ] 3.6 Crear apps/heladeria/hooks/useHeladeriaCart.js

### FASE 4: POS Heladería (UI)
- [ ] 4.1 Crear apps/heladeria/components/FlavorGrid.jsx
- [ ] 4.2 Crear apps/heladeria/components/QuickIceCreamPanel.jsx
- [ ] 4.3 Crear apps/heladeria/components/HeladeriaTicketPanel.jsx
- [ ] 4.4 Crear apps/heladeria/components/FlavorAvailabilityToggle.jsx
- [ ] 4.5 Crear apps/heladeria/components/HeladeriaTerminalSelector.jsx
- [ ] 4.6 Crear apps/heladeria/components/HeladeriaCashSwitch.jsx
- [ ] 4.7 Crear apps/heladeria/components/HeladeriaCheckout.jsx
- [ ] 4.8 Crear apps/heladeria/sections/PosHeladeriaUI.jsx (orquestador)
- [ ] 4.9 Verificar build compila sin errores

### FASE 5: KDS Helados + Malteadas
- [ ] 5.1 Crear apps/heladeria/hooks/useKdsPolling.js
- [ ] 5.2 Crear apps/heladeria/components/KdsOrderCard.jsx
- [ ] 5.3 Reescribir apps/heladeria/sections/KdsHeladosUI.jsx
- [ ] 5.4 Reescribir apps/heladeria/sections/KdsMalteadasUI.jsx
- [ ] 5.5 Verificar build compila sin errores

### FASE 6: Hub + Aislamiento de Módulos
- [ ] 6.1 Modificar HeladeriaHubUI.jsx (6ª tarjeta + lazy imports internos)
- [ ] 6.2 Modificar ExperimentCenterUI.jsx (React.lazy + ErrorBoundaryModule)
- [ ] 6.3 Verificar build compila sin errores
- [ ] 6.4 Verificar POS panadería sigue funcionando

### FASE 7: Reporte Diario Consolidado
- [ ] 7.1 Agregar función generar_reporte_diario en cash/service.py
- [ ] 7.2 Agregar endpoint GET /cash/daily-report en cash/router.py
- [ ] 7.3 Agregar pestaña Reportes Diarios en AuditoriaControlUI.jsx
- [ ] 7.4 Corregir bug API_BASE en AuditoriaControlUI.jsx (usar CONFIG)
- [ ] 7.5 Verificar build + POS funcionando

### FASE 8: Testing Completo
- [ ] 8.1 Checklist POS Panadería (10 tests)
- [ ] 8.2 Checklist Heladería (9 tests)
- [ ] 8.3 Test offline (desconectar/reconectar)
- [ ] 8.4 Commit final + push a GitHub

### FASE 9: Refinamiento
- [ ] 9.1 Ajustes de estética Häagen-Dazs
- [ ] 9.2 Micro-animaciones
- [ ] 9.3 Responsividad (tablet/celular)
- [ ] 9.4 Seed de datos de prueba (sabores, recipientes, extras)

## OLEADA 2 — Post-MVP (FUTURO)
- [ ] Tienda Interactiva (experiencia cliente)
- [ ] Display Tótem Sugestivo
- [ ] Display Pantalla de Precios
