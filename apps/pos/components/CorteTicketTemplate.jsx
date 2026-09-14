import React, { forwardRef } from 'react';
import { formatLocal } from '../../shared/timezone';

export const CorteTicketTemplate = forwardRef(({ resumen, sesion, capturado }, ref) => {
    if (!resumen || !sesion) return <div ref={ref} className="hidden">No hay datos de corte</div>;

    const formatHora = (iso) => {
        if (!iso) return '---';
        return formatLocal(iso, undefined, {
            day: '2-digit', month: '2-digit', year: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const difCash = (parseFloat(capturado?.cash) || 0) - (resumen.efectivo_esperado || 0);
    const difCredit = (parseFloat(capturado?.credit) || 0) - (resumen.total_credito || 0);
    const difDebit = (parseFloat(capturado?.debit) || 0) - (resumen.total_debito || 0);

    const salidas = (sesion.movements || []).filter(m => m.movement_type === 'SALIDA');
    const entradas = (sesion.movements || []).filter(m => m.movement_type === 'ENTRADA');
    const ticketsPagados = (sesion.tickets || []);

    return (
        <div ref={ref} className="print-ticket-corte bg-white text-black w-[80mm] font-mono font-bold leading-[1.1]">
            <style>
                {`
                    @media print {
                        @page { margin: 0; size: 80mm auto; }
                        body { margin: 0; padding: 0; }
                        .print-ticket-corte { 
                            width: 80mm; 
                            background: white; 
                            color: black;
                            padding: 0mm 2mm; 
                            margin: 0;
                        }
                    }
                    .print-ticket-corte { padding: 1mm 2mm; }
                    .dotted-line { border-top: 1px dotted #000; margin: 2px 0; }
                    .row { display: flex; justify-content: space-between; align-items: flex-end; }
                `}
            </style>

            {/* Header Ultra Compacto con Logo */}
            <div className="flex justify-center items-center gap-2 mb-1">
                <img src="/assets/logo.png" alt="Logo" style={{ width: '32px', height: '32px', imageRendering: 'pixelated' }} className="grayscale object-contain flex-shrink-0" />
                <div className="flex flex-col items-center">
                    <div className="font-bold text-[12px] uppercase tracking-widest leading-none">R DE RICO</div>
                    <div className="font-bold text-[7px] uppercase tracking-widest mt-0.5">*** CORTE CAJA ***</div>
                </div>
            </div>

            {/* Metadatos del Turno */}
            <div className="text-[7.5px] mt-1 space-y-0.5">
                <div className="row"><span>CORTE ID:</span> <span className="font-bold">{sesion.id}</span></div>
                <div className="row"><span>TERMINAL:</span> <span className="font-bold">{sesion.terminal_id}</span></div>
                <div className="row"><span>CAJERO:</span> <span className="font-bold truncate max-w-[45mm] text-right">{sesion.employee_name}</span></div>
                <div className="row"><span>APERTURA:</span> <span>{formatHora(sesion.opened_at)}</span></div>
                <div className="row"><span>CIERRE:</span> <span>{formatHora(sesion.closed_at || new Date())}</span></div>
            </div>

            <div className="dotted-line my-1"></div>

            {/* Lista de Cuentas Cobradas */}
            <div className="text-[8px] font-bold text-center mb-0.5">CUENTAS COBRADAS ({resumen.num_transacciones})</div>
            {ticketsPagados.length > 0 ? (
                <div className="text-[7px] space-y-0.5 mb-1">
                    {ticketsPagados.map((t, idx) => (
                        <div key={idx} className="row">
                            <span>#{t.account_num}</span>
                            <span>${t.total.toFixed(2)}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center text-[7px] italic mb-1">Sin tickets registrados</div>
            )}

            <div className="dotted-line my-1"></div>

            {/* Flujo de Dinero: Entradas y Salidas */}
            <div className="text-[8px] font-bold text-center mb-0.5">FLUJO DE EFECTIVO</div>
            <div className="text-[7px] mb-1">
                <div className="row"><span>FONDO INICIAL:</span> <span>${(resumen.fondo_inicial || 0).toFixed(2)}</span></div>
                
                {entradas.length > 0 && (
                    <div className="mt-1">
                        <span className="font-bold">ENTRADAS (+):</span>
                        {entradas.map((m, i) => (
                            <div key={i} className="flex text-[6.5px] italic gap-2">
                                <span className="font-bold w-10">${m.amount.toFixed(2)}</span>
                                <span className="truncate flex-1">- {m.concept}</span>
                            </div>
                        ))}
                        <div className="row font-bold mt-0.5 pl-2">
                            <span>TOTAL ENTRADAS:</span>
                            <span>${(resumen.total_entradas || 0).toFixed(2)}</span>
                        </div>
                    </div>
                )}
                
                {salidas.length > 0 && (
                    <div className="mt-1.5">
                        <span className="font-bold">SALIDAS (-):</span>
                        {salidas.map((m, i) => (
                            <div key={i} className="flex text-[6.5px] italic gap-2">
                                <span className="font-bold w-10">${m.amount.toFixed(2)}</span>
                                <span className="truncate flex-1">- {m.concept}</span>
                            </div>
                        ))}
                        <div className="row font-bold mt-0.5 pl-2">
                            <span>TOTAL SALIDAS:</span>
                            <span>${(resumen.total_salidas || 0).toFixed(2)}</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="dotted-line my-1"></div>

            {/* Totales de Ventas */}
            <div className="text-[10px] font-bold row my-1">
                <span>VENTA TOTAL:</span>
                <span>${(resumen.total_ventas || 0).toFixed(2)}</span>
            </div>

            <div className="dotted-line my-1"></div>

            {/* Balance Operativo: Esperado vs Real */}
            <div className="text-[8px] font-bold text-center mb-1">BALANCE FÍSICO (ESP. VS REAL)</div>
            
            <div className="text-[7px] space-y-2">
                <div>
                    <div className="font-bold text-[8px] text-center border-b border-dotted border-black/30 mb-0.5">-- EFECTIVO --</div>
                    <div className="row">
                        <span>Sistema: ${(resumen.efectivo_esperado || 0).toFixed(2)}</span>
                        <span>Físico: ${(parseFloat(capturado?.cash) || 0).toFixed(2)}</span>
                    </div>
                    <div className="row font-bold">
                        <span>Diferencia:</span>
                        <span>{difCash >= 0 ? '+' : ''}{difCash.toFixed(2)}</span>
                    </div>
                </div>

                <div>
                    <div className="font-bold text-[8px] text-center border-b border-dotted border-black/30 mb-0.5">-- T. CRÉDITO --</div>
                    <div className="row">
                        <span>Sistema: ${(resumen.total_credito || 0).toFixed(2)}</span>
                        <span>Físico: ${(parseFloat(capturado?.credit) || 0).toFixed(2)}</span>
                    </div>
                    <div className="row font-bold">
                        <span>Diferencia:</span>
                        <span>{difCredit >= 0 ? '+' : ''}{difCredit.toFixed(2)}</span>
                    </div>
                </div>

                <div>
                    <div className="font-bold text-[8px] text-center border-b border-dotted border-black/30 mb-0.5">-- T. DÉBITO --</div>
                    <div className="row">
                        <span>Sistema: ${(resumen.total_debito || 0).toFixed(2)}</span>
                        <span>Físico: ${(parseFloat(capturado?.debit) || 0).toFixed(2)}</span>
                    </div>
                    <div className="row font-bold">
                        <span>Diferencia:</span>
                        <span>{difDebit >= 0 ? '+' : ''}{difDebit.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            <div className="dotted-line mt-2 mb-4"></div>

            {/* Firmas */}
            <div className="flex justify-between text-center text-[7px] px-1 pb-2">
                <div className="flex flex-col items-center w-[45%]">
                    <div className="border-t border-black w-full pt-0.5">FIRMA CAJERO</div>
                    <div className="truncate w-full mt-0.5">{sesion.employee_name}</div>
                </div>
                <div className="flex flex-col items-center w-[45%]">
                    <div className="border-t border-black w-full pt-0.5">FIRMA GERENTE</div>
                    <div className="w-full mt-0.5">Recibe</div>
                </div>
            </div>

            <div className="text-center text-[6px] italic mt-1 pb-1">
                --- Fin del Reporte de Corte ---
            </div>
        </div>
    );
});
