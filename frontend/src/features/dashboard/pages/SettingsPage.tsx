import React, { useState, useEffect } from 'react';
import { Smartphone, MessageSquare, FileSpreadsheet, CreditCard } from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { useAuthStore } from '../../../stores/authStore';
import { hasAccessToAction } from '../../../constants/roles';
import { getSettings, updateSettings, updateMe } from '../../../api/auth';
import { toast } from '../../../utils/toast';

type TabType = 'profile' | 'integrations' | 'interface' | 'agent';

interface Integration {
  id: string;
  name: string;
  icon: string;
  status: 'connected' | 'disconnected' | 'error';
  description: string;
}

export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);

  // Стейт для профиля
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    language: 'ru',
    timezone: 'Europe/Moscow',
    twoFactorEnabled: false,
  });

  // Стейт для интерфейса
  const [interfaceSettings, setInterfaceSettings] = useState({
    theme: 'system',
    density: 'comfortable',
    fontSize: 'medium',
  });

  // Стейт для уведомлений
  const [notificationSettings, setNotificationSettings] = useState({
    email: {
      botErrors: true,
      payments: true,
      teamChanges: false,
    },
    telegram: {
      botErrors: false,
      payments: true,
      teamChanges: false,
    },
  });

  // Стейт для BF Agent
  const [agentSettings, setAgentSettings] = useState({
    enabled: false,
    mode: 'advisor',
    dataPolicy: 'minimal',
    allowSendTextToAi: false,
  });

  // Загрузка настроек с бэкенда
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingSettings(true);
        const data = await getSettings();
        if (cancelled) return;
        setProfileData({
          name: data.profile.name ?? '',
          email: data.profile.email ?? '',
          language: data.profile.language ?? 'ru',
          timezone: data.profile.timezone ?? 'Europe/Moscow',
          twoFactorEnabled: data.profile.two_factor_enabled ?? false,
        });
        setInterfaceSettings({
          theme: data.interface?.theme ?? 'system',
          density: data.interface?.density ?? 'comfortable',
          fontSize: data.interface?.font_size ?? 'medium',
        });
        setNotificationSettings({
          email: {
            botErrors: data.notifications?.email?.bot_errors ?? true,
            payments: data.notifications?.email?.payments ?? true,
            teamChanges: data.notifications?.email?.team_changes ?? false,
          },
          telegram: {
            botErrors: data.notifications?.telegram?.bot_errors ?? false,
            payments: data.notifications?.telegram?.payments ?? true,
            teamChanges: data.notifications?.telegram?.team_changes ?? false,
          },
        });
        setAgentSettings({
          enabled: data.agent?.enabled ?? false,
          mode: data.agent?.mode ?? 'advisor',
          dataPolicy: data.agent?.data_policy ?? 'minimal',
          allowSendTextToAi: data.agent?.allow_send_text_to_ai ?? false,
        });
      } catch (e) {
        if (!cancelled) toast.error('Не удалось загрузить настройки');
      } finally {
        if (!cancelled) setLoadingSettings(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const integrations: Integration[] = [
    {
      id: 'telegram',
      name: 'Telegram Bot API',
      icon: 'Smartphone',
      status: 'connected',
      description: 'Подключение ботов к Telegram',
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp Business',
      icon: 'MessageSquare',
      status: 'disconnected',
      description: 'Подключение ботов к WhatsApp',
    },
    {
      id: 'google_sheets',
      name: 'Google Sheets',
      icon: 'FileSpreadsheet',
      status: 'connected',
      description: 'Экспорт данных в Google Таблицы',
    },
    {
      id: 'payments',
      name: 'Платёжные системы',
      icon: 'CreditCard',
      status: 'connected',
      description: 'YooKassa, Stripe, Telegram Payments',
    },
  ];

  const statusColors = {
    connected: { bg: '#10b98120', color: '#10b981', label: 'Подключено' },
    disconnected: { bg: '#6b728020', color: '#6b7280', label: 'Не подключено' },
    error: { bg: '#ef444420', color: '#ef4444', label: 'Ошибка' },
  };

  const canEditIntegrations = hasAccessToAction(user?.role, 'settings_integrations');

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      await updateMe({ name: profileData.name || null });
      await updateSettings({
        profile: {
          language: profileData.language,
          timezone: profileData.timezone,
          two_factor_enabled: profileData.twoFactorEnabled,
        },
      });
      setUser(user ? { ...user, name: profileData.name || null } : null);
      toast.success('Профиль сохранён');
    } catch {
      toast.error('Не удалось сохранить профиль');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveInterface = async () => {
    try {
      setSaving(true);
      await updateSettings({
        interface: {
          theme: interfaceSettings.theme,
          density: interfaceSettings.density,
          font_size: interfaceSettings.fontSize,
        },
      });
      toast.success('Настройки интерфейса применены');
    } catch {
      toast.error('Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    try {
      setSaving(true);
      await updateSettings({
        notifications: {
          email: {
            bot_errors: notificationSettings.email.botErrors,
            payments: notificationSettings.email.payments,
            team_changes: notificationSettings.email.teamChanges,
          },
          telegram: {
            bot_errors: notificationSettings.telegram.botErrors,
            payments: notificationSettings.telegram.payments,
            team_changes: notificationSettings.telegram.teamChanges,
          },
        },
      });
      toast.success('Настройки уведомлений сохранены');
    } catch {
      toast.error('Не удалось сохранить уведомления');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAgent = async () => {
    try {
      setSaving(true);
      await updateSettings({
        agent: {
          enabled: agentSettings.enabled,
          mode: agentSettings.mode,
          data_policy: agentSettings.dataPolicy,
          allow_send_text_to_ai: agentSettings.allowSendTextToAi,
        },
      });
      toast.success('Настройки BF Agent сохранены');
    } catch {
      toast.error('Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'profile' as TabType, label: 'Профиль' },
    { id: 'integrations' as TabType, label: 'Интеграции' },
    { id: 'interface' as TabType, label: 'Интерфейс и уведомления' },
    { id: 'agent' as TabType, label: 'BF Agent' },
  ];

  if (loadingSettings) {
    return (
      <DashboardPage title="Настройки" subtitle="Управление аккаунтом и настройками">
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Загрузка настроек...
        </div>
      </DashboardPage>
    );
  }

  return (
    <DashboardPage title="Настройки" subtitle="Управление аккаунтом и настройками">
      {/* Вкладки */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 20px',
              background: 'transparent',
              border: 'none',
              borderBottom:
                activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--primary)' : 'var(--text)',
              fontSize: '15px',
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Профиль */}
      {activeTab === 'profile' && (
        <Card>
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px' }}>
            Личная информация
          </h3>

          <div style={{ maxWidth: '600px' }}>
            {/* Имя */}
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: '8px',
                }}
              >
                Имя
              </label>
              <input
                type="text"
                value={profileData.name}
                onChange={e => setProfileData({ ...profileData, name: e.target.value })}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  color: 'var(--text)',
                  outline: 'none',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
            </div>

            {/* Email */}
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: '8px',
                }}
              >
                Email
              </label>
              <input
                type="email"
                value={profileData.email}
                onChange={e => setProfileData({ ...profileData, email: e.target.value })}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  color: 'var(--text)',
                  outline: 'none',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
            </div>

            {/* Язык */}
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: '8px',
                }}
              >
                Язык
              </label>
              <select
                value={profileData.language}
                onChange={e => setProfileData({ ...profileData, language: e.target.value })}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="ru">Русский</option>
                <option value="en">Английский</option>
              </select>
            </div>

            {/* Часовой пояс */}
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: '8px',
                }}
              >
                Часовой пояс
              </label>
              <select
                value={profileData.timezone}
                onChange={e => setProfileData({ ...profileData, timezone: e.target.value })}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="Europe/Moscow">Москва (UTC+3)</option>
                <option value="Europe/London">Лондон (UTC+0)</option>
                <option value="America/New_York">Нью-Йорк (UTC-5)</option>
              </select>
            </div>

            {/* 2FA */}
            <div style={{ marginBottom: '24px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={profileData.twoFactorEnabled}
                  onChange={e =>
                    setProfileData({ ...profileData, twoFactorEnabled: e.target.checked })
                  }
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                    accentColor: 'var(--primary)',
                  }}
                />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>
                    Двухфакторная аутентификация
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Дополнительная защита вашего аккаунта
                  </div>
                </div>
              </label>
            </div>

            {/* Кнопки */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                style={{
                  padding: '12px 24px',
                  background: 'var(--primary)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e =>
                  !saving && (e.currentTarget.style.background = 'var(--primary-hover)')
                }
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button
                onClick={() => setShowPasswordModal(true)}
                style={{
                  padding: '12px 24px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  color: 'var(--text)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                Сменить пароль
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Интеграции */}
      {activeTab === 'integrations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {integrations.map(integration => {
            const iconMap: Record<string, import('../../../types/icons').DashboardIcon> = {
              Smartphone,
              MessageSquare,
              FileSpreadsheet,
              CreditCard,
            };
            const IntegrationIcon = iconMap[integration.icon] || CreditCard;

            return (
              <Card key={integration.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '8px',
                      background: 'rgba(255, 210, 76, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <IntegrationIcon size={24} style={{ color: 'var(--primary)' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
                      {integration.name}
                    </h3>
                    <p
                      style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}
                    >
                      {integration.description}
                    </p>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 500,
                        background: statusColors[integration.status].bg,
                        color: statusColors[integration.status].color,
                      }}
                    >
                      {statusColors[integration.status].label}
                    </span>
                  </div>
                  {canEditIntegrations && (
                    <button
                      style={{
                        padding: '10px 20px',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        color: 'var(--text)',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {integration.status === 'connected' ? 'Настроить' : 'Подключить'}
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Интерфейс и уведомления */}
      {activeTab === 'interface' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Интерфейс */}
          <Card>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>Интерфейс</h3>
            <div style={{ maxWidth: '600px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    marginBottom: '8px',
                  }}
                >
                  Тема
                </label>
                <select
                  value={interfaceSettings.theme}
                  onChange={e =>
                    setInterfaceSettings({ ...interfaceSettings, theme: e.target.value })
                  }
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="system">Системная</option>
                  <option value="light">Светлая</option>
                  <option value="dark">Тёмная</option>
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    marginBottom: '8px',
                  }}
                >
                  Плотность
                </label>
                <select
                  value={interfaceSettings.density}
                  onChange={e =>
                    setInterfaceSettings({ ...interfaceSettings, density: e.target.value })
                  }
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="compact">Компактная</option>
                  <option value="comfortable">Комфортная</option>
                  <option value="spacious">Просторная</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    marginBottom: '8px',
                  }}
                >
                  Размер шрифта
                </label>
                <select
                  value={interfaceSettings.fontSize}
                  onChange={e =>
                    setInterfaceSettings({ ...interfaceSettings, fontSize: e.target.value })
                  }
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="small">Маленький</option>
                  <option value="medium">Средний</option>
                  <option value="large">Большой</option>
                </select>
              </div>

              <button
                onClick={handleSaveInterface}
                disabled={saving}
                style={{
                  padding: '12px 24px',
                  background: 'var(--primary)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e =>
                  !saving && (e.currentTarget.style.background = 'var(--primary-hover)')
                }
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
              >
                {saving ? 'Сохранение...' : 'Применить'}
              </button>
            </div>
          </Card>

          {/* Уведомления */}
          <Card>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>Уведомления</h3>
            <div style={{ maxWidth: '600px' }}>
              <h4 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Email</h4>
              {Object.entries({
                botErrors: 'Ошибки ботов',
                payments: 'Платежи',
                teamChanges: 'Изменения в команде',
              }).map(([key, label]) => (
                <div key={key} style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input
                      type="checkbox"
                      checked={
                        notificationSettings.email[key as keyof typeof notificationSettings.email]
                      }
                      onChange={e =>
                        setNotificationSettings({
                          ...notificationSettings,
                          email: { ...notificationSettings.email, [key]: e.target.checked },
                        })
                      }
                      style={{
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                        accentColor: 'var(--primary)',
                      }}
                    />
                    <span style={{ fontSize: '14px' }}>{label}</span>
                  </label>
                </div>
              ))}

              <h4
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  marginTop: '24px',
                  marginBottom: '12px',
                }}
              >
                Telegram
              </h4>
              {Object.entries({
                botErrors: 'Ошибки ботов',
                payments: 'Платежи',
                teamChanges: 'Изменения в команде',
              }).map(([key, label]) => (
                <div key={key} style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input
                      type="checkbox"
                      checked={
                        notificationSettings.telegram[
                          key as keyof typeof notificationSettings.telegram
                        ]
                      }
                      onChange={e =>
                        setNotificationSettings({
                          ...notificationSettings,
                          telegram: { ...notificationSettings.telegram, [key]: e.target.checked },
                        })
                      }
                      style={{
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                        accentColor: 'var(--primary)',
                      }}
                    />
                    <span style={{ fontSize: '14px' }}>{label}</span>
                  </label>
                </div>
              ))}

              <button
                onClick={handleSaveNotifications}
                disabled={saving}
                style={{
                  padding: '12px 24px',
                  marginTop: '16px',
                  background: 'var(--primary)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e =>
                  !saving && (e.currentTarget.style.background = 'var(--primary-hover)')
                }
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* BF Agent */}
      {activeTab === 'agent' && (
        <Card>
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>
            BF Agent (AI-помощник)
          </h3>
          <div style={{ maxWidth: '600px' }}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input
                  type="checkbox"
                  checked={agentSettings.enabled}
                  onChange={e => setAgentSettings({ ...agentSettings, enabled: e.target.checked })}
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                    accentColor: 'var(--primary)',
                  }}
                />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>Включить BF Agent</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    AI-помощник для анализа и оптимизации ботов
                  </div>
                </div>
              </label>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input
                  type="checkbox"
                  checked={agentSettings.allowSendTextToAi}
                  onChange={e =>
                    setAgentSettings({ ...agentSettings, allowSendTextToAi: e.target.checked })
                  }
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                    accentColor: 'var(--primary)',
                  }}
                />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>
                    Разрешить отправку текста в AI
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Чат, генерация изображений и TTS будут доступны только при включении (152-ФЗ)
                  </div>
                </div>
              </label>
            </div>

            {agentSettings.enabled && (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: 500,
                      marginBottom: '8px',
                    }}
                  >
                    Режим работы
                  </label>
                  <select
                    value={agentSettings.mode}
                    onChange={e => setAgentSettings({ ...agentSettings, mode: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    <option value="advisor">Советник (только рекомендации)</option>
                    <option value="report">Отчёты (периодическая аналитика)</option>
                    <option value="auto">Автоматический (с исправлениями)</option>
                  </select>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: 500,
                      marginBottom: '8px',
                    }}
                  >
                    Политика данных
                  </label>
                  <select
                    value={agentSettings.dataPolicy}
                    onChange={e =>
                      setAgentSettings({ ...agentSettings, dataPolicy: e.target.value })
                    }
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    <option value="minimal">Минимальная (только статистика)</option>
                    <option value="standard">Стандартная (статистика + метаданные)</option>
                    <option value="full">Полная (доступ ко всем данным)</option>
                  </select>
                </div>
              </>
            )}

            <button
              onClick={handleSaveAgent}
              disabled={saving}
              style={{
                padding: '12px 24px',
                background: 'var(--primary)',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e =>
                !saving && (e.currentTarget.style.background = 'var(--primary-hover)')
              }
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </Card>
      )}

      {/* Модальное окно смены пароля */}
      {showPasswordModal && (
        <ChangePasswordModal
          onClose={() => setShowPasswordModal(false)}
          onSuccess={() => alert('Пароль успешно изменён!')}
        />
      )}
    </DashboardPage>
  );
}
