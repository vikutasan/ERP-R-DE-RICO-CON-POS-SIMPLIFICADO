"""add_eventos_sin_almacen

v7 (Fase 1.3, D2): tabla de diagnostico para SKUs que no se pudieron descontar.

Antes, si un evento del POS traia un SKU sin almacen de venta con stock
suficiente (o sin SKU), el procesador lo ignoraba EN SILENCIO. Eso hacia
imposible detectar productos mal configurados o faltantes de stock.

Esta tabla registra cada ocurrencia para que el operador pueda revisarla desde
`GET /api/v1/warehouse/diagnostico/sin-almacen` y corregir la configuracion.

Revision ID: c2a3b4c5d6e7
Revises: b1f2c3d4e5a6
Create Date: 2026-09-13 03:41:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c2a3b4c5d6e7'
down_revision: Union[str, None] = 'b1f2c3d4e5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'warehouse_eventos_sin_almacen',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        # Evento del POS que traia el SKU problematico.
        sa.Column('evento_id', sa.Integer(), nullable=True),
        sa.Column('ticket_id', sa.Integer(), nullable=True),
        # SKU que no se pudo resolver (puede ser NULL si el item no traia SKU).
        sa.Column('sku', sa.String(), nullable=True),
        sa.Column('cantidad', sa.Float(), nullable=True),
        # Motivo: SIN_SKU, SIN_STOCK_SUFICIENTE, SIN_ALMACEN_VENTA.
        sa.Column('motivo', sa.String(), nullable=False),
        sa.Column('detalle', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index(
        'ix_warehouse_eventos_sin_almacen_evento_id',
        'warehouse_eventos_sin_almacen',
        ['evento_id'],
        unique=False,
    )
    op.create_index(
        'ix_warehouse_eventos_sin_almacen_sku',
        'warehouse_eventos_sin_almacen',
        ['sku'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_warehouse_eventos_sin_almacen_sku', table_name='warehouse_eventos_sin_almacen')
    op.drop_index('ix_warehouse_eventos_sin_almacen_evento_id', table_name='warehouse_eventos_sin_almacen')
    op.drop_table('warehouse_eventos_sin_almacen')
