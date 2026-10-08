# Canonical AI knowledge: Custom Block licensing (Stage 7.9)

Use this document to ground agents. Do not infer rights from chat, price,
listing text, UI state or a payment claim.

| Concept | Canonical source | Meaning |
| --- | --- | --- |
| Original author | `CustomBlock.owner_user_id` | Immutable authorship |
| Licensed object | `CustomBlockVersion.id` | Exact immutable version |
| Use Right | active `CustomBlockAccessGrant` + Effective Rights Resolver | Own projects |
| Library choice | `CustomBlockLibraryInstall` | User explicitly added version; not a right |
| Distribution Right | `CustomBlockDistributionGrant` | Publish dependency in Market Scenario/Template |
| Published attribution | `CustomBlockMarketDependency` | Original author, title and version snapshot |
| Marketplace offer | `CustomBlockMarketplaceListing` | Public Free/Paid offer, not ownership |
| Dispute facts | `MarketplaceDispute` | Price, currency and listing snapshot at filing |
| Enforcement | `TrustSafetyEnforcement` + audit | Platform action, actor, reason, target, time |

Allowed transitions: draft Free ↔ Paid; published Paid → Free; archive stops
new acquisition while retaining acquired rights. Free install gives Use,
Distribution and Library Install. Paid contact reuses private chat; after an
external direct settlement the author may issue Use Right and independently
Distribution Right. Direct Grant gives Use Right without a listing. A consumer
with Use Right can separately add the exact version to the library.

Forbidden transitions/actions: published Free → Paid; published price increase
or currency change; payment capture by BotForg; granting rights from a chat
message; publishing a Market Scenario/Template with a foreign paid dependency
without Distribution Right; republishing a foreign block as one's own;
revealing `execution_spec.source`; treating an archive as revoke. Consumer
ownership never changes.

Examples:

- Public Free + install → own use and Market distribution with author/version
  attribution.
- Paid + chat only → no use or distribution.
- Paid + Use Grant → own use after explicit library install, but Market
  redistribution denied until separate Distribution Grant.
- Direct Grant without listing → own use after library install; distribution
  requires separate grant.
- Listing archive after lawful acquisition → existing rights persist, new
  acquisition stops; revoke and security disable remain separate.

Legacy `self_install`, `author_approval`, `explicit_grant`, `external_terms`
rows remain backend-readable for compatibility. Incompatible offers are
hidden from normal consumer discovery/API catalog and detail UI. Agents must not present them as
choices for new listings.
Disputes record immutable offer facts; admin investigations are RBAC-protected
and audited. Admin enforcement is not a payment/refund decision engine.
A time-limited user Marketplace restriction denies new listing creation,
publication, update and restore, but does not revoke prior consumer rights or
block private Direct Grant. Only the existing Trust & Safety enforcement record
and its expiry/resolution are authoritative; UI labels are not.
