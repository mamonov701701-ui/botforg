# Stage 7.2 — Addon packages (fixed / custom / pricing grids)

Brief technical notes for BotForg addon catalog, graduated custom messages, and refunds.

## Package kinds

| Kind | Catalog | Public buy | Price source | Expiry |
|------|---------|------------|--------------|--------|
| **Fixed** | `AddonPackage` (`is_public`, `is_active`) | Yes (sellable types only) | Package `price` / `amount` | Messages: `activation + validity_days`. Capacity (`active_bot`, `team_member`): **tariff `period_end`**, not `validity_days`. |
| **Custom messages** | Reserved code `custom_messages` (hidden anchor) | Via checkout code + `quantity` | Active pricing **grid version** (graduated bands) | Same as messages: `activation + validity_days` on the pack |

Reserved `custom_messages` is **not** mutated via admin addon CRUD. Admin Packages shows a read-only system card «Настраиваемый пакет сообщений» (sales status, active grid, max qty) with link to pricing grids.

Runtime `ensure_custom_messages_package` is an idempotent fail-safe (unique `code` + SAVEPOINT); migration seed remains primary provisioning.

## Pricing grid versions

- Lifecycle: **draft → active → archived**.
- Draft: edit tiers, publish, **delete** (fail-closed if snapshot refs).
- Active: view, clone-as-draft, **archive** (stops custom sales until a new publish).
- Archived: view + clone-as-draft only (no reactivation in place).
- Exactly one **active** grid per `(resource_type, currency)` for quoting.
- Publish replaces the previous active version (prior → archived).
- Quote / checkout snapshot stores `pricing_grid_version_id` so paid purchases stay frozen after admin republish.

## Graduated pricing

- Server-only quote: `POST /me/addons/custom-quote` (`resource_type=messages`, `quantity`).
- Quantity: integer from `addon_custom_pack.MAX_CUSTOM_QUANTITY` (`1_000_000`) — technical ceiling, not a commercial SKU limit and **not** a tier `range_end`.
- Last open-ended tier: `range_end = null`, UI «от N». Fictitious huge ends (≥ max) are normalized on publish / migration `038`.
- Config: `GET /me/addons/custom-messages-config` exposes authoritative min/max/sales_enabled.
- **Free / non–addon_purchase plans** cannot quote or checkout addons.
- Without an active grid → `pricing_unavailable` / sales disabled.

## Public access limits

- `ai_credits`: tiers may exist for admin grids; **not** publicly sellable.
- Archived / hidden / inactive fixed packages → `product_unavailable`.
- Custom checkout requires `quantity`; fixed packs reject client quantity.

## Terms + snapshot

- Addon checkout builds `price_grid_snapshot` (fixed or graduated).
- Fixed capacity packs store `duration_kind=tariff_period_end`.
- Pay requires `confirm-addon-terms`; confirmation embeds quantity, total, currency, validity/duration, user/intent ids, legal revision IDs, formula version, and `pricing_grid_version_id` when present.
- Price change clears confirmation (`price_changed`).

## Expiry vs tariff renewal

- Message packs keep their own `UserAddon.period_end`; renewing the base tariff does **not** extend them.
- Capacity packs expire at current tariff `period_end`.
- FIFO: nearest `period_end`, then older `created_at` (price ignored).

## Refunds

- Formula: `round_money(paid × revoke_units / purchased_units)`.
- Multiple partial refunds: cumulative units and money caps.
- Admin refund product exposes `purchase_kind`, `pricing_grid_version_id`, `duration_kind`, terms, units.
