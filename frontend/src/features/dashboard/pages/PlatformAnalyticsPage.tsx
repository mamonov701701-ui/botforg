import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Users,
  Search,
  X,
  Check,
  Filter,
  MessageCircle,
  Bot,
  Workflow,
  Calendar,
  PieChart,
  LineChart,
  Plus,
  Clock,
  Activity,
  UserPlus,
  Zap,
  RefreshCw,
} from 'lucide-react';
import {
  getAllUsers,
  getUserDetailedInfo,
  getPlatformAnalytics,
  type User,
  type UserDetailedInfo,
  type PlatformAnalyticsData,
  type HourlyData,
  type DailyData,
} from '../../../api/platformAdmin';
import { toast } from '../../../utils/toast';

type PeriodType = '7d' | '30d' | '90d' | 'custom';
type ChartType = 'bar' | 'line' | 'pie';
type TabType = 'overview' | 'users' | 'hourly' | 'daily' | 'retention';

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
    title: 'Новые пользователи ботов',
    type: 'bar',
    dataKey: 'daily_new_users',
    visible: true,
  },
  {
    id: 'daily-platform-users',
    title: 'Новые пользователи платформы',
    type: 'line',
    dataKey: 'daily_platform_users',
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
];

const periodDays: Record<PeriodType, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  custom: 30,
};

export default function PlatformAnalyticsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const userIdParam = searchParams.get('user_id');

  // User selection state
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>(() => {
    if (userIdParam) {
      const id = parseInt(userIdParam);
      return isNaN(id) ? [] : [id];
    }
    return [];
  });
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserSelector, setShowUserSelector] = useState(false);
  const [usersData, setUsersData] = useState<Map<number, UserDetailedInfo>>(new Map());

  // Analytics state
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PlatformAnalyticsData | null>(null);
  const [period, setPeriod] = useState<PeriodType>('30d');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [widgets, setWidgets] = useState<Widget[]>(defaultWidgets);
  const [showFilters, setShowFilters] = useState(false);
  const [showAddChart, setShowAddChart] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, [period, customDateFrom, customDateTo]);

  useEffect(() => {
    if (selectedUserIds.length > 0) {
      loadUsersData(selectedUserIds);
    }
  }, [selectedUserIds]);

  const calculateCustomDays = () => {
    if (!customDateFrom || !customDateTo) return 30;
    const from = new Date(customDateFrom);
    const to = new Date(customDateTo);
    const diff = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(1, Math.min(diff, 365));
  };

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const days = period === 'custom' ? calculateCustomDays() : periodDays[period];
      const analyticsData = await getPlatformAnalytics(days);
      setData(analyticsData);
    } catch (error: any) {
      console.error('Failed to load analytics:', error);
      toast.error('Не удалось загрузить аналитику платформы');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const response = await getAllUsers({
        search: searchQuery || undefined,
        page: 1,
        pageSize: 50,
      });
      setUsers(response.items || []);
    } catch (error: any) {
      console.error('Failed to load users:', error);
      toast.error(error.message || 'Не удалось загрузить пользователей');
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadUsersData = async (userIds: number[]) => {
    const newData = new Map(usersData);
    for (const userId of userIds) {
      if (!newData.has(userId)) {
        try {
          const userData = await getUserDetailedInfo(userId);
          newData.set(userId, userData);
        } catch (error: any) {
          console.error(`Failed to load user ${userId}:`, error);
        }
      }
    }
    setUsersData(newData);
  };

  const handleUserToggle = (userId: number) => {
    setSelectedUserIds(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  const handleRemoveUser = (userId: number) => {
    setSelectedUserIds(prev => prev.filter(id => id !== userId));
    const newData = new Map(usersData);
    newData.delete(userId);
    setUsersData(newData);
  };

  const handleSearch = () => {
    loadUsers();
    setShowUserSelector(true);
  };

  const toggleWidget = (id: string) => {
    setWidgets(prev => prev.map(w => (w.id === id ? { ...w, visible: !w.visible } : w)));
  };

  const changeWidgetType = (id: string, type: ChartType) => {
    setWidgets(prev => prev.map(w => (w.id === id ? { ...w, type } : w)));
  };

  // ============== Chart Rendering ==============

  const renderLineChart = (
    dataPoints: { x: number; y: number; label: string; value: number; isNow?: boolean }[],
    maxVal: number,
    color: string = 'var(--primary)'
  ) => {
    if (dataPoints.length === 0) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Нет данных
        </div>
      );
    }

    const width = 100;
    const height = 60;
    const padding = 5;

    const points = dataPoints.map((p, i) => ({
      x: padding + (i / (dataPoints.length - 1 || 1)) * (width - padding * 2),
      y: height - padding - (maxVal > 0 ? (p.value / maxVal) * (height - padding * 2) : 0),
      ...p,
    }));

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

    return (
      <div style={{ position: 'relative', width: '100%', height: '200px' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: '100%' }}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient
              id={`gradient-platform-${color.replace(/[^a-z0-9]/gi, '')}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0.05" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
            <line
              key={i}
              x1={padding}
              y1={height - padding - ratio * (height - padding * 2)}
              x2={width - padding}
              y2={height - padding - ratio * (height - padding * 2)}
              stroke="var(--border)"
              strokeWidth="0.2"
              strokeDasharray="1,1"
            />
          ))}
          <path d={areaPath} fill={`url(#gradient-platform-${color.replace(/[^a-z0-9]/gi, '')})`} />
          <path d={linePath} fill="none" stroke={color} strokeWidth="0.8" />
        </svg>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          {points.map((p, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${(i / (dataPoints.length - 1 || 1)) * 100}%`,
                bottom: `${maxVal > 0 ? (p.value / maxVal) * 100 : 0}%`,
                transform: 'translate(-50%, 50%)',
              }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: p.isNow ? '#22c55e' : color,
                  border: '2px solid var(--card-bg)',
                  boxShadow: p.isNow ? '0 0 8px rgba(34, 197, 94, 0.5)' : 'none',
                }}
                title={`${p.label}: ${p.value}`}
              />
            </div>
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            left: '0',
            top: '0',
            bottom: '0',
            width: '30px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            paddingTop: '5px',
            paddingBottom: '5px',
          }}
        >
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{maxVal}</span>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            {Math.round(maxVal / 2)}
          </span>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>0</span>
        </div>
      </div>
    );
  };

  const renderBarChart = (
    dataPoints: { label: string; value: number; isNow?: boolean }[],
    maxVal: number,
    color: string = 'var(--primary)'
  ) => {
    if (dataPoints.length === 0) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Нет данных
        </div>
      );
    }

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '2px',
          height: '180px',
          padding: '10px 0',
        }}
      >
        {dataPoints.map((p, i) => {
          const heightPercent = maxVal > 0 ? (p.value / maxVal) * 100 : 0;
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
              }}
              title={`${p.label}: ${p.value}`}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: '20px',
                  height: `${Math.max(heightPercent, 2)}%`,
                  background: p.isNow ? '#22c55e' : color,
                  borderRadius: '2px 2px 0 0',
                  transition: 'height 0.3s',
                  opacity: p.isNow ? 1 : 0.8,
                }}
              />
              {i % Math.ceil(dataPoints.length / 8) === 0 && (
                <span
                  style={{
                    fontSize: '9px',
                    color: 'var(--text-muted)',
                    marginTop: '4px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderPieChart = (segments: { label: string; value: number; color: string }[]) => {
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    if (total === 0) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Нет данных
        </div>
      );
    }

    let currentAngle = 0;
    const paths = segments.map(seg => {
      const angle = (seg.value / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      const startRad = (startAngle - 90) * (Math.PI / 180);
      const endRad = (endAngle - 90) * (Math.PI / 180);

      const x1 = 50 + 40 * Math.cos(startRad);
      const y1 = 50 + 40 * Math.sin(startRad);
      const x2 = 50 + 40 * Math.cos(endRad);
      const y2 = 50 + 40 * Math.sin(endRad);

      const largeArc = angle > 180 ? 1 : 0;

      return {
        ...seg,
        path: `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`,
        percentage: ((seg.value / total) * 100).toFixed(1),
      };
    });

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <svg viewBox="0 0 100 100" style={{ width: '150px', height: '150px' }}>
          {paths.map((p, i) => (
            <path key={i} d={p.path} fill={p.color} stroke="var(--card-bg)" strokeWidth="1">
              <title>{`${p.label}: ${p.value} (${p.percentage}%)`}</title>
            </path>
          ))}
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {paths.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{ width: '12px', height: '12px', borderRadius: '2px', background: p.color }}
              />
              <span style={{ fontSize: '12px', color: 'var(--text)' }}>{p.label}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                ({p.percentage}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ============== Widget Rendering ==============

  const renderWidget = (widget: Widget) => {
    if (!data || !widget.visible) return null;

    let content: React.ReactNode = null;

    switch (widget.dataKey) {
      case 'hourly_users': {
        const points = data.hourly.map((h, i) => ({
          x: i,
          y: h.users,
          label: h.hour,
          value: h.users,
          isNow: h.is_now,
        }));
        const max = Math.max(...points.map(p => p.value), 1);
        content =
          widget.type === 'bar'
            ? renderBarChart(points, max, '#3b82f6')
            : renderLineChart(points, max, '#3b82f6');
        break;
      }
      case 'hourly_messages': {
        const points = data.hourly.map((h, i) => ({
          x: i,
          y: h.messages,
          label: h.hour,
          value: h.messages,
          isNow: h.is_now,
        }));
        const max = Math.max(...points.map(p => p.value), 1);
        content =
          widget.type === 'line'
            ? renderLineChart(points, max, '#8b5cf6')
            : renderBarChart(points, max, '#8b5cf6');
        break;
      }
      case 'daily_new_users': {
        const points = data.daily.map((d, i) => ({
          x: i,
          y: d.new_bot_users,
          label: d.date_short,
          value: d.new_bot_users,
        }));
        const max = Math.max(...points.map(p => p.value), 1);
        content =
          widget.type === 'line'
            ? renderLineChart(points, max, '#22c55e')
            : renderBarChart(points, max, '#22c55e');
        break;
      }
      case 'daily_platform_users': {
        const points = data.daily.map((d, i) => ({
          x: i,
          y: d.new_platform_users,
          label: d.date_short,
          value: d.new_platform_users,
        }));
        const max = Math.max(...points.map(p => p.value), 1);
        content =
          widget.type === 'bar'
            ? renderBarChart(points, max, '#f59e0b')
            : renderLineChart(points, max, '#f59e0b');
        break;
      }
      case 'daily_active': {
        const points = data.daily.map((d, i) => ({
          x: i,
          y: d.active_users,
          label: d.date_short,
          value: d.active_users,
        }));
        const max = Math.max(...points.map(p => p.value), 1);
        content =
          widget.type === 'bar'
            ? renderBarChart(points, max, '#06b6d4')
            : renderLineChart(points, max, '#06b6d4');
        break;
      }
      case 'daily_messages': {
        const points = data.daily.map((d, i) => ({
          x: i,
          y: d.messages,
          label: d.date_short,
          value: d.messages,
        }));
        const max = Math.max(...points.map(p => p.value), 1);
        content =
          widget.type === 'line'
            ? renderLineChart(points, max, '#ec4899')
            : renderBarChart(points, max, '#ec4899');
        break;
      }
      case 'retention': {
        const segments = [
          { label: 'Активны 7д', value: data.retention.active_7d, color: '#22c55e' },
          {
            label: 'Активны 30д',
            value: data.retention.active_30d - data.retention.active_7d,
            color: '#3b82f6',
          },
          {
            label: 'Неактивны',
            value: Math.max(0, data.retention.total_users - data.retention.active_30d),
            color: '#64748b',
          },
        ];
        content = renderPieChart(segments);
        break;
      }
      case 'messages_direction': {
        const segments = [
          { label: 'Входящие', value: data.messages.incoming, color: '#22c55e' },
          { label: 'Исходящие', value: data.messages.outgoing, color: '#3b82f6' },
        ];
        content = renderPieChart(segments);
        break;
      }
    }

    return (
      <Card key={widget.id} style={{ marginBottom: '16px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h4 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--text)' }}>
            {widget.title}
          </h4>
          <div style={{ display: 'flex', gap: '4px' }}>
            {['bar', 'line', 'pie'].map(t => (
              <button
                key={t}
                onClick={() => changeWidgetType(widget.id, t as ChartType)}
                style={{
                  padding: '6px 10px',
                  background: widget.type === t ? 'var(--primary)' : 'var(--surface)',
                  color: widget.type === t ? 'var(--text-on-primary)' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                {t === 'bar' ? (
                  <BarChart3 size={14} />
                ) : t === 'line' ? (
                  <LineChart size={14} />
                ) : (
                  <PieChart size={14} />
                )}
              </button>
            ))}
          </div>
        </div>
        {content}
      </Card>
    );
  };

  // ============== Aggregated Stats for Selected Users ==============

  const aggregatedStats = {
    total_bots: 0,
    active_bots: 0,
    total_scenarios: 0,
    total_bot_users: 0,
    total_messages: 0,
  };

  selectedUserIds.forEach(userId => {
    const userData = usersData.get(userId);
    if (userData) {
      aggregatedStats.total_bots += userData.statistics.total_bots;
      aggregatedStats.active_bots += userData.statistics.active_bots;
      aggregatedStats.total_scenarios += userData.statistics.total_scenarios;
      aggregatedStats.total_bot_users += userData.statistics.total_bot_users;
      aggregatedStats.total_messages += userData.statistics.total_messages;
    }
  });

  const renderGrowthBadge = (value: number) => {
    if (value === 0) return null;
    const isPositive = value > 0;
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px',
          fontSize: '12px',
          color: isPositive ? '#22c55e' : '#ef4444',
          fontWeight: 500,
        }}
      >
        {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        {isPositive ? '+' : ''}
        {value}%
      </span>
    );
  };

  return (
    <DashboardPage
      title="Платформенная аналитика"
      subtitle="Подробная аналитика и метрики работы всей платформы"
    >
      {/* Period Selection */}
      <Card style={{ marginBottom: '24px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={20} style={{ color: 'var(--primary)' }} />
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>Период:</span>
            {(['7d', '30d', '90d'] as PeriodType[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '8px 16px',
                  background: period === p ? 'var(--primary)' : 'var(--surface)',
                  color: period === p ? 'var(--text-on-primary)' : 'var(--text)',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {p === '7d' ? '7 дней' : p === '30d' ? '30 дней' : '90 дней'}
              </button>
            ))}
            <button
              onClick={() => setPeriod('custom')}
              style={{
                padding: '8px 16px',
                background: period === 'custom' ? 'var(--primary)' : 'var(--surface)',
                color: period === 'custom' ? 'var(--text-on-primary)' : 'var(--text)',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Свой период
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{
                padding: '8px 16px',
                background: showFilters ? 'var(--primary)' : 'var(--surface)',
                color: showFilters ? 'var(--text-on-primary)' : 'var(--text)',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Filter size={16} />
              Фильтры
            </button>
            <button
              onClick={loadAnalytics}
              style={{
                padding: '8px 16px',
                background: 'var(--surface)',
                color: 'var(--text)',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <RefreshCw size={16} />
              Обновить
            </button>
          </div>
        </div>

        {period === 'custom' && (
          <div style={{ display: 'flex', gap: '16px', marginTop: '16px', flexWrap: 'wrap' }}>
            <div>
              <label
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                От
              </label>
              <input
                type="date"
                value={customDateFrom}
                onChange={e => setCustomDateFrom(e.target.value)}
                style={{
                  padding: '8px 12px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                До
              </label>
              <input
                type="date"
                value={customDateTo}
                onChange={e => setCustomDateTo(e.target.value)}
                style={{
                  padding: '8px 12px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                }}
              />
            </div>
          </div>
        )}

        {showFilters && (
          <div
            style={{
              marginTop: '16px',
              padding: '16px',
              background: 'var(--surface)',
              borderRadius: '8px',
            }}
          >
            <h4
              style={{
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '12px',
                color: 'var(--text)',
              }}
            >
              Показывать виджеты:
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {widgets.map(w => (
                <button
                  key={w.id}
                  onClick={() => toggleWidget(w.id)}
                  style={{
                    padding: '6px 12px',
                    background: w.visible ? 'rgba(255, 210, 76, 0.2)' : 'var(--card-bg)',
                    border: w.visible ? '1px solid var(--primary)' : '1px solid var(--border)',
                    borderRadius: '6px',
                    color: w.visible ? 'var(--primary)' : 'var(--text-muted)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {w.visible && <Check size={12} />}
                  {w.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {loading ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <RefreshCw
              size={40}
              style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }}
            />
            <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Загрузка аналитики...</p>
          </div>
        </Card>
      ) : data ? (
        <>
          {/* Summary KPI Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    padding: '12px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    borderRadius: '12px',
                  }}
                >
                  <Users size={24} style={{ color: '#3b82f6' }} />
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                    Пользователей
                  </p>
                  <p
                    style={{
                      fontSize: '24px',
                      fontWeight: 700,
                      margin: '4px 0',
                      color: 'var(--text)',
                    }}
                  >
                    {data.summary.total_users}
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    padding: '12px',
                    background: 'rgba(255, 210, 76, 0.1)',
                    borderRadius: '12px',
                  }}
                >
                  <Bot size={24} style={{ color: '#ffd24c' }} />
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Ботов</p>
                  <p
                    style={{
                      fontSize: '24px',
                      fontWeight: 700,
                      margin: '4px 0',
                      color: 'var(--text)',
                    }}
                  >
                    {data.summary.total_bots}
                    <span style={{ fontSize: '14px', color: '#22c55e', marginLeft: '8px' }}>
                      ({data.summary.active_bots} акт.)
                    </span>
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    padding: '12px',
                    background: 'rgba(139, 92, 246, 0.1)',
                    borderRadius: '12px',
                  }}
                >
                  <Workflow size={24} style={{ color: '#8b5cf6' }} />
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                    Сценариев
                  </p>
                  <p
                    style={{
                      fontSize: '24px',
                      fontWeight: 700,
                      margin: '4px 0',
                      color: 'var(--text)',
                    }}
                  >
                    {data.summary.total_scenarios}
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    padding: '12px',
                    background: 'rgba(34, 197, 94, 0.1)',
                    borderRadius: '12px',
                  }}
                >
                  <UserPlus size={24} style={{ color: '#22c55e' }} />
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                    Пользователей ботов
                  </p>
                  <p
                    style={{
                      fontSize: '24px',
                      fontWeight: 700,
                      margin: '4px 0',
                      color: 'var(--text)',
                    }}
                  >
                    {data.summary.total_bot_users}
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    padding: '12px',
                    background: 'rgba(236, 72, 153, 0.1)',
                    borderRadius: '12px',
                  }}
                >
                  <MessageCircle size={24} style={{ color: '#ec4899' }} />
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                    Сообщений
                  </p>
                  <p
                    style={{
                      fontSize: '24px',
                      fontWeight: 700,
                      margin: '4px 0',
                      color: 'var(--text)',
                    }}
                  >
                    {data.summary.total_messages}
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    padding: '12px',
                    background: 'rgba(34, 197, 94, 0.1)',
                    borderRadius: '12px',
                  }}
                >
                  <Zap size={24} style={{ color: '#22c55e' }} />
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                    Сейчас онлайн
                  </p>
                  <p
                    style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0', color: '#22c55e' }}
                  >
                    {data.online_now}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Growth & Peaks */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            <Card>
              <h4
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  marginBottom: '16px',
                  color: 'var(--text)',
                }}
              >
                📈 Рост за период
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Новых пользователей ботов</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                      {data.growth.current_new_users}
                    </span>
                    {renderGrowthBadge(data.growth.users_growth)}
                  </div>
                </div>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Сообщений</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                      {data.messages.total}
                    </span>
                    {renderGrowthBadge(data.growth.messages_growth)}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <h4
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  marginBottom: '16px',
                  color: 'var(--text)',
                }}
              >
                ⏰ Пики активности
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Пиковый час</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {data.peaks.peak_hour} ({data.peaks.peak_hour_users} польз.)
                  </span>
                </div>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Пиковый день</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {data.peaks.peak_day} ({data.peaks.peak_day_users} польз.)
                  </span>
                </div>
              </div>
            </Card>

            <Card>
              <h4
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  marginBottom: '16px',
                  color: 'var(--text)',
                }}
              >
                🔄 Удержание
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Retention 7d</span>
                  <span style={{ fontWeight: 600, color: '#22c55e' }}>
                    {data.retention.retention_7d}%
                  </span>
                </div>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Retention 30d</span>
                  <span style={{ fontWeight: 600, color: '#3b82f6' }}>
                    {data.retention.retention_30d}%
                  </span>
                </div>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Возвращаемость</span>
                  <span style={{ fontWeight: 600, color: '#8b5cf6' }}>
                    {data.retention.return_rate}%
                  </span>
                </div>
              </div>
            </Card>
          </div>

          {/* Charts */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            {widgets.filter(w => w.visible).map(w => renderWidget(w))}
          </div>
        </>
      ) : null}

      {/* User Selector Section */}
      <Card style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <Filter size={20} style={{ color: 'var(--primary)' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--text)' }}>
            Аналитика по отдельным пользователям
          </h3>
        </div>

        {selectedUserIds.length > 0 && (
          <div style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {selectedUserIds.map(userId => {
              const userData = usersData.get(userId);
              const userName = userData?.user.name || userData?.user.email || `ID: ${userId}`;
              return (
                <div
                  key={userId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    background: 'rgba(255, 210, 76, 0.2)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 210, 76, 0.3)',
                  }}
                >
                  <Users size={14} style={{ color: 'var(--primary)' }} />
                  <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>
                    {userName}
                  </span>
                  <button
                    onClick={() => handleRemoveUser(userId)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0',
                      display: 'flex',
                      alignItems: 'center',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
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
              placeholder="Поиск пользователей для анализа..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleSearch()}
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
            onClick={handleSearch}
            style={{
              padding: '10px 20px',
              background: 'var(--primary)',
              color: 'var(--text-on-primary)',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Найти
          </button>
        </div>

        {showUserSelector && (
          <div
            style={{
              maxHeight: '300px',
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '8px',
            }}
          >
            {loadingUsers ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                Загрузка...
              </div>
            ) : users.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                Пользователи не найдены
              </div>
            ) : (
              users.map(user => {
                const isSelected = selectedUserIds.includes(user.id);
                return (
                  <div
                    key={user.id}
                    onClick={() => handleUserToggle(user.id)}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(255, 210, 76, 0.1)' : 'transparent',
                      border: isSelected
                        ? '1px solid rgba(255, 210, 76, 0.3)'
                        : '1px solid transparent',
                      marginBottom: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {isSelected ? (
                        <Check size={18} style={{ color: 'var(--primary)' }} />
                      ) : (
                        <div
                          style={{
                            width: '18px',
                            height: '18px',
                            border: '2px solid var(--border)',
                            borderRadius: '4px',
                          }}
                        />
                      )}
                      <div>
                        <p
                          style={{
                            fontSize: '14px',
                            fontWeight: 500,
                            margin: 0,
                            color: 'var(--text)',
                          }}
                        >
                          {user.name || 'Без имени'}
                        </p>
                        <p
                          style={{
                            fontSize: '12px',
                            color: 'var(--text-muted)',
                            margin: '2px 0 0 0',
                          }}
                        >
                          {user.email}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        navigate(`/dashboard/platform/users/${user.id}`);
                      }}
                      style={{
                        padding: '4px 8px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#3b82f6',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      Подробнее
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </Card>

      {/* Selected Users Aggregated Stats */}
      {selectedUserIds.length > 0 && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              marginTop: '24px',
              marginBottom: '24px',
            }}
          >
            <Card>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <div>
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 8px 0' }}>
                    Ботов выбранных
                  </p>
                  <p style={{ fontSize: '32px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                    {aggregatedStats.total_bots}
                  </p>
                </div>
                <div
                  style={{
                    padding: '16px',
                    background: 'rgba(255, 210, 76, 0.1)',
                    borderRadius: '12px',
                  }}
                >
                  <BarChart3 size={32} style={{ color: '#ffd24c' }} />
                </div>
              </div>
            </Card>

            <Card>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <div>
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 8px 0' }}>
                    Активных ботов
                  </p>
                  <p style={{ fontSize: '32px', fontWeight: 700, margin: 0, color: '#22c55e' }}>
                    {aggregatedStats.active_bots}
                  </p>
                </div>
                <div
                  style={{
                    padding: '16px',
                    background: 'rgba(34, 197, 94, 0.1)',
                    borderRadius: '12px',
                  }}
                >
                  <TrendingUp size={32} style={{ color: '#22c55e' }} />
                </div>
              </div>
            </Card>

            <Card>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <div>
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 8px 0' }}>
                    Пользователей ботов
                  </p>
                  <p style={{ fontSize: '32px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                    {aggregatedStats.total_bot_users}
                  </p>
                </div>
                <div
                  style={{
                    padding: '16px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    borderRadius: '12px',
                  }}
                >
                  <Users size={32} style={{ color: '#3b82f6' }} />
                </div>
              </div>
            </Card>

            <Card>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <div>
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 8px 0' }}>
                    Всего сообщений
                  </p>
                  <p style={{ fontSize: '32px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                    {aggregatedStats.total_messages}
                  </p>
                </div>
                <div
                  style={{
                    padding: '16px',
                    background: 'rgba(139, 92, 246, 0.1)',
                    borderRadius: '12px',
                  }}
                >
                  <MessageCircle size={32} style={{ color: '#8b5cf6' }} />
                </div>
              </div>
            </Card>
          </div>

          {/* Individual User Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {selectedUserIds.map(userId => {
              const userData = usersData.get(userId);
              if (!userData) return null;

              return (
                <Card key={userId}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '16px',
                    }}
                  >
                    <div>
                      <h4
                        style={{
                          fontSize: '18px',
                          fontWeight: 600,
                          margin: '0 0 4px 0',
                          color: 'var(--text)',
                        }}
                      >
                        {userData.user.name || userData.user.email}
                      </h4>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                        {userData.user.email}
                      </p>
                    </div>
                    <button
                      onClick={() => navigate(`/dashboard/platform/users/${userId}`)}
                      style={{
                        padding: '8px 16px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#3b82f6',
                        fontSize: '14px',
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      Подробнее
                    </button>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <p
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          margin: '0 0 4px 0',
                        }}
                      >
                        Ботов
                      </p>
                      <p
                        style={{
                          fontSize: '20px',
                          fontWeight: 700,
                          margin: 0,
                          color: 'var(--text)',
                        }}
                      >
                        {userData.statistics.total_bots} ({userData.statistics.active_bots}{' '}
                        активных)
                      </p>
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          margin: '0 0 4px 0',
                        }}
                      >
                        Сценариев
                      </p>
                      <p
                        style={{
                          fontSize: '20px',
                          fontWeight: 700,
                          margin: 0,
                          color: 'var(--text)',
                        }}
                      >
                        {userData.statistics.total_scenarios}
                      </p>
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          margin: '0 0 4px 0',
                        }}
                      >
                        Пользователей
                      </p>
                      <p
                        style={{
                          fontSize: '20px',
                          fontWeight: 700,
                          margin: 0,
                          color: 'var(--text)',
                        }}
                      >
                        {userData.statistics.total_bot_users}
                      </p>
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          margin: '0 0 4px 0',
                        }}
                      >
                        Сообщений
                      </p>
                      <p
                        style={{
                          fontSize: '20px',
                          fontWeight: 700,
                          margin: 0,
                          color: 'var(--text)',
                        }}
                      >
                        {userData.statistics.total_messages}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </DashboardPage>
  );
}
