# Especificación Maestra: Auditoría Senior y Roadmap de Visión IA (V2)

Este documento es la **guía suprema** dictada por el Arquitecto Full-Stack Senior. Cualquier intervención en el código debe alinearse estrictamente con estos principios y restricciones.

---

## 🏛️ Pilar 1: Principios de Programación Senior

### 1. Responsabilidad Única (SRP)
- **Regla**: Un archivo o función debe hacer una sola cosa.
- **Detección**: Si un archivo gestiona ventas, envía correos y calcula inventarios, está mal.
- **Acción**: Separar la lógica de negocio (cálculos, validaciones) de la lógica de persistencia y de la UI.

### 2. DRY (Don't Repeat Yourself)
- **Regla**: Si escribes la misma lógica en dos lugares, crea una función reutilizable.
- **Acción**: Identificar patrones repetidos (ej. cálculos de IVA, formateo de moneda) y extraerlos a un `Helper` o utilidad global.

### 3. KISS (Keep It Simple, Stupid)
- **Regla**: Si una función se ve muy compleja, divídela en funciones más pequeñas.
- **Detección**: Más de 3 niveles de indentación o funciones de más de 20-25 líneas.
- **Acción**: Usar **Early Returns** para reducir el anidamiento de `if...else`.

### 4. Código Autodocumentado
- **Regla**: El código debe explicarse por sí mismo.
- **Nomenclatura**: Usar nombres descriptivos en español o inglés técnico claro. Evitar variables genéricas como `data` o `temp`; usar `nuevoPedido`, `stockRestante`, `precioConImpuesto`.

---

## 👁️ Pilar 2: Visión Artificial e Inteligencia de Datos

El sistema es una plataforma de **Visión Artificial** para retail alimentario.
- **Hardware Agóstico**: La arquitectura debe ser "Plug & Play". El código debe permitir inyectar flujos de video de cualquier cámara (USB, IP, móviles) mediante una capa de abstracción.
- **Identidad en el POS**: Los componentes de visión en la interfaz del POS (visor del escáner, botones de activación) deben funcionar exactamente como hasta ahora y **no deben moverse de su lugar**.
- **Centro de IA**: Se debe conservar el módulo de IA del ERP (hoy "Centro de IA", antes "Entrenamiento IA"). La refactorización debe asegurar que el flujo de datos para el entrenamiento de reconocimiento de panes sea más robusto y nunca se interrumpa.
- **Sincronización de Básculas**: Capacidad de integrar datos de peso en tiempo real con el reconocimiento visual del producto.

---

## 🎨 Pilar 3: La Regla de Oro (UX/UI Intocable)

**RESTRICCIÓN ABSOLUTA**: No modificar ni el aspecto ni la funcionalidad de la interfaz de usuario.

- **Estética de Madera**: El fondo `wood_bg.jpg` y el diseño cálido/premium son la identidad de "R de Rico". No se tocan.
- **Layout Táctil e Iconos**: La disposición de los botones de pago, el Pizarrón Central y la barra de categorías filtrada es definitiva. **Los iconos no solo deben verse igual, sino que deben funcionar exactamente igual** en su respuesta y comportamiento.
- **Separación de Módulos**: "TODOS" se mantiene en inventario pero desaparece del POS mediante filtros quirúrgicos de código.

---

## 📋 Lista de Cotejo de Auditoría
- [ ] **¿Es legible?**: Entendible en 30 segundos por un técnico.
- [ ] **¿Es escalable?**: Permite cambiar sucursales o configuraciones sin "pegamento".
- [ ] **Manejo de Errores**: ¿Qué pasa si falla el internet? "Guarda en local y reintenta", no colapses.
- [ ] **Linter y SOLID**: Funciones de max 20 líneas y comunicación clara entre módulos.

---

> [!IMPORTANT]
> **"Si funciona visualmente, no lo cambies. Si es código sucio por dentro, límpialo sin que se note por fuera".**
