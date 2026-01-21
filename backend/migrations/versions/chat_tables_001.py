"""create chat tables

Revision ID: chat_tables_001
Revises: 
Create Date: 2026-01-21
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'chat_tables_001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Friendships table
    op.create_table(
        'friendships',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('friend_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.Enum('pending', 'accepted', 'declined', 'blocked', name='friendshipstatus'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['friend_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_friendships_user_friend', 'friendships', ['user_id', 'friend_id'])
    op.create_index(op.f('ix_friendships_id'), 'friendships', ['id'], unique=False)
    
    # User statuses table
    op.create_table(
        'user_statuses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.Enum('online', 'offline', 'away', 'do_not_disturb', name='useronlinestatus'), nullable=False),
        sa.Column('custom_status', sa.String(100), nullable=True),
        sa.Column('last_seen_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id')
    )
    op.create_index(op.f('ix_user_statuses_id'), 'user_statuses', ['id'], unique=False)
    
    # Chat rooms table
    op.create_table(
        'chat_rooms',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('public_id', sa.BigInteger(), nullable=False),
        sa.Column('room_type', sa.Enum('private', 'group', name='chatroomtype'), nullable=False),
        sa.Column('name', sa.String(100), nullable=True),
        sa.Column('avatar', sa.String(500), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('is_archived', sa.Boolean(), nullable=True, default=False),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_chat_rooms_id'), 'chat_rooms', ['id'], unique=False)
    op.create_index(op.f('ix_chat_rooms_public_id'), 'chat_rooms', ['public_id'], unique=True)
    
    # Chat participants table
    op.create_table(
        'chat_participants',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('room_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('is_admin', sa.Boolean(), nullable=True, default=False),
        sa.Column('is_muted', sa.Boolean(), nullable=True, default=False),
        sa.Column('is_pinned', sa.Boolean(), nullable=True, default=False),
        sa.Column('joined_at', sa.DateTime(), nullable=True),
        sa.Column('last_read_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['room_id'], ['chat_rooms.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_chat_participants_room_user', 'chat_participants', ['room_id', 'user_id'])
    op.create_index(op.f('ix_chat_participants_id'), 'chat_participants', ['id'], unique=False)
    
    # Chat messages table
    op.create_table(
        'chat_messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('public_id', sa.BigInteger(), nullable=False),
        sa.Column('room_id', sa.Integer(), nullable=False),
        sa.Column('sender_id', sa.Integer(), nullable=True),
        sa.Column('message_type', sa.Enum('text', 'image', 'file', 'system', name='messagetype'), nullable=False),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('file_url', sa.String(500), nullable=True),
        sa.Column('file_name', sa.String(255), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('reply_to_id', sa.Integer(), nullable=True),
        sa.Column('forwarded_from_id', sa.Integer(), nullable=True),
        sa.Column('is_edited', sa.Boolean(), nullable=True, default=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=True, default=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('edited_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['room_id'], ['chat_rooms.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sender_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['reply_to_id'], ['chat_messages.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['forwarded_from_id'], ['chat_messages.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_chat_messages_room_created', 'chat_messages', ['room_id', 'created_at'])
    op.create_index(op.f('ix_chat_messages_id'), 'chat_messages', ['id'], unique=False)
    op.create_index(op.f('ix_chat_messages_public_id'), 'chat_messages', ['public_id'], unique=True)
    op.create_index(op.f('ix_chat_messages_created_at'), 'chat_messages', ['created_at'], unique=False)
    
    # Message reactions table
    op.create_table(
        'message_reactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('message_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('emoji', sa.String(10), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['message_id'], ['chat_messages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_message_reactions_message_user', 'message_reactions', ['message_id', 'user_id'])
    op.create_index(op.f('ix_message_reactions_id'), 'message_reactions', ['id'], unique=False)
    
    # Blocked users table
    op.create_table(
        'blocked_users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('blocker_id', sa.Integer(), nullable=False),
        sa.Column('blocked_id', sa.Integer(), nullable=False),
        sa.Column('reason', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['blocker_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['blocked_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_blocked_users_blocker_blocked', 'blocked_users', ['blocker_id', 'blocked_id'])
    op.create_index(op.f('ix_blocked_users_id'), 'blocked_users', ['id'], unique=False)


def downgrade() -> None:
    op.drop_table('blocked_users')
    op.drop_table('message_reactions')
    op.drop_table('chat_messages')
    op.drop_table('chat_participants')
    op.drop_table('chat_rooms')
    op.drop_table('user_statuses')
    op.drop_table('friendships')
    
    # Drop enums
    sa.Enum(name='friendshipstatus').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='useronlinestatus').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='chatroomtype').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='messagetype').drop(op.get_bind(), checkfirst=True)
