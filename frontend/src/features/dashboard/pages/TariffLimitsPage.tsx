import React, { useCallback, useEffect, useState } from 'react';
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
  addonDetails,
  addonTitle,
  formatBillingPeriod,
  formatUsageLine,
  giftDetails,
  giftTitle,
  planSourceLabel,
  subscriptionStatusLabel,
  usagePercent,
  warningSeverityColor,
  WARNING_TYPE_LABELS,
} from '../tariff/tariffDisplay';

const LOAD_ERROR_MESSAGE =
  'Не удалось загрузить информацию о тарифе. Попробуйте обновить страницу.';

function UsageLimitCard({
  title,
  icon: Icon,
  block,
}: {
  title: string;
  icon: LucideIcon;
  block: UsageBlock;
}) {
  const pct = usagePercent(block);
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <Icon size={22} style={{ color: 'var(--primary)' }} />
        <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>{title}</h3>
      </div>
      <p style={{ fontSize: '15px', marginBottom: '12px', color: 'var(--text)' }}>
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
            style={{
              height: '100%',
              width: `${pct}%`,
              borderRadius: '4px',
              background:
                pct >= 95
                  ? 'linear-gradient(90deg, #f97316, #ef4444)'
                  : pct >= 85
                    ? 'linear-gradient(90deg, #f59e0b, #f97316)'
                    : 'var(--primary)',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      )}
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
          <Card>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '12px' }}>
              Текущий тариф
            </h2>
            <p style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 8px' }}>
              {summary.current_plan.name}
            </p>
            <p style={{ margin: '0 0 4px', color: 'var(--text-muted)', fontSize: '14px' }}>
              Код: {summary.current_plan.code}
            </p>
            <p style={{ margin: '0 0 4px', color: 'var(--text-muted)', fontSize: '14px' }}>
              Источник: {planSourceLabel(summary.current_plan.source)}
            </p>
            {summary.current_plan.subscription_status && (
              <p style={{ margin: '0 0 4px', color: 'var(--text-muted)', fontSize: '14px' }}>
                Статус подписки: {subscriptionStatusLabel(summary.current_plan.subscription_status)}
              </p>
            )}
            <p style={{ margin: '12px 0 0', fontSize: '14px', color: 'var(--text-muted)' }}>
              Период: {formatBillingPeriod(summary.current_plan.billing_period)}
            </p>
          </Card>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px',
            }}
          >
            <UsageLimitCard title="Сообщения" icon={MessageCircle} block={summary.messages} />
            <UsageLimitCard title="Активные боты" icon={Bot} block={summary.active_bots} />
            <UsageLimitCard title="Участники команды" icon={Users} block={summary.team_members} />
          </div>

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

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px',
            }}
          >
            <Card>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}
              >
                <Package size={20} style={{ color: 'var(--primary)' }} />
                <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Активные пакеты</h2>
              </div>
              {summary.active_addons.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>Активных пакетов нет</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {summary.active_addons.map((item, i) => (
                    <li
                      key={String(item.id ?? i)}
                      style={{
                        padding: '10px 0',
                        borderBottom:
                          i < summary.active_addons.length - 1
                            ? '1px solid var(--color-border-accent-muted)'
                            : undefined,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{addonTitle(item)}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        {addonDetails(item)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}
              >
                <Gift size={20} style={{ color: 'var(--primary)' }} />
                <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Активные подарки</h2>
              </div>
              {summary.active_gifts.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>Активных подарков нет</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {summary.active_gifts.map((item, i) => (
                    <li
                      key={String(item.id ?? i)}
                      style={{
                        padding: '10px 0',
                        borderBottom:
                          i < summary.active_gifts.length - 1
                            ? '1px solid var(--color-border-accent-muted)'
                            : undefined,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{giftTitle(item)}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        {giftDetails(item)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}
            >
              <Shield size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Возможности тарифа</h2>
            </div>
            <FlagRow label="Маркетплейс" enabled={summary.flags.marketplace_access} />
            <FlagRow label="Публикация шаблонов" enabled={summary.flags.template_publish} />
            <FlagRow label="Публикация сценариев" enabled={summary.flags.scenario_publish} />
            <FlagRow label="Экспорт отчётов" enabled={summary.flags.export_reports} />
            <FlagRow label="Приоритетная поддержка" enabled={summary.flags.priority_support} />
          </Card>
        </div>
      )}
    </DashboardPage>
  );
}
