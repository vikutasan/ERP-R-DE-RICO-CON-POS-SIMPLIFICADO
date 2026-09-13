"""add_sucursal_id_warehouse_events

v7 (Fase 1.4): agrega la columna nullable `sucursal_id` a `warehouse_events`.

Motivo: el Outbox Pattern necesita saber de que sucursal proviene cada evento
para poder aislar el descuento de stock por sucursal. La columna es NULLABLE
para no romper los eventos historicos ya existentes ni el POS actual, que
todavia no envia este dato.

Revision ID: d3e4f5a6b7c8
Revises: c2a3b4c5d6e7
Create Date: 2026-09-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd3e4f5a6b7c8'
down_revision: Union[str, None] = 'c2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Agrega sucursal_id (nullable) e indice a warehouse_events."""
    op.add_column(
        'warehouse_events',
        sa.Column('sucursal_id', sa.Integer(), nullable=True),
    )
    op.create_index(
        op.f('ix_warehouse_events_sucursal_id'),
        'warehouse_events',
        ['sucursal_id'],
        unique=False,
    )


def downgrade() -> None:
    """Revierte el indice y la columna sucursal_id."""
    op.drop_index(
        op.f('ix_warehouse_events_sucursal_id'),
        table_name='warehouse_events',
    )
    op.drop_column('warehouse_events', 'sucursal_id')
