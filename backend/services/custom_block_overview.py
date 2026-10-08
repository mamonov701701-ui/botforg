"""Source-safe, exact-version overview of rights received by one user."""

from backend.models.custom_block import CustomBlock, CustomBlockVersion
from backend.models.custom_block_marketplace import (
    GRANT_ACTIVE, CustomBlockAccessGrant, CustomBlockDistributionGrant,
    CustomBlockLibraryInstall, CustomBlockMarketplaceListing,
)
from backend.models.user import User


def received_custom_block_rows(db, user_id: int) -> list[dict]:
    grants = db.query(CustomBlockAccessGrant).filter_by(recipient_user_id=user_id).all()
    if not grants:
        return []
    version_ids = [grant.custom_block_version_id for grant in grants]
    versions = {row.id: row for row in db.query(CustomBlockVersion).filter(CustomBlockVersion.id.in_(version_ids)).all()}
    blocks = {row.id: row for row in db.query(CustomBlock).filter(
        CustomBlock.id.in_([version.custom_block_id for version in versions.values()])).all()}
    authors = {row.id: row for row in db.query(User).filter(
        User.id.in_([block.owner_user_id for block in blocks.values()])).all()}
    listings = {row.custom_block_version_id: row for row in db.query(CustomBlockMarketplaceListing).filter(
        CustomBlockMarketplaceListing.custom_block_version_id.in_(version_ids)).all()}
    installed = {row.custom_block_version_id for row in db.query(CustomBlockLibraryInstall).filter(
        CustomBlockLibraryInstall.user_id == user_id,
        CustomBlockLibraryInstall.custom_block_version_id.in_(version_ids)).all()}
    distribution = {row.custom_block_version_id for row in db.query(CustomBlockDistributionGrant).filter(
        CustomBlockDistributionGrant.user_id == user_id,
        CustomBlockDistributionGrant.custom_block_version_id.in_(version_ids)).all()}
    result = []
    for grant in grants:
        version = versions.get(grant.custom_block_version_id)
        block = blocks.get(version.custom_block_id) if version else None
        if not version or not block or block.owner_user_id == user_id:
            continue
        listing = listings.get(version.id)
        author = authors.get(block.owner_user_id)
        result.append({
            "grant_id": grant.id,
            "custom_block_version_id": version.id,
            "block_id": block.id,
            "title": version.title,
            "version": version.version,
            "original_author_user_id": block.owner_user_id,
            "original_author_name": author.name if author and author.name else None,
            "grant_source": grant.grant_source,
            "source_channel": (
                "direct" if grant.grant_source in {"direct", "direct_grant"} else
                "marketplace" if grant.grant_source in {"self_install", "author_approval", "explicit_grant"} else
                "unknown"
            ),
            "grant_status": grant.status,
            "is_installed": version.id in installed,
            "has_distribution_right": grant.status == GRANT_ACTIVE and version.id in distribution,
            "listing_id": listing.id if listing else None,
            "listing_lifecycle": listing.lifecycle if listing else None,
            "current_commercial_mode": listing.commercial_mode if listing else None,
        })
    return result
