"""add_auditoria

v7 (Fase 2, seccion 14 del Contexto Maestro): tabla `auditoria`.

Toda operacion critica (merma, traspaso, ajuste, eliminacion de almacen, edicion
de stock) debe dejar un registro en esta tabla EN LA MISMA TRANSACCION SQL que la
operacion. Si la operacion hace rollback, el registro de auditoria se revierte
con ella: no se audita lo que no ocurrio.

La tabla es de insercion unica (libro mayor inmutable): no se actualiza ni se
elimina. `usuario_id` es NULLABLE para no romper operaciones historicas ni
bloquear el arranque si el actor no se identifica; la validacion de permisos se
hace por separado con `verificar_permiso`.

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-09-13 03:51:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e4f5a6b7c8d9'
down_revision: Union[str, None] = 'd3e4f5a6b7c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Crea la tabla auditoria con sus indices de consulta."""
    op.create_table(
        'auditoria',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        # Empleado que ejecuto la accion (NULL si el actor no se identifico).
        sa.Column('usuario_id', sa.Integer(), sa.ForeignKey('employees.id'), nullable=True),
        # Verbo: CREAR, ACTUALIZAR, ELIMINAR, MERMA, TRASPASO, AJUSTE...
        sa.Column('accion', sa.String(length=50), nullable=False),
        # Entidad afectada: almacen, stock_almacen, movimiento_inventario...
        sa.Column('entidad', sa.String(length=80), nullable=False),
        # Identificador de la entidad afectada (texto por flexibilidad).
        sa.Column('entidad_id', sa.String(length=120), nullable=True),
        # Estado previo y posterior en JSON para trazabilidad completa.
        sa.Column('valores_antes', sa.JSON(), nullable=True),
        sa.Column('valores_despues', sa.JSON(), nullable=True),
        # Contexto libre (motivo de merma, notas, etc.).
        sa.Column('detalle', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_auditoria_usuario_id', 'auditoria', ['usuario_id'], unique=False)
    op.create_index('ix_auditoria_accion', 'auditoria', ['accion'], unique=False)
    op.create_index('ix_auditoria_entidad', 'auditoria', ['entidad'], unique=False)
    op.create_index('ix_auditoria_entidad_id', 'auditoria', ['entidad_id'], unique=False)
    op.create_index('ix_auditoria_created_at', 'auditoria', ['created_at'], unique=False)


def downgrade() -> None:
    """Revierte los indices y la tabla auditoria."""
    op.drop_index('ix_auditoria_created_at', table_name='auditoria')
    op.drop_index('ix_auditoria_entidad_id', table_name='auditoria')
    op.drop_index('ix_auditoria_entidad', table_name='auditoria')
    op.drop_index('ix_auditoria_accion', table_name='auditoria')
    op.drop_index('ix_auditoria_usuario_id', table_name='auditoria')
    op.drop_table('auditoria')
