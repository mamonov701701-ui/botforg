# Models package
# Импортируем все модели для корректной работы SQLAlchemy relationships

from backend.models.user import User
from backend.models.auth import Account, EmailVerification, PasswordReset
from backend.models.template import Template
from backend.models.rating import Rating
from backend.models.comment import Comment
from backend.models.purchase import Purchase
from backend.models.payment import Payment
from backend.models.team import TeamMember
from backend.models.bot import Bot, BotInstance
from backend.models.bot_template import BotTemplate
from backend.models.user_template import UserTemplate
from backend.models.token_blacklist import TokenBlacklist
from backend.models.billing import BillingRecord, UserQuota
from backend.models.bonus_account import UserBonusAccount
from backend.models.bot_user_state import BotUserState
from backend.models.message import Message
from backend.models.review import Review
from backend.models.tag import Tag
from backend.models.editor import Node, Edge
from backend.models.referral import Referral
from backend.models.scenario import Scenario, ScenarioVersion
from backend.models.platform_role import PlatformRole

__all__ = [
    "User",
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
    "BotTemplate",
    "UserTemplate",
    "TokenBlacklist",
    "BillingRecord",
    "UserQuota",
    "UserBonusAccount",
    "BotUserState",
    "Message",
    "Review",
    "Tag",
    "Node",
    "Edge",
    "Referral",
    "Scenario",
    "ScenarioVersion",
    "PlatformRole",
]
