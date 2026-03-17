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
  Search,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  Link2,
} from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { useAuthStore } from '../../../stores/authStore';
import { hasAccessToAction } from '../../../constants/roles';
import { AccessLocked } from '../../../components/AccessLocked';
import {
  getDashboardData,
  getMarketingAnalytics,
  getBotUsers,
  type DashboardData,
  type MarketingAnalytics,
  type BotUser,
  type BotUsersFilters,
} from '../../../api/analytics';
import { getBots, type Bot as BotType } from '../../../api/bot';
import { toast } from '../../../utils/toast';

type PeriodType = '7d' | '30d' | '90d' | 'custom';
type ChartType = 'bar' | 'line' | 'pie';
type MainTabType = 'overview' | 'users';

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
  const [mainTab, setMainTab] = useState<MainTabType>('overview');

  // Users tab state
  const [botUsers, setBotUsers] = useState<BotUser[]>([]);
  const [botUsersFilters, setBotUsersFilters] = useState<BotUsersFilters | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(0);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersStatusFilter, setUsersStatusFilter] = useState<string>('');
  const [usersChannelFilter, setUsersChannelFilter] = useState<string>('');
  const [usersBotFilter, setUsersBotFilter] = useState<number | undefined>(undefined);
  const [usersUtmFilter, setUsersUtmFilter] = useState<string>('');
  const [usersSortBy, setUsersSortBy] = useState<'created_at' | 'last_interaction_at' | 'name'>(
    'last_interaction_at'
  );
  const [usersSortOrder, setUsersSortOrder] = useState<'asc' | 'desc'>('desc');

  const periodDays: Record<PeriodType, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    custom: 0,
  };

  useEffect(() => {
    loadData();
  }, [period, customDateFrom, customDateTo, selectedBotId]);

  // Load bot users when switching to users tab or changing filters
  useEffect(() => {
    if (mainTab === 'users') {
      loadBotUsers();
    }
  }, [
    mainTab,
    usersPage,
    usersStatusFilter,
    usersChannelFilter,
    usersBotFilter,
    usersUtmFilter,
    usersSortBy,
    usersSortOrder,
  ]);

  const loadBotUsers = async () => {
    try {
      setUsersLoading(true);
      const response = await getBotUsers({
        page: usersPage,
        page_size: 50,
        bot_id: usersBotFilter,
        status: usersStatusFilter || undefined,
        channel: usersChannelFilter || undefined,
        search: usersSearch || undefined,
        utm_source: usersUtmFilter || undefined,
        sort_by: usersSortBy,
        sort_order: usersSortOrder,
      });
      setBotUsers(response.items);
      setBotUsersFilters(response.filters);
      setUsersTotalPages(response.total_pages);
      setUsersTotal(response.total);
    } catch (error: any) {
      console.error('Failed to load bot users:', error);
      toast.error('Не удалось загрузить пользователей');
    } finally {
      setUsersLoading(false);
    }
  };

  const handleUsersSearch = () => {
    setUsersPage(1);
    loadBotUsers();
  };

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
      const [analyticsData, botsData, marketingData] = await Promise.all([
        getDashboardData(days),
        getBots(),
        getMarketingAnalytics(days, selectedBotId),
      ]);
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
    const totalSum = dataPoints.reduce((sum, p) => sum + p.value, 0);

    return (
      <div style={{ height: '240px' }}>
        {/* Header with max and total */}
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
          <span>Всего: {totalSum}</span>
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
            {dataPoints.map((p, i) => {
              const percentOfTotal = totalSum > 0 ? ((p.value / totalSum) * 100).toFixed(1) : '0';
              return (
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
                  title={`${p.label}: ${p.value}${showMessages ? ' сообщ.' : ' польз.'} (${percentOfTotal}% от общего)`}
                />
              );
            })}
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
    const totalSum = dataPoints.reduce((sum, p) => sum + p.value, 0);

    return (
      <div style={{ height: '240px' }}>
        {/* Header with max and total */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginBottom: '8px',
          }}
        >
          <span>Макс: {maxVal}</span>
          <span>Всего: {totalSum}</span>
        </div>
        <div style={{ display: 'flex', height: '180px' }}>
          {/* Y-axis with values */}
          <div
            style={{
              width: '40px',
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
            <span>{Math.round((maxVal * 3) / 4)}</span>
            <span>{Math.round(maxVal / 2)}</span>
            <span>{Math.round(maxVal / 4)}</span>
            <span>0</span>
          </div>
          {/* Chart area with grid lines and bars */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'flex-end',
              gap: '2px',
              borderLeft: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)',
              paddingLeft: '4px',
              position: 'relative',
            }}
          >
            {/* Horizontal grid lines */}
            {[0.25, 0.5, 0.75].map((ratio, idx) => (
              <div
                key={idx}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: `${ratio * 100}%`,
                  height: '1px',
                  background: 'var(--border)',
                  opacity: 0.5,
                }}
              />
            ))}
            {/* Bars */}
            {dataPoints.map((p, i) => {
              const heightPercent = maxVal > 0 ? (p.value / maxVal) * 100 : 0;
              const percentOfTotal = totalSum > 0 ? ((p.value / totalSum) * 100).toFixed(1) : '0';
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    height: '100%',
                    justifyContent: 'flex-end',
                    position: 'relative',
                    zIndex: 1,
                  }}
                  title={`${p.label}: ${p.value} (${percentOfTotal}% от общего)`}
                >
                  {/* Value label above bar */}
                  {p.value > 0 && heightPercent > 15 && dataPoints.length <= 24 && (
                    <div
                      style={{
                        fontSize: '9px',
                        color: 'var(--text)',
                        fontWeight: 600,
                        marginBottom: '2px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.value}
                    </div>
                  )}
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '24px',
                      height: `${Math.max(heightPercent, p.value > 0 ? 2 : 0)}%`,
                      background: p.color || color,
                      borderRadius: '2px 2px 0 0',
                      minHeight: p.value > 0 ? '2px' : '0',
                      transition: 'all 0.3s',
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        {/* X-axis labels */}
        <div
          style={{
            marginLeft: '40px',
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

  // Helper to convert hourly/daily data to pie chart segments
  const convertHourlyToPie = (
    hourlyData: { hour: string; users?: number; messages?: number }[],
    valueKey: 'users' | 'messages'
  ) => {
    if (hourlyData.length !== 24) {
      // If not 24 hours, just show sum as single segment
      const total = hourlyData.reduce((sum, h) => sum + ((h as any)[valueKey] || 0), 0);
      return [{ label: 'Всего', value: total, color: '#3b82f6', percent: 100 }];
    }
    const morning = hourlyData
      .slice(6, 12)
      .reduce((sum, h) => sum + ((h as any)[valueKey] || 0), 0);
    const day = hourlyData.slice(12, 18).reduce((sum, h) => sum + ((h as any)[valueKey] || 0), 0);
    const evening = hourlyData
      .slice(18, 24)
      .reduce((sum, h) => sum + ((h as any)[valueKey] || 0), 0);
    const night = hourlyData.slice(0, 6).reduce((sum, h) => sum + ((h as any)[valueKey] || 0), 0);
    const total = morning + day + evening + night;
    return [
      {
        label: 'Утро (6-12)',
        value: morning,
        color: '#f59e0b',
        percent: total > 0 ? (morning / total) * 100 : 0,
      },
      {
        label: 'День (12-18)',
        value: day,
        color: '#22c55e',
        percent: total > 0 ? (day / total) * 100 : 0,
      },
      {
        label: 'Вечер (18-24)',
        value: evening,
        color: '#3b82f6',
        percent: total > 0 ? (evening / total) * 100 : 0,
      },
      {
        label: 'Ночь (0-6)',
        value: night,
        color: '#8b5cf6',
        percent: total > 0 ? (night / total) * 100 : 0,
      },
    ];
  };

  const convertDailyToPie = (
    dailyData: {
      date_short: string;
      new_users?: number;
      active_users?: number;
      messages?: number;
    }[],
    valueKey: 'new_users' | 'active_users' | 'messages'
  ) => {
    const pieColors = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#64748b'];
    // Show last 7 days as pie segments
    const lastDays = dailyData.slice(-7);
    const total = lastDays.reduce((sum, d) => sum + ((d as any)[valueKey] || 0), 0);
    return lastDays.map((d, i) => ({
      label: d.date_short,
      value: (d as any)[valueKey] || 0,
      color: pieColors[i % pieColors.length],
      percent: total > 0 ? (((d as any)[valueKey] || 0) / total) * 100 : 0,
    }));
  };

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

      if (widget.type === 'pie') {
        return renderPieChart(convertHourlyToPie(hourlyData, 'users'));
      }
      if (widget.type === 'line') return renderLineChart(points, maxVal);
      if (widget.type === 'bar') {
        const barData = hourlyData.map(h => ({
          label: h.hour.slice(0, 2),
          value: h.users,
          color: h.is_now ? '#22c55e' : 'var(--primary)',
        }));
        return renderBarChart(barData, maxVal);
      }
      return renderLineChart(points, maxVal);
    }

    // Hourly Messages
    if (widget.dataKey === 'hourly_messages') {
      const hourlyData = marketing.hourly || [];
      const maxVal = Math.max(...hourlyData.map(h => h.messages), 1);

      if (widget.type === 'pie') {
        return renderPieChart(convertHourlyToPie(hourlyData, 'messages'));
      }
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

      if (widget.type === 'pie') {
        return renderPieChart(convertDailyToPie(dailyData, 'new_users'));
      }
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
      const barData = dailyData.map(d => ({ label: d.date_short, value: d.new_users }));
      return renderBarChart(barData, maxVal, '#10b981');
    }

    // Daily Active Users
    if (widget.dataKey === 'daily_active') {
      const dailyData = marketing.daily || [];
      const maxVal = Math.max(...dailyData.map(d => d.active_users), 1);

      if (widget.type === 'pie') {
        return renderPieChart(convertDailyToPie(dailyData, 'active_users'));
      }
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

      if (widget.type === 'pie') {
        return renderPieChart(convertDailyToPie(dailyData, 'messages'));
      }
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
          <AccessLocked
            hasAccess={canExport}
            actionKey="transactions_export"
            onClick={handleExport}
          >
            <button
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
          </AccessLocked>
        </div>
      }
    >
      {/* Main Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0',
          marginBottom: '24px',
          borderBottom: '2px solid var(--border)',
        }}
      >
        <button
          onClick={() => setMainTab('overview')}
          style={{
            padding: '14px 32px',
            background: 'transparent',
            border: 'none',
            borderBottom:
              mainTab === 'overview' ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-2px',
            color: mainTab === 'overview' ? 'var(--primary)' : 'var(--text-muted)',
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s',
          }}
        >
          <BarChart3 size={18} />
          Обзор
        </button>
        <button
          onClick={() => setMainTab('users')}
          style={{
            padding: '14px 32px',
            background: 'transparent',
            border: 'none',
            borderBottom:
              mainTab === 'users' ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-2px',
            color: mainTab === 'users' ? 'var(--primary)' : 'var(--text-muted)',
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s',
          }}
        >
          <Users size={18} />
          Пользователи
        </button>
      </div>
      {/* Overview Tab Content */}
      {mainTab === 'overview' && (
        <>
          {/* Filters Panel */}
          {showFilters && (
            <Card style={{ marginBottom: '20px', padding: '16px' }}>
              <div
                style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}
              >
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
                  <div
                    style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}
                  >
                    Онлайн сейчас
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 700 }}>
                    {marketing?.online_now || 0}
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
                    background: 'linear-gradient(135deg, #3b82f620, #3b82f640)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Users size={22} style={{ color: '#3b82f6' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}
                  >
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
                  <div
                    style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}
                  >
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
                  <div
                    style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}
                  >
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
                  <div
                    style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}
                  >
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
                  <div
                    style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}
                  >
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
                          title={
                            type === 'bar' ? 'Столбцы' : type === 'line' ? 'Линия' : 'Круговая'
                          }
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
              <div
                style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: '8px' }}
              >
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Сообщ. на пользователя
                </div>
                <div style={{ fontSize: '20px', fontWeight: 600 }}>
                  {marketing?.messages.avg_per_user || 0}
                </div>
              </div>
              <div
                style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: '8px' }}
              >
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
              <div
                style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: '8px' }}
              >
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
              <div
                style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: '8px' }}
              >
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Входящих сообщений
                </div>
                <div style={{ fontSize: '20px', fontWeight: 600 }}>
                  {marketing?.messages.incoming || 0}
                </div>
              </div>
              <div
                style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: '8px' }}
              >
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Исходящих сообщений
                </div>
                <div style={{ fontSize: '20px', fontWeight: 600 }}>
                  {marketing?.messages.outgoing || 0}
                </div>
              </div>
              <div
                style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: '8px' }}
              >
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
                <strong>Пики активности:</strong> Запускайте рекламные кампании за 1-2 часа до пика
                для максимального охвата.
              </li>
              <li>
                <strong>Новые пользователи:</strong> Отслеживайте эффективность рекламы — рост новых
                пользователей = успешная кампания.
              </li>
              <li>
                <strong>Retention:</strong> Если retention падает — пересмотрите контент бота и
                цепочки сообщений.
              </li>
              <li>
                <strong>Сообщения на пользователя:</strong> Чем выше — тем более вовлечённая
                аудитория.
              </li>
              <li>
                <strong>Фильтр по ботам:</strong> Сравнивайте эффективность разных ботов и кампаний.
              </li>
            </ul>
          </div>
        </>
      )}{' '}
      {/* End of Overview Tab */}
      {/* Users Tab Content */}
      {mainTab === 'users' && (
        <>
          {/* Filters Card */}
          <Card style={{ marginBottom: '24px' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}
            >
              <Users size={20} style={{ color: 'var(--primary)' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--text)' }}>
                Пользователи ботов
              </h3>
              <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                Всего: {usersTotal}
              </span>
            </div>

            {/* Search and Filters */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              {/* Search */}
              <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
                <Search
                  size={18}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  type="text"
                  placeholder="Поиск по имени, email, телефону..."
                  value={usersSearch}
                  onChange={e => setUsersSearch(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleUsersSearch()}
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 40px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    fontSize: '14px',
                  }}
                />
              </div>
              <button
                onClick={handleUsersSearch}
                style={{
                  padding: '10px 20px',
                  background: 'var(--primary)',
                  color: 'var(--text-on-primary)',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Найти
              </button>
            </div>

            {/* Filter Dropdowns */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {/* Bot Filter */}
              {botUsersFilters && botUsersFilters.bots.length > 0 && (
                <select
                  value={usersBotFilter || ''}
                  onChange={e => {
                    setUsersBotFilter(e.target.value ? Number(e.target.value) : undefined);
                    setUsersPage(1);
                  }}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    fontSize: '13px',
                    minWidth: '150px',
                  }}
                >
                  <option value="">Все боты</option>
                  {botUsersFilters.bots.map(bot => (
                    <option key={bot.id} value={bot.id}>
                      {bot.title}
                    </option>
                  ))}
                </select>
              )}

              {/* Status Filter */}
              {botUsersFilters && botUsersFilters.statuses.length > 0 && (
                <select
                  value={usersStatusFilter}
                  onChange={e => {
                    setUsersStatusFilter(e.target.value);
                    setUsersPage(1);
                  }}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    fontSize: '13px',
                    minWidth: '120px',
                  }}
                >
                  <option value="">Все статусы</option>
                  {botUsersFilters.statuses.map(s => (
                    <option key={s} value={s}>
                      {s === 'active'
                        ? 'Активен'
                        : s === 'unsubscribed'
                          ? 'Отписан'
                          : s === 'banned'
                            ? 'Заблокирован'
                            : s}
                    </option>
                  ))}
                </select>
              )}

              {/* Channel Filter */}
              {botUsersFilters && botUsersFilters.channels.length > 0 && (
                <select
                  value={usersChannelFilter}
                  onChange={e => {
                    setUsersChannelFilter(e.target.value);
                    setUsersPage(1);
                  }}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    fontSize: '13px',
                    minWidth: '120px',
                  }}
                >
                  <option value="">Все каналы</option>
                  {botUsersFilters.channels.map(c => (
                    <option key={c} value={c}>
                      {c === 'telegram' ? 'Telegram' : c}
                    </option>
                  ))}
                </select>
              )}

              {/* UTM Source Filter */}
              {botUsersFilters && botUsersFilters.utm_sources.length > 0 && (
                <select
                  value={usersUtmFilter}
                  onChange={e => {
                    setUsersUtmFilter(e.target.value);
                    setUsersPage(1);
                  }}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    fontSize: '13px',
                    minWidth: '120px',
                  }}
                >
                  <option value="">Все UTM</option>
                  {botUsersFilters.utm_sources.map(u => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              )}

              {/* Sort */}
              <select
                value={`${usersSortBy}-${usersSortOrder}`}
                onChange={e => {
                  const [field, order] = e.target.value.split('-') as [
                    'created_at' | 'last_interaction_at' | 'name',
                    'asc' | 'desc',
                  ];
                  setUsersSortBy(field);
                  setUsersSortOrder(order);
                  setUsersPage(1);
                }}
                style={{
                  padding: '8px 12px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  fontSize: '13px',
                  minWidth: '180px',
                }}
              >
                <option value="last_interaction_at-desc">Последняя активность ↓</option>
                <option value="last_interaction_at-asc">Последняя активность ↑</option>
                <option value="created_at-desc">Дата регистрации ↓</option>
                <option value="created_at-asc">Дата регистрации ↑</option>
                <option value="name-asc">Имя А-Я</option>
                <option value="name-desc">Имя Я-А</option>
              </select>
            </div>
          </Card>

          {/* Users List */}
          {usersLoading ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '60px' }}>
                <RefreshCw
                  size={40}
                  style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }}
                />
                <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>
                  Загрузка пользователей...
                </p>
              </div>
            </Card>
          ) : botUsers.length === 0 ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                <Users size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                <p style={{ fontSize: '16px', marginBottom: '8px' }}>Пользователей не найдено</p>
                <p style={{ fontSize: '13px' }}>Попробуйте изменить фильтры или поисковый запрос</p>
              </div>
            </Card>
          ) : (
            <>
              {/* Users Table */}
              <Card style={{ overflow: 'hidden', marginBottom: '16px' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr
                        style={{
                          background: 'var(--surface)',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <th
                          style={{
                            padding: '12px 16px',
                            textAlign: 'left',
                            fontWeight: 600,
                            color: 'var(--text)',
                          }}
                        >
                          Пользователь
                        </th>
                        <th
                          style={{
                            padding: '12px 16px',
                            textAlign: 'left',
                            fontWeight: 600,
                            color: 'var(--text)',
                          }}
                        >
                          Бот
                        </th>
                        <th
                          style={{
                            padding: '12px 16px',
                            textAlign: 'left',
                            fontWeight: 600,
                            color: 'var(--text)',
                          }}
                        >
                          Статус
                        </th>
                        <th
                          style={{
                            padding: '12px 16px',
                            textAlign: 'left',
                            fontWeight: 600,
                            color: 'var(--text)',
                          }}
                        >
                          Контакты
                        </th>
                        <th
                          style={{
                            padding: '12px 16px',
                            textAlign: 'center',
                            fontWeight: 600,
                            color: 'var(--text)',
                          }}
                        >
                          Сообщений
                        </th>
                        <th
                          style={{
                            padding: '12px 16px',
                            textAlign: 'left',
                            fontWeight: 600,
                            color: 'var(--text)',
                          }}
                        >
                          UTM/Источник
                        </th>
                        <th
                          style={{
                            padding: '12px 16px',
                            textAlign: 'left',
                            fontWeight: 600,
                            color: 'var(--text)',
                          }}
                        >
                          Последняя активность
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {botUsers.map(user => (
                        <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div
                                style={{
                                  width: '36px',
                                  height: '36px',
                                  borderRadius: '50%',
                                  background: 'var(--primary-bg)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Users size={18} style={{ color: 'var(--primary)' }} />
                              </div>
                              <div>
                                <div style={{ fontWeight: 500, color: 'var(--text)' }}>
                                  {user.name || 'Без имени'}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                  ID: {user.telegram_user_id}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text)' }}>
                              {user.bot_title}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 500,
                                background:
                                  user.status === 'active'
                                    ? 'rgba(34, 197, 94, 0.1)'
                                    : user.status === 'banned'
                                      ? 'rgba(239, 68, 68, 0.1)'
                                      : 'rgba(148, 163, 184, 0.1)',
                                color:
                                  user.status === 'active'
                                    ? '#22c55e'
                                    : user.status === 'banned'
                                      ? '#ef4444'
                                      : '#94a3b8',
                              }}
                            >
                              {user.status === 'active'
                                ? 'Активен'
                                : user.status === 'unsubscribed'
                                  ? 'Отписан'
                                  : user.status === 'banned'
                                    ? 'Заблокирован'
                                    : user.status}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                                fontSize: '12px',
                              }}
                            >
                              {user.email && (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    color: 'var(--text-muted)',
                                  }}
                                >
                                  <Mail size={12} /> {user.email}
                                </div>
                              )}
                              {user.phone && (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    color: 'var(--text-muted)',
                                  }}
                                >
                                  <Phone size={12} /> {user.phone}
                                </div>
                              )}
                              {!user.email && !user.phone && (
                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                              {user.messages_count}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                                fontSize: '12px',
                              }}
                            >
                              {user.utm_source && (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    color: 'var(--text-muted)',
                                  }}
                                >
                                  <Link2 size={12} /> {user.utm_source}
                                </div>
                              )}
                              {user.entry_point && (
                                <div style={{ color: 'var(--text-muted)' }}>
                                  Точка: {user.entry_point}
                                </div>
                              )}
                              {!user.utm_source && !user.entry_point && (
                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              {user.last_interaction_at
                                ? new Date(user.last_interaction_at).toLocaleString('ru-RU', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '—'}
                            </div>
                            <div
                              style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.7 }}
                            >
                              Создан:{' '}
                              {user.created_at
                                ? new Date(user.created_at).toLocaleDateString('ru-RU')
                                : '—'}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Pagination */}
              {usersTotalPages > 1 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <button
                    onClick={() => setUsersPage(p => Math.max(1, p - 1))}
                    disabled={usersPage === 1}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      cursor: usersPage === 1 ? 'not-allowed' : 'pointer',
                      opacity: usersPage === 1 ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span style={{ fontSize: '14px', color: 'var(--text)' }}>
                    Страница {usersPage} из {usersTotalPages}
                  </span>
                  <button
                    onClick={() => setUsersPage(p => Math.min(usersTotalPages, p + 1))}
                    disabled={usersPage === usersTotalPages}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      cursor: usersPage === usersTotalPages ? 'not-allowed' : 'pointer',
                      opacity: usersPage === usersTotalPages ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}{' '}
      {/* End of Users Tab */}
    </DashboardPage>
  );
}
