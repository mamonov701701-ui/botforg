import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bot,
  Check,
  Gift,
  MessageCircle,
  Package,
  RefreshCw,
  Shield,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { ApiError } from '../../../api/client';
import { getTariffSummary, type TariffSummary, type UsageBlock } from '../../../api/tariff';
import {
  addonActiveUntilLine,
  addonDetails,
  addonTitle,
  formatBillingPeriod,
  formatUsageLine,
  giftDetails,
  giftTitle,
  planSourceLabel,
  subscriptionStatusLabel,
  usageBarColor,
  usagePercent,
  warningSeverityColor,
  WARNING_TYPE_LABELS,
} from '../tariff/tariffDisplay';

const LOAD_ERROR_MESSAGE =
  'Не удалось загрузить информацию о тарифе. Попробуйте обновить страницу.';

/** BotForg primary CTA: amber bg + black text (theme --primary). */
const zoneCtaStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  marginTop: 'auto',
  padding: '8px 14px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--primary, #ffd24c)',
  color: '#000',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: 13,
  minHeight: 36,
  alignSelf: 'flex-start',
  cursor: 'pointer',
  transition: 'background 0.2s, transform 0.2s',
};

const limitActionStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  marginTop: 10,
  padding: '8px 14px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--primary, #ffd24c)',
  color: '#000',
  fontWeight: 600,
  fontSize: 13,
  textDecoration: 'none',
  minHeight: 36,
  cursor: 'pointer',
  transition: 'background 0.2s, transform 0.2s',
};

function primaryCtaHoverHandlers(disabled?: boolean) {
  if (disabled) return {};
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.currentTarget.style.background = 'var(--primary-hover, #ffc107)';
      e.currentTarget.style.transform = 'translateY(-1px)';
    },
    onMouseLeave: (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.currentTarget.style.background = 'var(--primary, #ffd24c)';
      e.currentTarget.style.transform = 'translateY(0)';
    },
    onFocus: (e: React.FocusEvent<HTMLAnchorElement>) => {
      e.currentTarget.style.outline = '2px solid var(--primary, #ffd24c)';
      e.currentTarget.style.outlineOffset = '2px';
    },
    onBlur: (e: React.FocusEvent<HTMLAnchorElement>) => {
      e.currentTarget.style.outline = 'none';
    },
  };
}

function UsageLimitCard({
  title,
  icon: Icon,
  block,
  testId,
  action,
  actionNote,
}: {
  title: string;
  icon: LucideIcon;
  block: UsageBlock;
  testId: string;
  action?: { label: string; to: string; testId: string };
  actionNote?: string;
}) {
  const pct = usagePercent(block);
  return (
    <Card>
      <div
        data-testid={testId}
        style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}
      >
        <Icon size={22} style={{ color: 'var(--primary)' }} />
        <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>{title}</h3>
        {pct !== null && (
          <span
            data-testid={`${testId}-percent`}
            style={{
              marginLeft: 'auto',
              fontSize: '14px',
              fontWeight: 700,
              color: pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : 'var(--text-muted)',
            }}
          >
            {pct}%
          </span>
        )}
      </div>
      <p
        data-testid={`${testId}-usage`}
        style={{ fontSize: '15px', marginBottom: '10px', color: 'var(--text)' }}
      >
        {formatUsageLine(block)}
      </p>
      {pct !== null && (
        <div
          style={{
            height: '8px',
            borderRadius: '4px',
            background: 'rgba(255, 255, 255, 0.08)',
            overflow: 'hidden',
          }}
        >
          <div
            data-testid={`${testId}-bar`}
            style={{
              height: '100%',
              width: `${pct}%`,
              borderRadius: '4px',
              background: usageBarColor(pct),
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      )}
      {actionNote ? (
        <p
          data-testid={`${testId}-action-note`}
          style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-muted)' }}
        >
          {actionNote}
        </p>
      ) : null}
      {action ? (
        <Link
          to={action.to}
          data-testid={action.testId}
          className="bf-primary-cta"
          style={limitActionStyle}
          {...primaryCtaHoverHandlers()}
        >
          {action.label}
        </Link>
      ) : null}
    </Card>
  );
}

function FlagRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 0',
        borderBottom: '1px solid var(--color-border-accent-muted)',
      }}
    >
      <span style={{ fontSize: '15px' }}>{label}</span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '14px',
          fontWeight: 600,
          color: enabled ? '#10b981' : 'var(--text-muted)',
        }}
      >
        {enabled ? <Check size={16} /> : <X size={16} />}
        {enabled ? 'Доступно' : 'Недоступно'}
      </span>
    </div>
  );
}

export default function TariffLimitsPage() {
  const [summary, setSummary] = useState<TariffSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTariffSummary();
      setSummary(data);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setError('Требуется вход в аккаунт. Обновите страницу или войдите снова.');
      } else if (e instanceof ApiError && e.status === 403) {
        setError('Нет доступа к информации о тарифе.');
      } else {
        setError(LOAD_ERROR_MESSAGE);
      }
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refreshButton = (
    <button
      type="button"
      onClick={() => load()}
      disabled={loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 16px',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        color: 'var(--text)',
        fontSize: '14px',
        fontWeight: 600,
        cursor: loading ? 'wait' : 'pointer',
      }}
    >
      <RefreshCw size={16} />
      Обновить
    </button>
  );

  return (
    <DashboardPage
      title="Финансы и лимиты"
      subtitle="Текущий тариф, использование лимитов и активные начисления. Только просмотр."
      actions={refreshButton}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {loading && !summary && (
          <Card>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Загрузка данных о тарифе…</p>
          </Card>
        )}

        {error && (
          <Card style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <AlertTriangle size={22} style={{ color: '#ef4444', flexShrink: 0 }} />
              <div>
                <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Ошибка загрузки</p>
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>{error}</p>
              </div>
            </div>
          </Card>
        )}

        {summary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div data-testid="tariff-current-plan">
              <Card>
                <h2
                  style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 12px' }}
                  data-testid="tariff-accruals-title"
                >
                  Тариф и начисления
                </h2>

                <div
                  data-testid="tariff-accruals-zones"
                  className="tariff-accruals-zones"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: 12,
                    alignItems: 'stretch',
                  }}
                >
                  <style>{`
                    @media (max-width: 860px) {
                      .tariff-accruals-zones {
                        grid-template-columns: 1fr !important;
                      }
                    }
                  `}</style>

                  <div
                    data-testid="tariff-plan-zone"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      padding: 12,
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      minWidth: 0,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
                      Текущий тариф
                    </div>
                    <div
                      data-testid="tariff-plan-name"
                      style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.25 }}
                    >
                      {summary.current_plan.name}
                    </div>
                    <div
                      style={{ fontSize: 13, color: 'var(--text-muted)' }}
                      data-testid="tariff-plan-period"
                    >
                      Период: {formatBillingPeriod(summary.current_plan.billing_period)}
                    </div>
                    {summary.current_plan.source &&
                      summary.current_plan.source !== 'legacy_plan_code' && (
                        <div
                          style={{ fontSize: 12, color: 'var(--text-muted)' }}
                          data-testid="tariff-plan-source"
                        >
                          {planSourceLabel(summary.current_plan.source)}
                        </div>
                      )}
                    {summary.current_plan.subscription_status && (
                      <div
                        style={{ fontSize: 13, color: 'var(--text-muted)' }}
                        data-testid="tariff-plan-status"
                      >
                        {subscriptionStatusLabel(summary.current_plan.subscription_status)}
                      </div>
                    )}
                    <Link
                      to="/pricing?tab=tariffs"
                      data-testid="tariff-change-plan-link"
                      className="bf-primary-cta"
                      style={zoneCtaStyle}
                      {...primaryCtaHoverHandlers()}
                    >
                      Сменить тариф
                    </Link>
                  </div>

                  <div
                    data-testid="tariff-active-addons"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      padding: 12,
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Package size={15} style={{ color: 'var(--primary)' }} />
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
                        Активные доп. пакеты
                      </div>
                    </div>
                    {summary.active_addons.length === 0 ? (
                      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
                        Активных пакетов нет
                      </p>
                    ) : (
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {summary.active_addons.map((item, i) => (
                          <li
                            key={String(item.id ?? i)}
                            data-testid={`tariff-owned-addon-${String(item.code ?? item.id ?? i)}`}
                            style={{
                              padding: '6px 0',
                              borderBottom:
                                i < summary.active_addons.length - 1
                                  ? '1px solid var(--color-border-accent-muted)'
                                  : undefined,
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{addonTitle(item)}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {addonDetails(item)}
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#10b981',
                                marginTop: 2,
                              }}
                              data-testid={`tariff-owned-addon-until-${String(item.code ?? item.id ?? i)}`}
                            >
                              {addonActiveUntilLine(item)}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <Link
                      to="/pricing?tab=addons"
                      data-testid="tariff-buy-addons-link"
                      className="bf-primary-cta"
                      style={zoneCtaStyle}
                      {...primaryCtaHoverHandlers()}
                    >
                      Купить доп. пакет
                    </Link>
                  </div>

                  <div
                    data-testid="tariff-active-gifts"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      padding: 12,
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Gift size={15} style={{ color: 'var(--primary)' }} />
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
                        Активные подарки
                      </div>
                    </div>
                    {summary.active_gifts.length === 0 ? (
                      <p
                        data-testid="tariff-gifts-empty"
                        style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}
                      >
                        Нет активных подарков
                      </p>
                    ) : (
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {summary.active_gifts.map((item, i) => (
                          <li
                            key={String(item.id ?? i)}
                            style={{
                              padding: '6px 0',
                              borderBottom:
                                i < summary.active_gifts.length - 1
                                  ? '1px solid var(--color-border-accent-muted)'
                                  : undefined,
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{giftTitle(item)}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {giftDetails(item)}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '16px',
              }}
              data-testid="tariff-limits-grid"
            >
              <UsageLimitCard
                title="Сообщения"
                icon={MessageCircle}
                block={summary.messages}
                testId="tariff-usage-messages"
                action={{
                  label: 'Увеличить лимит',
                  to: '/pricing?tab=addons',
                  testId: 'tariff-messages-increase-limit',
                }}
              />
              <UsageLimitCard
                title="Активные боты"
                icon={Bot}
                block={summary.active_bots}
                testId="tariff-usage-bots"
                action={{
                  label: 'Увеличить лимит',
                  to: '/pricing?tab=addons',
                  testId: 'tariff-bots-increase-limit',
                }}
              />
              <UsageLimitCard
                title="Участники команды"
                icon={Users}
                block={summary.team_members}
                testId="tariff-usage-team"
                actionNote={
                  summary.team_members.limit != null && summary.team_members.limit <= 0
                    ? 'Команда недоступна'
                    : undefined
                }
                action={
                  summary.team_members.limit != null && summary.team_members.limit <= 0
                    ? {
                        label: 'Выбрать тариф',
                        to: '/pricing?tab=tariffs',
                        testId: 'tariff-team-choose-plan',
                      }
                    : {
                        label: 'Управлять командой',
                        to: '/dashboard/team',
                        testId: 'tariff-team-manage',
                      }
                }
              />
            </div>

            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              data-testid="tariff-finance-actions"
            >
              <div data-testid="tariff-purchases-nav">
                <Card>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 4px' }}>
                        Мои покупки
                      </h2>
                      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>
                        История оплат тарифов и дополнительных пакетов.
                      </p>
                    </div>
                    <Link
                      to="/dashboard/finance/purchases"
                      data-testid="tariff-open-purchases"
                      style={{
                        padding: '10px 16px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        textDecoration: 'none',
                        fontWeight: 600,
                        fontSize: '14px',
                        minHeight: 44,
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      Мои покупки
                    </Link>
                  </div>
                </Card>
              </div>

              <div data-testid="tariff-refunds-nav">
                <Card>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 4px' }}>
                        Заявки на возврат
                      </h2>
                      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>
                        Просмотр статуса заявок и оформление возврата.
                      </p>
                    </div>
                    <Link
                      to="/dashboard/finance/refunds"
                      data-testid="tariff-open-refunds"
                      style={{
                        padding: '10px 16px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        textDecoration: 'none',
                        fontWeight: 600,
                        fontSize: '14px',
                        minHeight: 44,
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      Открыть возвраты
                    </Link>
                  </div>
                </Card>
              </div>
            </div>

            <div data-testid="tariff-warnings">
              <Card>
                <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
                  Предупреждения
                </h2>
                {summary.warnings.length === 0 ? (
                  <p
                    style={{
                      margin: 0,
                      color: '#10b981',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <Check size={18} />
                    Лимиты в норме
                  </p>
                ) : (
                  <ul
                    style={{
                      listStyle: 'none',
                      margin: 0,
                      padding: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    {summary.warnings.map((w, i) => (
                      <li
                        key={`${w.type}-${w.threshold}-${i}`}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          background: `${warningSeverityColor(w.threshold)}18`,
                          borderLeft: `4px solid ${warningSeverityColor(w.threshold)}`,
                        }}
                      >
                        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                          {WARNING_TYPE_LABELS[w.type] ?? 'Лимит'} · {w.threshold}%
                        </div>
                        <div style={{ fontSize: '14px' }}>{w.message}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div data-testid="tariff-capabilities">
              <Card>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '12px',
                  }}
                >
                  <Shield size={20} style={{ color: 'var(--primary)' }} />
                  <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
                    Возможности тарифа
                  </h2>
                </div>
                <FlagRow label="Маркетплейс" enabled={summary.flags.marketplace_access} />
                <FlagRow label="Публикация шаблонов" enabled={summary.flags.template_publish} />
                <FlagRow label="Публикация сценариев" enabled={summary.flags.scenario_publish} />
                <FlagRow label="Экспорт отчётов" enabled={summary.flags.export_reports} />
                <FlagRow label="Приоритетная поддержка" enabled={summary.flags.priority_support} />
              </Card>
            </div>
          </div>
        )}

        {!summary && !loading && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            data-testid="tariff-finance-actions-fallback"
          >
            <div data-testid="tariff-purchases-nav">
              <Card>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 4px' }}>
                      Мои покупки
                    </h2>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>
                      История оплат тарифов и дополнительных пакетов.
                    </p>
                  </div>
                  <Link
                    to="/dashboard/finance/purchases"
                    data-testid="tariff-open-purchases"
                    style={{
                      padding: '10px 16px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      textDecoration: 'none',
                      fontWeight: 600,
                      fontSize: '14px',
                      minHeight: 44,
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    Мои покупки
                  </Link>
                </div>
              </Card>
            </div>
            <div data-testid="tariff-refunds-nav">
              <Card>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 4px' }}>
                      Заявки на возврат
                    </h2>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>
                      Просмотр статуса заявок и оформление возврата.
                    </p>
                  </div>
                  <Link
                    to="/dashboard/finance/refunds"
                    data-testid="tariff-open-refunds"
                    style={{
                      padding: '10px 16px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      textDecoration: 'none',
                      fontWeight: 600,
                      fontSize: '14px',
                      minHeight: 44,
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    Открыть возвраты
                  </Link>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </DashboardPage>
  );
}
