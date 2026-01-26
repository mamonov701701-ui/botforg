"""create marketplace tables

Revision ID: marketplace_tables_001
Revises: e3a4b5c6d7e8
Create Date: 2026-01-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite


# revision identifiers, used by Alembic.
revision = 'marketplace_tables_001'
down_revision = 'chat_tables_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Market items table
    op.create_table(
        'market_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('item_type', sa.Enum('template', 'scenario', name='marketitemtype'), nullable=False),
        sa.Column('source_bot_id', sa.Integer(), nullable=True),
        sa.Column('source_scenario_id', sa.Integer(), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('additional_description', sa.Text(), nullable=True),
        sa.Column('image_url', sa.String(length=500), nullable=True),
        sa.Column('price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('sales_count', sa.Integer(), nullable=True),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=True),
        sa.Column('is_premium', sa.Boolean(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('is_published', sa.Boolean(), nullable=True),
        sa.Column('seller_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('published_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['source_bot_id'], ['bots.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['source_scenario_id'], ['scenarios.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['seller_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_market_items_type_seller', 'market_items', ['item_type', 'seller_id'])
    op.create_index('ix_market_items_category', 'market_items', ['category'])
    op.create_index(op.f('ix_market_items_id'), 'market_items', ['id'], unique=False)
    op.create_index(op.f('ix_market_items_item_type'), 'market_items', ['item_type'], unique=False)
    op.create_index(op.f('ix_market_items_seller_id'), 'market_items', ['seller_id'], unique=False)
    
    # Market orders table
    op.create_table(
        'market_orders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('budget_min', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('budget_max', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('deadline', sa.DateTime(), nullable=True),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('skills', sa.JSON(), nullable=True),
        sa.Column('status', sa.Enum('open', 'in_progress', 'completed', 'cancelled', name='marketorderstatus'), nullable=False),
        sa.Column('selected_freelancer_id', sa.Integer(), nullable=True),
        sa.Column('author_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['selected_freelancer_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_market_orders_status_category', 'market_orders', ['status', 'category'])
    op.create_index(op.f('ix_market_orders_id'), 'market_orders', ['id'], unique=False)
    op.create_index(op.f('ix_market_orders_status'), 'market_orders', ['status'], unique=False)
    op.create_index(op.f('ix_market_orders_author_id'), 'market_orders', ['author_id'], unique=False)
    op.create_index(op.f('ix_market_orders_category'), 'market_orders', ['category'], unique=False)
    
    # Order proposals table
    op.create_table(
        'order_proposals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('order_id', sa.Integer(), nullable=False),
        sa.Column('freelancer_id', sa.Integer(), nullable=False),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('proposed_price', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('estimated_days', sa.Integer(), nullable=True),
        sa.Column('is_accepted', sa.Boolean(), nullable=True),
        sa.Column('is_declined', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['freelancer_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['order_id'], ['market_orders.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_order_proposals_id'), 'order_proposals', ['id'], unique=False)
    op.create_index(op.f('ix_order_proposals_order_id'), 'order_proposals', ['order_id'], unique=False)
    op.create_index(op.f('ix_order_proposals_freelancer_id'), 'order_proposals', ['freelancer_id'], unique=False)
    
    # Freelancer profiles table
    op.create_table(
        'freelancer_profiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('hourly_rate', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('skills', sa.JSON(), nullable=True),
        sa.Column('portfolio_items', sa.JSON(), nullable=True),
        sa.Column('completed_orders_count', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('is_verified', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id')
    )
    op.create_index(op.f('ix_freelancer_profiles_id'), 'freelancer_profiles', ['id'], unique=False)
    op.create_index(op.f('ix_freelancer_profiles_user_id'), 'freelancer_profiles', ['user_id'], unique=True)
    
    # Market reviews table
    op.create_table(
        'market_reviews',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('item_type', sa.String(length=50), nullable=False),
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.Column('author_id', sa.Integer(), nullable=False),
        sa.Column('rating', sa.Integer(), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['author_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_market_reviews_item_type_id', 'market_reviews', ['item_type', 'item_id'])
    op.create_index(op.f('ix_market_reviews_id'), 'market_reviews', ['id'], unique=False)
    op.create_index(op.f('ix_market_reviews_item_type'), 'market_reviews', ['item_type'], unique=False)
    op.create_index(op.f('ix_market_reviews_item_id'), 'market_reviews', ['item_id'], unique=False)
    op.create_index(op.f('ix_market_reviews_author_id'), 'market_reviews', ['author_id'], unique=False)
    
    # Note: SQLite doesn't support conditional foreign keys for polymorphic relationships
    # Foreign key for market_reviews -> market_items is handled in application logic based on item_type


def downgrade() -> None:
    op.drop_index(op.f('ix_market_reviews_author_id'), table_name='market_reviews')
    op.drop_index(op.f('ix_market_reviews_item_id'), table_name='market_reviews')
    op.drop_index(op.f('ix_market_reviews_item_type'), table_name='market_reviews')
    op.drop_index(op.f('ix_market_reviews_id'), table_name='market_reviews')
    op.drop_index('ix_market_reviews_item_type_id', table_name='market_reviews')
    op.drop_table('market_reviews')
    
    op.drop_index(op.f('ix_freelancer_profiles_user_id'), table_name='freelancer_profiles')
    op.drop_index(op.f('ix_freelancer_profiles_id'), table_name='freelancer_profiles')
    op.drop_table('freelancer_profiles')
    
    op.drop_index(op.f('ix_order_proposals_freelancer_id'), table_name='order_proposals')
    op.drop_index(op.f('ix_order_proposals_order_id'), table_name='order_proposals')
    op.drop_index(op.f('ix_order_proposals_id'), table_name='order_proposals')
    op.drop_table('order_proposals')
    
    op.drop_index(op.f('ix_market_orders_category'), table_name='market_orders')
    op.drop_index(op.f('ix_market_orders_author_id'), table_name='market_orders')
    op.drop_index(op.f('ix_market_orders_status'), table_name='market_orders')
    op.drop_index(op.f('ix_market_orders_id'), table_name='market_orders')
    op.drop_index('ix_market_orders_status_category', table_name='market_orders')
    op.drop_table('market_orders')
    
    op.drop_index(op.f('ix_market_items_seller_id'), table_name='market_items')
    op.drop_index(op.f('ix_market_items_item_type'), table_name='market_items')
    op.drop_index(op.f('ix_market_items_id'), table_name='market_items')
    op.drop_index('ix_market_items_category', table_name='market_items')
    op.drop_index('ix_market_items_type_seller', table_name='market_items')
    op.drop_table('market_items')
    
    # Note: SQLite doesn't support DROP TYPE for ENUMs
    # They are stored as CHECK constraints which are removed when table is dropped
