# Этап 6.13 — Правила возврата средств и договорной контур

**Ветка:** `chore/fresh-clean`
**Тип этапа:** проектирование (аудит + документация). Код, миграции, API и refund-запросы к ЮKassa **не** входят в 6.13.
**Связанные черновики:**
- `docs/legal/REFUND_POLICY_DRAFT.md`
- `docs/legal/OFFER_REFUND_CLAUSES_DRAFT.md`
- `docs/admin/REFUND_ADMIN_GUIDE_DRAFT.md`

> Любое изменение формулы расчёта или административных полномочий должно **одновременно** обновлять все связанные документы (техника, политика, оферта, UI, уведомления, audit).

### Утверждённые решения (Виктор, 6.13)

1. **Тариф:** авто-расчёт строго по **точному времени** использования (`paid_amount`, `period_start`/`period_end`, момент calc); admin может мотивированно править сумму/дату/action; auto-calc и admin revision хранятся раздельно.
2. **Addon до per-addon ledger:** при отсутствии usage после покупки — можно предложить full refund; при usage общего пула — **`manual_review_required`** (без утверждения, что расход относится к конкретному addon); admin правит сумму/объём только с основанием; остаток ≥ 0.
3. **Обязательное развитие:** внедрить **per-addon usage ledger** + списание **FIFO** — обязательный следующий технический этап (не optional). После ledger авто-расчёт расхода каждого addon становится точным.
4. Общий контур: automatic calculation → admin edit with reason → snapshots/revisions/audit → final confirmation; **нет** silent revoke и скрытых комиссий. Публичные тексты — **DRAFT / legal review**.

---

## 1. Цели и scope

### Цели

1. Детерминированный автоматический расчёт рекомендуемого возврата и действия с entitlement.
2. Прозрачная административная корректировка с обязательным основанием и audit trail.
3. Согласованность технической реализации, публичной политики, оферты и интерфейсов.
4. Fail-closed валидации: нет silent revoke, нет скрытых штрафов, нет повторного возврата/отзыва.

### В scope 6.13

- Правила, workflow, snapshots/revisions, валидации, роли, сценарии.
- Code audit текущих моделей и пробелов данных.
- Черновики политики, оферты, гайда администратора.

### Вне scope 6.13 (этап 6.14+)

- Модели/миграции, API, UI, реальные вызовы `refund` ЮKassa, ledger в БД.

---

## 2. B2C / B2B

| Контур | Кто | Примечание |
|--------|-----|------------|
| **B2C** | Физлицо-потребитель | Льготные 24 ч + императивные права потребителя **не** ограничиваются сроком 24 ч и политикой сервиса |
| **B2B** | Юрлицо / ИП по договору | Порядок возврата — по оферте/договору; без «обхода» императивных норм, где они применимы |

Технически заявки и расчёт едины; юридические тексты и UI должны явно разделять контуры.
**Открытый вопрос (не BLOCKER для проектирования):** как в продукте надёжно классифицировать B2C vs B2B на момент оплаты (см. §19).

---

## 3. Отмена подписки ≠ возврат платежа

| Действие | Смысл |
|----------|--------|
| **Cancel subscription** | Прекращение/непродление доступа; деньги могут не возвращаться |
| **Refund payment** | Возврат денег через провайдера + согласованное действие с entitlement |

Заявка на возврат может включать оба эффекта; нельзя подменять одно другим в UI или audit.

---

## 4. Льготное правило 24 часа

1. В течение **24 часов** после `paid_at` (факт успешной оплаты) действует **льготный полный возврат**, если **платные возможности не использовались**.
2. Эти 24 часа **не ограничивают** законные права пользователя. После 24 ч заявка **принимается** и считается по **общим** правилам (полный/частичный / manual review).
3. Критерий «не использовались» для льготы 24 ч:
   - **Тариф:** платные возможности периода не использовались (для льготного full); иначе — общий time-based расчёт §6.
   - **Addon (до ledger):** если после покупки **нет** usage общего пула — можно предложить full refund; если usage общего пула **есть** — **не** утверждать атрибуцию к addon → `manual_review_required` (§7).

---

## 5. Полный и частичный refund

| Тип | Когда (рекомендация авто) |
|-----|---------------------------|
| **Full** | Льгота 24 ч без usage; addon без post-purchase pool usage; либо time-unused = 100 % (за вычетом prior refunds) |
| **Partial** | Тариф: истекла часть периода по точной time-формуле §6 |

Администратор может переключить full ↔ partial **только** если это проходит валидации и с категорией основания + текстом (§9). Auto-calc snapshot и admin revision хранятся **раздельно**.

---

## 6. Автоматический расчёт тарифа (утверждено)

**Базовый и единственный автоматический метод для тарифа — пропорционально точному времени использования.**

Входные данные:

- `paid_amount` — сумма успешной оплаты (snapshot `CheckoutIntent` / `PaymentAttempt`);
- `period_start` / `period_end` — `UserSubscription.current_period_start` / `current_period_end`;
- `calc_at` — момент расчёта (now);
- `prior_refunds` — сумма ранее успешных возвратов по этому платежу.

```text
elapsed_ratio = clamp((calc_at - period_start) / (period_end - period_start), 0, 1)
time_used_portion = round_money(paid_amount * elapsed_ratio)   # единое округление до копеек
recommended_refund = paid_amount - time_used_portion - prior_refunds
recommended_refund = clamp(recommended_refund, 0, paid_amount - prior_refunds)
```

Эквивалент: `recommended_refund = round_money(paid_amount * (1 - elapsed_ratio))`, затем вычет `prior_refunds` и clamp в `[0, paid − prior]`.

**Округление:** единая функция `round_money` → 2 знака (RUB, half-up); промежуточные ratio — с повышенной точностью.

**Администратор** может мотивированно изменить: сумму возврата, дату прекращения доступа, entitlement action.
**Обязательно:** сохранить исходный auto-calc snapshot и отдельную admin revision; основание + audit; final confirmation перед refund; без silent revoke и скрытых комиссий.

**Рекомендуемое entitlement action (тариф):**
`cancel_at` / `expire_at`; или `immediate_cancel` при full refund; без silent revoke.

---

## 7. Автоматический расчёт addon (утверждено до ledger)

Деньги: snapshot с intent. Единицы: `UserAddon.amount`.
**Пока нет per-addon usage ledger, нельзя утверждать, что расход общего пула относится к конкретному addon.**

### Правила авто (текущий контур)

| Условие после покупки | Авто-результат |
|----------------------|----------------|
| Usage общего пула **отсутствует** | Система **может** предложить **полный** refund (`paid − prior`) |
| Usage общего пула **есть** | Статус **`manual_review_required`**; показать доступные usage-данные (`UsageCounter` и т.п.); **не** строить «точный» usage-based auto-calc по этому addon |

Администратор при manual review может изменить сумму и объём отзыва addon **только** с обязательным основанием; отрицательный остаток запрещён; auto snapshot и admin revision раздельно; final confirmation; без silent revoke / скрытых комиссий.

### После внедрения per-addon ledger + FIFO (обязательный следующий этап)

```text
used_units   = fifo_ledger_used(user_addon_id)   # точная атрибуция
unused_units = max(package_amount - used_units, 0)
net_refund   = clamp(round_money(paid_amount * unused_units / package_amount) - prior_refunds,
                     0, paid_amount - prior_refunds)
```

Тогда автоматический расчёт расхода **каждого** addon становится точным. Это **обязательный** технический этап после/в рамках 6.14+, не optional improvement.

**Entitlement action:** `reduce_amount` / `cancel` / `expire`; остаток ≥ 0.

---

## 8. Workflow состояний

```text
submitted
  → calculating
  → awaiting_admin_review
  → admin_edited | approved
  → awaiting_final_confirmation
  → refund_processing
  → refunded | partially_refunded
  → entitlement_processing
  → completed
```

**Дополнительно:**
`calculation_failed`, `manual_review_required`, `needs_information`, `rejected`, `provider_unknown`, `refund_failed`, `entitlement_failed`, `chargeback_review`, `canceled`.

Переходы с финансовым эффектом — только после **финального подтверждения** администратора (и прохождения валидаций).

---

## 9. Административная корректировка

Администратор **видит** авто-расчёт и может:

| Действие | Условие |
|----------|---------|
| Одобрить без изменений | revision актуальна |
| Изменить сумму возврата | валидации §10 |
| Full ↔ partial | валидации + основание |
| Изменить дату прекращения тарифа | не в прошлом без явной категории; согласовано с action |
| Изменить объём отзываемого addon | остаток ≥ 0 |
| Выбрать entitlement action | из whitelist |
| Запросить сведения | → `needs_information` |
| Отклонить | обязательное основание |

### При любом редактировании обязательно

- категория основания корректировки;
- текстовое обоснование;
- сохранение **исходного** авто-расчёта (immutable snapshot);
- сохранение **окончательного** расчёта;
- audit trail всех изменённых полей (old/new);
- `admin_user_id`;
- timestamp изменения;
- новая **revision** (§11).

**Запрещено:** произвольное уменьшение без основания; скрытые комиссии/штрафы; silent revoke; правка БД вручную.

---

## 10. Validation rules

| Правило | Описание |
|---------|----------|
| Cap | `0 ≤ refund_amount ≤ paid - prior_refunds` |
| Non-negative limits | после revoke лимиты/остатки addon ≥ 0 |
| No double money | нельзя вернуть ту же сумму повторно (idempotency + ledger) |
| No double revoke | один entitlement revoke на один успешный refund decision |
| No silent revoke | entitlement меняется только после confirmed refund (или явный policy path с уведомлением — не silent) |
| User visibility | пользователь видит итоговую сумму и последствия для доступа |
| No hidden fees | итоговая сумма = то, что уходит провайдеру |
| Confirm gate | refund + entitlement только после `awaiting_final_confirmation` → confirm |
| Revision lock | approve только current revision |
| Money lock | после старта `refund_processing` финансовые поля финального snapshot заморожены |

---

## 11. Snapshots, revisions, optimistic locking

### Snapshot автоматического расчёта

Неизменяемая запись: входные данные (intent/attempt ids, paid, currency, period, usage snapshot на момент calc, формулы/версия политики), рекомендуемые `refund_amount`, `entitlement_action`, даты, `calc_status`.

### Snapshot решения администратора

Неизменяемая запись после final confirm: ссылка на auto snapshot + final amounts/actions + основания + admin id + time.

### Revision / versioning

- Любое изменение → **новая revision** (`version`++ / новый row).
- Старые значения **не** перезаписываются.
- Approval только для **текущей** revision; устаревшую одобрить нельзя (`409 stale_revision`).
- Optimistic locking: `If-Match` / `expected_version` на review/approve/confirm.
- Повторный calc при изменении usage → новая revision; старая помечается `superseded`.

### Защита usage между review и approval

1. При открытии review фиксируется `usage_fingerprint` (hash counters + period + entitlement ids).
2. Перед final confirm — повторная проверка fingerprint.
3. При расхождении → принудительный re-calc / `manual_review_required`, confirm блокируется.

---

## 12. Денежное округление (утверждено)

- Валюта checkout: **RUB**, 2 знака.
- **Единое** округление до копейки: `round_money` (half-up) — одна функция на все денежные шаги итога.
- Промежуточные ratio — с повышенной точностью; округление на порциях/`recommended_refund` / сумме к провайдеру.
- Сумма к провайдеру = округлённый `final_refund_amount` после clamp.

---

## 13. Максимум к возврату и предыдущие partial

```text
max_refundable = sum(succeeded_attempts.amount) - sum(succeeded_refunds.amount)
               // в рамках одного CheckoutIntent / provider_payment_id (уточнить в 6.14)
```

Каждый успешный refund пишет строку ledger; повтор с тем же idempotency key — идемпотентный replay.

---

## 14. Entitlement actions

| Target | Допустимые actions (whitelist) |
|--------|--------------------------------|
| `UserSubscription` | `none`, `cancel_immediate`, `cancel_at(date)`, `expire_at(period_end)` |
| `UserAddon` | `none`, `cancel`, `reduce_amount(delta)`, `expire` |

- Дата прекращения доступа показывается пользователю.
- Запрет отрицательных лимитов после apply.
- Apply **после** подтверждённого refund у провайдера (кроме явных safe paths вроде `provider_unknown` handling — без silent revoke).

---

## 15. Идемпотентность, provider unknown, webhook

| Тема | Правило |
|------|---------|
| Idempotency-Key | На вызов refund к ЮKassa; повтор не создаёт второй payout |
| Timeout / unknown | Состояние `provider_unknown`; polling/get refund; **не** применять entitlement до confirmed; **не** создавать второй refund без проверки |
| Webhook `refund.succeeded` / failed | Сверка через API; идемпотентная обработка `provider_event_id`; обновление ledger + переход к entitlement_processing |
| Partial provider refund | Статус `partially_refunded` |

Сейчас в коде адаптер `refund_payment` есть, оркестрации и записи `refunded` **нет** (audit §18).

---

## 16. Audit trail и уведомления

**Audit (обязательные события):** create request, calc, admin edit (per field), approve, reject, request info, final confirm, refund submitted, refund confirmed/failed/unknown, entitlement applied/failed, notify user.

**Пользователю:** принятие заявки; запрос сведений; решение (сумма + последствия доступа); статус возврата у провайдера/банка (срок зависит от банка); отказ с основанием.

---

## 17. Специальные сценарии

| Сценарий | Авто-расчёт | Admin | Refund | Entitlement |
|----------|-------------|-------|--------|-------------|
| Двойное списание | Full по лишнему платежу | Подтвердить / скорректировать | Full лишнего | Обычно `none` на «лишнем» intent |
| Entitlement не выдан | Full paid | Подтвердить | Full | `none` |
| Недостаток услуги | Partial/full по политике | Часто edit | Partial/full | По решению |
| Техническая ошибка BotForg | Full или partial | Edit + основание | По решению | По решению |
| Chargeback | — | `chargeback_review` | Координация с провайдером | По спору |
| 24 ч / тариф | Full или time-calc §6 | Approve / edit с основанием | Full/partial | Cancel/expire |
| Addon, no pool usage | Full suggestion | Approve / edit | Full | Cancel |
| Addon, pool usage | manual_review_required | Edit с основанием | По admin | Reduce/cancel |

---

## 18. Code audit (текущее состояние)

Источники: `backend/models/checkout.py`, `backend/models/tariff.py`, `backend/models/plan.py`, `backend/services/payment_fulfillment.py`, `backend/services/checkout_intents.py`, `backend/services/tariff_limits.py`, `backend/services/tariff_message_enforcement.py`, `backend/services/tariff_admin_audit.py`, `backend/services/payment_operations_admin.py`, `backend/routers/checkout_pay.py`, `backend/payments/base.py` / `providers/yookassa.py`.

### Что уже есть

| Сущность | Полезно для refund |
|----------|-------------------|
| `CheckoutIntent` | Snapshot цены (`amount`/`currency`/`product_*`), `paid_at`/`fulfilled_at`, `fulfilled_subscription_id` / `fulfilled_addon_id`, статус `refunded` + `refunded_at` (**writer отсутствует**) |
| `PaymentAttempt` | `amount`, `provider`, `provider_payment_id`, статус `refunded` (**writer отсутствует**) |
| `PaymentWebhookEvent` | Идемпотентность событий; `refund.succeeded` в доках ЛК, **обработка в runtime не применена** к ledger |
| `UserSubscription` | Период `current_period_start/end`, статусы active/cancelled/expired |
| `UserAddon` | `amount` (единицы), период, `source`, `provider_ref` |
| `UsageCounter` | Агрегат `messages_used` / bots / members **на период пользователя**, без `user_addon_id` |
| `AdminAuditLog` | Есть для gifts/connections; **нет** refund audit actions |
| YooKassa adapter | Метод `refund_payment` (не оркестрирован) |

### Связь расхода с конкретным addon

**Нет (до ledger).** Usage — общий пул. **Утверждено:** не утверждать атрибуцию к конкретному addon; при pool usage → `manual_review_required`.
**Обязательно внедрить:** per-addon usage ledger + **FIFO**.

### Использованная часть тарифного периода

**Утверждено для тарифа:** точная time-proration по `paid_amount` + `period_start`/`period_end` + `calc_at` (§6). Capacity-based атрибуция к тарифу не является базовым авто-методом.

### Где авто-расчёт точный (при реализации)

- Тариф: формула §6 всегда (детерминированно).
- Addon без post-purchase pool usage: предложение full refund.
- Двойное списание / entitlement не выдан.

### Где нужен admin edit / manual_review

- Addon при наличии pool usage (до ledger) — **всегда** `manual_review_required`.
- Недостаток услуги / tech error / chargeback.
- `calculation_failed`.

### Чего не хватает (для 6.14+)

- Модель заявки + **revisions** + auto/final **snapshots**.
- **Refund ledger** (amount, status, idempotency, prior totals).
- Обработка webhook refund + запись `refunded`.
- **Per-addon usage ledger + FIFO** (обязательный этап).
- Audit actions refund; UI; уведомления; optimistic locking.

---

## 19. Таблица сценариев (сводка)

| Сценарий | Автоматический расчёт | Что может изменить администратор | Валидации | Refund | Entitlement action |
|----------|----------------------|----------------------------------|-----------|--------|-------------------|
| 24 ч, тариф, без usage | Full = paid − prior | Approve; reject с основанием | Cap, no double | Full | Cancel/expire |
| Тариф (общий случай) | Time-proration §6 | Сумма, дата, action (с основанием) | Cap, revision, fingerprint | Partial/full | cancel_at / immediate |
| Addon, pool usage = 0 | Предложить full | Approve / edit с основанием | Cap | Full | cancel |
| Addon, pool usage > 0 (до ledger) | **manual_review_required** + показать usage | Сумма и объём отзыва только с основанием | Cap, unused≥0, no false attribution | По решению admin | reduce/cancel |
| Addon после FIFO ledger | Точный used/unused по ledger | Edit с основанием | Cap, unused≥0 | Partial/full | reduce/cancel |
| Двойное списание | Full лишнего платежа | Approve/edit | Cap per payment | Full | none |
| Entitlement не выдан | Full | Approve | Cap | Full | none |
| Недостаток услуги | Partial suggestion | Edit + основание | Cap, visibility | Partial/full | По решению |
| Tech error | Suggestion / manual | Edit + основание | Cap | Partial/full | По решению |
| Calculation failed | — | Ручной итоговый расчёт | Все валидации | После confirm | После refund |
| Chargeback | — | chargeback_review | Отдельный процесс | По банку/провайдеру | По спору |
| Provider unknown | — | Ждать/poll; не дублировать refund | Idempotency | После confirm API | После confirmed refund |

---

## 20. Полномочия ролей

| Роль | Refund review / confirm | Примечание |
|------|-------------------------|------------|
| **owner** | Да (платформенный владелец) | Полный контур |
| **admin** | Да | Полный контур |
| **BF Администратор** | Да (как в tariff admin) | Согласовать с `require_tariff_admin` |
| Обычный **user** | Только свои заявки | Без прав approve/edit |
| Конфликт интересов | Запрет self-deal без эскалации (второй admin / owner) | См. admin guide |

---

## 21. Требования синхронизации документов

При изменении правил обновлять **одновременно**:

1. Этот документ (техника).
2. `REFUND_POLICY_DRAFT.md` (публичная политика).
3. `OFFER_REFUND_CLAUSES_DRAFT.md` (оферта).
4. UI пользователя (тексты последствий).
5. UI администратора (поля, валидации).
6. Шаблоны уведомлений.
7. Схема audit / журнал операций.

---

## 22. Открытые вопросы (блокируют ли 6.14?)

| # | Вопрос | Блокирует 6.14? |
|---|--------|-----------------|
| Q1 | Юридическое утверждение политики и оферты | **Да для production-publish**; tech spike моделей — нет |
| Q2 | Per-addon ledger + FIFO | **Решено:** обязательный следующий техэтап; до него addon с pool usage → только `manual_review_required`. Не блокирует старт 6.14 с tariff time-calc + addon manual path |
| Q3 | Классификация B2C/B2B в аккаунте | MEDIUM |
| Q4 | Точка отсчёта 24 ч | **Утверждено для проектирования: `paid_at`** |
| Q5 | Scope ledger prior refunds (intent vs payment_id) | Уточнить при моделировании RefundLedger в 6.14 |

---

## 23. Риски

| Уровень | Риск |
|---------|------|
| **BLOCKER** (для точного auto-calc addon) | Нет per-addon usage ledger + FIFO — **обязательно внедрить** следующим техэтапом |
| **HIGH** | Нет refund orchestration / money ledger; статус `refunded` не пишется; webhook refund не обрабатывается |
| **HIGH** | Admin edit / revisions / audit — проектировать с нуля в 6.14 |
| **MEDIUM** | До ledger ошибочно атрибутировать pool usage к addon (процесс запрещает) |
| **MEDIUM** | Юр. тексты — DRAFT до legal review |

---

## 24. Предлагаемый scope 6.14+ (не реализуется здесь)

1. Модели: RefundRequest + Revision + CalcSnapshot + DecisionSnapshot + RefundLedger.
2. Сервис calc тарифа (time-формула §6) + addon path (full / `manual_review_required`) + validations + optimistic lock.
3. Admin API review/edit/confirm + audit; final confirmation.
4. User API submit + status + уведомления.
5. YooKassa refund + webhook + entitlement apply (без silent revoke).
6. **Обязательно:** per-addon usage ledger + FIFO (точный auto-calc addon).
7. Синхронизация опубликованных юр. текстов после legal review.
