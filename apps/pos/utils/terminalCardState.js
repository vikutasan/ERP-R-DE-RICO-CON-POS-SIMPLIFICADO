/**
 * v12 (Fase 12.1): Clasificacion pura del estado visual de una terminal.
 *
 * El bug original: `TerminalSelector.jsx` calculaba `isMine` y `lockedByOther`
 * inline, y el render solo tenia DOS ramas (ocupada por otro / libre). Cuando
 * `isMine === true`, `lockedByOther` era `false`, asi que la terminal propia
 * caia en el `else` y se pintaba IDENTICA a una libre. El bug dependia del
 * observador: el ocupante veia su propia terminal como disponible.
 *
 * Esta funcion extrae la clasificacion a un lugar puro y testeable, con TRES
 * estados explicitos. No depende de React ni del DOM.
 *
 * @param {object|null|undefined} info - Entrada de `terminalStatuses[tid]`.
 * @param {number|string|null|undefined} currentUserId - id del usuario actual.
 * @returns {'free'|'mine'|'occupied'}
 *   - 'free'     -> no hay lock: terminal disponible.
 *   - 'mine'     -> hay lock y el ocupante es el usuario actual.
 *   - 'occupied' -> hay lock y el ocupante es otro usuario.
 */
export const resolveCardState = (info, currentUserId) => {
    if (!info || !info.occupier_id) return 'free';
    if (currentUserId != null && info.occupier_id === currentUserId) return 'mine';
    return 'occupied';
};
