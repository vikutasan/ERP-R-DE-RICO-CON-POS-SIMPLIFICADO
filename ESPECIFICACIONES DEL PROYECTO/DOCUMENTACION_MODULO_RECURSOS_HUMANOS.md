# 📋 DOCUMENTACIÓN — MÓDULO DE RECURSOS HUMANOS

> **Versión:** 1.0.0  
> **Última actualización:** 10 de agosto de 2026  
> **Autor:** Sistema de IA / Arquitectura R de Rico  
> **Estado:** ✅ Fase 1, 2 y 3 implementadas

---

## 📑 ÍNDICE

1. [Visión General](#1-visión-general)
2. [Arquitectura del Módulo](#2-arquitectura-del-módulo)
3. [Estructura de Archivos](#3-estructura-de-archivos)
4. [Base de Datos — Modelo de Datos](#4-base-de-datos--modelo-de-datos)
5. [API — Endpoints](#5-api--endpoints)
6. [Lógica de Negocio](#6-lógica-de-negocio)
7. [Frontend — Componentes](#7-frontend--componentes)
8. [Integración con el ERP](#8-integración-con-el-erp)
9. [Reglas Operativas Codificadas](#9-reglas-operativas-codificadas)
10. [Configuración por Suites](#10-configuración-por-suites)
11. [Flujos Operativos](#11-flujos-operativos)
12. [Seguridad y Restricciones](#12-seguridad-y-restricciones)
13. [Guía de Mantenimiento](#13-guía-de-mantenimiento)

---

## 1. VISIÓN GENERAL

El módulo de Recursos Humanos de R de Rico es un sistema integral de gestión de personal diseñado para una operación de panadería artesanal con dos áreas principales: **Ventas** (turnos rotativos A/B/C/D) y **Producción** (horarios fijos, Artesanos 1-6).

### Objetivos del módulo

- **Automatizar** el control de asistencia (check-in/check-out al login/logout del ERP)
- **Gestionar** el ciclo de vida completo del empleado (ingreso → operación → salida)
- **Codificar** las reglas del reglamento interno como lógica de sistema
- **Calcular** nómina semanal basándose en datos reales de asistencia
- **Proveer** herramientas de evaluación (KPIs, psicométricos, encuestas)

### Principios de diseño

| Principio | Implementación |
|---|---|
| **No romper nada** | `LoginUI.jsx` jamás se modifica. Todo se envuelve en `try/catch` |
| **Side-car pattern** | La tabla `hr_employees_ext` extiende `employees` sin tocarla |
| **Idempotencia** | Seeds y migraciones verifican existencia antes de crear |
| **Configurabilidad** | 10 suites de configuración genéricas vía `ConfigSuite` |
| **Degradación elegante** | Si el módulo HR falla, el ERP funciona normalmente |

---

## 2. ARQUITECTURA DEL MÓDULO

```
┌──────────────────────────────────────────────────────────┐
│                    ExperimentCenterUI.jsx                 │
│                   (Dashboard Principal ERP)               │
│                                                          │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────┐  │
│  │ handleLogin  │──▶│ CheckIn HR   │──▶│ CheckInModal │  │
│  │ (try/catch) │   │ (hrService)  │   │ (Bienvenida) │  │
│  └─────────────┘   └──────────────┘   └──────────────┘  │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              RecursosHumanosUI.jsx                   │ │
│  │  ┌──────────────────────────────────────────────┐   │ │
│  │  │     Tabla Dinámica (12 columnas × N filas)   │   │ │
│  │  │     Col fijas: #, Puesto, Nombre, Semestre   │   │ │
│  │  │     Col scroll: Info → Finiquito             │   │ │
│  │  └──────────────────────────────────────────────┘   │ │
│  │                     ↓ click ↓                       │ │
│  │  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ...    │ │
│  │  │Mod1│ │Mod2│ │Mod3│ │Mod4│ │Mod5│ │Mod6│         │ │
│  │  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘         │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
                            │
                     FastAPI Backend
                            │
              ┌─────────────┼──────────────┐
              │             │              │
         ┌────▼────┐  ┌────▼────┐  ┌──────▼──────┐
         │ router  │  │ service │  │   models    │
         │ (.py)   │  │ (.py)   │  │   (.py)     │
         └────┬────┘  └────┬────┘  └──────┬──────┘
              │            │               │
              └────────────┼───────────────┘
                           │
                    PostgreSQL (35+ tablas HR)
```

### Patrón de comunicación

```
Frontend (React)
    ↓ fetch()
hrService.js (cliente API)
    ↓ HTTP
router.py (FastAPI endpoints)
    ↓ await
service.py (lógica de negocio)
    ↓ SQLAlchemy async
models.py (ORM → PostgreSQL)
```

---

## 3. ESTRUCTURA DE ARCHIVOS

### Backend (`apps/api/modules/hr/`)

| Archivo | Líneas | Función |
|---|---|---|
| `__init__.py` | ~1 | Paquete Python |
| `models.py` | ~580 | 35+ modelos SQLAlchemy (tablas de BD) |
| `schemas.py` | ~180 | Modelos Pydantic para validación |
| `service.py` | ~1340 | Lógica de negocio, seeds, cálculos |
| `router.py` | ~325 | 50+ endpoints de la API REST |

### Frontend (`apps/hr/`)

| Archivo | Función |
|---|---|
| `hrService.js` | Cliente API (30+ métodos fetch) |
| `RecursosHumanosUI.jsx` | Landing: header + tabla dinámica + routing de modales |
| `RegulationsPanel.jsx` | Panel del reglamento (11 secciones con acordeón) |
| `EmployeeProfileModal.jsx` | Ficha completa del empleado (datos extendidos) |
| `CheckInWelcomeModal.jsx` | Modal de bienvenida al check-in |
| `CheckOutModal.jsx` | Modal de registro de salida (normal / PRO) |
| `ConfigSuite.jsx` | Componente genérico: 1 componente → 10 suites de config |
| `IncidentsModal.jsx` | Historial + registro con escalamiento automático |
| `UniformDepositModal.jsx` | Barra de progreso + abonos semanales |
| `CoverageFundModal.jsx` | Tabla de % por anticipación + movimientos |
| `PayrollModal.jsx` | Desglose semanal con percepciones y deducciones |
| `PSGModal.jsx` | Permisos sin goce (3/contrato) con indicador visual |
| `VacationsModal.jsx` | Solicitudes con rango de fechas y estados |
| `PsychometricModal.jsx` | DISC con barras visuales + valores + aptitud |
| `KPIsModal.jsx` | 6 rubros con sliders + score promedio |
| `ExitSurveyModal.jsx` | 6 preguntas estructuradas + revisión |
| `SeveranceModal.jsx` | Cálculo de finiquito con percepciones y deducciones |

---

## 4. BASE DE DATOS — MODELO DE DATOS

### Fase 1 — Base

```
employees (existente, NO se modifica)
    ├── id, name, employee_code, role, is_active, profile_id
    ├── employee_number (columna agregada por migración)
    └── exclude_attendance (columna agregada por migración)

hr_employees_ext (side-car de employees)
    ├── employee_id → FK(employees.id)
    ├── position_id → FK(hr_positions.id)
    ├── fecha_ingreso, fecha_nacimiento
    ├── curp, rfc, nss, direccion, telefono
    ├── contacto_emergencia_nombre/telefono
    ├── semestre_actual (1-6)
    └── contrato_vigente, tipo_sangre, alergias

hr_positions
    ├── id, nombre, descripcion, area, orden, activo
    └── 20 puestos sembrados:
        - Ventas: Aspirante → Ayudante 1-6 → Refuerzo → Cajero
        - Admin: Gerente Ventas, Gerente Producción
        - Producción: Artesano Entrenamiento → Artesano 1-6
        - Logística: Repartidor

hr_attendance
    ├── employee_id, fecha, hora_entrada, hora_salida
    ├── tipo_entrada (puntual/retardo/falta)
    ├── tipo_salida (normal/pro)
    ├── bono_puntualidad (bool)
    └── turno_asignado, posicion_asignada, observaciones

hr_regulations
    ├── seccion_numero (1-11), titulo, contenido, icono
    └── 11 secciones sembradas del reglamento

hr_schedule_templates
    ├── nombre (A/B/C/D), turno (apertura/cierre)
    └── hora_inicio, hora_fin, posiciones_json

hr_schedules
    ├── employee_id, template_id
    └── semana, año, dia_semana, posicion_asignada
```

### Fase 2 — Operación Diaria

```
hr_incidents
    ├── employee_id, fecha, tipo, motivo, descripcion
    ├── contrato_periodo, firmado_por, firma_empleado
    ├── dias_suspension, fecha_reincorporacion
    └── auto_generada (bool — escalamiento automático)

hr_incident_config (parametro, valor_json)

hr_uniform_deposits
    ├── employee_id, uniforme_numero (1 o 2)
    ├── fianza_total ($600), pagado, estado
    └── fecha_entrega

hr_uniform_movements
    ├── deposit_id, fecha, concepto, monto, tipo (cargo/abono)

hr_uniform_config (parametro, valor_json)

hr_coverage_fund
    ├── employee_id, monto_requerido ($600)
    ├── monto_cubierto, estado
    └── Tabla de % por anticipación codificada en service.py

hr_coverage_movements
    ├── fund_id, fecha, concepto, monto, tipo
    ├── porcentaje_aplicado, dias_anticipacion

hr_coverage_config (parametro, valor_json)

hr_salary_tables
    ├── position_id → FK(hr_positions.id)
    ├── semestre (1-6)
    ├── sueldo_hora, bono_hora
    └── sueldo_dia (auto: hora × 8), bono_dia (auto: hora × 8)

hr_payroll
    ├── employee_id, semana, año
    ├── dias_trabajados/puntuales/retardo/falta/suspension/psg
    ├── salario_base, bono_puntualidad, total_percepciones
    ├── deduccion_uniforme/fondo/otros, total_deducciones
    ├── neto
    └── aprobado, aprobado_por, observaciones

hr_payroll_deductions
    ├── payroll_id, concepto, monto, descripcion

hr_payroll_config (parametro, valor_json)

hr_psg
    ├── employee_id, fecha_solicitado, fecha_permiso
    ├── dias_anticipacion, aprobado, aprobado_por
    ├── uso_fondo, porcentaje_fondo, monto_fondo
    └── contrato_periodo, observaciones

hr_psg_config (parametro, valor_json)
```

### Fase 3 — Evaluación y Cierre

```
hr_vacations
    ├── employee_id, fecha_inicio, fecha_fin, dias
    ├── prima_vacacional, estado, aprobado_por
    └── observaciones

hr_vacation_config (parametro, valor_json)

hr_psychometrics
    ├── employee_id, fecha, test_tipo (disc/valores/aptitud)
    ├── resultados_json
    │   DISC: {D: 0-100, I: 0-100, S: 0-100, C: 0-100}
    │   Valores: {procesos: x, relaciones: x, resultados: x, innovacion: x}
    │   Aptitud: {numerica: x, verbal: x, abstracta: x}
    ├── recomendacion, evaluador

hr_psychometric_config (parametro, valor_json)

hr_kpis
    ├── employee_id, mes, año, score_total
    ├── detalle_json:
    │   {puntualidad: 0-100, actitud: 0-100, productividad: 0-100,
    │    limpieza: 0-100, trabajo_equipo: 0-100, atencion_cliente: 0-100}
    └── evaluado_por

hr_kpi_config (parametro, valor_json)

hr_exit_surveys
    ├── employee_id, fecha, motivo_salida
    ├── respuestas_json:
    │   {motivo: "...", ambiente: 1-10, liderazgo: 1-10,
    │    crecimiento: 1-10, recomendaria: "...", sugerencias: "..."}
    └── observaciones

hr_exit_survey_config (parametro, valor_json)

hr_severance
    ├── employee_id, fecha_calculo, motivo_salida
    ├── percepciones_json:
    │   {salario_proporcional, aguinaldo_proporcional,
    │    vacaciones_proporcionales, prima_vacacional}
    ├── deducciones_json:
    │   {uniforme_1, uniforme_2, fondo_cobertura}
    ├── neto, aprobado, aprobado_por, firmado

hr_severance_config (parametro, valor_json)
```

---

## 5. API — ENDPOINTS

### Base URL: `/api/v1/hr`

#### Fase 1 — Base

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Health check del módulo |
| GET | `/employees` | Lista todos los empleados con datos HR |
| GET | `/employees/{id}` | Detalle de un empleado |
| PUT | `/employees/{id}` | Actualizar datos extendidos |
| GET | `/positions` | Catálogo de 20 puestos |
| GET | `/regulations` | 11 secciones del reglamento |
| POST | `/attendance/check-in` | Registrar entrada (automático al login) |
| POST | `/attendance/check-out` | Registrar salida |
| GET | `/attendance/{employee_id}` | Historial de asistencia |
| GET | `/birthdays` | Cumpleaños del mes |

#### Fase 2 — Operación

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/incidents/{employee_id}` | Historial de incidencias |
| POST | `/incidents` | Crear incidencia (con escalamiento auto) |
| GET | `/incidents/{employee_id}/summary` | Resumen: llamadas, actas, alertas |
| GET | `/uniform/{employee_id}` | Estado de fianza de uniforme |
| POST | `/uniform` | Registrar nuevo uniforme |
| POST | `/uniform/{deposit_id}/movement` | Abonar a fianza |
| GET | `/coverage/{employee_id}` | Estado del fondo de cobertura |
| POST | `/coverage` | Crear fondo |
| POST | `/coverage/{fund_id}/movement` | Movimiento del fondo |
| GET | `/salary-tables` | Tabla salarial completa |
| POST | `/salary-tables` | Crear/actualizar entrada salarial |
| GET | `/payroll/{employee_id}` | Nóminas del empleado |
| POST | `/payroll/calculate` | Calcular nómina semanal |
| GET | `/psg/{employee_id}` | PSGs del empleado |
| POST | `/psg` | Solicitar PSG |
| GET | `/config/{type}` | Obtener configuración de suite |
| PUT | `/config/{type}` | Guardar configuración de suite |

#### Fase 3 — Evaluación

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/vacations/{employee_id}` | Vacaciones del empleado |
| POST | `/vacations` | Solicitar vacaciones |
| GET | `/psychometrics/{employee_id}` | Tests psicométricos |
| POST | `/psychometrics` | Registrar resultado de test |
| GET | `/kpis/{employee_id}` | Evaluaciones KPI |
| POST | `/kpis` | Registrar evaluación KPI |
| GET | `/exit-survey/{employee_id}` | Encuesta de salida |
| POST | `/exit-survey` | Aplicar encuesta |
| GET | `/severance/{employee_id}` | Finiquito calculado |
| POST | `/severance/calculate` | Calcular finiquito |

---

## 6. LÓGICA DE NEGOCIO

### 6.1 Check-in Automático

```
Login del empleado
    → ExperimentCenterUI.handleLogin()
        → setIsAuthenticated(true)  ← siempre funciona
        → try { hrService.checkIn(userId) }  ← si falla, no pasa nada
            → POST /attendance/check-in
            → Backend: evalúa hora vs turno asignado
                → hora ≤ inicio_turno → tipo: "puntual", bono: true
                → hora ≤ inicio_turno + 15min → tipo: "retardo", bono: false
                → hora > inicio_turno + 15min → tipo: "falta"
            → Si es primer login del día → return { is_first_login: true }
            → Frontend muestra CheckInWelcomeModal
```

### 6.2 Escalamiento de Incidencias

```
Registro de incidencia
    → Evaluar MOTIVO:
        → Si contiene "hurto/robo/agresion_fisica" → BAJA DIRECTA
        → Si contiene "alcohol/drogas/agresion_verbal" → ACTA DIRECTA
        → Otro → tipo solicitado (default: llamada_atencion)
    
    → Guardar incidencia
    
    → Evaluar ACUMULACIÓN:
        → Si 3+ llamadas_atencion Y 0 actas → GENERA ACTA AUTO
            → Suspensión 8 días sin goce
            → Se marca auto_generada = true
        → Si 3+ actas_administrativas → GENERA BAJA AUTO
            → Se marca auto_generada = true
```

### 6.3 Fondo de Cobertura — Tabla de Anticipación

```
Días de anticipación  →  % del fondo que se aplica
─────────────────────────────────────────────────
No avisó (-1)         →  100% ($600)
0 días (avisa)        →   90% ($540)
1 día                 →   80% ($480)
2 días                →   70% ($420)
3 días                →   60% ($360)
4 días                →   50% ($300)
5+ días               →   40% ($240)

Reposición: El empleado repone el fondo en 3 exhibiciones semanales ($200/semana)
```

### 6.4 Cálculo de Nómina

```
Entrada: employee_id, semana, año

1. Obtener semestre_actual del empleado → hr_employees_ext
2. Buscar tabla salarial → hr_salary_tables[position_id][semestre]
   → sueldo_dia, bono_dia (o defaults: $190, $50)

3. Contar asistencia de la semana (lunes-domingo ISO):
   → dias_trabajados = registros de attendance
   → dias_puntuales = registros con bono_puntualidad = true
   → dias_retardo = registros con tipo_entrada = "retardo"

4. PERCEPCIONES:
   → salario_base = dias_trabajados × sueldo_dia
   → bono_puntualidad = dias_puntuales × bono_dia
   → total_percepciones = salario + bono

5. DEDUCCIONES:
   → uniforme: $100/semana por uniforme pendiente
   → fondo: $200/semana si fondo pendiente (600/3 exhibiciones)
   → total_deducciones = uniforme + fondo + otros

6. NETO = total_percepciones - total_deducciones
7. Guardar en hr_payroll (create or update)
```

### 6.5 Cálculo de Finiquito

```
Entrada: employee_id, motivo_salida

1. Obtener antigüedad:
   → fecha_ingreso (hr_employees_ext) → días_trabajados
   → años_servicio = días / 365.25

2. Obtener sueldo_dia:
   → Buscar en hr_salary_tables[position][semestre] o default $190

3. PERCEPCIONES:
   → Salario proporcional = (días_trabajados % 7) × sueldo_dia
   → Aguinaldo proporcional = (15/365) × días_año × sueldo_dia
   → Vacaciones proporcionales = (días_vac/365) × días_trabajados × sueldo_dia
     (días_vac = min(12 + años×2, 20) según LFT)
   → Prima vacacional = vacaciones × 25%

4. DEDUCCIONES:
   → Fianza uniforme pendiente (hr_uniform_deposits WHERE estado=pendiente)
   → Fondo cobertura pendiente (hr_coverage_fund WHERE estado=pendiente)

5. NETO = percepciones - deducciones
6. Guardar en hr_severance
```

### 6.6 Tabla Salarial — Bono por Semestre

```
El bono de puntualidad NO es una escalera corporativa.
Se incrementa con cada renovación de contrato (cada 6 meses):

Semestre 1 (meses 0-6):    bono configurable (default $50/día)
Semestre 2 (meses 6-12):   bono configurable (default $100/día)
Semestre 3 (meses 12-18):  bono configurable (default $150/día)
Semestre 4 (meses 18-24):  bono configurable (default $200/día)
Semestre 5 (meses 24-30):  bono configurable (default $250/día)
Semestre 6 (meses 30-36):  bono configurable (default $300/día)

El salario base es FIJO por puesto (no cambia por semestre).
La tabla es editable por puesto via POST /salary-tables.
```

---

## 7. FRONTEND — COMPONENTES

### 7.1 RecursosHumanosUI.jsx — Tabla Principal

La tabla tiene **4 columnas fijas** (izquierda, siempre visibles) + **12 columnas scrollable** (derecha):

```
FIJAS:                      SCROLLABLE (→):
┌───┬─────────┬──────┬────┐┌────────┬──────────┬───────────┬──────────┬─────────────┬────────┬──────┬───────────┬────────────┬──────┬────────────┬──────────┐
│ # │ Puesto  │Nombre│Sem ││Info Gen│Asistencia│Incidencias│Uniforme  │Fondo Cobert.│Nómina  │PSGs  │Vacaciones │Psicométric.│KPIs  │Enc. Salida │Finiquito │
├───┼─────────┼──────┼────┤├────────┼──────────┼───────────┼──────────┼─────────────┼────────┼──────┼───────────┼────────────┼──────┼────────────┼──────────┤
│ 1 │AyG Niv1 │NATY  │ 2  ││📋 Ver  │📅 Calend │⚡ Ver     │👔 Ver    │🛡️ Ver      │💰 Ver  │📝 Ver│🏖️ Ver     │🧠 Ver      │📊 Ver│📋 Ver      │💼 Ver    │
│ 2 │AyG Niv1 │LUZ   │ 1  ││📋 Ver  │📅 Calend │⚡ Ver     │👔 Ver    │🛡️ Ver      │💰 Ver  │📝 Ver│🏖️ Ver     │🧠 Ver      │📊 Ver│📋 Ver      │💼 Ver    │
└───┴─────────┴──────┴────┘└────────┴──────────┴───────────┴──────────┴─────────────┴────────┴──────┴───────────┴────────────┴──────┴────────────┴──────────┘
```

Los empleados se agrupan por puesto con separadores de color teal.

Cada encabezado de columna (a partir de la 3ra) tiene un ícono ⚙️ que abre la `ConfigSuite` correspondiente.

### 7.2 Header con 4 botones

1. **📅 Horarios** — Gestión de turnos rotativos (placeholder Fase 2)
2. **🏆 Empleado del Mes** — Placeholder
3. **🎂 Cumpleaños** — Lista cumpleaños del mes actual
4. **📖 Reglamento** — Abre `RegulationsPanel` (11 secciones)

### 7.3 Modales — Patrón de Diseño

Todos los modales siguen el mismo patrón visual:

```jsx
<div className="fixed inset-0 z-[99999] bg-black/80">      // Overlay
    <div className="bg-[#111] border border-white/10 rounded-2xl">  // Card
        <header>  Título + botones de acción + ✕ cerrar  </header>
        <form>    Formulario de creación (si aplica)       </form>
        <list>    Historial de registros                   </list>
    </div>
</div>
```

---

## 8. INTEGRACIÓN CON EL ERP

### 8.1 Cambios en ExperimentCenterUI.jsx

```jsx
// 1. Imports seguros
import { RecursosHumanosUI } from './hr/RecursosHumanosUI';
import { CheckInWelcomeModal } from './hr/CheckInWelcomeModal';
import { CheckOutModal } from './hr/CheckOutModal';
import { hrService } from './hr/hrService';

// 2. handleLogin ahora es async con try/catch
const handleLogin = async (user) => {
    // Login normal (SIEMPRE funciona)
    setIsAuthenticated(true);
    
    // Check-in HR (si falla, el ERP funciona igual)
    try {
        const result = await hrService.checkIn(user.id);
        if (result?.is_first_login) {
            setShowCheckInModal(true);
        }
    } catch (err) {
        console.warn('Check-in HR no disponible:', err);
    }
};

// 3. Módulo en el sidebar
{ id: 'recursos_humanos', name: 'Recursos Humanos', 
  color: 'bg-teal-800', icon: '👥', access: ['ADMIN', 'MANAGER'] }

// 4. Rendering
{activeModule === 'recursos_humanos' && 
    <RecursosHumanosUI userId={userId} userName={userName} />}

// 5. Botón de salida de turno en sidebar (antes del logout)
<button onClick={() => setShowCheckOutModal(true)}>
    👋 Registrar Salida de Turno
</button>
```

### 8.2 Cambios en main.py (Backend)

```python
# Import de modelos HR (para que Base.metadata.create_all los detecte)
from modules.hr.models import (
    HREmployeeExt, HRPosition, HRAttendance, HRRegulation,
    # ... + 30 modelos más
)

# Mount del router HR
app.include_router(hr_router, prefix="/api/v1/hr", tags=["HR"])

# En startup:
# 1. create_all() → crea tablas HR si no existen
# 2. seed_positions() → 20 puestos si tabla vacía
# 3. seed_regulations() → 11 secciones si tabla vacía
# 4. migrate_employee_columns() → agrega employee_number, exclude_attendance
```

### 8.3 LoginUI.jsx — NO SE MODIFICA

> ⚠️ **REGLA ABSOLUTA:** `LoginUI.jsx` jamás se toca. Toda la lógica de check-in
> se ejecuta en `ExperimentCenterUI.handleLogin()` DESPUÉS del login exitoso,
> envuelta en `try/catch` para que si HR falla, el login funcione normalmente.

---

## 9. REGLAS OPERATIVAS CODIFICADAS

Las siguientes reglas del reglamento interno están implementadas como lógica del sistema:

| # | Regla | Implementación |
|---|---|---|
| 1 | Tolerancia de 15 minutos | `service.py` → check_in evalúa hora vs turno |
| 2 | 3 retardos = 1 falta | `service.py` → configurable vía payroll config |
| 3 | 3 faltas = baja | `service.py` → configurable vía payroll config |
| 4 | 3 llamadas → acta automática | `crear_incidencia()` → escalamiento auto |
| 5 | 3 actas → baja automática | `crear_incidencia()` → escalamiento auto |
| 6 | Hurto/robo → baja directa | Motivos en `MOTIVOS_BAJA_DIRECTA` |
| 7 | Alcohol/drogas → acta directa | Motivos en `MOTIVOS_ACTA_DIRECTA` |
| 8 | Agresión física → baja directa | Motivos en `MOTIVOS_BAJA_DIRECTA` |
| 9 | Suspensión = 8 días sin goce | `dias_suspension=8` en acta auto |
| 10 | 3 PSGs máximo por contrato | `crear_psg()` → valida count ≥ 3 |
| 11 | PSG requiere 6 días anticipación | Configurable vía PSG config |
| 12 | Fondo de cobertura = $600 | `CoverageFund.monto_requerido` |
| 13 | Tabla de % por anticipación | `TABLA_PORCENTAJE_FONDO` en service.py |
| 14 | Reposición en 3 exhibiciones | $200/semana en cálculo de nómina |
| 15 | Fianza uniforme = $600 | `UniformDeposit.fianza_total` |
| 16 | Bono sube por semestre | `hr_salary_tables` por position × semestre |

---

## 10. CONFIGURACIÓN POR SUITES

Cada suite es accesible via el ícono ⚙️ en el encabezado de la columna correspondiente. Todas usan el mismo componente genérico `ConfigSuite.jsx` y el endpoint `/api/v1/hr/config/{type}`.

| Suite | Tipo | Parámetros |
|---|---|---|
| `incidents` | Incidencias | llamadas_para_acta, actas_para_baja, dias_suspension, motivos directos |
| `uniform` | Uniforme | fianza_total, descuento_semanal, juegos, prendas |
| `coverage` | Fondo | monto_total, exhibiciones_reposicion, tabla_porcentajes |
| `payroll` | Nómina | dia_corte, dia_pago, sueldo/bono por semestre, tolerancia, retardos/faltas |
| `psg` | PSGs | max_por_contrato, dias_anticipacion, dias_alta_demanda |
| `vacations` | Vacaciones | dias_primer_año, incremento_anual, max_dias, prima_vacacional |
| `psychometrics` | Psicométricos | tests_obligatorios, frecuencia_meses |
| `kpis` | KPIs | rubros, score_minimo, frecuencia |
| `exit_survey` | Enc. Salida | obligatoria, preguntas_extra |
| `severance` | Finiquito | dias_aguinaldo, prima_vacacional, descuentos_pendientes |

---

## 11. FLUJOS OPERATIVOS

### 11.1 Ciclo de vida del empleado

```
INGRESO
  ├── Se crea en tabla employees (sistema existente)
  ├── Se crea hr_employees_ext con position_id, fecha_ingreso, semestre=1
  ├── Se crea hr_uniform_deposits (2 juegos × $600)
  └── Se crea hr_coverage_fund ($600)

OPERACIÓN DIARIA
  ├── Check-in automático al login → hr_attendance
  ├── Bono de puntualidad evaluado por día
  ├── Incidencias si hay faltas al reglamento
  ├── Nómina calculada semanalmente
  ├── PSGs solicitados por el empleado
  └── KPIs evaluados mensualmente por el gerente

RENOVACIÓN DE CONTRATO (cada 6 meses)
  ├── semestre_actual += 1
  ├── Bono de puntualidad sube según tabla salarial
  └── Contador de PSGs se reinicia

SALIDA
  ├── Encuesta de salida
  ├── Cálculo de finiquito
  │     ├── (+) Salario proporcional
  │     ├── (+) Aguinaldo proporcional
  │     ├── (+) Vacaciones proporcionales
  │     ├── (+) Prima vacacional
  │     ├── (-) Fianza uniforme pendiente
  │     └── (-) Fondo cobertura pendiente
  └── Firma y aprobación
```

### 11.2 Flujo de nómina semanal

```
Lunes → Domingo (semana ISO)
  │
  ├── Cada día: check-in/out registra asistencia
  │     → puntual (bono ✅) / retardo (bono ❌) / falta
  │
  ├── Domingo (corte):
  │     → POST /payroll/calculate
  │     → Sistema cuenta días, calcula percepciones/deducciones
  │
  ├── Viernes (pago):
  │     → Gerente aprueba nómina
  │     → Se registran movimientos de uniforme/fondo si aplica
  │
  └── Resultado: recibo con desglose completo
```

---

## 12. SEGURIDAD Y RESTRICCIONES

| Restricción | Implementación |
|---|---|
| Solo ADMIN y MANAGER acceden al módulo | `access: ['ADMIN', 'MANAGER']` en sidebar |
| LoginUI.jsx intocable | Try/catch en `handleLogin`, degradación elegante |
| Migraciones idempotentes | `IF NOT EXISTS` en columnas, `count > 0` en seeds |
| Datos no se pierden | Side-car pattern: `hr_employees_ext` no modifica `employees` |
| Finiquito requiere aprobación | Campo `aprobado` / `aprobado_por` / `firmado` |
| PSGs limitados | Validación server-side: max 3 por contrato |

---

## 13. GUÍA DE MANTENIMIENTO

### Agregar un nuevo puesto

1. Insertar en `hr_positions` vía BD o crear endpoint
2. Crear entradas en `hr_salary_tables` para los 6 semestres
3. El puesto aparecerá automáticamente en la tabla de empleados

### Modificar tabla salarial

```
POST /api/v1/hr/salary-tables
{
    "position_id": 3,    // ID del puesto
    "semestre": 2,       // Semestre (1-6)
    "sueldo_hora": 25.0, // Sueldo por hora
    "bono_hora": 15.0    // Bono por hora
}
// sueldo_dia y bono_dia se calculan automáticamente (× 8)
```

### Agregar una nueva columna al módulo

1. Crear modelo en `models.py` (tabla + config)
2. Agregar funciones en `service.py`
3. Agregar endpoints en `router.py`
4. Crear modal en `apps/hr/NuevoModal.jsx`
5. Agregar métodos en `hrService.js`
6. Agregar schema en `ConfigSuite.jsx`
7. Agregar config model en `CONFIG_MODELS` dict
8. Conectar en `RecursosHumanosUI.jsx` (import, columna, modal render)
9. Reiniciar API → tablas se crean automáticamente

### Docker

```bash
# Reiniciar API (aplica cambios de backend)
docker compose restart api

# Ver logs de errores
docker compose logs api --tail 50

# Ver compilación de Vite
docker compose logs pos --tail 10
```

---

> **Nota:** Este módulo está diseñado para crecer. La arquitectura de columnas + modales + config suites permite agregar nuevas funcionalidades sin refactorizar el código existente. Cada columna es independiente y autónoma.
