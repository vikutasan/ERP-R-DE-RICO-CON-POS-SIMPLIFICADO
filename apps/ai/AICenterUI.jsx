import React, { useState } from 'react';
import { AIEngineStatusPanel } from './components/AIEngineStatusPanel';
import { AIVoicePanel } from './components/AIVoicePanel';
import { AIOcrPanel } from './components/AIOcrPanel';
import { VisionTrainingUI } from '../pos/VisionTrainingUI';

/**
 * AICenterUI — v27.4 (CENTRO DE IA)
 *
 * Modulo paraguas que agrupa las capacidades de IA del ERP en pestanas:
 *   1. Estado del Motor  - semaforo del AI Gateway (GET /ai/status).
 *   2. Vision            - captura, anotacion y fine-tuning (VisionTrainingUI).
 *   3. Voz               - parametros de captura + prueba de microfono.
 *   4. Lector (OCR)      - lectura de capturas de WhatsApp (AIOcrPanel).
 *
 * DECISION DE DISENO (v26): NO se crea un modulo "IA por Voz" separado. Un solo
 * modulo paraguas respeta DRY (un solo diagnostico del motor) y SRP (el modulo
 * observa el motor; las capacidades son pestanas, no modulos).
 *
 * DECISION DE DISENO (v27.4): la capacidad OCR (4ª) se expone AQUI como pestana
 * «Lector» para que sea descubrible desde el Centro de IA. Antes solo vivia
 * dentro de la pestana Grandeza «Programacion de Pedidos», lo que la hacia
 * invisible para quien buscaba la capacidad en el Centro de IA. El panel de
 * aqui es de DIAGNOSTICO (no guarda nada); la captura/confirmacion sigue en
 * Grandeza, respetando el contrato human-in-the-loop.
 *
 * PRESERVACION DE ESTADO (corrige el defecto D3 de la autocrítica): los paneles
 * se montan SIEMPRE y se ocultan con CSS. Asi, si el operador esta anotando una
 * imagen y cambia a "Estado", al volver su anotacion sigue ahi. Cada panel recibe
 * `activo` para hacer lazy-fetch (no consulta hasta ser visible).
 *
 * RESPONSABILIDAD UNICA: barra de pestanas + montaje. Cero logica de negocio.
 */

const TABS = {
    ESTADO: 'estado',
    VISION: 'vision',
    VOZ: 'voz',
    LECTOR: 'lector',
};

const ETIQUETA_TAB = {
    [TABS.ESTADO]: '📊 Estado del Motor',
    [TABS.VISION]: '👁️ Visión',
    [TABS.VOZ]: '🎙️ Voz',
    [TABS.LECTOR]: '📷 Lector',
};

// Orden de presentacion de las pestanas.
const ORDEN_TABS = [TABS.ESTADO, TABS.VISION, TABS.VOZ, TABS.LECTOR];

export const AICenterUI = ({ products = [], categories = [], onCategoriesChange }) => {
    const [tabActiva, setTabActiva] = useState(TABS.ESTADO);

    return (
        <div className="flex h-full flex-col bg-slate-900">
            {/* Barra de pestanas */}
            <nav className="flex shrink-0 gap-1 border-b border-white/10 bg-slate-950 px-4 pt-3">
                {ORDEN_TABS.map((tab) => {
                    const activa = tabActiva === tab;
                    return (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setTabActiva(tab)}
                            className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition ${
                                activa
                                    ? 'bg-slate-900 text-white'
                                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                            }`}
                        >
                            {ETIQUETA_TAB[tab]}
                        </button>
                    );
                })}
            </nav>

            {/* Paneles: montados siempre, ocultos con CSS para preservar estado. */}
            <div className="min-h-0 flex-1">
                <div className={tabActiva === TABS.ESTADO ? 'block h-full' : 'hidden'}>
                    <AIEngineStatusPanel activo={tabActiva === TABS.ESTADO} />
                </div>
                <div className={tabActiva === TABS.VISION ? 'block h-full' : 'hidden'}>
                    <VisionTrainingUI
                        activo={tabActiva === TABS.VISION}
                        products={products}
                        categories={categories}
                        onCategoriesChange={onCategoriesChange}
                    />
                </div>
                <div className={tabActiva === TABS.VOZ ? 'block h-full' : 'hidden'}>
                    <AIVoicePanel activo={tabActiva === TABS.VOZ} />
                </div>
                <div className={tabActiva === TABS.LECTOR ? 'block h-full' : 'hidden'}>
                    <AIOcrPanel activo={tabActiva === TABS.LECTOR} />
                </div>
            </div>
        </div>
    );
};

export default AICenterUI;
