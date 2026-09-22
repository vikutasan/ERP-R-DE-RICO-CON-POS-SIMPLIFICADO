"""
FASE 1 — Migración FLOAT → DECIMAL (Numeric 12,2)
Basado en análisis del POS SISYTEC que usa DECIMAL para todos los montos monetarios.

Ejecutar dentro del contenedor:
  docker exec rderico-api-dev python migrate_float_to_decimal.py

Este script altera las columnas Float a Numeric(12,2) en PostgreSQL.
Es seguro ejecutar múltiples veces (idempotente).
"""
import asyncio
from sqlalchemy import text
from core.database import engine

ALTERATIONS = [
    # --- tickets ---
    "ALTER TABLE tickets ALTER COLUMN total TYPE NUMERIC(12,2) USING total::NUMERIC(12,2);",
    # --- ticket_items ---
    "ALTER TABLE ticket_items ALTER COLUMN unit_price TYPE NUMERIC(12,2) USING unit_price::NUMERIC(12,2);",
    "ALTER TABLE ticket_items ALTER COLUMN subtotal TYPE NUMERIC(12,2) USING subtotal::NUMERIC(12,2);",
    # --- products ---
    "ALTER TABLE products ALTER COLUMN price TYPE NUMERIC(12,2) USING price::NUMERIC(12,2);",
    "ALTER TABLE products ALTER COLUMN cost TYPE NUMERIC(12,2) USING cost::NUMERIC(12,2);",
    # --- cash_sessions ---
    "ALTER TABLE cash_sessions ALTER COLUMN opening_float TYPE NUMERIC(12,2) USING opening_float::NUMERIC(12,2);",
    "ALTER TABLE cash_sessions ALTER COLUMN physical_cash TYPE NUMERIC(12,2) USING physical_cash::NUMERIC(12,2);",
    "ALTER TABLE cash_sessions ALTER COLUMN physical_credit TYPE NUMERIC(12,2) USING physical_credit::NUMERIC(12,2);",
    "ALTER TABLE cash_sessions ALTER COLUMN physical_debit TYPE NUMERIC(12,2) USING physical_debit::NUMERIC(12,2);",
    # --- cash_movements ---
    "ALTER TABLE cash_movements ALTER COLUMN amount TYPE NUMERIC(12,2) USING amount::NUMERIC(12,2);",
]

# ============================================================================
# V23 (FASE 1): columnas monetarias que quedaron en Float en 3 modulos.
# Se separan por modulo para poder migrar de a uno (Pedidos -> Grandeza -> RRHH)
# y aislar cualquier fallo. NO incluye columnas que NO son dinero:
#   - GPS: grandeza_driver_locations.lat/lng/accuracy, orders.delivery_lat/lng
#   - Distancia: orders.delivery_distance_km
#   - Porcentajes: hr_coverage_movements.porcentaje_aplicado, hr_psg.porcentaje_fondo
#   - Puntaje: hr_kpis.score_total
# ============================================================================
ALTERATIONS_PEDIDOS = [
    # --- orders ---
    "ALTER TABLE orders ALTER COLUMN delivery_fee TYPE NUMERIC(12,2) USING delivery_fee::NUMERIC(12,2);",
]

ALTERATIONS_GRANDEZA = [
    # --- grandeza_product_config ---
    "ALTER TABLE grandeza_product_config ALTER COLUMN b2b_price TYPE NUMERIC(12,2) USING b2b_price::NUMERIC(12,2);",
    # --- grandeza_journeys ---
    "ALTER TABLE grandeza_journeys ALTER COLUMN cash_fund TYPE NUMERIC(12,2) USING cash_fund::NUMERIC(12,2);",
    "ALTER TABLE grandeza_journeys ALTER COLUMN cash_expected TYPE NUMERIC(12,2) USING cash_expected::NUMERIC(12,2);",
    "ALTER TABLE grandeza_journeys ALTER COLUMN cash_received TYPE NUMERIC(12,2) USING cash_received::NUMERIC(12,2);",
    # --- grandeza_visits ---
    "ALTER TABLE grandeza_visits ALTER COLUMN total_exchange_amount TYPE NUMERIC(12,2) USING total_exchange_amount::NUMERIC(12,2);",
    "ALTER TABLE grandeza_visits ALTER COLUMN total_fresh_amount TYPE NUMERIC(12,2) USING total_fresh_amount::NUMERIC(12,2);",
    "ALTER TABLE grandeza_visits ALTER COLUMN sale_amount TYPE NUMERIC(12,2) USING sale_amount::NUMERIC(12,2);",
    "ALTER TABLE grandeza_visits ALTER COLUMN payment_received TYPE NUMERIC(12,2) USING payment_received::NUMERIC(12,2);",
    "ALTER TABLE grandeza_visits ALTER COLUMN change_given TYPE NUMERIC(12,2) USING change_given::NUMERIC(12,2);",
    # --- grandeza_visit_items ---
    "ALTER TABLE grandeza_visit_items ALTER COLUMN unit_price TYPE NUMERIC(12,2) USING unit_price::NUMERIC(12,2);",
    # --- grandeza_expenses ---
    "ALTER TABLE grandeza_expenses ALTER COLUMN amount TYPE NUMERIC(12,2) USING amount::NUMERIC(12,2);",
    # --- grandeza_orders ---
    "ALTER TABLE grandeza_orders ALTER COLUMN total_amount TYPE NUMERIC(12,2) USING total_amount::NUMERIC(12,2);",
    "ALTER TABLE grandeza_orders ALTER COLUMN advance_payment TYPE NUMERIC(12,2) USING advance_payment::NUMERIC(12,2);",
]

ALTERATIONS_RRHH = [
    # --- hr_uniform_deposits ---
    "ALTER TABLE hr_uniform_deposits ALTER COLUMN fianza_total TYPE NUMERIC(12,2) USING fianza_total::NUMERIC(12,2);",
    "ALTER TABLE hr_uniform_deposits ALTER COLUMN pagado TYPE NUMERIC(12,2) USING pagado::NUMERIC(12,2);",
    # --- hr_uniform_movements ---
    "ALTER TABLE hr_uniform_movements ALTER COLUMN monto TYPE NUMERIC(12,2) USING monto::NUMERIC(12,2);",
    # --- hr_coverage_fund ---
    "ALTER TABLE hr_coverage_fund ALTER COLUMN monto_requerido TYPE NUMERIC(12,2) USING monto_requerido::NUMERIC(12,2);",
    "ALTER TABLE hr_coverage_fund ALTER COLUMN monto_cubierto TYPE NUMERIC(12,2) USING monto_cubierto::NUMERIC(12,2);",
    # --- hr_coverage_movements ---
    "ALTER TABLE hr_coverage_movements ALTER COLUMN monto TYPE NUMERIC(12,2) USING monto::NUMERIC(12,2);",
    # --- hr_salary_tables ---
    "ALTER TABLE hr_salary_tables ALTER COLUMN sueldo_hora TYPE NUMERIC(12,2) USING sueldo_hora::NUMERIC(12,2);",
    "ALTER TABLE hr_salary_tables ALTER COLUMN bono_hora TYPE NUMERIC(12,2) USING bono_hora::NUMERIC(12,2);",
    "ALTER TABLE hr_salary_tables ALTER COLUMN sueldo_dia TYPE NUMERIC(12,2) USING sueldo_dia::NUMERIC(12,2);",
    "ALTER TABLE hr_salary_tables ALTER COLUMN bono_dia TYPE NUMERIC(12,2) USING bono_dia::NUMERIC(12,2);",
    # --- hr_payroll ---
    "ALTER TABLE hr_payroll ALTER COLUMN salario_base TYPE NUMERIC(12,2) USING salario_base::NUMERIC(12,2);",
    "ALTER TABLE hr_payroll ALTER COLUMN bono_puntualidad TYPE NUMERIC(12,2) USING bono_puntualidad::NUMERIC(12,2);",
    "ALTER TABLE hr_payroll ALTER COLUMN total_percepciones TYPE NUMERIC(12,2) USING total_percepciones::NUMERIC(12,2);",
    "ALTER TABLE hr_payroll ALTER COLUMN deduccion_uniforme TYPE NUMERIC(12,2) USING deduccion_uniforme::NUMERIC(12,2);",
    "ALTER TABLE hr_payroll ALTER COLUMN deduccion_fondo TYPE NUMERIC(12,2) USING deduccion_fondo::NUMERIC(12,2);",
    "ALTER TABLE hr_payroll ALTER COLUMN deduccion_otros TYPE NUMERIC(12,2) USING deduccion_otros::NUMERIC(12,2);",
    "ALTER TABLE hr_payroll ALTER COLUMN total_deducciones TYPE NUMERIC(12,2) USING total_deducciones::NUMERIC(12,2);",
    "ALTER TABLE hr_payroll ALTER COLUMN neto TYPE NUMERIC(12,2) USING neto::NUMERIC(12,2);",
    # --- hr_payroll_deductions ---
    "ALTER TABLE hr_payroll_deductions ALTER COLUMN monto TYPE NUMERIC(12,2) USING monto::NUMERIC(12,2);",
    # --- hr_psg ---
    "ALTER TABLE hr_psg ALTER COLUMN monto_fondo TYPE NUMERIC(12,2) USING monto_fondo::NUMERIC(12,2);",
    # --- hr_vacations ---
    "ALTER TABLE hr_vacations ALTER COLUMN prima_vacacional TYPE NUMERIC(12,2) USING prima_vacacional::NUMERIC(12,2);",
    # --- hr_severance ---
    "ALTER TABLE hr_severance ALTER COLUMN neto TYPE NUMERIC(12,2) USING neto::NUMERIC(12,2);",
]

MODULOS = {
    "pedidos": ALTERATIONS_PEDIDOS,
    "grandeza": ALTERATIONS_GRANDEZA,
    "rrhh": ALTERATIONS_RRHH,
}

def _parse_sql(sql: str) -> tuple:
    """Extrae (tabla, columna) de un ALTER TABLE ... ALTER COLUMN ... TYPE ..."""
    table = sql.split("ALTER TABLE ")[1].split(" ALTER")[0]
    table_col = sql.split("ALTER COLUMN ")[1].split(" TYPE")[0]
    return table, table_col


async def _run(alterations: list, titulo: str):
    print("=" * 60)
    print(f"FASE 1: Migración FLOAT → DECIMAL (Numeric 12,2) — {titulo}")
    print("=" * 60)

    async with engine.begin() as conn:
        for sql in alterations:
            table, table_col = _parse_sql(sql)
            try:
                await conn.execute(text(sql))
                print(f"  ✅ {table}.{table_col} → NUMERIC(12,2)")
            except Exception as e:
                print(f"  ⚠️  {table}.{table_col} — {e}")

    # Verificación dinámica: se construye el IN a partir de las alteraciones
    pares = [_parse_sql(sql) for sql in alterations]
    in_clause = ", ".join(f"('{t}', '{c}')" for t, c in pares)

    async with engine.begin() as conn:
        result = await conn.execute(text(f"""
            SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
            FROM information_schema.columns
            WHERE (table_name, column_name) IN ({in_clause})
            ORDER BY table_name, column_name
        """))
        rows = result.fetchall()

        print("\n" + "=" * 60)
        print("VERIFICACIÓN:")
        print("=" * 60)
        all_ok = True
        for row in rows:
            status = "✅" if row[2] == "numeric" else "❌ AÚN ES " + row[2]
            if row[2] != "numeric":
                all_ok = False
            print(f"  {status} {row[0]}.{row[1]} = {row[2]}({row[3]},{row[4]})")

        if len(rows) != len(pares):
            print(f"  ⚠️  Se esperaban {len(pares)} columnas, se encontraron {len(rows)}")

        if all_ok and len(rows) == len(pares):
            print(f"\n🎉 {titulo}: MIGRACIÓN COMPLETADA — Todos los campos monetarios son DECIMAL")
        else:
            print(f"\n⚠️  {titulo}: ALGUNOS CAMPOS NO SE MIGRARON — Revisa los errores arriba")


async def migrate(modulo: str = None):
    """
    Sin argumento: migra las 10 columnas originales (POS/Catálogo/Caja).
    Con argumento: migra solo el módulo indicado (pedidos | grandeza | rrhh).
    """
    if modulo:
        if modulo not in MODULOS:
            print(f"❌ Módulo desconocido: '{modulo}'. Opciones: {', '.join(MODULOS)}")
            return
        await _run(MODULOS[modulo], modulo.upper())
    else:
        await _run(ALTERATIONS, "BASE (POS/Catálogo/Caja)")

if __name__ == "__main__":
    # Uso:
    #   python migrate_float_to_decimal.py            -> 10 columnas base
    #   python migrate_float_to_decimal.py pedidos    -> solo Pedidos
    #   python migrate_float_to_decimal.py grandeza   -> solo Grandeza
    #   python migrate_float_to_decimal.py rrhh       -> solo RRHH
    import sys
    arg = sys.argv[1].lower() if len(sys.argv) > 1 else None
    asyncio.run(migrate(arg))
