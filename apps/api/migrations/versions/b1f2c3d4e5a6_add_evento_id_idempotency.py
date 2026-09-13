"""add_evento_id_idempotency

v7 (Fase 1.2, D1): idempotencia del procesador de eventos del Outbox Pattern.

Agrega `evento_id` a `movimientos_inventario` y un indice unico compuesto
`(evento_id, item_id)`. Esto garantiza que, si un evento se reprocesa (por un
reinicio del contenedor a mitad del procesamiento, o por un reintento tras un
fallo transitorio), NO se vuelva a descontar stock del mismo SKU dos veces:
el segundo INSERT viola la restriccion unica y el evento se revierte.

`evento_id` es nullable para no romper los movimientos historicos ni los que
se crean por otras vias (mermas, traspasos, entradas manuales), que no
provienen de un evento del POS.

Revision ID: b1f2c3d4e5a6
Revises: 07ac8e13c9ab
Create Date: 2026-09-13 03:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1f2c3d4e5a6'
down_revision: Union[str, None] = '07ac8e13c9ab'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Columna nullable: los movimientos historicos y los que no vienen del POS
    # (mermas, traspasos, entradas manuales) quedan con evento_id = NULL.
    op.add_column(
        'movimientos_inventario',
        sa.Column('evento_id', sa.Integer(), nullable=True),
    )

    # Indice unico compuesto: un evento solo puede descontar un SKU una vez.
    # En PostgreSQL los NULL no colisionan entre si, por lo que los movimientos
    # sin evento_id (NULL) no se ven afectados por esta restriccion.
    op.create_index(
        'uq_movimiento_evento_item',
        'movimientos_inventario',
        ['evento_id', 'item_id'],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index('uq_movimiento_evento_item', table_name='movimientos_inventario')
    op.drop_column('movimientos_inventario', 'evento_id')
