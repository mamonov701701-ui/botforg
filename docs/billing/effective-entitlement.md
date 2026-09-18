# Effective Entitlement (фактические права пользователя)

## Канонический resolver

Единственный порядок определения базового плана:

1. active subscription;
2. active plan gift;
3. Start default.

Effective plan, source и limits вычисляются сервисом тарифных лимитов. `users.plan_code` больше не является entitlement source: это historical/migration metadata, пока поле существует. Не допускаются fallback через `free`, `pro` или `developer`.

## Legacy mapping

Migration 041 нормализует известные исторические значения: `free → start`, `pro → business_pro`, `developer → team`. Unknown legacy code не должен silently map: он должен быть явно reported/fail-closed для обработки.

## Границы прав

Base plan определяет только базовые limits и source. Addon entitlement ведётся отдельно через `UserAddon`; plan gifts — через active `GiftGrant`. Purchased AI Credits — addon entitlement и доступны без paid subscription. Их spendable amount определяется canonical AI Credit buckets, а не `plan_code` и не дублирующим balance.

Canonical data sources — active subscription/gift, plan limits и активные addon/bucket records в применимом контуре. Исторические данные не должны повышать права пользователя без такого источника.
