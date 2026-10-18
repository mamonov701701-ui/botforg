import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Link, useSearchParams } from 'react-router-dom';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import PasswordField from '../../../components/PasswordField';
import { getSettings, resendVerification, updateSettings } from '../../../api/auth';
import {
  type AccountProfile,
  type AccountSession,
  cancelTotpSetup,
  changeAccountPassword,
  claimUsername,
  confirmTotp,
  disableTotp,
  exportAccountData,
  getAccountProfile,
  getDeletionRequest,
  getOptionalConsents,
  listAccountSessions,
  removeAvatar,
  removePhone,
  requestAccountDeletion,
  requestEmailChange,
  revokeAccountSession,
  revokeOtherSessions,
  saveAccountProfile,
  savePhone,
  setAdvertisingConsent,
  setupTotp,
  uploadAvatar,
} from '../../../api/account';

type Tab = 'profile' | 'security' | 'notifications' | 'privacy';
const actionStyle: React.CSSProperties = {
  minHeight: 44,
  border: 0,
  borderRadius: 10,
  padding: '10px 16px',
  background: '#FFB300',
  color: '#0A1B3D',
  fontWeight: 700,
  cursor: 'pointer',
};
const dangerStyle: React.CSSProperties = {
  ...actionStyle,
  background: 'transparent',
  color: '#FF3B30',
  border: '1px solid #FF3B30',
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 44,
  boxSizing: 'border-box',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--text)',
};
const rowStyle: React.CSSProperties = { display: 'grid', gap: 8, marginBottom: 16 };

function describeClient(agent: string): string {
  const browser = /Edg\//.test(agent)
    ? 'Microsoft Edge'
    : /Firefox\//.test(agent)
      ? 'Firefox'
      : /Chrome\//.test(agent)
        ? 'Chrome'
        : /Safari\//.test(agent)
          ? 'Safari'
          : 'Браузер не определён';
  const platform = /Windows/i.test(agent)
    ? 'Windows'
    : /Android/i.test(agent)
      ? 'Android'
      : /iPhone|iPad/i.test(agent)
        ? 'iOS'
        : /Macintosh|Mac OS/i.test(agent)
          ? 'macOS'
          : /Linux/i.test(agent)
            ? 'Linux'
            : 'система не определена';
  return `${browser} · ${platform}`;
}

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get('tab');
  const tab: Tab =
    selected === 'security' || selected === 'notifications' || selected === 'privacy'
      ? selected
      : 'profile';
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [name, setName] = useState('');
  const [usernameDraft, setUsernameDraft] = useState('');
  const [usernameStatus, setUsernameStatus] = useState('');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSecret, setTotpSecret] = useState('');
  const [totpUri, setTotpUri] = useState('');
  const [totpQr, setTotpQr] = useState('');
  const [showTotpSecret, setShowTotpSecret] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [passwordCurrent, setPasswordCurrent] = useState('');
  const [totpPassword, setTotpPassword] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [deletionPassword, setDeletionPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [code, setCode] = useState('');
  const [deletionStatus, setDeletionStatus] = useState('none');
  const [advertisingConsent, setAdvertisingConsentState] = useState(false);
  const [theme, setTheme] = useState('system');
  const [density, setDensity] = useState('comfortable');
  const [fontSize, setFontSize] = useState('medium');
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [agentMode, setAgentMode] = useState('advisor');
  const [agentDataPolicy, setAgentDataPolicy] = useState('minimal');
  const [agentAllowText, setAgentAllowText] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let canceled = false;
    Promise.all([
      getAccountProfile(),
      getSettings(),
      listAccountSessions(),
      getDeletionRequest(),
      getOptionalConsents(),
    ])
      .then(([person, settings, active, deletion, consents]) => {
        if (canceled) return;
        setProfile(person);
        setName(person.name || '');
        setUsernameDraft(person.username || '');
        setDob(person.date_of_birth || '');
        setPhone(person.phone || '');
        setSessions(active);
        setTotpEnabled(settings.profile.two_factor_enabled);
        setDeletionStatus(deletion.status);
        setAdvertisingConsentState(consents.advertising_consent);
        setTheme(settings.interface.theme);
        setDensity(settings.interface.density);
        setFontSize(settings.interface.font_size);
        setAgentEnabled(settings.agent.enabled);
        setAgentMode(settings.agent.mode);
        setAgentDataPolicy(settings.agent.data_policy);
        setAgentAllowText(!!settings.agent.allow_send_text_to_ai);
      })
      .catch(() => {
        if (!canceled) setError('Не удалось загрузить настройки. Обновите страницу.');
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    setUsernameStatus('');
    if (profile?.username || usernameDraft.length < 3) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/auth/email/username-availability?username=${encodeURIComponent(usernameDraft)}`,
          { signal: controller.signal }
        );
        if (response.ok) setUsernameStatus((await response.json()).message);
      } catch (reason: any) {
        if (reason?.name !== 'AbortError') setUsernameStatus('Проверка ника временно недоступна');
      }
    }, 600);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [profile?.username, usernameDraft]);

  useEffect(() => {
    if (!totpUri) {
      setTotpQr('');
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(totpUri, { margin: 2, width: 224 }).then(url => {
      if (!cancelled) setTotpQr(url);
    });
    return () => {
      cancelled = true;
    };
  }, [totpUri]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(success);
    } catch (reason: any) {
      setError(reason?.message || 'Не удалось выполнить действие. Попробуйте снова.');
    } finally {
      setEmailPassword('');
      setPasswordCurrent('');
      setTotpPassword('');
      setDisablePassword('');
      setDeletionPassword('');
      setNewPassword('');
      setCode('');
      setBusy(false);
    }
  };

  const refreshSessions = async () => setSessions(await listAccountSessions());
  const switchTab = async (next: Tab) => {
    if (busy || next === tab) return;
    if (totpSecret) {
      setBusy(true);
      try {
        await cancelTotpSetup();
      } catch {
        setError('Не удалось отменить настройку защиты. Повторите попытку.');
        setBusy(false);
        return;
      }
      setTotpSecret('');
      setTotpUri('');
      setBusy(false);
    }
    setShowTotpSecret(false);
    setBackupCodes([]);
    setEmailPassword('');
    setPasswordCurrent('');
    setTotpPassword('');
    setDisablePassword('');
    setDeletionPassword('');
    setNewPassword('');
    setCode('');
    setSearchParams({ tab: next });
    setMessage('');
    setError('');
  };
  const tabs: { id: Tab; label: string }[] = [
    { id: 'profile', label: 'Профиль' },
    { id: 'security', label: 'Безопасность' },
    { id: 'notifications', label: 'Уведомления' },
    { id: 'privacy', label: 'Конфиденциальность' },
  ];

  return (
    <DashboardPage
      title="Профиль и настройки"
      subtitle="Управление личными данными и безопасностью"
    >
      <nav
        aria-label="Разделы настроек"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}
      >
        {tabs.map(item => (
          <button
            key={item.id}
            type="button"
            disabled={busy}
            onClick={() => void switchTab(item.id)}
            aria-current={tab === item.id ? 'page' : undefined}
            style={{
              ...actionStyle,
              background: tab === item.id ? '#FFB300' : 'var(--card)',
              color: tab === item.id ? '#0A1B3D' : 'var(--text)',
              border: '1px solid var(--border)',
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {loading && <p>Загружаем настройки…</p>}
      {error && (
        <p role="alert" style={{ color: '#FF3B30' }}>
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!loading && profile && (
        <div style={{ maxWidth: 760, display: 'grid', gap: 20 }}>
          {tab === 'profile' && (
            <>
              <Card>
                <h2>Личные данные</h2>
                <div style={rowStyle}>
                  <label htmlFor="display-name">Отображаемое имя</label>
                  <input
                    id="display-name"
                    style={inputStyle}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    maxLength={100}
                  />
                </div>
                {profile.username ? (
                  <div style={rowStyle}>
                    <span>Публичный ник</span>
                    <strong>@{profile.username}</strong>
                    <small>Ник выбран окончательно и не меняется.</small>
                  </div>
                ) : (
                  <div style={rowStyle}>
                    <label htmlFor="claim-username">Публичный ник — выберите один раз</label>
                    <input
                      id="claim-username"
                      style={inputStyle}
                      value={usernameDraft}
                      onChange={event => setUsernameDraft(event.target.value)}
                      minLength={3}
                      maxLength={30}
                      autoComplete="off"
                      aria-describedby="claim-username-status"
                    />
                    <small>
                      Кириллица или латиница, цифры, _, - и точка; без смешения алфавитов.
                    </small>
                    <span id="claim-username-status" role="status" aria-live="polite">
                      {usernameStatus}
                    </span>
                    <button
                      type="button"
                      disabled={busy || usernameDraft.length < 3}
                      style={actionStyle}
                      onClick={() =>
                        void run(async () => {
                          const updated = await claimUsername(usernameDraft);
                          setProfile(updated);
                        }, 'Ник сохранён окончательно')
                      }
                    >
                      Сохранить ник
                    </button>
                  </div>
                )}
                <div style={rowStyle}>
                  <span>User ID — постоянный номер аккаунта</span>
                  <strong>{profile.public_id}</strong>
                </div>
                <div style={rowStyle}>
                  <span>Электронная почта</span>
                  <strong>{profile.email}</strong>
                  <span>{profile.email_verified ? 'Подтверждена' : 'Не подтверждена'}</span>
                  {profile.pending_email && (
                    <span>Новый адрес ожидает подтверждения: {profile.pending_email}</span>
                  )}
                  {!profile.email_verified && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => resendVerification(profile.email),
                          'Если адрес ожидает подтверждения, письмо будет отправлено.'
                        )
                      }
                      style={actionStyle}
                    >
                      Отправить письмо повторно
                    </button>
                  )}
                </div>
                <div style={rowStyle}>
                  <label htmlFor="date-of-birth">Дата рождения</label>
                  <input
                    id="date-of-birth"
                    type="date"
                    style={inputStyle}
                    value={dob}
                    onChange={e => setDob(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  style={actionStyle}
                  onClick={() =>
                    run(async () => {
                      const updated = await saveAccountProfile(name, dob || null);
                      setProfile(updated);
                    }, 'Профиль сохранён')
                  }
                >
                  Сохранить профиль
                </button>
              </Card>
              <Card>
                <h2>Телефон</h2>
                <p>
                  {profile.phone_verified
                    ? 'Номер подтверждён'
                    : 'Номер не подтверждён. Его нельзя использовать для восстановления доступа.'}
                </p>
                <div style={rowStyle}>
                  <label htmlFor="profile-phone">Международный номер</label>
                  <input
                    id="profile-phone"
                    type="tel"
                    placeholder="+79991234567"
                    style={inputStyle}
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    type="button"
                    disabled={busy}
                    style={actionStyle}
                    onClick={() =>
                      run(
                        async () => setProfile(await savePhone(phone)),
                        'Номер сохранён без подтверждения'
                      )
                    }
                  >
                    Сохранить номер
                  </button>
                  {profile.phone && (
                    <button
                      type="button"
                      disabled={busy}
                      style={dangerStyle}
                      onClick={() =>
                        run(async () => {
                          setProfile(await removePhone());
                          setPhone('');
                        }, 'Номер удалён')
                      }
                    >
                      Удалить номер
                    </button>
                  )}
                </div>
              </Card>
              <Card>
                <h2>Аватар</h2>
                {profile.avatar && (
                  <img
                    src={profile.avatar}
                    alt="Ваш аватар"
                    style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: '50%' }}
                  />
                )}
                <div style={rowStyle}>
                  <label htmlFor="avatar-file">PNG, JPEG или WebP до 2 МБ</label>
                  <input
                    id="avatar-file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file)
                        void run(
                          async () => setProfile(await uploadAvatar(file)),
                          'Аватар обновлён'
                        );
                    }}
                  />
                </div>
                {profile.avatar && (
                  <button
                    type="button"
                    disabled={busy}
                    style={dangerStyle}
                    onClick={() =>
                      run(async () => setProfile(await removeAvatar()), 'Аватар удалён')
                    }
                  >
                    Удалить аватар
                  </button>
                )}
              </Card>
              <Card>
                <details>
                  <summary>Дополнительные настройки интерфейса и BF Agent</summary>
                  <div style={rowStyle}>
                    <label htmlFor="profile-theme">Тема</label>
                    <select
                      id="profile-theme"
                      style={inputStyle}
                      value={theme}
                      onChange={e => setTheme(e.target.value)}
                    >
                      <option value="system">Системная</option>
                      <option value="light">Светлая</option>
                      <option value="dark">Тёмная</option>
                    </select>
                  </div>
                  <div style={rowStyle}>
                    <label htmlFor="profile-density">Плотность</label>
                    <select
                      id="profile-density"
                      style={inputStyle}
                      value={density}
                      onChange={e => setDensity(e.target.value)}
                    >
                      <option value="compact">Компактная</option>
                      <option value="comfortable">Комфортная</option>
                      <option value="spacious">Просторная</option>
                    </select>
                  </div>
                  <div style={rowStyle}>
                    <label htmlFor="profile-font">Размер шрифта</label>
                    <select
                      id="profile-font"
                      style={inputStyle}
                      value={fontSize}
                      onChange={e => setFontSize(e.target.value)}
                    >
                      <option value="small">Маленький</option>
                      <option value="medium">Средний</option>
                      <option value="large">Большой</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    style={actionStyle}
                    onClick={() =>
                      run(
                        () =>
                          updateSettings({ interface: { theme, density, font_size: fontSize } }),
                        'Настройки интерфейса сохранены'
                      )
                    }
                  >
                    Сохранить интерфейс
                  </button>
                  <h3>BF Agent</h3>
                  <label>
                    <input
                      type="checkbox"
                      checked={agentEnabled}
                      onChange={e => setAgentEnabled(e.target.checked)}
                    />{' '}
                    Включить BF Agent
                  </label>
                  <div style={rowStyle}>
                    <label htmlFor="agent-mode">Режим</label>
                    <select
                      id="agent-mode"
                      style={inputStyle}
                      value={agentMode}
                      onChange={e => setAgentMode(e.target.value)}
                    >
                      <option value="advisor">Советник</option>
                      <option value="assistant">Помощник</option>
                    </select>
                  </div>
                  <div style={rowStyle}>
                    <label htmlFor="agent-policy">Передача данных</label>
                    <select
                      id="agent-policy"
                      style={inputStyle}
                      value={agentDataPolicy}
                      onChange={e => setAgentDataPolicy(e.target.value)}
                    >
                      <option value="minimal">Минимальная</option>
                      <option value="standard">Стандартная</option>
                    </select>
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={agentAllowText}
                      onChange={e => setAgentAllowText(e.target.checked)}
                    />{' '}
                    Разрешить передачу текста для AI-функций
                  </label>
                  <div>
                    <button
                      type="button"
                      disabled={busy}
                      style={actionStyle}
                      onClick={() =>
                        run(
                          () =>
                            updateSettings({
                              agent: {
                                enabled: agentEnabled,
                                mode: agentMode,
                                data_policy: agentDataPolicy,
                                allow_send_text_to_ai: agentAllowText,
                              },
                            }),
                          'Настройки BF Agent сохранены'
                        )
                      }
                    >
                      Сохранить BF Agent
                    </button>
                  </div>
                </details>
              </Card>
            </>
          )}
          {tab === 'security' && (
            <>
              <Card>
                <h2>Смена электронной почты</h2>
                <p>Старый адрес останется основным, пока вы не подтвердите новый.</p>
                <div style={rowStyle}>
                  <label htmlFor="new-email">Новый адрес</label>
                  <input
                    id="new-email"
                    type="email"
                    style={inputStyle}
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                  />
                </div>
                <div style={rowStyle}>
                  <label htmlFor="email-password">Текущий пароль</label>
                  <PasswordField
                    id="email-password"
                    label="Текущий пароль для смены почты"
                    autoComplete="off"
                    style={inputStyle}
                    value={emailPassword}
                    onChange={e => setEmailPassword(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  style={actionStyle}
                  onClick={() =>
                    run(
                      () => requestEmailChange(newEmail, emailPassword),
                      'Проверьте новый адрес и подтвердите его по ссылке'
                    )
                  }
                >
                  Отправить подтверждение
                </button>
              </Card>
              <Card>
                <h2>Смена пароля</h2>
                <div style={rowStyle}>
                  <label htmlFor="password-current">Текущий пароль</label>
                  <PasswordField
                    id="password-current"
                    label="Текущий пароль"
                    autoComplete="off"
                    style={inputStyle}
                    value={passwordCurrent}
                    onChange={e => setPasswordCurrent(e.target.value)}
                  />
                </div>
                <div style={rowStyle}>
                  <label htmlFor="password-new">Новый пароль</label>
                  <PasswordField
                    id="password-new"
                    label="Новый пароль"
                    autoComplete="new-password"
                    style={inputStyle}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  style={actionStyle}
                  onClick={() =>
                    run(
                      () => changeAccountPassword(passwordCurrent, newPassword),
                      'Пароль изменён. Войдите снова.'
                    )
                  }
                >
                  Изменить пароль
                </button>
              </Card>
              <Card>
                <h2>Активные сессии</h2>
                <p>Завершение сессии немедленно прекращает её доступ.</p>
                {sessions.length === 0 && <p>Активных сессий нет.</p>}
                {sessions.map(session => (
                  <div
                    key={session.id}
                    style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}
                  >
                    <strong>{session.current ? 'Текущая сессия' : 'Другая сессия'}</strong>
                    <div>{describeClient(session.client)}</div>
                    <div>Создана: {new Date(session.created_at).toLocaleString('ru-RU')}</div>
                    <div>
                      Последняя активность: {new Date(session.last_seen_at).toLocaleString('ru-RU')}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      style={dangerStyle}
                      onClick={() => {
                        if (window.confirm('Завершить эту сессию?'))
                          void run(async () => {
                            await revokeAccountSession(session.id);
                            await refreshSessions();
                          }, 'Сессия завершена');
                      }}
                    >
                      Завершить
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={busy || !sessions.some(s => !s.current)}
                  style={dangerStyle}
                  onClick={() => {
                    if (window.confirm('Завершить все другие сессии?'))
                      void run(async () => {
                        await revokeOtherSessions();
                        await refreshSessions();
                      }, 'Другие сессии завершены');
                  }}
                >
                  Завершить все другие
                </button>
              </Card>
              <Card>
                <h2>Двухфакторная защита</h2>
                <p>{totpEnabled ? 'Включена' : 'Выключена'}</p>
                {!totpEnabled && !totpSecret && (
                  <>
                    <div style={rowStyle}>
                      <label htmlFor="totp-password">Текущий пароль</label>
                      <PasswordField
                        id="totp-password"
                        label="Текущий пароль для подключения защиты"
                        autoComplete="off"
                        style={inputStyle}
                        value={totpPassword}
                        onChange={e => setTotpPassword(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={busy || !totpPassword}
                      style={actionStyle}
                      onClick={() =>
                        run(async () => {
                          const result = await setupTotp(totpPassword);
                          setTotpSecret(result.secret);
                          setTotpUri(result.otpauth_uri);
                        }, 'Отсканируйте код в приложении и подтвердите настройку')
                      }
                    >
                      Подключить
                    </button>
                  </>
                )}
                {totpSecret && (
                  <div>
                    <p>
                      Отсканируйте QR-код приложением для кодов. До подтверждения защита не
                      включена.
                    </p>
                    {totpQr && (
                      <img
                        src={totpQr}
                        alt="QR-код настройки двухфакторной защиты"
                        width={224}
                        height={224}
                        style={{ maxWidth: '100%' }}
                      />
                    )}
                    <div>
                      <button
                        type="button"
                        style={actionStyle}
                        onClick={() => setShowTotpSecret(value => !value)}
                      >
                        {showTotpSecret ? 'Скрыть ключ' : 'Показать ключ вручную'}
                      </button>
                    </div>
                    {showTotpSecret && (
                      <p>
                        <code style={{ overflowWrap: 'anywhere' }}>{totpSecret}</code>{' '}
                        <button
                          type="button"
                          onClick={() => void navigator.clipboard.writeText(totpSecret)}
                        >
                          Скопировать
                        </button>
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      style={dangerStyle}
                      onClick={() =>
                        run(async () => {
                          await cancelTotpSetup();
                          setTotpSecret('');
                          setTotpUri('');
                          setShowTotpSecret(false);
                        }, 'Настройка отменена')
                      }
                    >
                      Отменить настройку
                    </button>
                  </div>
                )}
                {(totpSecret || totpEnabled) && (
                  <div style={rowStyle}>
                    <label htmlFor="security-code">Код из приложения или резервный код</label>
                    <input
                      id="security-code"
                      style={inputStyle}
                      value={code}
                      onChange={e => setCode(e.target.value)}
                      autoComplete="one-time-code"
                    />
                  </div>
                )}
                {totpSecret && (
                  <button
                    type="button"
                    disabled={busy}
                    style={actionStyle}
                    onClick={() =>
                      run(async () => {
                        const result = await confirmTotp(code);
                        setBackupCodes(result.backup_codes);
                        setTotpSecret('');
                        setTotpUri('');
                        setShowTotpSecret(false);
                        setTotpEnabled(true);
                      }, 'Защита включена. Сохраните резервные коды и войдите снова.')
                    }
                  >
                    Подтвердить подключение
                  </button>
                )}
                {backupCodes.length > 0 && (
                  <div role="status">
                    <p>Резервные коды показываются один раз. Сохраните их в безопасном месте:</p>
                    <code style={{ overflowWrap: 'anywhere' }}>{backupCodes.join('  ')}</code>
                  </div>
                )}
                {totpEnabled && (
                  <>
                    <div style={rowStyle}>
                      <label htmlFor="totp-disable-password">Текущий пароль для отключения</label>
                      <PasswordField
                        id="totp-disable-password"
                        label="Текущий пароль для отключения"
                        autoComplete="off"
                        style={inputStyle}
                        value={disablePassword}
                        onChange={e => setDisablePassword(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      style={dangerStyle}
                      onClick={() =>
                        run(async () => {
                          await disableTotp(disablePassword, code);
                          setTotpEnabled(false);
                        }, 'Защита отключена. Войдите снова.')
                      }
                    >
                      Отключить защиту
                    </button>
                  </>
                )}
              </Card>
            </>
          )}
          {tab === 'notifications' && (
            <Card>
              <h2>Уведомления</h2>
              <p>
                Письма о безопасности аккаунта, платежах, возвратах, тарифах, лимитах, Marketplace и
                действиях администратора обязательны. Их нельзя отключить.
              </p>
              <p>
                Дополнительные каналы станут доступны после подключения реальной доставки. Здесь нет
                переключателей, которые только меняют сохранённую настройку без отправки
                уведомлений.
              </p>
            </Card>
          )}
          {tab === 'privacy' && (
            <>
              <Card>
                <h2>Ваши данные</h2>
                <p>
                  Можно скачать JSON-файл с профилем, согласиями, ботами и сохранёнными сообщениями.
                  Храните его в безопасном месте.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  style={actionStyle}
                  onClick={() =>
                    run(async () => {
                      const data = await exportAccountData();
                      const url = URL.createObjectURL(
                        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                      );
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = 'botforg-account-data.json';
                      link.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }, 'Файл данных подготовлен')
                  }
                >
                  Скачать копию моих данных (JSON)
                </button>
              </Card>
              <Card>
                <h2>Юридические документы</h2>
                <p>
                  <Link className="bf-legal-settings-link" to="/dashboard/account/legal">
                    Открыть действующие условия и историю согласий →
                  </Link>
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={advertisingConsent}
                    disabled={busy}
                    onChange={e => {
                      const accepted = e.target.checked;
                      void run(
                        async () => {
                          const result = await setAdvertisingConsent(accepted);
                          setAdvertisingConsentState(result.advertising_consent);
                        },
                        accepted ? 'Согласие сохранено' : 'Согласие отозвано'
                      );
                    }}
                  />{' '}
                  Согласие на рекламные сообщения (необязательно)
                </label>
              </Card>
              <Card>
                <h2>Удаление аккаунта</h2>
                <p>
                  Статус запроса:{' '}
                  {(
                    {
                      none: 'Запрос не подан',
                      pending_review: 'Ожидает рассмотрения',
                      in_review: 'Рассматривается',
                      awaiting_legal_policy: 'Ожидает юридического решения',
                      needs_information: 'Нужны дополнительные сведения',
                    } as Record<string, string>
                  )[deletionStatus] || 'Статус уточняется'}
                  .
                </p>
                <p>
                  Запрос проходит проверку зависимостей и обязательных сроков хранения. Данные не
                  удаляются автоматически.
                </p>
                {deletionStatus === 'none' && (
                  <>
                    <div style={rowStyle}>
                      <label htmlFor="deletion-password">Текущий пароль</label>
                      <PasswordField
                        id="deletion-password"
                        label="Текущий пароль для запроса удаления"
                        autoComplete="off"
                        style={inputStyle}
                        value={deletionPassword}
                        onChange={e => setDeletionPassword(e.target.value)}
                      />
                    </div>
                    {totpEnabled && (
                      <div style={rowStyle}>
                        <label htmlFor="deletion-code">Код двухфакторной защиты</label>
                        <input
                          id="deletion-code"
                          style={inputStyle}
                          value={code}
                          onChange={e => setCode(e.target.value)}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      style={{ ...actionStyle, background: '#FF3B30', color: '#fff' }}
                      onClick={() => {
                        if (window.confirm('Подать запрос на удаление аккаунта?'))
                          void run(async () => {
                            const result = await requestAccountDeletion(deletionPassword, code);
                            setDeletionStatus(result.status);
                          }, 'Запрос отправлен на рассмотрение');
                      }}
                    >
                      Запросить удаление аккаунта
                    </button>
                  </>
                )}
              </Card>
            </>
          )}
        </div>
      )}
    </DashboardPage>
  );
}
