# Этап 6.14.10В-2 — frontend: ответ пользователя на needs_information

## Пользовательская форма

На `RefundRequestDetailPage` форма «Ответить администратору» видна **только** при
`status === needs_information`.

- textarea до 2000 символов + счётчик;
- кнопка disabled при пустом trim / во время отправки;
- `POST /me/refund-requests/{id}/provide-information` с `expected_version`;
- после успеха: toast, detail из ответа API, форма скрыта, статус
  `awaiting_admin_review`, history обновлена.

Старый текст про «поддержку» убран из подсказки статуса.

## Ошибки

| Код | UI |
|-----|-----|
| 409 (`version_conflict` / `invalid_status_for_reply`) | обновить detail, toast без raw API |
| 422 | сообщение валидации у формы |
| прочее | `safeRefundErrorMessage` |

## История пользователя

Событие приходит в `status_history` с заголовком
«Дополнительная информация отправлена». Отдельный блок чата не создаётся.

## Admin

В «Истории решений» (`audit_timeline`):

- заголовок из backend title;
- переход needs_information → awaiting_admin_review;
- многострочный `reason` отдельно;
- `user_comment` при создании заявки не заменяется.

## Вне scope

Чат, inbox, вложения, polling, backend-изменения.
