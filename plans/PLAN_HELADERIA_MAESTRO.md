# 🍦 PLAN MAESTRO — MÓDULO DE HELADERÍA (Oleada 2) — R de Rico ERP

**Fecha:** 13/Septiembre/2026
**Autor:** Auditoría técnica derivada de [`DOCUMENTACION_MODULO_HELADERIA.md`](../ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_HELADERIA.md)
**Estado:** ⏳ PROPUESTO — pendiente de ejecución
**Alcance:** Completar las 4 secciones que hoy son placeholders y elevar los 2 KDS existentes a "KDS Inteligente", con paridad absoluta de terminales y productos respecto al resto del ERP.

---

## 🚨 PROTOCOLO DE NO-INTERFERENCIA AL POS (OBLIGATORIO)

> **Este plan NO puede romper el POS de Panadería. Punto.**
> El POS está en producción y cualquier regresión cuesta dinero real.
> La Heladería es un módulo **aislado**: si se cae, la Panadería sigue operando.

### Reglas de ejecución

1. **PROHIBIDO tocar** [`apps/pos/RetailVisionPOS.jsx`](../apps/pos/RetailVisionPOS.jsx), [`apps/pos/hooks/useTerminalLocking.js`](../apps/pos/hooks/useTerminalLocking.js), [`apps/pos/hooks/useBeforeUnload.js`](../apps/pos/hooks/useBeforeUnload.js) y [`apps/pos/services/POSService.js`](../apps/pos/services/POSService.js) — territorio sagrado del POS.
2. **PROHIBIDO modificar** [`apps/pos/config.js`](../apps/pos/config.js) — es la única fuente de verdad de URLs (Incidente 16.6). Solo se **lee**.
3. **PROHIBIDO** cambiar el contrato público de [`useNetworkHealth`](../apps/pos/hooks/useNetworkHealth.js:12) (`{ status, latency }`).
4. **PROHIBIDO** introducir `setInterval`/timers que escriban en el carrito del POS de Panadería. Los timers de Heladería viven **solo** dentro de `apps/heladeria/`.
5. **PROHIBIDO** construir URLs con `window.location.hostname`. Siempre `CONFIG.API_BASE_URL`.
6. **PROHIBIDO** animaciones CSS infinitas (`animate-pulse`) en indicadores estáticos que dependan de red/polling (Incidente 16.1 — Efecto Estrobo).
7. **Cada fase es un commit independiente** y debe pasar la verificación completa antes de continuar.
8. **Si una fase falla la verificación, se revierte inmediatamente** (`git revert`) y se documenta el motivo.
9. **Ninguna fase se ejecuta en horario de operación del POS** (idealmente antes de abrir o después de cerrar).
10. **Toda integración con el POS se envuelve en `try/except pass`** (o `try/catch` silencioso en JS) para que un fallo de Heladería jamás interrumpa la Panadería.

### Verificación obligatoria por fase

```bash
# 1. Tests backend (deben seguir en 39/39 o más)
docker exec rderico-api-dev python -m pytest -q

# 2. Tests frontend (deben seguir en 141/141 o más)
npx vitest run

# 3. Build de producción (debe transformar sin errores)
npm run build

# 4. Arranque del POS Panadería (verificación manual)
#    - Abrir http://localhost:5000
#    - Seleccionar una terminal
#    - Agregar un producto al carrito
#    - Verificar que NO aparece banner falso "SIN CONEXIÓN"

# 5. Arranque del Hub Heladería (verificación manual)
#    - Abrir el Hub de Heladería desde el Centro de Experimentos
#    - Entrar a la sección modificada
#    - Verificar que las demás secciones siguen accesibles
```

> **Nota de entorno:** Python **NO** está en el PATH del host. `pytest` se ejecuta **siempre** vía `docker exec rderico-api-dev python -m pytest -q`.

---

## 📋 ESTADO REAL DEL MÓDULO (evidencia en código)

| # | Sección | Archivo | Estado real | Plan |
|---|---|---|---|---|
| 1 | Tienda Interactiva | [`TiendaInteractivaUI.jsx`](../apps/heladeria/sections/TiendaInteractivaUI.jsx:7) | 🔴 **Placeholder** (105 líneas, "Próximamente") | **V14** |
| 2 | KDS Helados | [`KdsHeladosUI.jsx`](../apps/heladeria/sections/KdsHeladosUI.jsx:15) | 🟡 **Funcional** — polling 5s, 3 estados, **sin urgencia por tiempo** | **V15** |
| 3 | KDS Malteadas | [`KdsMalteadasUI.jsx`](../apps/heladeria/sections/KdsMalteadasUI.jsx:14) | 🟡 **Funcional pero clon** — "Idéntico al KDS Helados" (línea 3), **sin batching** | **V15** |
| 4 | Display Tótem | [`DisplayTotemUI.jsx`](../apps/heladeria/sections/DisplayTotemUI.jsx:7) | 🔴 **Placeholder** (100 líneas, "Próximamente") | **V16** |
| 5 | Display Precios | [`DisplayPreciosUI.jsx`](../apps/heladeria/sections/DisplayPreciosUI.jsx:7) | 🔴 **Placeholder** (100 líneas, "Próximamente") | **V17** |

**El Hub ya está listo** ([`HeladeriaHubUI.jsx`](../apps/heladeria/HeladeriaHubUI.jsx:49)): las 6 secciones existen con `React.lazy` + `SectionErrorBoundary` (doble barrera). Solo faltan los cuerpos.

**Backend ya existente** (`apps/api/modules/heladeria/`): `models.py`, `schemas.py`, `service.py`, `router.py`. Endpoints `/api/v1/heladeria/*` operativos.

**Servicios ya existentes** (`apps/heladeria/services/`): [`heladeriaService.js`](../apps/heladeria/services/heladeriaService.js:12) (cliente HTTP con `withRetries`), `heladeriaOfflineStore.js` (IndexedDB), `heladeriaTerminals.js` (locks H1/H2/H-CAJA).

---

## 🗂️ LOS 4 PLANES (orden de ejecución)

| Orden | Plan | Alcance | Complejidad | Riesgo POS | Dependencias |
|---|---|---|---|---|---|
| **1º** | [`PLAN_HELADERIA_V17_DISPLAY_PRECIOS.md`](PLAN_HELADERIA_V17_DISPLAY_PRECIOS.md) | Doble landing (panel/output), conexión a catálogo | 🟢 Baja | 🟢 Nulo | `/display/menu` (ya existe) |
| **2º** | [`PLAN_HELADERIA_V16_TOTEM_SUGESTIVO.md`](PLAN_HELADERIA_V16_TOTEM_SUGESTIVO.md) | Gestor de contenido macro, control fino de reproducción, torre dinámica, color picker | 🟡 Media | 🟢 Nulo | Volumen de storage dedicado |
| **3º** | [`PLAN_HELADERIA_V14_TIENDA_INTERACTIVA.md`](PLAN_HELADERIA_V14_TIENDA_INTERACTIVA.md) | Configurador visual doble columna, pre-comanda PENDING, switch de caja, cancelaciones | 🔴 Alta | 🟢 Nulo | `GestorDeCaja.jsx` (reusar) |
| **4º** | [`PLAN_HELADERIA_V15_KDS_INTELIGENTE.md`](PLAN_HELADERIA_V15_KDS_INTELIGENTE.md) | Urgencia por tiempos (Verde/Amarillo/Rojo) + Asistente de lotes malteadas | 🔴 Alta | 🟢 Nulo | KDS actuales |

**Justificación del orden:** se empieza por el de **menor riesgo y menor dependencia** (V17) para validar el patrón "display de solo lectura" sin tocar nada crítico. Se termina por el **más complejo** (V15), que es una máquina de estado con concurrencia.

---

## 🎯 CRITERIOS DE ACEPTACIÓN GLOBALES

Al terminar los 4 planes:

- [ ] **Las 5 secciones del Hub son funcionales** (cero placeholders "Próximamente").
- [ ] **pytest:** 39 → 39+ tests, todos OK (sin regresiones).
- [ ] **vitest:** 141 → 141+ tests, todos OK (sin regresiones).
- [ ] **build:** transforma sin errores.
- [ ] **Cero** `window.location.hostname` en `apps/heladeria/`.
- [ ] **Cero** archivos del POS de Panadería modificados (`git diff --name-only` no incluye `apps/pos/RetailVisionPOS.jsx`, `useTerminalLocking.js`, `useBeforeUnload.js`, `POSService.js`).
- [ ] **El POS de Panadería funciona idéntico** (verificación manual: seleccionar terminal, agregar producto, sin banner falso).
- [ ] **El aislamiento se mantiene:** apagar el API y verificar que el POS de Panadería sigue operando.
- [ ] Documentación actualizada: [`DOCUMENTACION_MODULO_HELADERIA.md`](../ESPECIFICACIONES%20DEL%20PROYECTO/DOCUMENTACION_MODULO_HELADERIA.md) sección 13 "Próximos Pasos (Oleada 2)" marcada como resuelta.

---

## 🔄 PROTOCOLO DE REVERSIÓN

Si cualquier fase rompe algo:

```bash
# Revertir el último commit
git revert HEAD --no-edit
git push origin main

# Verificar que el POS de Panadería sigue funcionando
# (abrir http://localhost:5000 y probar el flujo básico)
```

**Regla:** ante la duda, revertir. El POS nunca se queda roto.

---

## 📝 NOTAS DE DISEÑO TRANSVERSALES

1. **¿Por qué 4 planes y no 1?**
   Porque la especificación original mezcla 4 proyectos de tamaños muy distintos. Un solo plan sería imposible de verificar y de revertir. Cada plan es independiente, con su propio commit y su propia verificación.

2. **¿Por qué el Tótem es offline-first?**
   Porque un tótem que depende del API en vivo se queda **en negro frente al cliente** si el API se cae. El tótem debe cachear su manifiesto de contenido en IndexedDB y solo *refrescar* disponibilidad cuando hay red. Nunca bloquea el render esperando al API.

3. **¿Por qué las imágenes 4K/8K necesitan estrategia de storage?**
   Porque un JPEG 8K pesa 15-40 MB. Subirlos al servidor actual (Docker local, sin CDN) satura disco y ancho de banda. Se define desde el inicio: límite de peso, conversión a WebP, volumen Docker dedicado y lazy-loading por diapositiva.

4. **¿Por qué el asistente de lotes es una fase propia?**
   Porque no es una pantalla: es una **máquina de estado con concurrencia** (3 lotes simultáneos, cada uno con su paso actual, cantidades del ERP, avance por pedal/manos libres). Es el mismo patrón de [`useQuickBuilder.js`](../apps/heladeria/hooks/useQuickBuilder.js:1) multiplicado por 3 y con input externo.

5. **¿Por qué reutilizar `GestorDeCaja.jsx` y no crear uno nuevo?**
   Porque el patrón "Habilitar/Deshabilitar Caja" ya existe y funciona ([`GestorDeCaja.jsx`](../apps/pos/components/GestorDeCaja.jsx:73) con `onCajaHabilitada`/`onCajaDeshabilitada`, y [`POSHeader.jsx`](../apps/pos/components/POSHeader.jsx:140)). Duplicarlo sería crear una segunda fuente de verdad (anti-patrón). Se **reutiliza** el componente, no se modifica.

---

## ✅ CHECKLIST DE APROBACIÓN

Antes de ejecutar, confirmar:

- [ ] El plan respeta el protocolo de no-interferencia al POS.
- [ ] Cada fase es reversible de forma independiente.
- [ ] La verificación es objetiva (tests + build + manual).
- [ ] El orden de ejecución minimiza el riesgo.

**Una vez aprobado:** ejecutar V17 → verificar → commit → push → V16 → ... → V15.
