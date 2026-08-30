import React, { useState } from 'react';

/**
 * Modal de Ficha del Empleado
 * 
 * Muestra y permite editar todos los datos personales y laborales.
 * Incluye campos para foto, INE, selfie, datos médicos, etc.
 */

const TIPOS_SANGRE = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const EmployeeProfileModal = ({ employee, positions, onClose, onSave }) => {
    const hr = employee.hr || {};

    const [form, setForm] = useState({
        fecha_nacimiento: hr.fecha_nacimiento || '',
        direccion: hr.direccion || '',
        telefono: hr.telefono || '',
        telefono_emergencia: hr.telefono_emergencia || '',
        contacto_emergencia: hr.contacto_emergencia || '',
        tipo_sangre: hr.tipo_sangre || '',
        curp: hr.curp || '',
        nss: hr.nss || '',
        position_id: hr.position_id || '',
        fecha_ingreso: hr.fecha_ingreso || '',
        fecha_fin_contrato: hr.fecha_fin_contrato || '',
        semestre_actual: hr.semestre_actual || 1,
        estado: hr.estado || 'activo',
    });

    const [saving, setSaving] = useState(false);

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async () => {
        setSaving(true);
        try {
            await onSave(form);
        } finally {
            setSaving(false);
        }
    };

    const Field = ({ label, field, type = 'text', options = null, placeholder = '', span = 1 }) => (
        <div className={span === 2 ? 'col-span-2' : ''}>
            <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-1">{label}</label>
            {options ? (
                <select
                    value={form[field] || ''}
                    onChange={(e) => handleChange(field, e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-teal-500/50 transition-all"
                >
                    <option value="" className="bg-[#111]">Seleccionar...</option>
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-[#111]">{opt.label}</option>
                    ))}
                </select>
            ) : (
                <input
                    type={type}
                    value={form[field] || ''}
                    onChange={(e) => handleChange(field, e.target.value)}
                    placeholder={placeholder}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-700 outline-none focus:border-teal-500/50 transition-all"
                />
            )}
        </div>
    );

    return (
        <div className="h-full flex flex-col bg-[#0a0a0a] text-white overflow-hidden">
            {/* Header */}
            <div className="shrink-0 border-b border-white/5 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onClose}
                        className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all text-sm"
                    >
                        ←
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-teal-600/20 flex items-center justify-center text-xl font-bold text-teal-400">
                            {(employee.name || '?')[0]}
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white">{employee.name}</h2>
                            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                                #{String(employee.employee_number || employee.id).padStart(3, '0')} • {employee.position_name || employee.role}
                            </p>
                        </div>
                    </div>
                </div>
                <button
                    onClick={handleSubmit}
                    disabled={saving}
                    className={`px-6 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all ${
                        saving ? 'bg-gray-800 text-gray-600' : 'bg-teal-600 text-white hover:bg-teal-500 active:scale-95'
                    }`}
                >
                    {saving ? 'Guardando...' : '💾 Guardar Cambios'}
                </button>
            </div>

            {/* Contenido */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-4xl mx-auto space-y-6">

                    {/* Datos Personales */}
                    <section className="bg-white/[0.02] border border-white/5 rounded-2xl p-5">
                        <h3 className="text-sm font-black uppercase tracking-wider text-teal-400 mb-4 flex items-center gap-2">
                            <span className="w-6 h-6 rounded bg-teal-600/20 flex items-center justify-center text-xs">👤</span>
                            Datos Personales
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Fecha de Nacimiento" field="fecha_nacimiento" type="date" />
                            <Field label="Tipo de Sangre" field="tipo_sangre" options={TIPOS_SANGRE.map(t => ({ value: t, label: t }))} />
                            <Field label="CURP" field="curp" placeholder="18 caracteres" span={2} />
                            <Field label="Dirección" field="direccion" placeholder="Calle, número, colonia, CP" span={2} />
                            <Field label="Teléfono Personal" field="telefono" placeholder="722 123 4567" />
                            <Field label="NSS (Seguro Social)" field="nss" placeholder="11 dígitos" />
                        </div>
                    </section>

                    {/* Contacto de Emergencia */}
                    <section className="bg-white/[0.02] border border-white/5 rounded-2xl p-5">
                        <h3 className="text-sm font-black uppercase tracking-wider text-red-400 mb-4 flex items-center gap-2">
                            <span className="w-6 h-6 rounded bg-red-600/20 flex items-center justify-center text-xs">🆘</span>
                            Contacto de Emergencia
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Nombre del Contacto" field="contacto_emergencia" placeholder="Nombre y parentesco" />
                            <Field label="Teléfono de Emergencia" field="telefono_emergencia" placeholder="722 123 4567" />
                        </div>
                    </section>

                    {/* Datos Laborales */}
                    <section className="bg-white/[0.02] border border-white/5 rounded-2xl p-5">
                        <h3 className="text-sm font-black uppercase tracking-wider text-blue-400 mb-4 flex items-center gap-2">
                            <span className="w-6 h-6 rounded bg-blue-600/20 flex items-center justify-center text-xs">💼</span>
                            Datos Laborales
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <Field
                                label="Puesto"
                                field="position_id"
                                options={positions.map(p => ({ value: p.id, label: p.nombre }))}
                            />
                            <Field label="Semestre de Contrato" field="semestre_actual" type="number" />
                            <Field label="Fecha de Ingreso" field="fecha_ingreso" type="date" />
                            <Field label="Fin de Contrato" field="fecha_fin_contrato" type="date" />
                            <Field
                                label="Estado"
                                field="estado"
                                options={[
                                    { value: 'activo', label: '✅ Activo' },
                                    { value: 'baja', label: '❌ Baja' },
                                    { value: 'proceso_baja', label: '⚠️ En proceso de baja' },
                                    { value: 'aspirante', label: '📋 Aspirante' },
                                ]}
                            />
                        </div>
                    </section>

                    {/* Documentos */}
                    <section className="bg-white/[0.02] border border-white/5 rounded-2xl p-5">
                        <h3 className="text-sm font-black uppercase tracking-wider text-amber-400 mb-4 flex items-center gap-2">
                            <span className="w-6 h-6 rounded bg-amber-600/20 flex items-center justify-center text-xs">📄</span>
                            Documentos
                        </h3>
                        <div className="grid grid-cols-3 gap-4">
                            {['Foto', 'INE Frontal', 'INE Trasera', 'Selfie'].map((doc) => {
                                const urlKey = doc === 'Foto' ? 'foto_url' :
                                               doc === 'INE Frontal' ? 'ine_frontal_url' :
                                               doc === 'INE Trasera' ? 'ine_trasera_url' : 'selfie_url';
                                const url = hr[urlKey];
                                return (
                                    <div key={doc} className="border border-dashed border-white/10 rounded-xl p-4 text-center hover:border-teal-500/30 transition-all cursor-pointer">
                                        {url ? (
                                            <img src={url} alt={doc} className="w-full h-24 object-cover rounded-lg mb-2" />
                                        ) : (
                                            <div className="w-full h-24 bg-white/5 rounded-lg flex items-center justify-center mb-2">
                                                <span className="text-2xl text-gray-700">📷</span>
                                            </div>
                                        )}
                                        <p className="text-[9px] font-bold text-gray-500 uppercase">{doc}</p>
                                        <p className="text-[8px] text-gray-700 mt-1">{url ? 'Clic para cambiar' : 'Clic para subir'}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                </div>
            </div>
        </div>
    );
};
