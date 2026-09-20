/**
 * v17 + v18 — Fuente ÚNICA de verdad de "cómo se limpia una sesión de captura" del POS.
 *
 * PROBLEMA QUE RESOLVIÓ (ver PLAN_CORRECCION_ESTADO_POS_V17.md §1.4):
 *   La limpieza de sesión estaba escrita A MANO en 5 rutas de salida distintas
 *   (handleExitWithoutSaving, rama success de handleTicketAction, doTerminalExit,
 *   handleForceLogout, window.requestPOSExit). Cada ruta limpiaba un subconjunto
 *   distinto de valores, y se desincronizaban entre sí.
 *
 *   Asimetría verificada (FASE 0, sessionReset.asymmetry.test.js):
 *     - handleExitWithoutSaving SÍ limpia savedTicketRef / showExitModal / pendingExitAction.
 *     - La rama success de handleTicketAction NO los limpia.
 *
 * SOLUCIÓN:
 *   Una función PURA que devuelve el conjunto EXACTO de valores de reset.
 *   Las rutas de salida aplican este patch en vez de limpiar a mano.
 *
 * ESTADO DEL CONTRATO (v18 — CERRADO):
 *   Las 4 rutas de limpieza aplican buildResetPatch():
 *     1. handleExitWithoutSaving          ✅ (v17)
 *     2. rama success de handleTicketAction ✅ (v17)
 *     3. doTerminalExit                   ✅ (v17)
 *     4. handleForceLogout                ✅ (v18 — antes limpiaba IMPLÍCITAMENTE
 *        vía desmontaje del componente; ahora lo hace por contrato explícito)
 *   La 5ª ruta (window.requestPOSExit) NO es de limpieza: es un interceptor.
 *   Guardián: architecture.test.js (describe "v18") verifica que las 4 rutas
 *   contienen `const patch = buildResetPatch();`.
 *
 * QUÉ **NO** INCLUYE (límite explícito — ver §3.2 del plan):
 *   - cart / cartState  → vive en useCart con su candado Anti-Wipe (v4.6).
 *   - categories, initialProducts, activeCategory → es CATÁLOGO, no sesión.
 *   - printTicketData   → es de IMPRESIÓN.
 *   - toastMessage      → es EFÍMERO (se auto-limpia con setTimeout).
 *   - viewMode, currentPage, showCorkboard, allOpenAccounts, isCashEnabled,
 *     showGestorCaja, cashSessionId, showProgramacion → es UI/contexto.
 *
 *   Justificación del límite: solo se resetea lo que, si sobrevive, CONTAMINA
 *   la siguiente cuenta. La UI puede sobrevivir sin daño; el catálogo DEBE
 *   sobrevivir (recargarlo sería un bug de rendimiento).
 *
 * IMPORTANTE — las REFS no se pueden resetear desde aquí:
 *   Esta función es pura y no tiene acceso a las refs (cartRef, accountNumRef,
 *   originalCapturerRef, ticketVersionRef, savedTicketRef). El LLAMADOR debe
 *   sincronizarlas explícitamente. La función define los VALORES; el llamador
 *   los APLICA. Ver §3.3 del plan.
 *
 * -----------------------------------------------------------------------------
 * v19 — DECISIÓN SOBRE LA ASIMETRÍA A3 (documentada, NO corregida)
 * -----------------------------------------------------------------------------
 *   ASIMETRÍA A3 (verificada empíricamente en v19):
 *     - handleExitWithoutSaving  → aplica 5 refs + 11 setters + 1 localStorage = 17
 *     - rama success             → aplica 1 ref  + 11 setters + 1 localStorage = 13
 *     - doTerminalExit           → aplica 5 refs + 11 setters + 2 localStorage = 18
 *     - handleForceLogout        → aplica 5 refs + 11 setters + 1 localStorage = 17
 *
 *   La rama success aplica SOLO 1 ref (savedTicketRef); las otras 3 aplican 5.
 *
 *   ¿ES UN BUG? NO. Verificado en RetailVisionPOS.jsx:95:
 *       React.useEffect(() => { cartRef.current = cart; }, [cart]);
 *   clearCart() hace setCartState(items: []) → `cart` cambia de referencia →
 *   el useEffect se dispara → cartRef.current = []. Por tanto cartRef se limpia
 *   AUTOMÁTICAMENTE tras clearCart(). La rama success no necesita escribirlo.
 *   Lo mismo aplica a accountNumRef/originalCapturerRef/ticketVersionRef, que
 *   tienen sus propios useEffect de re-sincronización (l.96-98).
 *
 *   DECISIÓN v19: la asimetría A3 se ACEPTA como inconsistencia de ESTILO.
 *   NO se corrige. Razón: corregirla exigiría tocar la rama success (la ruta
 *   de CADA VENTA) sin beneficio funcional, añadiendo riesgo a la ruta crítica.
 *   El único defecto REAL era la redundancia de doTerminalExit (1 línea), que
 *   SÍ se corrigió en v19 (ver RetailVisionPOS.jsx, doTerminalExit).
 *
 *   Guardián: architecture.test.js (describe "v19") verifica que doTerminalExit
 *   NO duplica removeItem(`pos_cart_`).
 */

/**
 * Devuelve el patch de reset de la sesión de captura.
 *
 * Es PURA: dos llamadas devuelven objetos con el mismo contenido pero
 * NO la misma referencia (cada llamada crea un objeto nuevo, y el array
 * `paymentsHistory` también es nuevo). Esto evita mutaciones compartidas.
 *
 * @returns {{
 *   currentAccountNum: string,
 *   originalCapturer: null,
 *   ticketVersion: null,
 *   orderType: string,
 *   orderData: null,
 *   paymentsHistory: Array,
 *   lastSaveStatus: string,
 *   lastSaveTime: null,
 *   showCheckout: boolean,
 *   savedTicket: null,
 *   showExitModal: boolean,
 *   pendingExitAction: null,
 * }}
 */
export function buildResetPatch() {
    return {
        // --- Identidad de la cuenta en captura ---
        currentAccountNum: '',
        originalCapturer: null,
        ticketVersion: null,

        // --- Tipo y datos del pedido ---
        orderType: 'VENTA_DIRECTA',
        orderData: null,

        // --- Cobro ---
        paymentsHistory: [],
        showCheckout: false,

        // --- Estado de guardado ---
        lastSaveStatus: 'idle',
        lastSaveTime: null,

        // --- Asimetría verificada en FASE 0 (la rama success no los limpiaba) ---
        savedTicket: null,
        showExitModal: false,
        pendingExitAction: null,
    };
}

/**
 * Lista canónica de las claves que `buildResetPatch()` resetea.
 * Se exporta para que los tests de límite puedan verificar que NO se
 * incluyen claves prohibidas (cart, categories, printTicketData, toastMessage).
 */
export const RESET_PATCH_KEYS = Object.freeze([
    'currentAccountNum',
    'originalCapturer',
    'ticketVersion',
    'orderType',
    'orderData',
    'paymentsHistory',
    'lastSaveStatus',
    'lastSaveTime',
    'showCheckout',
    'savedTicket',
    'showExitModal',
    'pendingExitAction',
]);

/**
 * Claves que NUNCA deben aparecer en el patch (test de límite §3.2).
 * Si alguna aparece, el patch estaría pisando estado que tiene su propio
 * ciclo de vida (carrito, catálogo, impresión, UI efímera).
 */
export const FORBIDDEN_PATCH_KEYS = Object.freeze([
    'cart',
    'cartState',
    'categories',
    'initialProducts',
    'activeCategory',
    'printTicketData',
    'toastMessage',
    'viewMode',
    'currentPage',
    'showCorkboard',
    'allOpenAccounts',
    'isCashEnabled',
    'showGestorCaja',
    'cashSessionId',
    'showProgramacion',
]);
