/**
 * heladeriaCategoryNav.js — Guardián del contrato de navegación por CATEGORÍA
 * del POS de Heladería.
 *
 * PROBLEMA QUE RESUELVE
 * ---------------------
 * El POS de Heladería mostraba tres secciones FIJAS (Recipientes / Sabores /
 * Extras) derivadas de `component_type`. Eso contradecía el principio del
 * sistema ("NADA HARDCODEADO. TODO CONFIGURABLE DESDE BASE DE DATOS"): el
 * usuario quiere crear categorías en el Maestro de Productos y arrastrar
 * productos, igual que en el POS de Panadería.
 *
 * MODELO
 * ------
 * - `component_type` describe el COMPORTAMIENTO del producto al armar un helado
 *   (receta: recipiente, sabor, extra...). NO es la navegación.
 * - La CATEGORÍA es la unidad de navegación, exactamente como en Panadería.
 *
 * Este módulo es PURO: no toca red, ni React, ni estado global. Recibe la
 * respuesta del menú y devuelve el índice de navegación listo para renderizar.
 */

/** Categoría sintética para items proyectados sin categoría asignada. */
export const SIN_CATEGORIA_ID = -1;
export const SIN_CATEGORIA_NAME = 'Sin categoría';

/**
 * Aplana `menu.groups[].items[]` en una sola lista.
 * Nunca lanza: tolera `menu` nulo o corrupto.
 */
export function flattenMenuItems(menu) {
    if (!menu || !Array.isArray(menu.groups)) return [];
    return menu.groups.flatMap((group) =>
        group && Array.isArray(group.items) ? group.items : []
    );
}

/**
 * Construye el índice de navegación por categoría.
 *
 * Prefiere `menu.categories` (índice canónico que envía el backend, ya ordenado
 * por `position`). Si el backend no lo envía (respuesta antigua o caché offline
 * previa), lo DERIVA de los items para no romper la pantalla.
 *
 * @returns {Array<{id:number,name:string,icon:string|null,position:number,itemCount:number}>}
 */
export function buildCategoryNav(menu) {
    const items = flattenMenuItems(menu);

    if (Array.isArray(menu?.categories) && menu.categories.length > 0) {
        return menu.categories.map((cat) => ({
            id: cat.id,
            name: cat.name,
            icon: cat.icon || null,
            position: cat.position || 0,
            itemCount: cat.item_count || 0,
        }));
    }

    return deriveCategoryNavFromItems(items);
}

/**
 * Fallback: deriva las categorías a partir de los items.
 * Los items sin categoría se agrupan bajo "Sin categoría".
 */
function deriveCategoryNavFromItems(items) {
    const byId = new Map();

    items.forEach((item) => {
        const id = item.category_id ?? SIN_CATEGORIA_ID;
        const name = item.category_name || SIN_CATEGORIA_NAME;
        const entry = byId.get(id) || { id, name, icon: null, position: 0, itemCount: 0 };
        entry.itemCount += 1;
        byId.set(id, entry);
    });

    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Devuelve los items de una categoría concreta.
 * `categoryId` nulo devuelve la lista completa (vista "Todos").
 */
export function getItemsByCategory(menu, categoryId) {
    const items = flattenMenuItems(menu);
    if (categoryId === null || categoryId === undefined) return items;
    return items.filter((item) => (item.category_id ?? SIN_CATEGORIA_ID) === categoryId);
}

/**
 * Resuelve la categoría activa inicial: la primera del índice, o `null`.
 */
export function resolveInitialCategoryId(nav) {
    if (!Array.isArray(nav) || nav.length === 0) return null;
    return nav[0].id;
}
