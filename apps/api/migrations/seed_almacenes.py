"""
Seed de almacenes para R de Rico (Panadería + Heladería).
Script idempotente — puede ejecutarse múltiples veces sin duplicar datos.

Uso: python -m apps.api.migrations.seed_almacenes
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

async def main():
    # Importar todos los modelos para resolver relaciones SQLAlchemy
    from core.database import AsyncSessionLocal
    from modules.pos import models as pos_models
    from modules.cash import models as cash_models
    from modules.security import models as sec_models
    from modules.catalog import models as cat_models
    from modules.heladeria import models as hel_models
    from modules.warehouse.models import Almacen, Insumo
    from sqlalchemy.future import select

    ALMACENES = [
        # Panadería
        {"nombre": "Bodega Insumos", "zona_termica": "SECO", "proposito": "ALMACENAMIENTO",
         "pautas_acomodo": ["PEPS: producto más antiguo al frente", "No mezclar lotes", "Mantener limpio y seco"]},
        {"nombre": "Exhibidor Pan Dulce", "zona_termica": "SECO", "proposito": "EXHIBICION_VENTA",
         "pautas_acomodo": ["PEPS: producto más antiguo al frente", "Reponer cada 2 horas", "Retirar pan con más de 2 días"]},
        {"nombre": "Exhibidor Pan Salado", "zona_termica": "SECO", "proposito": "EXHIBICION_VENTA",
         "pautas_acomodo": ["PEPS: producto más antiguo al frente", "Separar bolillo de telera", "Reponer según demanda"]},
        {"nombre": "Refrigerador Materias Primas", "zona_termica": "REFRIGERADO", "proposito": "ALMACENAMIENTO",
         "pautas_acomodo": ["Mantener 2-4°C", "Lácteos arriba, carnes abajo", "Verificar fechas diariamente"]},
        # Heladería
        {"nombre": "Cámara de Helados", "zona_termica": "CONGELADO", "proposito": "ALMACENAMIENTO",
         "pautas_acomodo": ["Mantener -18°C", "No abrir innecesariamente", "Rotar sabores según producción"]},
        {"nombre": "Exhibidor Helados", "zona_termica": "CONGELADO", "proposito": "EXHIBICION_VENTA",
         "pautas_acomodo": ["Mantener -14°C a -16°C", "Sabores populares al frente", "Limpiar bordes cada turno"]},
        {"nombre": "Almacén Insumos Heladería", "zona_termica": "SECO", "proposito": "ALMACENAMIENTO",
         "pautas_acomodo": ["Conos y vasos separados", "PEPS en toppings", "Inventario semanal"]},
    ]

    INSUMOS = [
        {"nombre": "Harina de Trigo T55", "unidad_base": "KG", "unidad_compra": "COSTAL", "factor_conversion": 50.0, "categoria_insumo": "MATERIA_PRIMA"},
        {"nombre": "Azúcar Estándar", "unidad_base": "KG", "unidad_compra": "COSTAL", "factor_conversion": 50.0, "categoria_insumo": "MATERIA_PRIMA"},
        {"nombre": "Manteca Vegetal", "unidad_base": "KG", "unidad_compra": "CAJA", "factor_conversion": 20.0, "categoria_insumo": "MATERIA_PRIMA"},
        {"nombre": "Huevo", "unidad_base": "PZA", "unidad_compra": "CAJA", "factor_conversion": 360.0, "categoria_insumo": "MATERIA_PRIMA"},
        {"nombre": "Leche Entera", "unidad_base": "LT", "unidad_compra": "CAJA", "factor_conversion": 12.0, "categoria_insumo": "MATERIA_PRIMA"},
        {"nombre": "Mantequilla", "unidad_base": "KG", "unidad_compra": "CAJA", "factor_conversion": 10.0, "categoria_insumo": "MATERIA_PRIMA"},
        {"nombre": "Levadura Fresca", "unidad_base": "KG", "unidad_compra": "CAJA", "factor_conversion": 5.0, "categoria_insumo": "MATERIA_PRIMA"},
        {"nombre": "Bolsa Papel Kraft", "unidad_base": "PZA", "unidad_compra": "BULTO", "factor_conversion": 1000.0, "categoria_insumo": "EMPAQUE"},
        {"nombre": "Charola Cartón", "unidad_base": "PZA", "unidad_compra": "BULTO", "factor_conversion": 500.0, "categoria_insumo": "EMPAQUE"},
        {"nombre": "Vaso Helado Chico", "unidad_base": "PZA", "unidad_compra": "CAJA", "factor_conversion": 200.0, "categoria_insumo": "EMPAQUE"},
        {"nombre": "Vaso Helado Grande", "unidad_base": "PZA", "unidad_compra": "CAJA", "factor_conversion": 150.0, "categoria_insumo": "EMPAQUE"},
        {"nombre": "Cono Waffle", "unidad_base": "PZA", "unidad_compra": "CAJA", "factor_conversion": 100.0, "categoria_insumo": "EMPAQUE"},
    ]

    async with AsyncSessionLocal() as db:
        created_alm = 0
        created_ins = 0

        # Seed almacenes
        for alm_data in ALMACENES:
            result = await db.execute(select(Almacen).where(Almacen.nombre == alm_data["nombre"]))
            if not result.scalar_one_or_none():
                db.add(Almacen(**alm_data))
                created_alm += 1
                print(f"  ✅ Almacén: {alm_data['nombre']} ({alm_data['zona_termica']}/{alm_data['proposito']})")
            else:
                print(f"  ⏭️  Almacén ya existe: {alm_data['nombre']}")

        # Seed insumos
        for ins_data in INSUMOS:
            result = await db.execute(select(Insumo).where(Insumo.nombre == ins_data["nombre"]))
            if not result.scalar_one_or_none():
                db.add(Insumo(**ins_data))
                created_ins += 1
                print(f"  ✅ Insumo: {ins_data['nombre']} ({ins_data['unidad_base']})")
            else:
                print(f"  ⏭️  Insumo ya existe: {ins_data['nombre']}")

        await db.commit()
        print(f"\n🏪 Seed completado: {created_alm} almacenes + {created_ins} insumos creados")

if __name__ == "__main__":
    asyncio.run(main())
