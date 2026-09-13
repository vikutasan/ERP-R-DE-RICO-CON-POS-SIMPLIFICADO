"""add_warehouse_propositos

v8: catalogo configurable de subcategorias de almacen.

Reemplaza al enum cerrado `PropositoAlmacen` (schemas.py) por una tabla
catalogo, replicando el patron ya probado de `catalog.Category`:

  - `es_sistema` protege los valores base de borrado accidental.
  - `orden` controla la posicion en la barra de subcategorias.
  - `SIN_CLASIFICAR` actua como cuarentena (equivalente a DESCONTINUADOS en
    productos): destino de traslado antes de eliminar una subcategoria que
    todavia tiene almacenes asignados.

MIGRACION ADITIVA: solo CREATE TABLE + INSERT. No hay ALTER sobre tablas
existentes, por lo que el riesgo de interferir con el POS en operacion es
minimo. `almacenes.proposito` NO se modifica: sigue siendo String NOT NULL y
conserva los 3 valores historicos (ALMACENAMIENTO, EXHIBICION_VENTA,
EQUIPAMIENTO), que se siembran aqui para que la validacion en servicio los
encuentre.

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-09-13 07:24:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f5a6b7c8d9e0'
down_revision: Union[str, None] = 'e4f5a6b7c8d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Valores base del catalogo. `es_cuarentena` marca el unico destino de traslado.
# `orden` 999 en la cuarentena la manda al final (patron DESCONTINUADOS).
PROPOSITOS_BASE = [
    {
        'id': 'wpr_exhibicion',
        'codigo': 'EXHIBICION_VENTA',
        'label': 'Almacenes / Exhibidores',
        'icon': '🏪',
        'orden': 1,
        'es_sistema': True,
        'es_cuarentena': False,
    },
    {
        'id': 'wpr_almacenamiento',
        'codigo': 'ALMACENAMIENTO',
        'label': 'Almacenes de Insumos',
        'icon': '📦',
        'orden': 2,
        'es_sistema': True,
        'es_cuarentena': False,
    },
    {
        'id': 'wpr_equipamiento',
        'codigo': 'EQUIPAMIENTO',
        'label': 'Almacenes de Equipamiento',
        'icon': '🔧',
        'orden': 3,
        'es_sistema': True,
        'es_cuarentena': False,
    },
    {
        'id': 'wpr_sin_clasificar',
        'codigo': 'SIN_CLASIFICAR',
        'label': 'Sin Clasificar',
        'icon': '🗂️',
        'orden': 999,
        'es_sistema': True,
        'es_cuarentena': True,
    },
]


def upgrade() -> None:
    """Crea el catalogo de subcategorias y siembra los valores base."""
    op.create_table(
        'warehouse_propositos',
        sa.Column('id', sa.String(), primary_key=True),
        # Valor que se persiste en almacenes.proposito (compatibilidad historica).
        sa.Column('codigo', sa.String(), nullable=False),
        # Etiqueta visible en la barra de subcategorias.
        sa.Column('label', sa.String(), nullable=False),
        # Emoji mostrado junto a la etiqueta.
        sa.Column('icon', sa.String(), nullable=False, server_default='📦'),
        # Posicion en la barra (menor = mas a la izquierda).
        sa.Column('orden', sa.Integer(), nullable=False, server_default='0'),
        # Proteccion de sistema: no se puede eliminar ni desactivar.
        sa.Column('es_sistema', sa.Boolean(), nullable=False, server_default=sa.false()),
        # Cuarentena: destino de traslado antes de eliminar una subcategoria.
        sa.Column('es_cuarentena', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index(
        'ix_warehouse_propositos_codigo',
        'warehouse_propositos',
        ['codigo'],
        unique=True,
    )

    # Sembrar los valores base. Se usa INSERT ... ON CONFLICT DO NOTHING para que
    # la migracion sea re-ejecutable sin romper si el seed de arranque ya corrio.
    tabla = sa.table(
        'warehouse_propositos',
        sa.column('id', sa.String()),
        sa.column('codigo', sa.String()),
        sa.column('label', sa.String()),
        sa.column('icon', sa.String()),
        sa.column('orden', sa.Integer()),
        sa.column('es_sistema', sa.Boolean()),
        sa.column('es_cuarentena', sa.Boolean()),
        sa.column('activo', sa.Boolean()),
    )
    op.bulk_insert(
        tabla,
        [{**p, 'activo': True} for p in PROPOSITOS_BASE],
    )

    # Verificacion de integridad: si existen almacenes con un proposito que no
    # esta en el catalogo (dato huerfano de una version anterior), se inserta
    # como subcategoria NO de sistema para no perder la referencia. No se falla
    # la migracion: se prefiere dejar el dato visible y corregible.
    conexion = op.get_bind()
    huerfanos = conexion.execute(
        sa.text(
            "SELECT DISTINCT a.proposito FROM almacenes a "
            "WHERE a.proposito IS NOT NULL "
            "AND NOT EXISTS ("
            "  SELECT 1 FROM warehouse_propositos w WHERE w.codigo = a.proposito"
            ")"
        )
    ).fetchall()

    for indice, fila in enumerate(huerfanos):
        codigo = fila[0]
        conexion.execute(
            sa.text(
                "INSERT INTO warehouse_propositos "
                "(id, codigo, label, icon, orden, es_sistema, es_cuarentena, activo) "
                "VALUES (:id, :codigo, :label, :icon, :orden, false, false, true)"
            ),
            {
                'id': f'wpr_huerfano_{indice}',
                'codigo': codigo,
                'label': codigo.replace('_', ' ').title(),
                'icon': '📦',
                'orden': 500 + indice,
            },
        )


def downgrade() -> None:
    """Revierte el catalogo. NO toca almacenes.proposito (sin perdida de datos)."""
    op.drop_index('ix_warehouse_propositos_codigo', table_name='warehouse_propositos')
    op.drop_table('warehouse_propositos')
