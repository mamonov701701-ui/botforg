"""add_analytics_tables

Revision ID: 891de05b15e2
Revises: cef39c593384
Create Date: 2025-12-09 21:14:43.394771

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '891de05b15e2'
down_revision: Union[str, Sequence[str], None] = 'cef39c593384'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create events table
    op.create_table('events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(length=50), nullable=False),
        sa.Column('event_name', sa.String(length=100), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('bot_id', sa.Integer(), nullable=True),
        sa.Column('scenario_id', sa.Integer(), nullable=True),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.Column('session_id', sa.String(length=100), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['bot_id'], ['bots.id'], ),
        sa.ForeignKeyConstraint(['scenario_id'], ['scenarios.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_events_id'), 'events', ['id'], unique=False)
    op.create_index(op.f('ix_events_event_type'), 'events', ['event_type'], unique=False)
    op.create_index(op.f('ix_events_event_name'), 'events', ['event_name'], unique=False)
    op.create_index(op.f('ix_events_user_id'), 'events', ['user_id'], unique=False)
    op.create_index(op.f('ix_events_bot_id'), 'events', ['bot_id'], unique=False)
    op.create_index(op.f('ix_events_scenario_id'), 'events', ['scenario_id'], unique=False)
    op.create_index(op.f('ix_events_session_id'), 'events', ['session_id'], unique=False)
    op.create_index(op.f('ix_events_created_at'), 'events', ['created_at'], unique=False)
    op.create_index('ix_events_type_created', 'events', ['event_type', 'created_at'], unique=False)
    op.create_index('ix_events_user_created', 'events', ['user_id', 'created_at'], unique=False)
    op.create_index('ix_events_bot_created', 'events', ['bot_id', 'created_at'], unique=False)

    # Create scenario_executions table
    op.create_table('scenario_executions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('scenario_id', sa.Integer(), nullable=False),
        sa.Column('bot_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='started'),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('nodes_visited', sa.JSON(), nullable=True),
        sa.Column('current_node', sa.String(length=50), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('error_node', sa.String(length=50), nullable=True),
        sa.Column('input_data', sa.JSON(), nullable=True),
        sa.Column('output_data', sa.JSON(), nullable=True),
        sa.Column('variables', sa.JSON(), nullable=True),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['bot_id'], ['bots.id'], ),
        sa.ForeignKeyConstraint(['scenario_id'], ['scenarios.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_scenario_executions_id'), 'scenario_executions', ['id'], unique=False)
    op.create_index(op.f('ix_scenario_executions_scenario_id'), 'scenario_executions', ['scenario_id'], unique=False)
    op.create_index(op.f('ix_scenario_executions_bot_id'), 'scenario_executions', ['bot_id'], unique=False)
    op.create_index(op.f('ix_scenario_executions_user_id'), 'scenario_executions', ['user_id'], unique=False)
    op.create_index(op.f('ix_scenario_executions_status'), 'scenario_executions', ['status'], unique=False)
    op.create_index('ix_executions_scenario_status', 'scenario_executions', ['scenario_id', 'status'], unique=False)
    op.create_index('ix_executions_bot_started', 'scenario_executions', ['bot_id', 'started_at'], unique=False)

    # Create daily_stats table
    op.create_table('daily_stats',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('date', sa.DateTime(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('bot_id', sa.Integer(), nullable=True),
        sa.Column('total_messages', sa.Integer(), server_default='0'),
        sa.Column('unique_users', sa.Integer(), server_default='0'),
        sa.Column('scenario_runs', sa.Integer(), server_default='0'),
        sa.Column('scenario_completions', sa.Integer(), server_default='0'),
        sa.Column('scenario_failures', sa.Integer(), server_default='0'),
        sa.Column('avg_response_time_ms', sa.Integer(), server_default='0'),
        sa.Column('ai_requests', sa.Integer(), server_default='0'),
        sa.Column('ai_tokens_used', sa.Integer(), server_default='0'),
        sa.ForeignKeyConstraint(['bot_id'], ['bots.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_daily_stats_id'), 'daily_stats', ['id'], unique=False)
    op.create_index(op.f('ix_daily_stats_date'), 'daily_stats', ['date'], unique=False)
    op.create_index(op.f('ix_daily_stats_user_id'), 'daily_stats', ['user_id'], unique=False)
    op.create_index(op.f('ix_daily_stats_bot_id'), 'daily_stats', ['bot_id'], unique=False)
    op.create_index('ix_daily_stats_date_user', 'daily_stats', ['date', 'user_id'], unique=False)
    op.create_index('ix_daily_stats_date_bot', 'daily_stats', ['date', 'bot_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('daily_stats')
    op.drop_table('scenario_executions')
    op.drop_table('events')
