# Módulo de Recursos Humanos — Plan de Implementación v3 (FINAL)

> **Documento de referencia para la IA.** Si la sesión se reinicia, leer este archivo completo antes de continuar el desarrollo.

## Contexto

Módulo de RRHH completo para ERP R de Rico (FastAPI + Vite + Postgres, monolito en Docker). ~40 colaboradores. Accesible para Gerente de Ventas y Gerente de Producción (controlado desde módulo Seguridad y Acceso). 

**Concepto clave:** NO hay escalera corporativa. Lo que sube con cada contrato de 6 meses (semestre) es el **bono de puntualidad**. El salario base es fijo por puesto. Todas las reglas son **configurables** desde suites de parámetros (clic en encabezado de columna).

**Restricción operativa:** `LoginUI.jsx` **NO se modifica nunca**. El check-in se maneja en `ExperimentCenterUI.handleLogin` dentro de un try/catch seguro.

---

## Documentos de Reglas de Negocio Leídos

Los siguientes documentos de Google Docs fueron leídos y su contenido informa las reglas del módulo:

1. **Sistema de Juntas de Personal** — Horarios de juntas (Producción L 13:00, Generales V 13:45, Fin de semana S 13:45), reglas de civilidad, secuencia de 6 pasos, celebración de cumpleaños en última junta del mes.
2. **Política de Permisos e Inasistencias** — PSGs (3 por contrato, 6 días anticipación), ITs, CPs, PROs, Fondo de Cobertura ($600 RsG), tabla de sanciones por días de anticipación (0 días=100%, 5 días=40%), reposición en 3 exhibiciones.
3. **Normas Generales (Carta/Póster)** — Póster visual con 16 reglas en iconos (prohibido celular, no drogas/alcohol, no perfumes, no alhajas, uniforme limpio, uñas cortas, cabello recogido, respeto, etc.).
4. **Reglamento Interior de Trabajo** — Convivencia, vestimenta/uniforme (2 juegos: paliacate, mandil, camiseta, pantalón, calzado antiderrapante café), puntualidad (bono diario + tolerancia 15min), 3 retardos=1 falta, 3 faltas=baja, celular prohibido (ricofón 7225 41 05 53), drogas/alcohol=suspensión 8 días+acta, hurto=baja inmediata+denuncia.
5. **Horarios A/B/C/D** — Sistema rotativo de 4 semanas, turnos Apertura (6:00-14:00) y Cierre (14:00-22:00), 20 posiciones (RJT, RL, RAP, REV, REPAV, RV), personal gerencial ALFA/BETA, refuerzos de ventas (7:00-11:00 y 16:00-22:00). Artesanos NO rotan.
6. **Tabla de Sueldos y Percepciones Rs Generales** — Salario base $23.75/hr ($190/día) fijo. Bono por semestre: Sem1=$50/día, Sem2=$100, Sem3=$150, Sem4=$200, Sem5=$250, Sem6=$300. Cada puesto tiene tabla similar pero con valores distintos, configurables desde suite.

---

## Sistema Salarial

| Semestre | Sueldo/día (RsG) | Bono/día | Percepción/día |
|----------|-------------------|----------|----------------|
| 1 | $190 | $50 | $240 |
| 2 | $190 | $100 | $290 |
| 3 | $190 | $150 | $340 |
| 4 | $190 | $200 | $390 |
| 5 | $190 | $250 | $440 |
| 6 | $190 | $300 | $490 |

Cada puesto tiene su propia tabla configurable desde la suite del encabezado de Nómina.

---

## Sistema de Horarios

- **Ventas:** Rotación automática A→B→C→D por semana del año. 20 posiciones. Gerente puede modificar puntualmente.
  - Posiciones 1-4: Apertura L-V (6:00-14:00)
  - Posiciones 5-8: Cierre L-V (14:00-22:00)
  - Posiciones 9-12: Apertura S-D (6:00-14:00)
  - Posiciones 13-16: Cierre S-D (14:00-22:00)
  - Posiciones 17-18: Refuerzo Ventas Apertura
  - Posiciones 19-20: Refuerzo Ventas Cierre
  - ALFA/BETA: Personal gerencial piso de ventas
- **Producción:** Artesanos 1-6 tienen horario fijo, no rotan. Formato separado.

---

## Arquitectura

### Decisiones de Diseño

| Decisión | Justificación |
|----------|---------------|
| **LoginUI.jsx NO se toca** | Zona crítica. Check-in en `ExperimentCenterUI.handleLogin` con try/catch. Si HR falla, ERP funciona normal. |
| **Componente genérico `ConfigSuite.jsx`** | Recibe schema JSON, renderiza suite automáticamente. 1 componente → 10 suites. |
| **Tablas de BD por fase** | No crear 25+ tablas de golpe. Cada fase crea solo las suyas. |
| **Columnas fijas + scroll** | Primeras 4 cols (#, Puesto, Nombre, Semestre) fijas. Resto scroll horizontal. |

---

### Backend (FastAPI)

#### NUEVO: `apps/api/modules/hr/`

Archivos: `__init__.py`, `models.py`, `router.py`, `service.py`, `schemas.py`, `pdf_generator.py`

**Fase 1 — Tablas base:**

| Tabla | Columnas principales |
|-------|---------------------|
| `hr_employees_ext` | employee_id (FK→employees), fecha_nacimiento, direccion, telefono, foto_url, ine_url, selfie_url, contacto_emergencia, tipo_sangre, curp, nss, semestre_actual, fecha_ingreso, estado (activo/baja/proceso) |
| `hr_positions` | nombre, descripcion, area (ventas/produccion/admin), orden |
| `hr_attendance` | employee_id, fecha, hora_entrada, hora_salida, tipo_entrada (normal/retardo), tipo_salida (normal/pro/abandono/no_registrada), observaciones, registrado_por |
| `hr_regulations` | seccion_numero, titulo, contenido_markdown, orden, activo |
| `hr_schedule_templates` | nombre (A/B/C/D), data_json (la matriz completa de 20 posiciones × 7 días) |
| `hr_schedules` | semana_año, año, template_id, modificaciones_json, generado_auto (bool) |

**Fase 2 — Tablas operativas:**

| Tabla | Columnas principales |
|-------|---------------------|
| `hr_incidents` | employee_id, fecha, tipo (llamada/acta/baja), motivo, observaciones, firmado_por, firma_empleado, contrato_periodo |
| `hr_incident_config` | parametro, valor_json (escalamiento, motivos, periodos) |
| `hr_uniform_deposits` | employee_id, uniforme_numero, fecha_entrega, fianza_total, pagado, estado |
| `hr_uniform_movements` | deposit_id, fecha, concepto, monto, tipo (cargo/abono) |
| `hr_uniform_config` | parametro, valor_json (prendas, costos, monto_semanal) |
| `hr_coverage_fund` | employee_id, monto_requerido, monto_cubierto, estado |
| `hr_coverage_movements` | fund_id, fecha, concepto, monto, tipo |
| `hr_coverage_config` | parametro, valor_json (monto, tabla_porcentajes, exhibiciones) |
| `hr_salary_tables` | position_id, semestre, sueldo_hora, bono_hora, sueldo_dia, bono_dia |
| `hr_payroll` | employee_id, semana, año, dias_trabajados, dias_puntuales, salario_base, bono_puntualidad, deducciones_total, neto, aprobado, aprobado_por |
| `hr_payroll_deductions` | payroll_id, concepto, monto, descripcion |
| `hr_payroll_config` | parametro, valor_json (dia_corte, dia_pago, conceptos_deduccion) |
| `hr_psg` | employee_id, fecha_solicitado, fecha_permiso, dias_anticipacion, pagado (bool), fecha_pago, firma_empleado, firma_gerente, contrato_periodo |
| `hr_psg_config` | parametro, valor_json (max_por_contrato, dias_anticipacion, dias_alta_demanda) |

**Fase 3 — Tablas de evaluación:**

| Tabla | Columnas principales |
|-------|---------------------|
| `hr_vacations` | employee_id, fecha_inicio, fecha_fin, dias, prima_vacacional, estado, aprobado_por |
| `hr_vacation_config` | parametro, valor_json (dias_por_antiguedad, prima_porcentaje, anticipacion, restricciones) |
| `hr_psychometrics` | employee_id, fecha, test_tipo (disc/valores/aptitud), resultados_json, recomendacion, evaluador |
| `hr_psychometric_config` | parametro, valor_json (preguntas, umbrales, perfiles_ideales) |
| `hr_kpis` | employee_id, mes, año, score_total, detalle_json, evaluado_por |
| `hr_kpi_config` | parametro, valor_json (indicadores, pesos, escala, frecuencia) |
| `hr_exit_survey` | employee_id, fecha, respuestas_json, motivo_salida |
| `hr_exit_survey_config` | parametro, valor_json (preguntas, opciones_motivo) |
| `hr_severance` | employee_id, fecha_calculo, motivo_salida, percepciones_json, deducciones_json, neto, aprobado, firmado |
| `hr_severance_config` | parametro, valor_json (conceptos, reglas_por_tipo_salida) |

#### MODIFICAR: `apps/api/main.py`

```python
# Agregar imports:
from modules.hr.router import router as hr_router
from modules.hr.models import *  # Para que Base.metadata.create_all las detecte

# Agregar router:
app.include_router(hr_router, prefix="/api/v1/hr", tags=["HR"])

# Agregar mount de archivos estáticos para fotos de empleados:
# app.mount("/static/empleados", StaticFiles(directory="static/empleados"), name="empleados")
```

#### MODIFICAR: `apps/api/modules/security/models.py`

```python
# Agregar a clase Employee:
employee_number = Column(Integer, unique=True, nullable=True)  # Número secuencial RRHH
exclude_attendance = Column(Boolean, default=False)  # Excluir de check-in/check-out
```

Migración idempotente en main.py startup:
```python
migrations = [
    ("employees", "employee_number", "INTEGER"),
    ("employees", "exclude_attendance", "BOOLEAN DEFAULT FALSE"),
]
```

---

### Frontend (React/Vite)

#### NUEVO: `apps/hr/`

**Componentes (todos los archivos):**

```
apps/hr/
├── RecursosHumanosUI.jsx        # Landing: header 4 botones + tabla
├── HRDynamicTable.jsx           # Tabla 15 cols, fijas + scroll
├── ConfigSuite.jsx              # Componente genérico de configuración
├── hrService.js                 # Servicio API
│
├── EmployeeProfileModal.jsx     # Fase 1: Ficha empleado
├── RegulationsPanel.jsx         # Fase 1: Reglamento 11 secciones
├── CheckInWelcomeModal.jsx      # Fase 1: Modal bienvenida check-in
├── CheckOutModal.jsx            # Fase 1: Modal salida + motivo
├── ScheduleManager.jsx          # Fase 1: Gestor horarios auto-rotación
├── SchedulePDF.jsx              # Fase 1: PDF horarios
├── BirthdayPDF.jsx              # Fase 1: PDF cumpleaños
│
├── AttendanceCalendarModal.jsx  # Fase 2: Calendario asistencias
├── AttendanceIncidentModal.jsx  # Fase 2: Registro abandono/incidencia
├── IncidentsModal.jsx           # Fase 2: Historial incidencias
├── UniformDepositModal.jsx      # Fase 2: Fianza uniforme
├── CoverageFundModal.jsx        # Fase 2: Fondo cobertura
├── PayrollModal.jsx             # Fase 2: Nómina semanal
├── PSGModal.jsx                 # Fase 2: Permisos sin goce
│
├── VacationsModal.jsx           # Fase 3: Vacaciones
├── PsychometricsModal.jsx       # Fase 3: DISC + Valores + Aptitud
├── KPIsModal.jsx                # Fase 3: Dashboard KPIs
├── ExitSurveyModal.jsx          # Fase 3: Encuesta salida
├── SeveranceModal.jsx           # Fase 3: Finiquito
├── EmployeeOfMonthPDF.jsx       # Fase 3: PDF empleado mes
└── PublicApplicationForm.jsx    # Fase 3: Portal público aspirantes
```

#### MODIFICAR: `apps/ExperimentCenterUI.jsx`

1. Agregar import:
```jsx
import { RecursosHumanosUI } from './hr/RecursosHumanosUI';
```

2. Agregar a allModules (~línea 115):
```jsx
{ id: 'recursos_humanos', name: 'Recursos Humanos', icon: '👥', color: 'bg-teal-800', access: ['ADMIN', 'MANAGER'] },
```

3. Agregar case de renderizado en el switch/condicional donde se renderiza el módulo activo.

4. Agregar check-in seguro en handleLogin (~línea 75):
```jsx
const handleLogin = async (user) => {
    // 1. Login normal (siempre funciona)
    setUserRole(user.role);
    setUserName(user.name || '');
    setUserId(user.id);
    setUserProfileId(user.profile_id);
    setUserPermissions(user.permissions || {});
    setIsAuthenticated(true);
    
    // 2. Check-in HR (si falla, no pasa nada)
    try {
        if (!user.exclude_attendance) {
            const res = await fetch(`${API_BASE}/api/v1/hr/attendance/check-in`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employee_id: user.id })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.is_first_login) {
                    setShowCheckInModal(true);
                    setCheckInData(data);
                }
            }
        }
    } catch (err) {
        console.warn("Check-in HR no disponible:", err);
    }
};
```

5. Agregar estados para check-in/check-out:
```jsx
const [showCheckInModal, setShowCheckInModal] = useState(false);
const [showCheckOutModal, setShowCheckOutModal] = useState(false);
const [checkInData, setCheckInData] = useState(null);
```

6. Agregar botón "Registrar Salida de Turno" en sidebar (visible solo si usuario no está excluido).

7. Renderizar `CheckInWelcomeModal` y `CheckOutModal` condicionalmente.

#### MODIFICAR: `apps/auth/PerfilesAccessSuite.jsx`

Agregar toggle `"recursos_humanos"` al objeto de permisos disponibles.
Agregar checkbox `"Excluir de registro entrada/salida"` en la sección de edición de empleado.

#### NO MODIFICAR: `apps/auth/LoginUI.jsx` ← INTOCABLE

---

## Header del Módulo

```
┌─ RECURSOS HUMANOS ─── [📅 Horarios] [🏆 Empleado del Mes] [🎂 Cumpleaños] [📋 Reglamento] ─┐
```

| Botón | Acción |
|-------|--------|
| 📅 Horarios | PDF imprimible con asignación semanal (ventas rotativa + producción fija) |
| 🏆 Empleado del Mes | Top 5 KPIs → seleccionar → PDF tamaño carta con foto |
| 🎂 Cumpleaños | PDF tamaño carta con cumpleaños del mes |
| 📋 Reglamento | Panel con 11 secciones |

---

## Tabla Dinámica — 15 Columnas (+ 1 = 16 con Finiquito)

Primeras 4 fijas │ Resto scroll horizontal →

| # | Columna | Celda (clic) | Encabezado (clic) |
|---|---------|-------|------------|
| 1 | **# Empleado** | Número secuencial | — |
| 2 | **Puesto** | Puesto actual (agrupa filas) | — |
| 3 | **Nombre** | Nombre completo (alfabético) | — |
| 4 | **Semestre** | Semestre de contrato actual | — |
| 5 | **Info General** | → Modal ficha completa | — |
| 6 | **Asistencia** | → Modal calendario histórico | — |
| 7 | **Incidencias** | → Modal historial + registro | ⚙️ Config escalamiento |
| 8 | **Fianza Uniforme** | → Modal saldo + movimientos | ⚙️ Config prendas/costos |
| 9 | **Fondo Cobertura** | → Modal saldo + movimientos | ⚙️ Config montos/tabla % |
| 10 | **Nómina** | → Modal desglose semanal | ⚙️ Tabla salarial por puesto |
| 11 | **PSGs** | → Modal historial permisos | ⚙️ Config PSGs |
| 12 | **Vacaciones** | → Modal programación | ⚙️ Config días/antigüedad |
| 13 | **Psicométricos** | → Modal resultados DISC | ⚙️ Config tests/umbrales |
| 14 | **KPIs** | → Modal dashboard | ⚙️ Config indicadores/pesos |
| 15 | **Encuesta Salida** | → Modal encuesta | ⚙️ Config preguntas |
| 16 | **Finiquito** | → Modal cálculo | ⚙️ Config conceptos/reglas |

---

## Reglamento — 11 Secciones

1. **Observancia General** — Trato justo, reglas claras
2. **Convivencia y Liderazgo** — Compañerismo, apodos prohibidos, provocaciones→acta, agresión verbal→suspensión 8 días, agresión física→baja
3. **Vestimenta y Uniforme** — 2 juegos (paliacate, mandil, camiseta, pantalón), calzado antiderrapante café, préstamo con cargo lavandería
4. **Puntualidad y Asistencia** — Bono diario por semestre, tolerancia 15min (pierde bono), 3 retardos=1 falta, 3 faltas=baja
5. **Permisos e Inasistencias** — PSG (3/contrato, 6 días), IT (3 días), CP (3 días), PRO (emergencias), Fondo de Cobertura ($600, tabla de % por anticipación, reposición en 3 exhibiciones)
6. **Horarios y Turnos** — Rotación A/B/C/D para ventas, horario fijo para producción
7. **Juntas de Personal** — Producción L 13:00-13:30, Generales V 13:45-14:15, Fin de semana S 13:45-14:15, secuencia 6 pasos, cumpleaños última junta del mes
8. **Uso de Celular** — Prohibido en turno, ricofón: 7225 41 05 53
9. **Sustancias Prohibidas** — Alcohol/drogas = suspensión 8 días + acta
10. **Hurto** — Baja inmediata + denuncia penal
11. **Normas Generales (Visual)** — Póster con 16 reglas:
    - 🚫 Prohibido celular y dispositivos de foto/video
    - 🚫 No ingresar con resaca, alcohol o drogas
    - 🚫 No usar perfumes o lociones
    - 🚫 No usar alhajas ni relojes
    - 🚫 No usar maquillaje
    - 🚫 No hacer señas obscenas ni groserías
    - 🚫 No robar productos, materias primas, equipos
    - 🚫 No provocar ni pelear
    - ✅ Ser puntual
    - ✅ Mantener actitud positiva
    - ✅ Presentarse aseado con desodorante no aromático
    - ✅ Uniforme limpio, planchado y completo
    - ✅ Uñas cortas sin esmaltes o barnices
    - ✅ Cabello corto o recogido
    - ✅ Guardar mochila y pertenencias en locker
    - ✅ Respeto

---

## Lógica Automática del Sistema

### Nómina (cruza todas las columnas)
| Fuente | Efecto |
|---|---|
| Asistencia → días trabajados + puntualidad | Salario base + bono según semestre |
| Fondo cobertura → reposición pendiente | Deducción semanal automática |
| Fianza uniforme → saldo pendiente | Deducción semanal automática |
| Incidencia → suspensión | Descuenta días suspendido |
| PSG → permiso sin goce | Descuenta día completo |

### Incidencias (escalamiento automático, configurable)
| Evento | Acción |
|---|---|
| 3ª llamada de atención en contrato | → Auto-genera Acta Administrativa + alerta gerente |
| 3ª acta administrativa en contrato | → Proceso de baja automático + alerta |
| Motivo de acta directa (alcohol, agresión verbal, provocación) | → Salta a Acta sin pasar por llamada |
| Motivo de baja inmediata (hurto, agresión física) | → Baja directa sin escalamiento |

### Asistencia
| Evento | Acción |
|---|---|
| 3 retardos acumulados | → 1 falta injustificada |
| 3 faltas injustificadas | → Baja laboral |
| Sin registro de salida +2 hrs después del fin teórico | → Marca "Salida no registrada" para validación del gerente |
| Falta con aviso | → Aplica % del fondo de cobertura según tabla de anticipación |

### Finiquito (automático al procesar baja/renuncia)
| Concepto a favor | Cálculo |
|---|---|
| Días trabajados no pagados | Días × salario diario del puesto |
| Vacaciones proporcionales | Días según antigüedad × proporcional |
| Prima vacacional | % configurable sobre vacaciones |
| Aguinaldo proporcional | Días configurables / 365 × días trabajados en el año |
| Devolución fianza uniforme | Saldo cubierto |
| Devolución fondo cobertura | Saldo no usado |
| (-) Deducciones pendientes | Fianza/fondo sin cubrir, merma, daños |

### Horarios (rotación automática)
| Evento | Acción |
|---|---|
| Nueva semana del año | Sistema asigna siguiente template (A→B→C→D→A...) |
| Gerente modifica posición | Se respeta cambio solo para ese día |
| Empleado ficha entrada | Modal muestra su posición, turno y rol del día |

---

## Fases de Implementación

### Fase 1 — Base
**Estimado: ~3-4 hrs desarrollo**

Entregables:
- [ ] 6 tablas de BD (hr_employees_ext, hr_positions, hr_attendance, hr_regulations, hr_schedule_templates, hr_schedules)
- [ ] Migración columnas employee_number + exclude_attendance en tabla employees
- [ ] API CRUD: `/api/v1/hr/` (employees, positions, attendance, regulations, schedules)
- [ ] Endpoint check-in: `POST /api/v1/hr/attendance/check-in`
- [ ] Frontend: RecursosHumanosUI.jsx (landing + header 4 botones)
- [ ] Frontend: HRDynamicTable.jsx (columnas 1-6 con datos reales)
- [ ] Frontend: EmployeeProfileModal.jsx (ficha completa)
- [ ] Frontend: RegulationsPanel.jsx (11 secciones)
- [ ] Frontend: CheckInWelcomeModal.jsx + CheckOutModal.jsx
- [ ] Frontend: ScheduleManager.jsx + SchedulePDF.jsx
- [ ] Frontend: BirthdayPDF.jsx
- [ ] Integración: módulo en sidebar de ExperimentCenterUI
- [ ] Integración: check-in seguro en handleLogin
- [ ] Integración: permiso "recursos_humanos" en PerfilesAccessSuite
- [ ] hrService.js

### Fase 2 — Operación Diaria
**Estimado: ~4-5 hrs (después de validar Fase 1 en producción)**

Entregables:
- [ ] 14 tablas operativas
- [ ] ConfigSuite.jsx genérico
- [ ] Columnas 7-11 funcionales (Incidencias, Fianza, Fondo, Nómina, PSGs)
- [ ] Lógica de escalamiento automático
- [ ] Cálculo de nómina automático
- [ ] Calendario visual de asistencias
- [ ] Todas las suites de configuración para cols 7-11

### Fase 3 — Evaluación
**Estimado: ~3-4 hrs (después de validar Fase 2)**

Entregables:
- [ ] 10 tablas de evaluación
- [ ] Columnas 12-16 (Vacaciones, Psicométricos, KPIs, Encuesta Salida, Finiquito)
- [ ] Evaluación psicométrica DISC + Valores + Aptitud
- [ ] Portal público para aspirantes (URL dedicada)
- [ ] PDF Empleado del mes
- [ ] Dashboard KPIs con tendencias

---

## Verificación Post-Integración

```bash
# Frontend
curl http://192.168.1.124:5000/

# Backend general
curl http://127.0.0.1:5001/health

# Backend HR
curl http://127.0.0.1:5001/api/v1/hr/health

# Prueba login → check-in modal
# Prueba módulo RRHH visible en sidebar
# Prueba crear empleado
# Prueba reglamento
```

---

## Archivos del ERP que se Modifican

| Archivo | Cambio |
|---------|--------|
| `apps/api/main.py` | Import + router + mount estáticos HR |
| `apps/api/modules/security/models.py` | +employee_number, +exclude_attendance |
| `apps/ExperimentCenterUI.jsx` | +import HR, +módulo en sidebar, +check-in en handleLogin, +botón salida turno |
| `apps/auth/PerfilesAccessSuite.jsx` | +toggle recursos_humanos, +toggle excluir_attendance |
| `apps/auth/LoginUI.jsx` | **NO SE MODIFICA** |

## Archivos Nuevos

Todo el directorio `apps/hr/` (~25 archivos JSX + 1 JS) y `apps/api/modules/hr/` (5 archivos Python).
