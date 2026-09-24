# 🌐 DOCUMENTACIÓN MAESTRA: ENLACES REMOTOS AL ERP — R de Rico ERP

> ⚠️ **LECTURA OBLIGATORIA** antes de compartir cualquier enlace del ERP con un colaborador.
> Este documento describe **cómo se accede al ERP desde fuera de la panadería**, la
> **política de responsabilidad personal** sobre la clave, y el **protocolo de equipos
> compartidos**. Cualquier cambio que rompa las **Reglas de Oro** (sección 8) se considera
> una regresión crítica de seguridad.

**Última actualización:** 23/Septiembre/2026 (v19.5 — subdominio `erp.rdericotoluca.com` + enlace de acceso limpio `?logout=1`)
**Archivos gobernados:**
- [`vite.config.js`](../../vite.config.js) — `allowedHosts` (hosts públicos permitidos por Vite)
- [`apps/ExperimentCenterUI.jsx`](../../apps/ExperimentCenterUI.jsx) — Sesión persistida, `?logout=1`, login/logout
- [`apps/auth/LoginUI.jsx`](../../apps/auth/LoginUI.jsx) — Pantalla de PIN
- [`apps/pos/services/securityService.js`](../../apps/pos/services/securityService.js) — `validatePin` contra el API
- [`apps/shared/config.js`](../../apps/shared/config.js) — Derivación dinámica de la URL del API
- [`ESPECIFICACIONES DEL PROYECTO/CONTEXTO_SISTEMA_IA.md`](CONTEXTO_SISTEMA_IA.md:1329) — §16.15 (incidente y solución)

---

## 1. PROPÓSITO DEL DOCUMENTO

Este documento responde a una pregunta operativa concreta:

> **¿Cómo entra un colaborador al ERP desde su casa, su celular o su tablet, sin estar
> conectado a la red de la panadería?**

Y a una pregunta de gobernanza igual de importante:

> **¿Quién es responsable de lo que se hace dentro del sistema cuando alguien está
> logueado con su clave?**

La respuesta corta es: **un solo enlace público** (`erp.rdericotoluca.com`) sirve a
**todos** los colaboradores, y **cada quien responde por lo que hace con su clave**.
El nivel de acceso de cada persona lo determina **su perfil de permisos**, no el enlace.

---

## 2. EL ENLACE ÚNICO DE ACCESO

### 2.1 Enlace oficial

```
https://erp.rdericotoluca.com
```

Este es **el único enlace** que se comparte con los colaboradores. No hay enlaces
distintos por puesto, por sucursal ni por nivel jerárquico.

### 2.2 ¿Por qué un solo enlace sirve para todos?

Porque el ERP **no autentica por URL, autentica por PIN**. El flujo es:

```
Colaborador abre https://erp.rdericotoluca.com
        │
        ▼
┌───────────────────────────────┐
│  Pantalla de PIN (LoginUI)    │   ← Pide la clave personal
└───────────────────────────────┘
        │  POST /security/employees/validate-pin
        ▼
┌───────────────────────────────┐
│  El API valida el PIN y        │
│  devuelve el PERFIL del        │
│  empleado:                     │
│   • id                         │
│   • role                       │
│   • name                       │
│   • profile_id                 │
│   • profile.permissions  ←─────┼── AQUÍ se decide qué ve y qué puede hacer
└───────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│  El ERP monta el menú y los    │
│  módulos SEGÚN los permisos    │
│  de ese perfil                 │
└───────────────────────────────┘
```

**Conclusión:** el enlace es el mismo para todos; **la clave es la que abre la puerta
correcta**. Un colaborador de reparto verá el módulo de Reparto; un cajero verá el POS;
un administrador verá todo. Nadie ve más de lo que su perfil permite.

### 2.3 Evidencia en el código

| Paso | Archivo | Detalle |
|---|---|---|
| Captura del PIN | [`apps/auth/LoginUI.jsx`](../../apps/auth/LoginUI.jsx:16) | `handleSubmit` envía el PIN |
| Validación | [`apps/pos/services/securityService.js`](../../apps/pos/services/securityService.js:54) | `POST /security/employees/validate-pin` |
| Entrega del perfil | [`apps/auth/LoginUI.jsx`](../../apps/auth/LoginUI.jsx:25) | `onLogin({ id, role, name, profile_id, permissions })` |
| Aplicación de permisos | [`apps/ExperimentCenterUI.jsx`](../../apps/ExperimentCenterUI.jsx:266) | `handleLogin` fija rol, perfil y permisos |

---

## 3. SUBDOMINIOS DEL SISTEMA

El ERP expone **tres** subdominios públicos, cada uno con una función distinta:

| Subdominio | Función | Puerto interno | ¿Se comparte con colaboradores? |
|---|---|---|---|
| `erp.rdericotoluca.com` | **Interfaz del ERP** (lo que abre el colaborador) | `:3000` (Vite) | ✅ **Sí — es el enlace oficial** |
| `api.rdericotoluca.com` | **Backend** (lo consume el ERP, no se abre a mano) | `:5001` (FastAPI) | ❌ No — es interno |
| `reparto.rdericotoluca.com` | **Alias heredado** del ERP (transición) | `:3000` (Vite) | ⚠️ Solo enlaces ya compartidos |

> **Nota de transición:** `reparto.rdericotoluca.com` se conserva en
> [`vite.config.js`](../../vite.config.js:20) para **no romper enlaces ya compartidos**,
> pero el enlace que debe difundirse de ahora en adelante es `erp.rdericotoluca.com`.

### 3.1 Por qué el API tiene su propio subdominio

[`apps/shared/config.js`](../../apps/shared/config.js:31) deriva la URL del API desde el
`hostname` de la página. En la red local eso funciona (`http://<host>:5001/api/v1`), pero
**en internet el puerto 5001 no está expuesto**. El túnel de Cloudflare resuelve esto
enrutando `api.rdericotoluca.com` → `localhost:5001`, de modo que el ERP remoto encuentra
su backend sin cambiar una sola línea de código de negocio.

> **Regla:** el dominio público **no vive en el código de negocio**. Vive en el túnel de
> Cloudflare, en `allowedHosts` de [`vite.config.js`](../../vite.config.js:20) y en este
> documento. Si mañana cambia el dominio, se tocan esos tres lugares, no los módulos.

---

## 4. EL ENLACE DE ACCESO LIMPIO (`?logout=1`)

### 4.1 El problema que resuelve

La sesión del ERP **persiste 12 horas** para no obligar al colaborador a teclear su PIN
cada vez que cambia de pantalla (ver sección 5). Eso es cómodo en un dispositivo personal,
pero en un **equipo compartido** (la tablet del mostrador, la computadora de la oficina)
significa que el siguiente usuario podría encontrar la sesión del anterior abierta.

### 4.2 La solución

Existe un enlace especial que **fuerza el cierre de sesión al abrirse**:

```
https://erp.rdericotoluca.com/?logout=1
```

Al abrir ese enlace, el ERP:

1. **Detecta** el parámetro `?logout=1` — [`esAccesoLimpio()`](../../apps/ExperimentCenterUI.jsx:133)
2. **Borra** la sesión guardada en `localStorage` — [`aplicarAccesoLimpio()`](../../apps/ExperimentCenterUI.jsx:147)
3. **Limpia** el parámetro de la barra de direcciones (`history.replaceState`)
4. **Muestra** la pantalla de PIN, siempre limpia

### 4.3 Cuándo usar cada enlace

| Escenario | Enlace recomendado |
|---|---|
| Dispositivo **personal** (mi celular, mi tablet) | `https://erp.rdericotoluca.com` |
| Dispositivo **compartido** (mostrador, oficina) | `https://erp.rdericotoluca.com/?logout=1` |
| Enlace que se manda por WhatsApp a un colaborador | `https://erp.rdericotoluca.com/?logout=1` |

> **Recomendación operativa:** guarda el enlace con `?logout=1` como **marcador en los
> equipos compartidos**. Así, cada persona que lo abra empieza desde cero, sin heredar
> la sesión de nadie.

---

## 5. LA SESIÓN PERSISTIDA (12 HORAS)

### 5.1 Cómo funciona

| Aspecto | Detalle |
|---|---|
| **Dónde se guarda** | `localStorage`, clave `erp_session_v1` |
| **Qué guarda** | `{ user, lastActivity }` — **NUNCA el PIN** |
| **Duración** | 12 horas de **inactividad** ([`SESSION_INACTIVITY_MS`](../../apps/ExperimentCenterUI.jsx:65)) |
| **Renovación** | Cada interacción del usuario refresca `lastActivity` |
| **Expiración** | Al superar 12 h sin actividad, la sesión se descarta y se pide PIN |

### 5.2 Qué pasa al cerrar sesión

Cuando el colaborador oprime **"Salir del sistema"**,
[`handleLogout()`](../../apps/ExperimentCenterUI.jsx:315) ejecuta:

```javascript
const handleLogout = () => {
    borrarSesionPersistida();   // ← borra erp_session_v1 de localStorage
    setIsAuthenticated(false);  // ← vuelve a la pantalla de PIN
};
```

**Resultado:** la próxima vez que se abra el enlace, **el ERP pedirá la clave**.

### 5.3 La única excepción

Si el colaborador **NO** oprime "Salir del sistema" y simplemente cierra la pestaña o
apaga el equipo, la sesión **sigue viva hasta 12 horas**. Al reabrir el enlace dentro de
ese plazo, el ERP **no pedirá PIN**.

> **Por eso existe `?logout=1`:** es la red de seguridad para los equipos compartidos,
> donde no se puede confiar en que todos recuerden oprimir "Salir del sistema".

---

## 6. POLÍTICA DE RESPONSABILIDAD PERSONAL

### 6.1 La regla

> **Cada colaborador es responsable de todo lo que se haga dentro del ERP mientras esté
> logueado con su clave.**

El sistema registra las acciones **a nombre del usuario autenticado**. Si alguien presta
su clave, o deja su sesión abierta, **las acciones que ocurran después quedan a su
nombre**. No hay forma de "despersonalizar" una operación hecha con una sesión activa.

### 6.2 Por qué esta política funciona

Esta regla convierte al colaborador en el **primer guardián de su propia clave**:

- **Es celoso de su PIN** — no lo comparte, porque sabe que responde por él.
- **Es cuidadoso al salir** — oprime "Salir del sistema" al terminar, porque sabe que
  una sesión abierta es un riesgo a su nombre.
- **Reporta de inmediato** si sospecha que alguien vio su clave.

Es un modelo de **seguridad distribuida**: en lugar de depender de que un administrador
vigile a todos, **cada quien vigila su propia puerta**.

### 6.3 El único punto débil: el olvido

La política depende de la **disciplina humana**. El eslabón más frágil es el olvido:
el colaborador termina su turno, se distrae y **no oprime "Salir del sistema"**.

**Mitigaciones implementadas:**

| Mitigación | Cómo ayuda |
|---|---|
| **Timeout de 12 h** | La sesión olvidada muere sola al día siguiente |
| **Enlace `?logout=1`** | Fuerza el cierre aunque el anterior no lo haya hecho |
| **PIN único por persona** | Impide que dos personas compartan credencial |
| **Baja del empleado** | Al desactivar a un empleado, su PIN deja de funcionar |

---

## 7. PROTOCOLO DE EQUIPOS COMPARTIDOS

### 7.1 Reglas para el colaborador

1. **Al terminar tu turno, oprime "Salir del sistema".** No basta con cerrar la pestaña.
2. **Nunca prestes tu clave.** Si alguien necesita entrar, que use la suya.
3. **Si usas un equipo compartido, abre el enlace con `?logout=1`.**
4. **Si sospechas que alguien vio tu clave, repórtalo de inmediato** para que se cambie.

### 7.2 Reglas para el administrador

| Acción | Cuándo | Herramienta |
|---|---|---|
| **PIN único por empleado** | Al dar de alta a un colaborador | Módulo de Seguridad |
| **Desactivar al empleado** | Al terminar la relación laboral | `deactivateEmployee` ([`securityService.js`](../../apps/pos/services/securityService.js:42)) |
| **Revisar perfiles** | Al cambiar de puesto a alguien | Módulo de Gestión de Perfiles |
| **Difundir el enlace correcto** | Al incorporar a alguien | Este documento (sección 4.3) |

> **Regla de oro administrativa:** un empleado que ya no trabaja **debe ser desactivado
> el mismo día**. Un PIN activo de alguien que ya no está es una puerta abierta.

---

## 8. REGLAS DE ORO (NO ROMPER)

1. **Un solo enlace público:** `https://erp.rdericotoluca.com`. No crear enlaces por puesto.
2. **El acceso se controla por PIN y perfil, nunca por URL.** La URL no otorga permisos.
3. **El PIN NUNCA se guarda en el dispositivo.** Solo se guarda `{ user, lastActivity }`.
4. **"Salir del sistema" siempre borra la sesión.** Si esa función falla, es una regresión crítica.
5. **`?logout=1` siempre debe forzar el cierre de sesión.** Es la red de seguridad de los equipos compartidos.
6. **El dominio público no vive en el código de negocio.** Solo en el túnel, `allowedHosts` y este documento.
7. **Un empleado dado de baja debe perder su acceso el mismo día.**
8. **La responsabilidad de lo hecho con una clave es de quien la posee.** No hay excepciones.

---

## 9. VERIFICACIÓN DEL ACCESO REMOTO

### 9.1 Comandos de diagnóstico

Desde cualquier equipo con acceso a internet:

```cmd
nslookup erp.rdericotoluca.com
curl -s -I -m 20 https://erp.rdericotoluca.com/ | findstr /I "HTTP"
curl -s -I -m 20 https://erp.rdericotoluca.com/?logout=1 | findstr /I "HTTP"
curl -s -I -m 20 https://api.rdericotoluca.com/api/v1/settings | findstr /I "HTTP"
```

### 9.2 Resultados esperados (verificados el 23/Septiembre/2026)

| Comprobación | Resultado esperado | Resultado obtenido |
|---|---|---|
| DNS de `erp.rdericotoluca.com` | Resuelve a Cloudflare | `2606:4700:3036::ac43:a687` ✅ |
| HTTP de `erp.rdericotoluca.com/` | `200 OK` | `HTTP/1.1 200 OK` ✅ |
| HTTP de `erp.rdericotoluca.com/?logout=1` | `200 OK` | `HTTP/1.1 200 OK` ✅ |
| HTTP de `api.rdericotoluca.com/api/v1/settings` | `307` (redirección del API) | `HTTP/1.1 307` ✅ |
| HTTP de `reparto.rdericotoluca.com/` | `200 OK` (alias heredado) | `HTTP/1.1 200 OK` ✅ |

### 9.3 Si el enlace no responde

| Síntoma | Causa probable | Solución |
|---|---|---|
| `nslookup` no resuelve | Falta la ruta en el túnel | Agregar el host en **"Rutas de aplicación publicadas"** del túnel Cloudflare |
| Resuelve pero da error 502/1033 | El contenedor `pos` está caído | `docker compose up -d pos` |
| Carga la página pero el API falla | Falta la ruta de `api` en el túnel | Verificar `api.rdericotoluca.com` → `localhost:5001` |
| "Blocked request. This host is not allowed" | Falta el host en `allowedHosts` | Agregarlo en [`vite.config.js`](../../vite.config.js:20) y reiniciar Vite |

> **Nota sobre la UI de Cloudflare:** en este túnel, la tabla con `reparto` y `api` vive
> en la pestaña **"Rutas de aplicación publicadas"** (*Published application routes*),
> **NO** en "Rutas de nombre de host" (*Public Hostname*). Ver
> [`CONTEXTO_SISTEMA_IA.md`](CONTEXTO_SISTEMA_IA.md:1329) §16.15 para el detalle del incidente.

---

## 10. PREGUNTAS FRECUENTES

**¿Puedo quedarme solo con el enlace `erp.rdericotoluca.com` y serviría para todos?**
Sí. Es exactamente el diseño: un enlace, y cada quien entra con su clave y ve lo que su
perfil le permite.

**Si presto mi tablet y mi compañero se loguea con su clave, ¿ve lo mío?**
No. Al entrar con su clave, el ERP carga **su** perfil y **sus** permisos. Tu sesión se
reemplaza por la suya.

**Si yo oprimo "Salir del sistema" y le paso la tablet, ¿le pedirá clave?**
Sí. "Salir del sistema" borra la sesión guardada; el siguiente acceso pide PIN.

**¿Y si no oprimo "Salir del sistema"?**
Entonces la sesión sigue viva hasta 12 horas y el siguiente usuario **no** vería la
pantalla de PIN. Por eso, en equipos compartidos, usa `?logout=1`.

**¿El ERP guarda mi PIN en la tablet?**
No. Solo guarda tu nombre, rol, perfil y permisos, más la marca de tiempo de tu última
actividad. El PIN nunca se almacena.

**¿Qué pasa si me roban el celular con la sesión abierta?**
La sesión muere sola a las 12 horas de inactividad. Para cortarla de inmediato, pide al
administrador que **desactive tu empleado**; al reactivarlo, se te asigna un PIN nuevo.

---

## 11. HISTORIAL DE CAMBIOS

| Versión | Fecha | Cambio |
|---|---|---|
| **v19.5** | 23/Sept/2026 | Creación del documento. Subdominio oficial `erp.rdericotoluca.com`, enlace de acceso limpio `?logout=1`, política de responsabilidad personal y protocolo de equipos compartidos. |

---

**Fin del documento.**
