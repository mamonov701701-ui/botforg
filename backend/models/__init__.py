# Models package
# Импортируем все модели для корректной работы SQLAlchemy relationships

from backend.models.user import User, UserSettings
from backend.models.auth import Account, EmailVerification, PasswordReset
from backend.models.template import Template
from backend.models.rating import Rating
from backend.models.comment import Comment
from backend.models.purchase import Purchase
from backend.models.payment import Payment
from backend.models.team import TeamMember
from backend.models.bot import Bot, BotInstance
from backend.models.bot_channel import BotChannelConnection
from backend.models.processed_update import ProcessedUpdate
from backend.models.bot_template import BotTemplate
from backend.models.user_template import UserTemplate
from backend.models.token_blacklist import TokenBlacklist
from backend.models.billing import BillingRecord, UserQuota
from backend.models.bonus_account import UserBonusAccount
from backend.models.bot_user_state import BotUserState
from backend.models.bot_tag import BotTag, bot_contact_tags
from backend.models.message import Message
from backend.models.review import Review
from backend.models.tag import Tag
from backend.models.editor import Node, Edge
from backend.models.referral import Referral
from backend.models.scenario import Scenario, ScenarioVersion
from backend.models.platform_role import PlatformRole
from backend.models.bf_team_member import BFTeamMember
from backend.models.base_role import BaseRole
from backend.models.chat import (
    Friendship, UserStatus, ChatRoom, ChatParticipant, 
    ChatMessage, MessageReaction, BlockedUser,
    FriendshipStatus, UserOnlineStatus, MessageType, ChatRoomType
)
from backend.models.market import (
    MarketItem, MarketOrder, OrderProposal, FreelancerProfile, MarketReview,
    MarketItemType, MarketOrderStatus
)
from backend.models.market_access import (
    MarketAccessRequest,
    MarketAccessRequestStatus,
    MarketItemAccessGrant,
)
from backend.models.legal import Consent
from backend.models.plan import Plan
from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    CheckoutProductType,
    PaymentAttempt,
    PaymentAttemptStatus,
    PaymentWebhookEvent,
    PaymentWebhookProcessStatus,
)
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    AdminAuditLog,
    GiftGrant,
    GiftGrantStatus,
    GiftType,
    SubscriptionStatus,
    UsageCounter,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
    UserSubscription,
)
from backend.models.constructor_core import (
    PlatformUser,
    CtorBot,
    CtorBotUser,
    CtorScenario,
    CtorBlock,
    CtorBlockEdge,
    CtorBotVariableDefinition,
    CtorBotUserVariable,
    CtorBotTag,
    CtorBotUserTag,
    CtorBotUserSession,
    CtorBotUserEvent,
)
from backend.models.event import Event, ScenarioExecution, DailyStats, ScenarioEvent, UserSession

__all__ = [
    "User",
    "UserSettings",
    "Account",
    "EmailVerification",
    "PasswordReset",
    "Template",
    "Rating",
    "Comment",
    "Purchase",
    "Payment",
    "TeamMember",
    "Bot",
    "BotInstance",
    "BotChannelConnection",
    "ProcessedUpdate",
    "BotTemplate",
    "UserTemplate",
    "TokenBlacklist",
    "BillingRecord",
    "UserQuota",
    "UserBonusAccount",
    "BotUserState",
    "BotTag",
    "bot_contact_tags",
    "Message",
    "Review",
    "Tag",
    "Node",
    "Edge",
    "Referral",
    "Scenario",
    "ScenarioVersion",
    "PlatformRole",
    "BFTeamMember",
    "BaseRole",
    "Friendship",
    "UserStatus",
    "ChatRoom",
    "ChatParticipant",
    "ChatMessage",
    "MessageReaction",
    "BlockedUser",
    "FriendshipStatus",
    "UserOnlineStatus",
    "MessageType",
    "ChatRoomType",
    "MarketItem",
    "MarketOrder",
    "OrderProposal",
    "FreelancerProfile",
    "MarketReview",
    "MarketItemType",
    "MarketOrderStatus",
    "MarketAccessRequest",
    "MarketAccessRequestStatus",
    "MarketItemAccessGrant",
    "Consent",
    "Plan",
    "CheckoutIntent",
    "CheckoutIntentStatus",
    "CheckoutProductType",
    "PaymentAttempt",
    "PaymentAttemptStatus",
    "PaymentWebhookEvent",
    "PaymentWebhookProcessStatus",
    "AddonPackage",
    "AddonPackageType",
    "UserSubscription",
    "SubscriptionStatus",
    "UserAddon",
    "UserAddonStatus",
    "UserAddonSource",
    "UsageCounter",
    "GiftGrant",
    "GiftType",
    "GiftGrantStatus",
    "AdminAuditLog",
    "PlatformUser",
    "CtorBot",
    "CtorBotUser",
    "CtorScenario",
    "CtorBlock",
    "CtorBlockEdge",
    "CtorBotVariableDefinition",
    "CtorBotUserVariable",
    "CtorBotTag",
    "CtorBotUserTag",
    "CtorBotUserSession",
    "CtorBotUserEvent",
    "Event",
    "ScenarioExecution",
    "DailyStats",
    "ScenarioEvent",
    "UserSession",
]
