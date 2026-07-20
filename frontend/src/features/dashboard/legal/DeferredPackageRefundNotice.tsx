import React, { useState } from 'react';
import { toast } from '../../../utils/toast';
import { LEGAL_COLORS, legalPrimaryBtnStyle, legalSecondaryBtnStyle } from './legalHelpers';
import {
  DEFERRED_PACKAGE_REFUND_FULL_TEXT,
  DEFERRED_PACKAGE_REFUND_NEXT_ACTION,
  DEFERRED_PACKAGE_REFUND_STATUS,
  DEFERRED_PACKAGE_REFUND_SUBTITLE,
  DEFERRED_PACKAGE_REFUND_SUMMARY,
  DEFERRED_PACKAGE_REFUND_TITLE,
} from './deferredPackageRefundContext';

const sectionTitleStyle: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: 15,
  fontWeight: 600,
  color: LEGAL_COLORS.text,
};

const sectionBodyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.55,
  color: LEGAL_COLORS.text,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const listStyle: React.CSSProperties = {
  margin: '8px 0 0',
  paddingLeft: 20,
  fontSize: 14,
  lineHeight: 1.55,
  color: LEGAL_COLORS.text,
};

function BulletList({ items }: { items: string[] }) {
  return (
    <ul style={listStyle}>
      {items.map(item => (
        <li key={item} style={{ marginBottom: 4 }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function DeferredPackageRefundNotice() {
  const [expanded, setExpanded] = useState(false);
  const [copyHint, setCopyHint] = useState('');

  const onCopy = async () => {
    setCopyHint('');
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('clipboard unavailable');
      }
      await navigator.clipboard.writeText(DEFERRED_PACKAGE_REFUND_FULL_TEXT);
      setCopyHint('Контекст скопирован');
      toast.success('Контекст скопирован');
    } catch {
      const msg = 'Не удалось скопировать контекст. Скопируйте текст вручную.';
      setCopyHint(msg);
      toast.error(msg);
    }
  };

  return (
    <aside
      data-testid="legal-deferred-package-refund-notice"
      style={{
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        marginBottom: 16,
        padding: 16,
        borderRadius: 12,
        border: `1px solid ${LEGAL_COLORS.accentBorder}`,
        background: LEGAL_COLORS.accentSoftBg,
        overflowWrap: 'anywhere',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          data-testid="legal-deferred-notice-title"
          style={{ fontSize: 16, fontWeight: 700, color: LEGAL_COLORS.text }}
        >
          {DEFERRED_PACKAGE_REFUND_TITLE}
        </div>
        <div
          data-testid="legal-deferred-notice-subtitle"
          style={{ fontSize: 14, fontWeight: 600, color: LEGAL_COLORS.text }}
        >
          {DEFERRED_PACKAGE_REFUND_SUBTITLE}
        </div>
        <div
          data-testid="legal-deferred-notice-status"
          style={{ fontSize: 13, color: LEGAL_COLORS.textSecondary }}
        >
          {DEFERRED_PACKAGE_REFUND_STATUS}
        </div>
        <p
          data-testid="legal-deferred-notice-summary"
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.5,
            color: LEGAL_COLORS.text,
          }}
        >
          {DEFERRED_PACKAGE_REFUND_SUMMARY}
        </p>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            marginTop: 4,
          }}
        >
          <button
            type="button"
            data-testid="legal-deferred-notice-toggle"
            style={legalSecondaryBtnStyle}
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? 'Скрыть подробности' : 'Показать подробности'}
          </button>
          <button
            type="button"
            data-testid="legal-deferred-notice-copy"
            style={legalPrimaryBtnStyle}
            onClick={() => void onCopy()}
          >
            Скопировать контекст
          </button>
          {copyHint ? (
            <span
              data-testid="legal-deferred-notice-copy-hint"
              style={{ fontSize: 13, color: LEGAL_COLORS.textSecondary }}
            >
              {copyHint}
            </span>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div
          data-testid="legal-deferred-notice-details"
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: `1px solid ${LEGAL_COLORS.accentBorder}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <section data-testid="legal-deferred-section-context">
            <h3 style={sectionTitleStyle}>Контекст</h3>
            <p style={sectionBodyStyle}>
              В BotForg уже реализована техническая основа для точного учёта приобретённых
              дополнений и возвратов:
            </p>
            <BulletList
              items={[
                'FIFO-учёт приобретённых единиц;',
                'хранение стоимости и происхождения каждой партии единиц;',
                'резервирование единиц при создании заявки на возврат;',
                'защита от повторного возврата одних и тех же единиц;',
                'учёт использованных и оставшихся единиц;',
                'сохранение снимка покупки;',
                'сохранение версий оферты и политики возвратов;',
                'подготовлены поля refund_formula_version и price_grid_snapshot.',
              ]}
            />
            <p style={{ ...sectionBodyStyle, marginTop: 8 }}>
              При этом окончательная финансовая формула возврата для пакетов со скидкой пока не
              должна использоваться в production.
            </p>
          </section>

          <section data-testid="legal-deferred-section-why">
            <h3 style={sectionTitleStyle}>Почему подэтап отложен</h3>
            <p style={sectionBodyStyle}>
              При покупке большого пакета цена одной единицы обычно ниже, чем при покупке маленького
              пакета.
            </p>
            <p style={{ ...sectionBodyStyle, marginTop: 8 }}>
              Если пользователь частично использовал большой пакет, нельзя без юридически
              утверждённого правила просто вернуть стоимость оставшихся единиц по средней цене
              большого пакета.
            </p>
            <p style={{ ...sectionBodyStyle, marginTop: 8 }}>
              В зависимости от утверждённой бизнес-модели может потребоваться:
            </p>
            <BulletList
              items={[
                'пересчитать фактически использованные единицы по стоимости меньшего подходящего пакета;',
                'удержать предоставленную пакетную скидку;',
                'вернуть разницу между оплаченной суммой и стоимостью фактически использованного объёма;',
                'применить другой метод, утверждённый владельцем платформы и юристом.',
              ]}
            />
            <p style={{ ...sectionBodyStyle, marginTop: 8 }}>
              Без закреплённого правила автоматический расчёт может привести к:
            </p>
            <BulletList
              items={[
                'финансовым потерям платформы;',
                'неоднозначным расчётам;',
                'спорам с пользователями;',
                'расхождению расчёта с публичной офертой;',
                'изменению условий задним числом.',
              ]}
            />
          </section>

          <section data-testid="legal-deferred-section-prerequisites">
            <h3 style={sectionTitleStyle}>Что необходимо сделать до реализации</h3>
            <ol style={listStyle}>
              <li style={{ marginBottom: 10 }}>
                Зарегистрировать ИП или ООО, от имени которого BotForg будет принимать оплату.
              </li>
              <li style={{ marginBottom: 10 }}>
                Утвердить финальную тарифную сетку:
                <BulletList
                  items={[
                    'названия тарифов;',
                    'стоимость тарифов;',
                    'размеры пакетов дополнений;',
                    'стоимость каждого пакета;',
                    'количество единиц в каждом пакете;',
                    'стоимость единицы внутри пакета;',
                    'правила пакетных скидок;',
                    'срок действия приобретённых единиц;',
                    'правила использования остатков;',
                    'правила бонусных и подарочных единиц.',
                  ]}
                />
              </li>
              <li style={{ marginBottom: 10 }}>
                Совместно с юристом утвердить метод расчёта возврата:
                <BulletList
                  items={[
                    'полный возврат;',
                    'частичный возврат;',
                    'возврат неиспользованных единиц;',
                    'пересчёт пакетной скидки;',
                    'порядок округления денежных значений;',
                    'минимальную сумму возврата;',
                    'случаи отказа в возврате;',
                    'правила возврата бонусных и подарочных единиц;',
                    'правила для единиц из нескольких партий;',
                    'правила для старых покупок после изменения тарифов.',
                  ]}
                />
              </li>
              <li style={{ marginBottom: 10 }}>
                Внести утверждённые правила в:
                <BulletList
                  items={[
                    'публичную оферту;',
                    'политику возвратов;',
                    'описание тарифов и дополнений;',
                    'форму подтверждения покупки;',
                    'административную документацию BotForg.',
                  ]}
                />
              </li>
              <li style={{ marginBottom: 10 }}>
                Опубликовать финальные утверждённые редакции документов через раздел «Юридические
                документы».
              </li>
            </ol>
          </section>

          <section data-testid="legal-deferred-section-implement">
            <h3 style={sectionTitleStyle}>Что нужно реализовать после выполнения условий</h3>
            <ol style={listStyle}>
              <li style={{ marginBottom: 10 }}>
                Зафиксировать утверждённую формулу возврата в отдельной версии:
                <div style={{ marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>
                  refund_formula_version.
                </div>
              </li>
              <li style={{ marginBottom: 10 }}>
                Зафиксировать версию тарифной сетки:
                <div style={{ marginTop: 4 }}>
                  price_grid_version или эквивалентный неизменяемый идентификатор.
                </div>
              </li>
              <li style={{ marginBottom: 10 }}>
                При каждой покупке сохранять неизменяемый snapshot:
                <BulletList
                  items={[
                    'версию оферты;',
                    'версию политики возвратов;',
                    'версию тарифной сетки;',
                    'тип приобретённого тарифа или пакета;',
                    'размер пакета;',
                    'количество приобретённых единиц;',
                    'цену пакета;',
                    'стоимость одной единицы;',
                    'размер применённой скидки;',
                    'валюту;',
                    'правила округления;',
                    'версию формулы возврата.',
                  ]}
                />
              </li>
              <li style={{ marginBottom: 10 }}>
                При создании заявки на возврат использовать только условия, действовавшие на момент
                конкретной покупки.
                <p style={{ ...sectionBodyStyle, marginTop: 6 }}>
                  Новые тарифы, новые документы и новая формула не должны изменять расчёт по ранее
                  совершённой покупке.
                </p>
              </li>
              <li style={{ marginBottom: 10 }}>
                Реализовать расчёт возврата, который определяет:
                <BulletList
                  items={[
                    'исходную сумму покупки;',
                    'фактически использованный объём;',
                    'неиспользованный объём;',
                    'партии FIFO, из которых списывались единицы;',
                    'стоимость фактически использованного объёма;',
                    'размер восстановленной или удержанной пакетной скидки;',
                    'сумму, доступную к возврату;',
                    'причину ограничения или отказа;',
                    'понятное объяснение расчёта для пользователя;',
                    'подробное объяснение расчёта для администратора.',
                  ]}
                />
              </li>
              <li style={{ marginBottom: 10 }}>
                Сохранять неизменяемый snapshot расчёта возврата:
                <BulletList
                  items={[
                    'входные значения;',
                    'идентификаторы и значения партий FIFO;',
                    'применённую тарифную сетку;',
                    'версию формулы;',
                    'промежуточные суммы;',
                    'размер скидки;',
                    'правила округления;',
                    'итоговую сумму;',
                    'дату расчёта;',
                    'инициатора расчёта.',
                  ]}
                />
              </li>
              <li style={{ marginBottom: 10 }}>
                Не пересчитывать старую заявку автоматически после:
                <BulletList
                  items={[
                    'изменения тарифов;',
                    'изменения оферты;',
                    'изменения политики возвратов;',
                    'выпуска новой версии формулы.',
                  ]}
                />
                <p style={{ ...sectionBodyStyle, marginTop: 6 }}>
                  Повторный расчёт должен быть отдельным контролируемым действием с сохранением
                  новой версии результата и истории изменений.
                </p>
              </li>
              <li style={{ marginBottom: 10 }}>
                Добавить тесты:
                <BulletList
                  items={[
                    'полный возврат полностью неиспользованного пакета;',
                    'частичный возврат;',
                    'полностью использованный пакет;',
                    'использование единиц из нескольких FIFO-партий;',
                    'смешение пакетов с разной стоимостью;',
                    'покупка до изменения тарифов;',
                    'возврат после изменения тарифов;',
                    'изменение формулы после покупки;',
                    'бонусные единицы;',
                    'подарочные единицы;',
                    'повторная заявка;',
                    'конкурентные заявки;',
                    'резервирование единиц;',
                    'освобождение резерва после отмены;',
                    'денежное округление;',
                    'идемпотентный повторный расчёт;',
                    'невозможность изменить завершённый расчёт задним числом.',
                  ]}
                />
              </li>
              <li style={{ marginBottom: 10 }}>
                Провести sandbox-проверку:
                <BulletList
                  items={[
                    'полный возврат;',
                    'частичный возврат;',
                    'provider pending;',
                    'provider succeeded;',
                    'повторный webhook;',
                    'recovery после временной ошибки;',
                    'корректное изменение entitlement после возврата.',
                  ]}
                />
              </li>
            </ol>
          </section>

          <section data-testid="legal-deferred-section-forbidden">
            <h3 style={sectionTitleStyle}>Запрещено до выполнения условий</h3>
            <p style={sectionBodyStyle}>
              До регистрации компании, утверждения тарифов и получения финального юридического
              заключения запрещено:
            </p>
            <BulletList
              items={[
                'включать автоматическую формулу возврата пакетной скидки в production;',
                'выполнять расчёт по текущей тарифной сетке вместо snapshot покупки;',
                'менять формулу задним числом для старых покупок;',
                'применять новые правила возврата к старым покупкам;',
                'запускать реальные возвраты по неутверждённой формуле;',
                'удалять или перезаписывать старые snapshots расчёта.',
              ]}
            />
          </section>

          <section data-testid="legal-deferred-section-prepared">
            <h3 style={sectionTitleStyle}>Что уже подготовлено в проекте</h3>
            <p style={sectionBodyStyle}>В проекте уже подготовлены связанные элементы:</p>
            <BulletList
              items={[
                'FIFO ledger дополнений;',
                'резервирование единиц;',
                'расчёт доступного остатка;',
                'заявки пользователей на возврат;',
                'административное рассмотрение заявок;',
                'безопасное выполнение возврата через платёжного провайдера;',
                'webhook reconciliation;',
                'изменение entitlement после возврата;',
                'audit timeline;',
                'версионирование юридических документов;',
                'snapshot версий юридических документов в покупке;',
                'поля refund_formula_version и price_grid_snapshot.',
              ]}
            />
            <p style={{ ...sectionBodyStyle, marginTop: 8 }}>
              При продолжении нельзя создавать дублирующие модели и сервисы. Нужно сначала
              использовать уже существующие механизмы.
            </p>
          </section>

          <section data-testid="legal-deferred-section-next">
            <h3 style={sectionTitleStyle}>Следующее действие</h3>
            <pre
              data-testid="legal-deferred-next-action-text"
              style={{
                margin: 0,
                padding: 12,
                borderRadius: 8,
                border: `1px solid ${LEGAL_COLORS.accentBorder}`,
                background: LEGAL_COLORS.panelBgElevated,
                fontSize: 13,
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'inherit',
                color: LEGAL_COLORS.text,
              }}
            >
              {DEFERRED_PACKAGE_REFUND_NEXT_ACTION}
            </pre>
          </section>
        </div>
      ) : null}
    </aside>
  );
}
