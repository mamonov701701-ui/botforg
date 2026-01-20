import React, { useState, useEffect } from 'react';
import {
  Download,
  Users,
  MessageCircle,
  Bot,
  Workflow,
  Calendar,
  BarChart3,
  PieChart,
  LineChart,
  TrendingUp,
  Filter,
  Plus,
  X,
  Check,
  Clock,
  Activity,
  UserPlus,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Zap,
  Target,
} from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { useAuthStore } from '../../../stores/authStore';
import { hasAccessToAction } from '../../../constants/roles';
import {
  getDashboardData,
  getMarketingAnalytics,
  type DashboardData,
  type MarketingAnalytics,
} from '../../../api/analytics';
import { getBots, type Bot as BotType } from '../../../api/bot';
import { toast } from '../../../utils/toast';

type PeriodType = '7d' | '30d' | '90d' | 'custom';
type ChartType = 'bar' | 'line' | 'pie';
type TabType = 'overview' | 'users' | 'messages' | 'retention' | 'growth';

interface Widget {
  id: string;
  title: string;
  type: ChartType;
  dataKey: string;
  visible: boolean;
}

const defaultWidgets: Widget[] = [
  {
    id: 'hourly-users',
    title: 'Активность пользователей (24ч)',
    type: 'line',
    dataKey: 'hourly_users',
    visible: true,
  },
  {
    id: 'hourly-messages',
    title: 'Сообщения по часам (24ч)',
    type: 'bar',
    dataKey: 'hourly_messages',
    visible: true,
  },
  {
    id: 'daily-new-users',
    title: 'Новые пользователи',
    type: 'bar',
    dataKey: 'daily_new_users',
    visible: true,
  },
  {
    id: 'daily-active',
    title: 'Активные пользователи',
    type: 'line',
    dataKey: 'daily_active',
    visible: true,
  },
  {
    id: 'daily-messages',
    title: 'Сообщения по дням',
    type: 'bar',
    dataKey: 'daily_messages',
    visible: true,
  },
  {
    id: 'retention-pie',
    title: 'Удержание пользователей',
    type: 'pie',
    dataKey: 'retention',
    visible: true,
  },
  {
    id: 'messages-direction',
    title: 'Входящие / Исходящие',
    type: 'pie',
    dataKey: 'messages_direction',
    visible: true,
  },
  { id: 'bots-stats', title: 'Статистика ботов', type: 'pie', dataKey: 'bots', visible: true },
];

export default function AnalyticsPage() {
  const { user } = useAuthStore();
  const [period, setPeriod] = useState<PeriodType>('30d');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [marketing, setMarketing] = useState<MarketingAnalytics | null>(null);
  const [bots, setBots] = useState<BotType[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<number | undefined>(undefined);
  const [widgets, setWidgets] = useState<Widget[]>(defaultWidgets);
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const periodDays: Record<PeriodType, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    custom: 0,
  };

  useEffect(() => {
    loadData();
  }, [period, customDateFrom, customDateTo, selectedBotId]);

  const calculateCustomDays = () => {
    if (!customDateFrom || !customDateTo) return 30;
    const from = new Date(customDateFrom);
    const to = new Date(customDateTo);
    const diff = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(1, Math.min(diff, 365));
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const days = period === 'custom' ? calculateCustomDays() : periodDays[period];
      console.log('[AnalyticsPage] Loading data with days:', days, 'selectedBotId:', selectedBotId);
      const [analyticsData, botsData, marketingData] = await Promise.all([
        getDashboardData(days),
        getBots(),
        getMarketingAnalytics(days, selectedBotId),
      ]);
      console.log('[AnalyticsPage] Dashboard data:', analyticsData);
      console.log('[AnalyticsPage] Marketing data:', marketingData);
      console.log('[AnalyticsPage] Marketing retention:', marketingData?.retention);
      setData(analyticsData);
      setBots(botsData.items || []);
      setMarketing(marketingData);
    } catch (error: any) {
      console.error('Failed to load analytics:', error);
      toast.error('Не удалось загрузить аналитику');
    } finally {
      setLoading(false);
    }
  };

  const canExport = hasAccessToAction(user?.role, 'transactions_export');

  const handleExport = () => {
    toast.info('Экспорт будет доступен в следующей версии');
  };

  const toggleWidget = (id: string) => {
    setWidgets(prev => prev.map(w => (w.id === id ? { ...w, visible: !w.visible } : w)));
  };

  const changeWidgetType = (id: string, type: ChartType) => {
    setWidgets(prev => prev.map(w => (w.id === id ? { ...w, type } : w)));
  };

  const activeBots = data?.summary.active_bots || 0;
  const inactiveBots = (data?.summary.total_bots || 0) - activeBots;

  // ============== Render Chart Functions ==============

  const renderLineChart = (
    dataPoints: { x: number; y: number; label: string; value: number; isNow?: boolean }[],
    maxVal: number,
    color: string = 'var(--primary)',
    showMessages?: boolean
  ) => {
    if (dataPoints.length === 0)
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-muted)',
          }}
        >
          Нет данных
        </div>
      );

    const pathD = `M ${dataPoints.map(p => `${p.x} ${p.y}`).join(' L ')}`;
    const fillPathD = `${pathD} L 100 100 L 0 100 Z`;
    const timeLabels = dataPoints.filter((_, i) => i % 3 === 0 || i === dataPoints.length - 1);

    return (
      <div style={{ height: '220px' }}>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginBottom: '8px',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>Макс: {maxVal}</span>
        </div>
        <div style={{ display: 'flex', height: '160px' }}>
          <div
            style={{
              width: '35px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              paddingRight: '8px',
              fontSize: '10px',
              color: 'var(--text-muted)',
            }}
          >
            <span>{maxVal}</span>
            <span>{Math.round(maxVal / 2)}</span>
            <span>0</span>
          </div>
          <div
            style={{
              flex: 1,
              position: 'relative',
              borderLeft: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
              <line
                x1="0"
                y1="50"
                x2="100"
                y2="50"
                stroke="var(--border)"
                strokeWidth="0.3"
                vectorEffect="non-scaling-stroke"
                strokeDasharray="2,2"
              />
              <path d={fillPathD} fill={`${color}15`} />
              <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {dataPoints.map((p, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  transform: 'translate(-50%, -50%)',
                  width: p.isNow ? '8px' : '5px',
                  height: p.isNow ? '8px' : '5px',
                  borderRadius: '50%',
                  background: p.isNow ? '#22c55e' : color,
                  cursor: 'pointer',
                }}
                title={`${p.label}: ${p.value}${showMessages ? ' сообщ.' : ' польз.'}`}
              />
            ))}
          </div>
        </div>
        <div
          style={{
            marginLeft: '35px',
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: '6px',
            fontSize: '10px',
            color: 'var(--text-muted)',
          }}
        >
          {timeLabels.map((p, i) => (
            <span
              key={i}
              style={{
                color: p.isNow ? '#22c55e' : 'var(--text-muted)',
                fontWeight: p.isNow ? 600 : 400,
              }}
            >
              {p.label}
              {p.isNow ? ' ●' : ''}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const renderBarChart = (
    dataPoints: { label: string; value: number; color?: string }[],
    maxVal: number,
    color: string = 'var(--primary)'
  ) => {
    if (dataPoints.length === 0)
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-muted)',
          }}
        >
          Нет данных
        </div>
      );

    const showLabels = dataPoints.length <= 14;
    const labelInterval = Math.ceil(dataPoints.length / 7);

    return (
      <div style={{ height: '220px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          Макс: {maxVal}
        </div>
        <div style={{ display: 'flex', height: '160px' }}>
          <div
            style={{
              width: '35px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              paddingRight: '8px',
              fontSize: '10px',
              color: 'var(--text-muted)',
            }}
          >
            <span>{maxVal}</span>
            <span>{Math.round(maxVal / 2)}</span>
            <span>0</span>
          </div>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'flex-end',
              gap: '2px',
              borderLeft: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)',
              paddingLeft: '4px',
            }}
          >
            {dataPoints.map((p, i) => (
              <div
                key={i}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                title={`${p.label}: ${p.value}`}
              >
                <div
                  style={{
                    width: '100%',
                    height: `${maxVal > 0 ? (p.value / maxVal) * 100 : 0}%`,
                    background: p.color || color,
                    borderRadius: '2px 2px 0 0',
                    minHeight: p.value > 0 ? '2px' : '0',
                    transition: 'all 0.3s',
                  }}
                />
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            marginLeft: '35px',
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: '6px',
            fontSize: '10px',
            color: 'var(--text-muted)',
          }}
        >
          {dataPoints
            .filter((_, i) => showLabels || i % labelInterval === 0)
            .map((p, i) => (
              <span key={i}>{p.label}</span>
            ))}
        </div>
      </div>
    );
  };

  const renderPieChart = (
    segments: { label: string; value: number; color: string; percent: number }[]
  ) => {
    if (segments.length === 0 || segments.every(s => s.value === 0)) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-muted)',
          }}
        >
          Нет данных
        </div>
      );
    }

    let currentAngle = 0;
    const total = segments.reduce((sum, s) => sum + s.value, 0);

    return (
      <div
        style={{
          height: '220px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          padding: '10px',
        }}
      >
        <div style={{ position: 'relative', width: '140px', height: '140px' }}>
          <svg
            viewBox="0 0 36 36"
            style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}
          >
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3" />
            {segments.map((seg, i) => {
              if (seg.value === 0) return null;
              const segPercent = (seg.value / total) * 100;
              const dashArray = `${segPercent} ${100 - segPercent}`;
              const offset = -currentAngle;
              currentAngle += segPercent;
              return (
                <circle
                  key={i}
                  cx="18"
                  cy="18"
                  r="15.9"
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="3"
                  strokeDasharray={dashArray}
                  strokeDashoffset={offset}
                />
              );
            })}
          </svg>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '18px', fontWeight: 700 }}>{total}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>всего</div>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {segments.map((seg, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: seg.color,
                }}
              />
              <span style={{ flex: 1, fontSize: '12px' }}>{seg.label}</span>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>{seg.value}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                ({seg.percent.toFixed(1)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ============== Render Widget ==============

  const renderWidget = (widget: Widget) => {
    if (!marketing) return null;

    // Hourly Users
    if (widget.dataKey === 'hourly_users') {
      const hourlyData = marketing.hourly || [];
      const maxVal = Math.max(...hourlyData.map(h => h.users), 1);
      const points = hourlyData.map((h, i) => ({
        x: (i / Math.max(hourlyData.length - 1, 1)) * 100,
        y: 100 - (h.users / maxVal) * 100,
        label: h.hour,
        value: h.users,
        isNow: h.is_now,
      }));

      if (widget.type === 'line') return renderLineChart(points, maxVal);
      if (widget.type === 'bar') {
        const barData = hourlyData.map(h => ({
          label: h.hour.slice(0, 2),
          value: h.users,
          color: h.is_now ? '#22c55e' : 'var(--primary)',
        }));
        return renderBarChart(barData, maxVal);
      }
      // Fallback to line if unsupported type
      return renderLineChart(points, maxVal);
    }

    // Hourly Messages
    if (widget.dataKey === 'hourly_messages') {
      const hourlyData = marketing.hourly || [];
      const maxVal = Math.max(...hourlyData.map(h => h.messages), 1);

      if (widget.type === 'bar') {
        const barData = hourlyData.map(h => ({
          label: h.hour.slice(0, 2),
          value: h.messages,
          color: h.is_now ? '#22c55e' : '#3b82f6',
        }));
        return renderBarChart(barData, maxVal, '#3b82f6');
      }
      if (widget.type === 'line') {
        const points = hourlyData.map((h, i) => ({
          x: (i / Math.max(hourlyData.length - 1, 1)) * 100,
          y: 100 - (h.messages / maxVal) * 100,
          label: h.hour,
          value: h.messages,
          isNow: h.is_now,
        }));
        return renderLineChart(points, maxVal, '#3b82f6', true);
      }
      // Fallback to bar if unsupported type
      const barData = hourlyData.map(h => ({
        label: h.hour.slice(0, 2),
        value: h.messages,
        color: h.is_now ? '#22c55e' : '#3b82f6',
      }));
      return renderBarChart(barData, maxVal, '#3b82f6');
    }

    // Daily New Users
    if (widget.dataKey === 'daily_new_users') {
      const dailyData = marketing.daily || [];
      const maxVal = Math.max(...dailyData.map(d => d.new_users), 1);

      if (widget.type === 'bar') {
        const barData = dailyData.map(d => ({ label: d.date_short, value: d.new_users }));
        return renderBarChart(barData, maxVal, '#10b981');
      }
      if (widget.type === 'line') {
        const points = dailyData.map((d, i) => ({
          x: (i / Math.max(dailyData.length - 1, 1)) * 100,
          y: 100 - (d.new_users / maxVal) * 100,
          label: d.date_short,
          value: d.new_users,
        }));
        return renderLineChart(points, maxVal, '#10b981');
      }
      // Fallback to bar if unsupported type
      const barData = dailyData.map(d => ({ label: d.date_short, value: d.new_users }));
      return renderBarChart(barData, maxVal, '#10b981');
    }

    // Daily Active Users
    if (widget.dataKey === 'daily_active') {
      const dailyData = marketing.daily || [];
      const maxVal = Math.max(...dailyData.map(d => d.active_users), 1);

      if (widget.type === 'line') {
        const points = dailyData.map((d, i) => ({
          x: (i / Math.max(dailyData.length - 1, 1)) * 100,
          y: 100 - (d.active_users / maxVal) * 100,
          label: d.date_short,
          value: d.active_users,
        }));
        return renderLineChart(points, maxVal, '#8b5cf6');
      }
      if (widget.type === 'bar') {
        const barData = dailyData.map(d => ({ label: d.date_short, value: d.active_users }));
        return renderBarChart(barData, maxVal, '#8b5cf6');
      }
      // Fallback to line if unsupported type
      const points = dailyData.map((d, i) => ({
        x: (i / Math.max(dailyData.length - 1, 1)) * 100,
        y: 100 - (d.active_users / maxVal) * 100,
        label: d.date_short,
        value: d.active_users,
      }));
      return renderLineChart(points, maxVal, '#8b5cf6');
    }

    // Daily Messages
    if (widget.dataKey === 'daily_messages') {
      const dailyData = marketing.daily || [];
      const maxVal = Math.max(...dailyData.map(d => d.messages), 1);

      if (widget.type === 'bar') {
        const barData = dailyData.map(d => ({ label: d.date_short, value: d.messages }));
        return renderBarChart(barData, maxVal, '#f59e0b');
      }
      if (widget.type === 'line') {
        const points = dailyData.map((d, i) => ({
          x: (i / Math.max(dailyData.length - 1, 1)) * 100,
          y: 100 - (d.messages / maxVal) * 100,
          label: d.date_short,
          value: d.messages,
        }));
        return renderLineChart(points, maxVal, '#f59e0b', true);
      }
      // Fallback to bar if unsupported type
      const barData = dailyData.map(d => ({ label: d.date_short, value: d.messages }));
      return renderBarChart(barData, maxVal, '#f59e0b');
    }

    // Retention
    if (widget.dataKey === 'retention') {
      const ret = marketing.retention;
      const total = ret.total_users;
      const segments = [
        { label: 'Активны 7д', value: ret.active_7d, color: '#10b981', percent: ret.retention_7d },
        {
          label: 'Активны 30д',
          value: ret.active_30d - ret.active_7d,
          color: '#3b82f6',
          percent: ret.retention_30d - ret.retention_7d,
        },
        {
          label: 'Неактивны',
          value: Math.max(0, total - ret.active_30d),
          color: '#ef4444',
          percent: 100 - ret.retention_30d,
        },
      ];

      if (widget.type === 'pie') {
        return renderPieChart(segments);
      }
      if (widget.type === 'bar') {
        const maxVal = Math.max(...segments.map(s => s.value), 1);
        return renderBarChart(
          segments.map(s => ({ label: s.label, value: s.value, color: s.color })),
          maxVal
        );
      }
      if (widget.type === 'line') {
        const maxVal = Math.max(...segments.map(s => s.value), 1);
        const points = segments.map((s, i) => ({
          x: (i / Math.max(segments.length - 1, 1)) * 100,
          y: 100 - (s.value / maxVal) * 100,
          label: s.label,
          value: s.value,
        }));
        return renderLineChart(points, maxVal);
      }
      // Fallback to pie
      return renderPieChart(segments);
    }

    // Messages Direction
    if (widget.dataKey === 'messages_direction') {
      const msgs = marketing.messages;
      const total = msgs.incoming + msgs.outgoing;
      const segments = [
        {
          label: 'Входящие (от польз.)',
          value: msgs.incoming,
          color: '#3b82f6',
          percent: total > 0 ? (msgs.incoming / total) * 100 : 0,
        },
        {
          label: 'Исходящие (от бота)',
          value: msgs.outgoing,
          color: '#10b981',
          percent: total > 0 ? (msgs.outgoing / total) * 100 : 0,
        },
      ];

      if (widget.type === 'pie') {
        return renderPieChart(segments);
      }
      if (widget.type === 'bar') {
        const maxVal = Math.max(...segments.map(s => s.value), 1);
        return renderBarChart(
          segments.map(s => ({ label: s.label, value: s.value, color: s.color })),
          maxVal
        );
      }
      if (widget.type === 'line') {
        const maxVal = Math.max(...segments.map(s => s.value), 1);
        const points = segments.map((s, i) => ({
          x: (i / Math.max(segments.length - 1, 1)) * 100,
          y: 100 - (s.value / maxVal) * 100,
          label: s.label,
          value: s.value,
        }));
        return renderLineChart(points, maxVal);
      }
      // Fallback to pie
      return renderPieChart(segments);
    }

    // Bots Stats
    if (widget.dataKey === 'bots') {
      const total = activeBots + inactiveBots;
      const segments = [
        {
          label: 'Активные',
          value: activeBots,
          color: '#22c55e',
          percent: total > 0 ? (activeBots / total) * 100 : 0,
        },
        {
          label: 'Неактивные',
          value: inactiveBots,
          color: '#94a3b8',
          percent: total > 0 ? (inactiveBots / total) * 100 : 0,
        },
      ];

      if (widget.type === 'pie') {
        return renderPieChart(segments);
      }
      if (widget.type === 'bar') {
        const maxVal = Math.max(...segments.map(s => s.value), 1);
        return renderBarChart(
          segments.map(s => ({ label: s.label, value: s.value, color: s.color })),
          maxVal
        );
      }
      if (widget.type === 'line') {
        const maxVal = Math.max(...segments.map(s => s.value), 1);
        const points = segments.map((s, i) => ({
          x: (i / Math.max(segments.length - 1, 1)) * 100,
          y: 100 - (s.value / maxVal) * 100,
          label: s.label,
          value: s.value,
        }));
        return renderLineChart(points, maxVal);
      }
      // Fallback to pie
      return renderPieChart(segments);
    }

    return null;
  };

  const getPeriodLabel = () => {
    if (period === 'custom' && customDateFrom && customDateTo) {
      return `${new Date(customDateFrom).toLocaleDateString('ru-RU')} — ${new Date(customDateTo).toLocaleDateString('ru-RU')}`;
    }
    const labels: Record<PeriodType, string> = {
      '7d': 'За 7 дней',
      '30d': 'За 30 дней',
      '90d': 'За 90 дней',
      custom: 'Свой период',
    };
    return labels[period];
  };

  const GrowthIndicator = ({ value, label }: { value: number; label: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {value > 0 ? (
        <ArrowUp size={14} style={{ color: '#22c55e' }} />
      ) : value < 0 ? (
        <ArrowDown size={14} style={{ color: '#ef4444' }} />
      ) : null}
      <span
        style={{
          color: value > 0 ? '#22c55e' : value < 0 ? '#ef4444' : 'var(--text-muted)',
          fontSize: '12px',
          fontWeight: 600,
        }}
      >
        {value > 0 ? '+' : ''}
        {value}%
      </span>
      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{label}</span>
    </div>
  );

  if (loading) {
    return (
      <DashboardPage title="Маркетинговая аналитика" subtitle="Загрузка...">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '4px solid var(--border)',
              borderTop: '4px solid var(--primary)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
        </div>
      </DashboardPage>
    );
  }

  return (
    <DashboardPage
      title="Маркетинговая аналитика"
      subtitle={`Данные ${getPeriodLabel().toLowerCase()}${selectedBotId ? ' • Выбранный бот' : ' • Все боты'}`}
      actions={
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={loadData}
            style={{
              padding: '8px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Обновить"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              padding: '8px 12px',
              background: showFilters ? 'var(--primary)' : 'var(--surface)',
              color: showFilters ? 'var(--text-on-primary)' : 'inherit',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Filter size={16} /> Фильтры
          </button>
          {canExport && (
            <button
              onClick={handleExport}
              style={{
                padding: '8px 12px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Download size={16} /> Экспорт
            </button>
          )}
        </div>
      }
    >
      {/* Filters Panel */}
      {showFilters && (
        <Card style={{ marginBottom: '20px', padding: '16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
            {/* Period Selection */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  marginBottom: '6px',
                }}
              >
                Период
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['7d', '30d', '90d', 'custom'] as PeriodType[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    style={{
                      padding: '6px 12px',
                      background: period === p ? 'var(--primary)' : 'var(--surface)',
                      color: period === p ? 'var(--text-on-primary)' : 'inherit',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    {p === '7d'
                      ? '7 дней'
                      : p === '30d'
                        ? '30 дней'
                        : p === '90d'
                          ? '90 дней'
                          : 'Свой'}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Date Range */}
            {period === 'custom' && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      marginBottom: '6px',
                    }}
                  >
                    От
                  </label>
                  <input
                    type="date"
                    value={customDateFrom}
                    onChange={e => setCustomDateFrom(e.target.value)}
                    style={{
                      padding: '6px 10px',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      background: 'var(--surface)',
                      fontSize: '12px',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      marginBottom: '6px',
                    }}
                  >
                    До
                  </label>
                  <input
                    type="date"
                    value={customDateTo}
                    onChange={e => setCustomDateTo(e.target.value)}
                    style={{
                      padding: '6px 10px',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      background: 'var(--surface)',
                      fontSize: '12px',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Bot Selection */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  marginBottom: '6px',
                }}
              >
                Бот
              </label>
              <select
                value={selectedBotId || ''}
                onChange={e =>
                  setSelectedBotId(e.target.value ? Number(e.target.value) : undefined)
                }
                style={{
                  padding: '6px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  background: 'var(--surface)',
                  fontSize: '12px',
                  minWidth: '150px',
                }}
              >
                <option value="">Все боты</option>
                {bots.map(bot => (
                  <option key={bot.id} value={bot.id}>
                    {bot.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Widgets Toggle */}
            <div style={{ marginLeft: 'auto' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  marginBottom: '6px',
                }}
              >
                Виджеты
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {widgets.map(w => (
                  <button
                    key={w.id}
                    onClick={() => toggleWidget(w.id)}
                    style={{
                      padding: '4px 8px',
                      background: w.visible ? 'var(--primary)' : 'var(--surface)',
                      color: w.visible ? 'var(--text-on-primary)' : 'var(--text-muted)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '10px',
                    }}
                  >
                    {w.title.length > 15 ? w.title.slice(0, 15) + '...' : w.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <Card style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #22c55e20, #22c55e40)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Activity size={22} style={{ color: '#22c55e' }} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                Онлайн сейчас
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700 }}>{marketing?.online_now || 0}</div>
            </div>
          </div>
        </Card>

        <Card style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #3b82f620, #3b82f640)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={22} style={{ color: '#3b82f6' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                Всего пользователей
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700 }}>
                {marketing?.retention.total_users || 0}
              </div>
              <GrowthIndicator
                value={marketing?.growth.users_growth || 0}
                label="vs пред. период"
              />
            </div>
          </div>
        </Card>

        <Card style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #10b98120, #10b98140)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <UserPlus size={22} style={{ color: '#10b981' }} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                Новых за период
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700 }}>
                {marketing?.growth.current_new_users || 0}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                было: {marketing?.growth.previous_new_users || 0}
              </div>
            </div>
          </div>
        </Card>

        <Card style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #f59e0b20, #f59e0b40)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MessageCircle size={22} style={{ color: '#f59e0b' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                Сообщений
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700 }}>
                {marketing?.messages.total || 0}
              </div>
              <GrowthIndicator
                value={marketing?.growth.messages_growth || 0}
                label="vs пред. период"
              />
            </div>
          </div>
        </Card>

        <Card style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #8b5cf620, #8b5cf640)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Target size={22} style={{ color: '#8b5cf6' }} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                Retention 7д
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700 }}>
                {marketing?.retention.retention_7d || 0}%
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                30д: {marketing?.retention.retention_30d || 0}%
              </div>
            </div>
          </div>
        </Card>

        <Card style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #ec489920, #ec489940)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Zap size={22} style={{ color: '#ec4899' }} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                Пик активности
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>
                {marketing?.peaks.peak_hour || 'N/A'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {marketing?.peaks.peak_hour_users || 0} польз.
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: '20px',
        }}
      >
        {widgets
          .filter(w => w.visible)
          .map(widget => (
            <Card key={widget.id} style={{ padding: '16px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{widget.title}</h3>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(['bar', 'line', 'pie'] as ChartType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => changeWidgetType(widget.id, type)}
                      style={{
                        padding: '4px 8px',
                        background: widget.type === type ? 'var(--primary)' : 'transparent',
                        color:
                          widget.type === type ? 'var(--text-on-primary)' : 'var(--text-muted)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title={type === 'bar' ? 'Столбцы' : type === 'line' ? 'Линия' : 'Круговая'}
                    >
                      {type === 'bar' && <BarChart3 size={14} />}
                      {type === 'line' && <LineChart size={14} />}
                      {type === 'pie' && <PieChart size={14} />}
                    </button>
                  ))}
                </div>
              </div>
              {renderWidget(widget)}
            </Card>
          ))}
      </div>

      {/* Summary Stats */}
      <Card style={{ marginTop: '24px', padding: '20px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>
          Сводная статистика
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
          }}
        >
          <div style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: '8px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Сообщ. на пользователя
            </div>
            <div style={{ fontSize: '20px', fontWeight: 600 }}>
              {marketing?.messages.avg_per_user || 0}
            </div>
          </div>
          <div style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: '8px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Возвращающиеся
            </div>
            <div style={{ fontSize: '20px', fontWeight: 600 }}>
              {marketing?.retention.returning_users || 0}{' '}
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                ({marketing?.retention.return_rate || 0}%)
              </span>
            </div>
          </div>
          <div style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: '8px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Пиковый день
            </div>
            <div style={{ fontSize: '20px', fontWeight: 600 }}>
              {marketing?.peaks.peak_day || 'N/A'}{' '}
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                ({marketing?.peaks.peak_day_users || 0} польз.)
              </span>
            </div>
          </div>
          <div style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: '8px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Входящих сообщений
            </div>
            <div style={{ fontSize: '20px', fontWeight: 600 }}>
              {marketing?.messages.incoming || 0}
            </div>
          </div>
          <div style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: '8px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Исходящих сообщений
            </div>
            <div style={{ fontSize: '20px', fontWeight: 600 }}>
              {marketing?.messages.outgoing || 0}
            </div>
          </div>
          <div style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: '8px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Активных за 7 дней
            </div>
            <div style={{ fontSize: '20px', fontWeight: 600 }}>
              {marketing?.retention.active_7d || 0}
            </div>
          </div>
        </div>
      </Card>

      {/* Help Text */}
      <div
        style={{
          marginTop: '20px',
          padding: '16px',
          background: 'var(--surface)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
        }}
      >
        <h4
          style={{
            margin: '0 0 8px 0',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <TrendingUp size={16} style={{ color: 'var(--primary)' }} /> Как использовать для
          маркетинга
        </h4>
        <ul
          style={{
            margin: 0,
            paddingLeft: '20px',
            fontSize: '12px',
            color: 'var(--text-muted)',
            lineHeight: 1.6,
          }}
        >
          <li>
            <strong>Пики активности:</strong> Запускайте рекламные кампании за 1-2 часа до пика для
            максимального охвата.
          </li>
          <li>
            <strong>Новые пользователи:</strong> Отслеживайте эффективность рекламы — рост новых
            пользователей = успешная кампания.
          </li>
          <li>
            <strong>Retention:</strong> Если retention падает — пересмотрите контент бота и цепочки
            сообщений.
          </li>
          <li>
            <strong>Сообщения на пользователя:</strong> Чем выше — тем более вовлечённая аудитория.
          </li>
          <li>
            <strong>Фильтр по ботам:</strong> Сравнивайте эффективность разных ботов и кампаний.
          </li>
        </ul>
      </div>
    </DashboardPage>
  );
}
