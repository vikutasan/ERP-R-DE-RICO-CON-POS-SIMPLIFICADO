# REVISIÓN CRÍTICA (TERCERA PASADA) — PLAN DE CORRECCIÓN DE ESTADO POS v18 (v3)

**Documento revisado:** [`PLAN_CORRECCION_ESTADO_POS_V18.md`](ESPECIFICACIONES DEL PROYECTO/PLAN_CORRECCION_ESTADO_POS_V18.md) (v3)
**Revisiones previas:**
- 1ª: [`REVISION_CRITICA_PLAN_ESTADO_POS_V18.md`](ESPECIFICACIONES DEL PROYECTO/REVISION_CRITICA_PLAN_ESTADO_POS_V18.md) → D1-D3, O1-O4
- 2ª: [`REVISION_CRITICA_V2_PLAN_ESTADO_POS_V18.md`](ESPECIFICACIONES DEL PROYECTO/REVISION_CRITICA_V2_PLAN_ESTADO_POS_V18.md) → N1-N5, O5-O8

**Fecha:** 20/Septiembre/2026
**Método:** auditoría de las **correcciones mismas** (una corrección puede introducir un defecto nuevo). Verificación contra el código real.
**Veredicto:** ⛔ **RECHAZADO — la v3 introdujo 2 defectos ALTA auto-infligidos.** Las correcciones N3 y O8, tal como se especificaron, **no son implementables** con el extractor existente.

---

## 0. Resumen ejecutivo

La v3 corrigió correctamente N1, N2, N4, N5, O5, O6 y O7. **Pero las correcciones N3 y O8 se especificaron de forma que NO funcionan**, porque ignoran un detalle del extractor `extractForceLogoutBlock` que la propia v3 documentó en N1 pero no aplicó a sus tests.

**El defecto raíz (P1):** el extractor hace `source.slice(start, end)` donde `end = indexOf('onForceLogout();')`. Por tanto **el bloque extraído EXCLUYE `onForceLogout();`**. La v3, en su test #7, afirma `block.trimEnd().endsWith('onForceLogout();')` → **siempre falso** → el test **falla incluso con el código correcto**.

**Ironía:** la v3 documentó este comportamiento en la nota N1 ("el bloque extraído ahora incluye el PASO 2 completo") pero **no se dio cuenta de que el bloque termina ANTES de `onForceLogout();`**, lo que invalida su propio test #7.

**Además:** la v3 dice "7 tests" pero lista **8**; y afirma que los 7 fallan en FASE 0, cuando **2 de ellos pasan** (P5).

---

## 1. Defectos auto-infligidos por la v3

### P1 — ALTA — El test #7 ("última sentencia") es IMPOSIBLE con el extractor actual

**Evidencia.** El extractor ([`architecture.test.js:179-185`](apps/pos/state/architecture.test.js:179)):

```js
function extractForceLogoutBlock(source) {
    const start = source.indexOf('const handleForceLogout = () => {');
    if (start === -1) return null;
    const end = source.indexOf('onForceLogout();', start);   // ← índice de 'onForceLogout();'
    if (end === -1) return null;
    return source.slice(start, end);   // ← slice EXCLUYE el carácter en 'end'
}
```

`String.prototype.slice(start, end)` devuelve los caracteres desde `start` **hasta `end` exclusive**. Por tanto el bloque **termina justo ANTES** de `onForceLogout();`.

La v3 §3.3 test #7 dice:

```js
block.trimEnd().endsWith('onForceLogout();')   // ← SIEMPRE FALSE
```

**El bloque nunca contiene `onForceLogout();`.** El test **falla siempre**, incluso con el código correcto. Es un test **imposible de satisfacer**.

**Impacto:** bloquea la FASE 1 (el test nunca se pone verde). El implementador, al verlo fallar, "arreglaría" el test relajándolo — exactamente lo que el encabezado de [`architecture.test.js:32`](apps/pos/state/architecture.test.js:32) prohíbe.

> **Corrección obligatoria P1:** el test #7 debe usar el **source completo**, no el bloque. Opciones:
> - **(a)** Extraer un bloque alternativo con ancla de fin `};` (el cierre de la función) en vez de `onForceLogout();`. Requiere un **nuevo extractor** `extractForceLogoutFull`.
> - **(b)** Verificar sobre `posSource` completo: `posSource.indexOf('onForceLogout();', start) < posSource.indexOf('};', start)` — frágil.
> - **(c)** **Recomendada:** añadir un extractor `extractForceLogoutFull(source)` que ancle el fin en `\n    };` (el cierre de la arrow function a 4 espacios de indentación) y usarlo para el test #7. Los tests 1-6 siguen usando el extractor actual.

---

### P2 — ALTA — El test #1 (sanidad, O8) NO falla en FASE 0 → rompe el TDD

**Evidencia.** La v3 §3.3 test #1: `block.length > 100`.

El bloque **actual** (código sin migrar, [`RetailVisionPOS.jsx:450-476`](apps/pos/RetailVisionPOS.jsx:450)) tiene **27 líneas** (~900 caracteres). Por tanto `length > 100` es **VERDADERO** → el test **PASA en FASE 0**.

La v3 §4 FASE 0 afirma: "los tests nuevos DEBEN FALLAR (rojo)". **Falso para el test #1.**

**Impacto:** la narrativa TDD de la v3 es incorrecta. Un test de sanidad **no debe** fallar en FASE 0 (su misión es verificar que el bloque no está vacío, no que el código esté migrado). Pero entonces **no puede contarse entre los "tests en rojo"**.

> **Corrección obligatoria P2:** reclasificar el test #1 como **test de sanidad permanente** (no forma parte del ciclo rojo→verde). La FASE 0 debe decir: "los tests **funcionales** (2-8) fallan en rojo; el test de sanidad (1) pasa en ambas fases".

---

### P3 — MEDIA — El test #6 (D2) usa una regex con backtick ambigua

**Evidencia.** La v3 §3.3 test #6 y §6 criterio #4 escriben:

```js
expect(block).not.toMatch(/removeItem\(\s*`pos_cart_/)
```

El código real es `localStorage.removeItem(\`pos_session_${selectedTerminal}\`)` — un **template literal**. La regex `/removeItem\(\s*`pos_cart_/` contiene un **backtick literal**, que en un regex literal de JS es válido pero **visualmente indistinguible** de un template literal en el markdown. Un implementador podría escribir `removeItem(\`pos_cart_\`` (template) y romper la sintaxis.

**Impacto:** riesgo de error de sintaxis al implementar. Además, la regex no escapa el backtick, lo que es frágil.

> **Corrección obligatoria P3:** usar una comprobación **basada en string**, no en regex:
> ```js
> expect(block).not.toContain('removeItem(`pos_cart_');
> expect(block).toContain('removeItem(`pos_session_');
> ```
> Es inequívoca y no depende de escapar backticks.

---

### P4 — MEDIA — El test #8 (contraste) no especifica que lee DOS archivos

**Evidencia.** La v3 §3.3 test #8: "las 4 rutas de limpieza contienen `buildResetPatch()`".

Pero las rutas viven en **dos archivos**:
- `handleExitWithoutSaving`, `doTerminalExit`, `handleForceLogout` → [`RetailVisionPOS.jsx`](apps/pos/RetailVisionPOS.jsx)
- Rama `success` de `handleTicketAction` → [`useTicketActions.js`](apps/pos/hooks/useTicketActions.js)

El test necesita leer **ambos**. La v3 no lo dice.

> **Corrección obligatoria P4:** especificar que el test #8 lee `posSource` **y** `ticketActionsSource`, y verifica `buildResetPatch()` en cada uno.

---

### P5 — MEDIA — La afirmación "los 7 tests DEBEN FALLAR en FASE 0" es falsa para 2 tests

**Evidencia.** En FASE 0 (código sin migrar):

| Test | ¿Falla en FASE 0? | Razón |
|------|-------------------|-------|
| 1 (sanidad `length > 100`) | ❌ **PASA** | El bloque actual tiene ~900 chars |
| 2 (presencia `buildResetPatch()`) | ✅ Falla | No existe aún |
| 3 (ORDEN) | ✅ Falla | No existe `const patch =` |
| 4 (refs) | ✅ Falla | No sincroniza refs |
| 5 (claves asimetría) | ✅ Falla | No limpia `showExitModal` |
| 6 (D2 no `removeItem(\`pos_cart_`) | ❌ **PASA** | El código actual NO tiene ningún `removeItem` |
| 7 (última sentencia) | ⚠️ Falla **por la razón equivocada** (P1) | El bloque nunca contiene `onForceLogout();` |
| 8 (contraste) | ✅ Falla | `handleForceLogout` no tiene el patch |

**2 tests pasan en FASE 0** (el 1 y el 6). La afirmación de la v3 es **incorrecta**.

> **Corrección obligatoria P5:** la FASE 0 debe declarar **exactamente** qué tests fallan (2, 3, 4, 5, 8) y qué tests pasan (1, 6). El test 7 se corrige según P1.

---

### P6 — BAJA — Inconsistencia aritmética: "7 tests" vs 8 listados

**Evidencia.** La v3 §3.3 dice "**7 tests**" pero lista **8 ítems** (1-8). §4 FASE 1 dice "540 = 533 + 7". §9 dice "Añadir 7 tests (…8 nombres…)". §10 dice "7 tests".

**El número real es 8** → el conteo esperado es **533 + 8 = 541 tests**.

> **Corrección obligatoria P6:** unificar en **8 tests** → **541 tests**.

---

### P7 — BAJA — El test #3 (ORDEN) tiene un falso positivo latente

**Evidencia.** El test #3 compara `indexOf('JSON.stringify({')` vs `indexOf('const patch = buildResetPatch()')` **dentro del bloque**.

**Riesgo:** si un refactor futuro **mueve** el beacon a una función auxiliar pero deja `JSON.stringify({` en un comentario antes del patch, el test pasaría en falso. Es el mismo riesgo "best-effort" ya documentado (R4), pero la v3 no lo menciona para este test específico.

> **Corrección (opcional, no bloqueante):** documentar en §3.3 que el test #3 es best-effort y ancla en la **construcción** del payload, no en un comentario.

---

## 2. Verificación de las correcciones de la v3 (¿se aplicaron bien?)

| Corrección | ¿Aplicada? | ¿Correcta? | Nota |
|-----------|-----------|-----------|------|
| N1 (extractor + sanidad) | ✅ Sí | ⚠️ **Parcial** | Documenta el extractor, pero **no se dio cuenta** de que el bloque excluye `onForceLogout();` → causa P1 |
| N2 (ancla D2 + comentario) | ✅ Sí | ⚠️ Parcial | El comentario ya no tiene `pos_cart_` ✅, pero la regex es ambigua (P3) |
| N3 (invariante + test última sentencia) | ✅ Sí | ❌ **No implementable** | El test #7 es imposible con el extractor (P1) |
| N4 (TDD rojo→verde) | ✅ Sí | ⚠️ Parcial | El principio es correcto, pero 2 tests no fallan en FASE 0 (P5) |
| N5 (crear tag) | ✅ Sí | ✅ Sí | Correcto |
| O5 (orden de setters) | ✅ Sí | ✅ Sí | Correcto |
| O6 (try/catch) | ✅ Sí | ✅ Sí | Correcto |
| O7 (conteo exacto) | ✅ Sí | ❌ **Incorrecto** | Dice 7 → 540; el real es 8 → 541 (P6) |
| O8 (test no vacuo) | ✅ Sí | ⚠️ Parcial | El test existe, pero no falla en FASE 0 (P2) |

**3 correcciones mal aplicadas (N3, O7, O8-parcial).**

---

## 3. Correcciones obligatorias antes de ejecutar (v4)

| # | Corrección | Sección |
|---|-----------|---------|
| **P1** | Añadir extractor `extractForceLogoutFull` (ancla de fin `\n    };`) para el test #7 | §3.3 |
| **P2** | Reclasificar el test #1 como sanidad permanente (no parte del rojo→verde) | §3.3, §4 FASE 0 |
| **P3** | Cambiar el test #6 a comprobación por string (`not.toContain('removeItem(\`pos_cart_')`) | §3.3, §6 |
| **P4** | Especificar que el test #8 lee `RetailVisionPOS.jsx` **y** `useTicketActions.js` | §3.3 |
| **P5** | Declarar exactamente qué tests fallan en FASE 0 (2,3,4,5,8) y cuáles pasan (1,6) | §4 FASE 0 |
| **P6** | Unificar en **8 tests** → **541 tests** | §3.3, §4, §6, §9, §10 |
| **P7** | (Opcional) Documentar el test #3 como best-effort | §3.3 |

---

## 4. Veredicto

**⛔ RECHAZADO — cuarta iteración requerida.**

La v3 es **mejor que la v2** (corrigió N1, N2, N4, N5, O5, O6), pero **introdujo 2 defectos ALTA auto-infligidos**:

1. **P1:** el test #7 es **imposible de satisfacer** con el extractor actual → bloquea la FASE 1.
2. **P2/P5:** la narrativa TDD es **incorrecta** (2 tests no fallan en FASE 0).

**Lección de proceso:** cada corrección debe **verificarse contra el código real** antes de incorporarse. La v3 documentó el comportamiento del extractor (N1) pero **no lo aplicó a sus propios tests** — un fallo de consistencia interna.

**Ninguno de los defectos es de diseño.** El diseño (migrar `handleForceLogout`, orden beacon→limpieza→logout) sigue siendo correcto. Los defectos son de **especificación de tests**.

**Recomendación:** aplicar P1-P6 y emitir la **v4**. El costo es bajo (reescribir §3.3 y §4). Solo entonces ejecutar.

---

## 5. Lo que la v3 hace BIEN (preservar en la v4)

- ✅ El **código de producción** de §3.1 es **correcto** (orden, refs, D2, D3, O5, O6). No requiere cambios.
- ✅ La **nota N1** sobre el extractor es correcta en su análisis (aunque incompleta).
- ✅ La **FASE 0 con tag (N5)** es correcta.
- ✅ El **conteo exacto** es la dirección correcta (solo el número está mal).
- ✅ La **tabla de trazabilidad** (§10) es una buena práctica.
- ✅ El **diseño conceptual** (beacon → limpieza → logout) permanece intacto.

---

## 6. Recomendación de proceso (meta)

Este es el **tercer ciclo** de revisión. El patrón sugiere que el plan está **convergiendo** (los defectos son cada vez más pequeños y localizados: de "diseño" en v1 → "especificación" en v2 → "detalle de test" en v3). 

**Sugerencia:** en la v4, **verificar cada test contra el código real ANTES de escribirlo en el plan** — concretamente, ejecutar mentalmente el extractor sobre el código "Después" y comprobar que cada aserción es satisfacible. Esto cerraría el ciclo.
