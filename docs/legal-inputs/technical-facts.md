# Technical Facts for Legal Inputs (технические факты для юридических входных данных)

Это не юридический документ и не оферта.

- BotForg технически продаёт tariffs, addons и AI Credits.
- Marketplace не является финансовым посредником: текущий marketplace flow не проводит buyer-to-developer settlements; BotForg не исполняет такие расчёты.
- Для Custom Blocks право использования точной версии, добавление в библиотеку и право распространения в публичном Scenario/Template — разные backend-состояния. Новый публичный Marketplace предлагает Free или Paid с фиксированной ценой и валютой. Free даёт право распространения при добавлении; Paid и прямая выдача без карточки требуют отдельного разрешения автора. Расчёты по Paid идут напрямую вне BotForg. Авторство остаётся за первоначальным владельцем. Спор сохраняет снимок цены и карточки. Подробные требования к будущей оферте: [custom-block-license-offer-requirements.md](custom-block-license-offer-requirements.md).
- AI Credits — внутренняя единица платформы, не токены модели. Purchased credits могут иметь срок, определяемый addon grant.
- Refund automation ограничена money/entitlement/ledger invariants; AI-credit addon требует manual review.
- Реальные payment/provider integrations должны подтверждаться отдельными operational docs и конфигурацией; этот документ не перечисляет secrets или неподтверждённые подключения.
- AI Provider Layer, DeepSeek и provider-backed AI capabilities — **PLANNED**, не реализованы.

Состав обрабатываемых пользовательских данных и правовые основания должны подтверждаться отдельным code/data audit перед подготовкой privacy policy.
