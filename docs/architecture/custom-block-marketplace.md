# Custom Block Marketplace: canonical licensing architecture

## Identity and authority

`CustomBlock.owner_user_id` is immutable authorship. A listing refers to one
published, review-approved `CustomBlockVersion`; its title and author-facing
metadata cannot transfer ownership or expose `execution_spec.source`.
Consumer serializers return only safe metadata. A foreign user cannot create a
listing for a version they do not own.
Consumer Market and `/blocks` catalog passports use an allowlist of public
metadata, so extra fields in a historical passport cannot expose executable
source. A private historical listing is not self-installable by guessing its
ID; public discoverability and acquisition remain separate from prior grants.

`CustomBlockAccessGrant` is an exact-version **Use Right**. The separate
`CustomBlockLibraryInstall` records the user's explicit library choice; neither
is ownership. `CustomBlockDistributionGrant` is an exact-version **Distribution
Right** snapshot with original author, title, version and source. It is unique
per recipient/version, remains after listing archive and requires an active
Use Right to be effective for a new publication.

## New Free/Paid listing model

New listings are public and use `commercial_mode=free|paid`. Internal
`access_policy` persists only for compatibility with historical rows:
`free → self_install`, `paid → explicit_grant`. New API payloads do not expose
the old three-policy selector or `external_terms`. Historical QA listings and
their existing access requests remain backend-readable for compatibility;
incompatible legacy offers are omitted from the ordinary consumer discovery API
and UI catalog and show no consumer UI detail actions. Migration 051 does not
rewrite them. One
listing per exact version remains the storage invariant.

Free installation atomically creates/reuses Use Right, free-public Distribution
Right and Library Install. Paid requires positive `price_amount` and ISO-like
three-letter `price_currency`, shows that fixed price, and offers contact via
the existing private chat. BotForg does not process payment. The author issues
Use Right manually after external settlement and may separately issue
Distribution Right. Direct Grant creates Use Right for an exact version without
any listing; the consumer then installs it explicitly. Chat messages never
create rights.

Published Free → Paid is denied. Paid → Free is allowed and extends the free
distribution snapshot to already installed users. Published price increases or
currency changes are denied. Draft terms may change both ways. Archive ends
new acquisition but does not revoke acquired rights, delete existing library
installs, prevent a holder with an acquired Distribution Right from publishing,
or unpublish lawful Market items. Individual revoke and global
security disable are separate mechanisms. Free/published rights are snapshotted,
so metadata changes cannot retroactively remove them.

## Dependency licensing

The server checks every foreign exact-version dependency before Scenario or
Template Market publication, including bot-contained scenarios. Active Use
Right and Distribution Right are both required. Free-public installation
creates the latter automatically; Paid and Direct Grant need the author's
separate Distribution Grant. `CustomBlockMarketDependency` records original
author/title/version for attribution on published Market items. A changing
source cannot silently add a dependency beyond the publication snapshot.
Legacy Template public transitions use the same check, though their old
content store has no per-publication attribution snapshot. Private scenario
publication for the owner's bot is not Market distribution.

`GET /blocks` and EditorV2 include a foreign exact version only after explicit
Library Install and while effective Use Right allows it. Existing saved
scenario references remain after archive; revoke blocks subsequent use under
Stage 7.9 semantics. No frontend state is a security authority.

## Trust & Safety foundation

Migration 051 adds Paid price columns, immutable dispute offer snapshots,
cross-object reports, enforcement records and audited admin reads/actions.

Admin Bot warning creates an auditable enforcement record but does not suspend the bot. Temporary and permanent Bot restrictions are separate; the temporary end time is persisted in `TrustSafetyEnforcement.expires_at` and the operational Bot status. Expired temporary restrictions cease to deny use, while the historical record remains. Unblock marks the restriction resolved (`revoked_at`, admin actor) and writes a resolution audit event. Bot owners see the warning/restriction reason and expiry in their bot list; administrative internal notes must not be placed in that user-facing reason field. Object-level UI currently exposes effective restriction for Marketplace listings and Market items; Scenario/Template UI offers warning only. The backend explicitly rejects `suspend_object` for the legacy `Template` object (`unsupported_action`); a Marketplace `MarketItem` of type Template is a distinct target with its own effective restriction. Direct Custom Block version enforcement is not supported by this foundation. An active author Marketplace restriction also denies restoring an archived Custom Block listing; existing grants and library installs remain intact.
A dispute stores buyer, author, listing, exact version, price/currency, listing
snapshot and relevant private chat. Evidence is limited to metadata references;
no payment capture or generic attachment pipeline is introduced.

Admin endpoints use existing platform-owner RBAC. Enforcement records require
actor, reason, target and timestamp and cover user, listing, bot, scenario,
template and Market item targets. Active restrictions are checked on relevant
Marketplace actions. User overview and bot investigation link objects,
versions, dependencies and enforcement history; sensitive reads are audited.
Admin User Detail can apply a time-limited Marketplace restriction to a user
with a recorded reason and remove it through the audited enforcement history.
It blocks new listing creation, publication, updates and restore, but not
private Direct Grants or already lawfully acquired rights.
This is a foundation, not mass activity surveillance or a full admin UI.
Admin User Detail uses the existing User ID, display name, email, role,
registration date and account status, plus real Bots, Scenarios, Templates,
Custom Blocks, Marketplace activity, disputes, reports and enforcement records.
It does not create a new user-profile schema.

## UX placement

Discovery and author listings live in the common Market. Block Library handles
version lifecycle and links to Market or Direct Grant actions. Marketplace
contact reuses an existing private room. No new messaging or payment system is
created.

## Responsive Market UI

The shared Market catalog uses a container-width grid: two columns below
600px, then three/four/five/six at 600/900/1200/1500px. Catalog cards share
type visuals, aligned CTA footers and readable clamped text; management cards
remain compact. The search/filter toolbar is sticky below the site header.
The Block Library links an exact published version into listing creation or
opens its existing draft/published/archived placement for management.

## Block Library classification

Block type and access source are separate axes. **Basic Block (базовый блок)**
means an ordinary platform scenario step (Start, Message, Input, Wait,
Condition, Go to Scenario, Set Variable, End). **System Block (системный
блок)** means an internal/special platform step; the current legacy `variable`
and `action` definitions are not offered for new insertion, so the System tab
can legitimately be empty. **Custom Block (кастомный блок)** is an authored
exact version, whether owned or received through Market or Direct Grant.
EditorV2 and the personal Block Library use the same type mapping from catalog
`source` and functional `category`; Created/Received sections describe the
user's relationship, not another block type. The EditorV2 picker shows the
Custom version, canonical author and acquisition source. The catalog only
offers a foreign installed version when Effective Rights allows a new node;
an installed but revoked version stays in received history, not in the picker.
The catalog preserves `blockVersionId` for insertion and never silently
substitutes a newer version in an existing scenario. No consumer catalog field
includes `execution_spec.source`.
