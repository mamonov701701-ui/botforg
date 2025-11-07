import React, { useState } from 'react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { useAuthStore } from '../../../stores/authStore';
import { hasAccessToAction } from '../../../constants/roles';

type TabType = 'profile' | 'integrations' | 'interface' | 'agent';

interface Integration {
  id: string;
  name: string;
  icon: string;
  status: 'connected' | 'disconnected' | 'error';
  description: string;
}

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('profile');

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
  });

  const integrations: Integration[] = [
    {
      id: 'telegram',
      name: 'Telegram Bot API',
      icon: '📱',
      status: 'connected',
      description: 'Подключение ботов к Telegram',
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp Business',
      icon: '💬',
      status: 'disconnected',
      description: 'Подключение ботов к WhatsApp',
    },
    {
      id: 'google_sheets',
      name: 'Google Sheets',
      icon: '📊',
      status: 'connected',
      description: 'Экспорт данных в Google Таблицы',
    },
    {
      id: 'payments',
      name: 'Платёжные системы',
      icon: '💳',
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

  const handleSaveProfile = () => {
    console.log('Save profile:', profileData);
    // TODO: API call
  };

  const handleSaveInterface = () => {
    console.log('Save interface:', interfaceSettings);
    // TODO: Apply settings
  };

  const handleSaveNotifications = () => {
    console.log('Save notifications:', notificationSettings);
    // TODO: API call
  };

  const handleSaveAgent = () => {
    console.log('Save agent:', agentSettings);
    // TODO: API call
  };

  const tabs = [
    { id: 'profile' as TabType, label: 'Профиль' },
    { id: 'integrations' as TabType, label: 'Интеграции' },
    { id: 'interface' as TabType, label: 'Интерфейс и уведомления' },
    { id: 'agent' as TabType, label: 'BF Agent' },
  ];

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
                <option value="en">English</option>
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
                style={{
                  padding: '12px 24px',
                  background: 'var(--primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
              >
                Сохранить
              </button>
              <button
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
          {integrations.map(integration => (
            <Card key={integration.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '8px',
                    background: 'var(--card)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                  }}
                >
                  {integration.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
                    {integration.name}
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
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
          ))}
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
                style={{
                  padding: '12px 24px',
                  background: 'var(--primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
              >
                Применить
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
                style={{
                  padding: '12px 24px',
                  marginTop: '16px',
                  background: 'var(--primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
              >
                Сохранить
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
              style={{
                padding: '12px 24px',
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
            >
              Сохранить
            </button>
          </div>
        </Card>
      )}
    </DashboardPage>
  );
}
