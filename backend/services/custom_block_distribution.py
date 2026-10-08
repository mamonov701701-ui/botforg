"""Exact-version licensing for public Market Scenario/Template dependencies."""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.models.bot import Bot
from backend.models.custom_block import CustomBlockVersion
from backend.models.custom_block_marketplace import (
    ACCESS_SELF_INSTALL, COMMERCIAL_FREE, GRANT_ACTIVE, VISIBILITY_PUBLIC,
    CustomBlockAccessGrant, CustomBlockDistributionGrant, CustomBlockMarketDependency,
)
from backend.models.market import MarketItem, MarketItemType
from backend.models.scenario import Scenario
from backend.services.custom_block_marketplace import is_marketplace_eligible
from backend.services.custom_blocks import content_version_ids


def is_free_public_open(listing) -> bool:
    return bool(listing and listing.visibility == VISIBILITY_PUBLIC
                and listing.commercial_mode == COMMERCIAL_FREE
                and listing.access_policy == ACCESS_SELF_INSTALL)


def acquire_free_public_distribution(db: Session, *, user_id: int, version: CustomBlockVersion, listing) -> None:
    """Persist the licence terms at acquisition, independently of later listing edits."""
    if not is_free_public_open(listing):
        return
    existing = db.query(CustomBlockDistributionGrant.id).filter_by(user_id=user_id, custom_block_version_id=version.id).first()
    if not existing:
        db.add(CustomBlockDistributionGrant(
            user_id=user_id, custom_block_version_id=version.id,
            granted_by_user_id=version.block.owner_user_id, source="free_public",
            original_author_user_id=version.block.owner_user_id,
            block_title=version.title, version_number=version.version,
        ))


def source_dependency_ids(db: Session, *, item_type: MarketItemType, source_bot_id: int | None = None,
                          source_scenario_id: int | None = None) -> set[int]:
    if item_type == MarketItemType.SCENARIO:
        scenario = db.query(Scenario).filter_by(id=source_scenario_id).first()
        if not scenario:
            raise HTTPException(status_code=404, detail="Исходный сценарий не найден")
        return content_version_ids(scenario.content) | content_version_ids(scenario.published_content)
    bot = db.query(Bot).filter_by(id=source_bot_id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Исходный бот не найден")
    ids = content_version_ids(bot.content)
    for scenario in db.query(Scenario).filter_by(bot_id=bot.id).all():
        ids |= content_version_ids(scenario.content) | content_version_ids(scenario.published_content)
    return ids


def validate_distribution_dependencies(db: Session, *, seller_id: int, item_type: MarketItemType,
                                       source_bot_id: int | None = None, source_scenario_id: int | None = None) -> list[CustomBlockVersion]:
    """Fail closed for every foreign exact version; private bot publish is separate."""
    return validate_distribution_version_ids(
        db, seller_id=seller_id,
        version_ids=source_dependency_ids(db, item_type=item_type, source_bot_id=source_bot_id,
                                          source_scenario_id=source_scenario_id),
    )


def validate_distribution_version_ids(db: Session, *, seller_id: int,
                                      version_ids: set[int]) -> list[CustomBlockVersion]:
    versions = []
    for version_id in sorted(version_ids):
        version = db.query(CustomBlockVersion).filter_by(id=version_id).first()
        if not version or not is_marketplace_eligible(version):
            raise HTTPException(status_code=409, detail="Версия блока недоступна для публикации в Маркете")
        if version.block.owner_user_id != seller_id:
            grant = db.query(CustomBlockAccessGrant).filter_by(
                custom_block_version_id=version.id, recipient_user_id=seller_id, status=GRANT_ACTIVE).first()
            distribution = db.query(CustomBlockDistributionGrant).filter_by(
                custom_block_version_id=version.id, user_id=seller_id).first()
            # Distribution is an acquired exact-version licence snapshot.
            # Listing archive ends new acquisition, not already granted distribution.
            if not (grant and distribution):
                raise HTTPException(status_code=403, detail="Для публикации нужен отдельный доступ на распространение используемого блока")
        versions.append(version)
    return versions


def snapshot_market_dependencies(db: Session, *, item: MarketItem, versions: list[CustomBlockVersion]) -> None:
    db.query(CustomBlockMarketDependency).filter_by(market_item_id=item.id).delete()
    for version in versions:
        db.add(CustomBlockMarketDependency(
            market_item_id=item.id, custom_block_version_id=version.id,
            original_author_user_id=version.block.owner_user_id,
            block_title=version.title, version_number=version.version,
        ))


def ensure_published_dependencies_unchanged(db: Session, *, item: MarketItem) -> None:
    """A mutable source cannot silently add dependencies after Market approval."""
    current = source_dependency_ids(db, item_type=item.item_type, source_bot_id=item.source_bot_id,
                                    source_scenario_id=item.source_scenario_id)
    approved = {row.custom_block_version_id for row in db.query(CustomBlockMarketDependency).filter_by(market_item_id=item.id).all()}
    if not current.issubset(approved):
        raise HTTPException(status_code=409, detail="Источник товара изменён; проверьте права на блоки и опубликуйте заново")
