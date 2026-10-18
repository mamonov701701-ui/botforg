import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useUiStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { useNavigate } from 'react-router-dom';
import {
  loginEmail,
  registerEmail,
  completeTwoFactor,
  requestPasswordReset,
  getMe,
  getConsentStatus,
} from '../../api/auth';
import {
  acceptPublishedConsent,
  hasAcceptedRequiredConsents,
  listLegalDocuments,
  resolvePublishedConsentTargets,
  type PublishedConsentTarget,
} from '../../api/legal';
import { toast } from '../../utils/toast';
import { Eye, EyeOff } from 'lucide-react';

type Tab = 'login' | 'register';
type EmailMode = 'login' | 'register' | 'reset';

export default function AuthModal() {
  const { authModalOpen, nextPath, closeAuth } = useUiStore();
  const { setUser } = useAuthStore();
  const navigate = useNavigate();
  const modalRef = useRef<HTMLDivElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const confirmInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>('login');
  const [emailMode, setEmailMode] = useState<EmailMode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [usernameAvailability, setUsernameAvailability] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [name, setName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [personalDataConsentAccepted, setPersonalDataConsentAccepted] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentTargets, setConsentTargets] = useState<{
    privacy: PublishedConsentTarget | null;
    terms: PublishedConsentTarget | null;
  } | null>(null);

  // Локальные ошибки валидации для каждого поля
  const [emailError, setEmailError] = useState('');
  const [nameError, setNameError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [dateOfBirthError, setDateOfBirthError] = useState('');

  const toggleVisibility = (
    input: HTMLInputElement | null,
    update: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    const start = input?.selectionStart;
    const end = input?.selectionEnd;
    const direction = input?.selectionDirection;
    update(previous => !previous);
    window.requestAnimationFrame(() => {
      if (!input?.isConnected) return;
      input.focus();
      if (start !== null && start !== undefined && end !== null && end !== undefined)
        input.setSelectionRange(start, end, direction ?? undefined);
    });
  };

  useEffect(() => {
    if (authModalOpen) return;
    setPassword('');
    setConfirmPassword('');
    setTwoFactorChallenge(null);
    setTwoFactorCode('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  }, [authModalOpen]);

  useEffect(() => {
    setUsernameAvailability('');
    if (!authModalOpen || tab !== 'register' || username.length < 3) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/auth/email/username-availability?username=${encodeURIComponent(username)}`,
          { signal: controller.signal }
        );
        if (!response.ok) return;
        const result = await response.json();
        setUsernameAvailability(result.message);
      } catch (error: any) {
        if (error?.name !== 'AbortError')
          setUsernameAvailability('Проверка ника временно недоступна');
      }
    }, 600);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [authModalOpen, tab, username]);

  // ESC key handler
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && authModalOpen) {
        closeAuth();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [authModalOpen, closeAuth]);

  // Focus trap
  useEffect(() => {
    if (authModalOpen && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      const handleTab = (e: KeyboardEvent) => {
        if (e.key === 'Tab') {
          if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      };

      modalRef.current.addEventListener('keydown', handleTab as any);
      firstElement?.focus();

      return () => {
        modalRef.current?.removeEventListener('keydown', handleTab as any);
      };
    }
  }, [authModalOpen, tab, emailMode]);

  // Очищаем поля и ошибки при переключении вкладок
  useEffect(() => {
    if (authModalOpen) {
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setShowConfirmPassword(false);
      // Очищаем все ошибки
      setEmailError('');
      setNameError('');
      setUsernameError('');
      setPasswordError('');
      setConfirmPasswordError('');
      setDateOfBirthError('');
      // Сохраняем email при переключении, но очищаем остальные поля
      if (tab === 'login') {
        // Загружаем сохраненный email если есть
        const rememberedEmail = localStorage.getItem('rememberedEmail');
        if (rememberedEmail && !email) {
          setEmail(rememberedEmail);
        }
      } else {
        // При переключении на регистрацию очищаем email
        setEmail('');
      }
      setUsername('');
    }
  }, [tab]);

  // Загружаем сохраненный email при открытии модального окна
  useEffect(() => {
    if (authModalOpen && tab === 'login') {
      const rememberedEmail = localStorage.getItem('rememberedEmail');
      const shouldRemember = localStorage.getItem('rememberMe');
      if (rememberedEmail && shouldRemember) {
        setEmail(rememberedEmail);
        setRememberMe(true);
      }
    }
  }, [authModalOpen]);

  // Валидация пароля
  const validatePassword = (pwd: string) => {
    const hasDigit = /\d/.test(pwd);
    const hasLowerCase = /[a-z]/.test(pwd);
    const hasUpperCase = /[A-Z]/.test(pwd);
    return hasDigit && hasLowerCase && hasUpperCase && pwd.length >= 8;
  };

  // Проверка, что пароль содержит только латинские буквы, цифры и спецсимволы
  const hasOnlyLatinLetters = (pwd: string) => {
    // Проверяем, что нет кириллицы и других нелатинских символов
    return !/[а-яА-ЯёЁ]/.test(pwd);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Очищаем все ошибки перед валидацией
    setEmailError('');
    setUsernameError('');
    setPasswordError('');
    setConfirmPasswordError('');
    setDateOfBirthError('');

    try {
      if (twoFactorChallenge) {
        await completeTwoFactor(twoFactorChallenge, twoFactorCode);
        const verifiedUser = await getMe();
        if (!verifiedUser) throw new Error('Не удалось завершить вход');
        setUser(verifiedUser);
        setTwoFactorChallenge(null);
        setTwoFactorCode('');
        closeAuth();
        navigate(nextPath || '/dashboard');
        return;
      }
      if (tab === 'register') {
        let hasErrors = false;

        // Валидация email
        if (!email || !email.includes('@')) {
          setEmailError('Введите корректный email адрес');
          hasErrors = true;
        }

        if (!name || name.trim().length < 2) {
          setNameError('Укажите отображаемое имя (минимум 2 символа)');
          hasErrors = true;
        }
        if (!username || username.length < 3) {
          setUsernameError('Укажите ник (от 3 до 30 символов)');
          hasErrors = true;
        }

        // Валидация пароля
        if (!hasOnlyLatinLetters(password)) {
          setPasswordError(
            'Пароль должен содержать только латинские буквы (заглавные и строчные), цифры и специальные символы'
          );
          hasErrors = true;
        } else if (!validatePassword(password)) {
          // Проверяем конкретные требования
          const hasDigit = /\d/.test(password);
          const hasLowerCase = /[a-z]/.test(password);
          const hasUpperCase = /[A-Z]/.test(password);
          const isLongEnough = password.length >= 8;

          let missingRequirements = [];
          if (!isLongEnough) missingRequirements.push('минимум 8 символов');
          if (!hasDigit) missingRequirements.push('цифры');
          if (!hasLowerCase) missingRequirements.push('строчные латинские буквы');
          if (!hasUpperCase) missingRequirements.push('заглавные латинские буквы');

          setPasswordError(`Пароль должен содержать: ${missingRequirements.join(', ')}`);
          hasErrors = true;
        }

        // Проверка совпадения паролей
        if (password !== confirmPassword) {
          setConfirmPasswordError('Пароли не совпадают');
          hasErrors = true;
        }

        if (!termsAccepted || !privacyAcknowledged || !personalDataConsentAccepted) {
          setConfirmPasswordError(
            'Подтвердите условия, ознакомление с политикой и отдельное согласие'
          );
          hasErrors = true;
        }
        if (!dateOfBirth) {
          setDateOfBirthError('Укажите дату рождения');
          hasErrors = true;
        } else {
          const birthDate = new Date(`${dateOfBirth}T00:00:00`);
          const today = new Date();
          let age = today.getFullYear() - birthDate.getFullYear();
          if (
            today.getMonth() < birthDate.getMonth() ||
            (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())
          )
            age -= 1;
          if (!Number.isFinite(age) || age < 18) {
            setDateOfBirthError('Регистрация доступна только с 18 лет.');
            hasErrors = true;
          }
        }

        if (hasErrors) {
          setLoading(false);
          return;
        }

        // Регистрация
        const docs = await listLegalDocuments();
        const byType = new Map(docs.map(doc => [doc.doc_type, doc]));
        const required = ['public_offer', 'privacy_policy', 'personal_data_consent'];
        if (required.some(type => !byType.get(type) || byType.get(type)?.status !== 'published')) {
          throw new Error('Юридические документы временно недоступны');
        }
        const revisions = Object.fromEntries(required.map(type => [type, byType.get(type)!.id]));
        await registerEmail(email, password, name.trim(), username, dateOfBirth, revisions, {
          termsAccepted,
          privacyAcknowledged,
          personalDataConsentAccepted,
        });
        sessionStorage.setItem('pendingVerificationEmail', email);
        closeAuth();
        navigate('/auth/verify-pending');
      } else if (tab === 'login') {
        let hasErrors = false;

        // Валидация полей входа
        if (!email) {
          setEmailError('Введите email или логин');
          hasErrors = true;
        }
        if (!password) {
          setPasswordError('Введите пароль');
          hasErrors = true;
        }

        if (hasErrors) {
          setLoading(false);
          return;
        }

        // Вход
        const loginResponse = await loginEmail(email, password);
        if (loginResponse?.requires_2fa) {
          setTwoFactorChallenge(loginResponse.challenge);
          toast.success('Введите код из приложения для подтверждения входа');
          return;
        }

        // Проверяем, что токен сохранился
        const token = localStorage.getItem('auth_token');
        if (!token) {
          console.error('Токен не был сохранен после входа');
          toast.error('Ошибка: токен не был сохранен. Попробуйте еще раз.');
          setLoading(false);
          return;
        }

        // Сохраняем флаг "запомнить меня"
        if (rememberMe) {
          localStorage.setItem('rememberMe', 'true');
          localStorage.setItem('rememberedEmail', email);
        } else {
          localStorage.removeItem('rememberMe');
          localStorage.removeItem('rememberedEmail');
        }

        // Небольшая задержка, чтобы токен точно сохранился в localStorage
        await new Promise(resolve => setTimeout(resolve, 50));

        // Проверяем, что токен действительно сохранен
        const savedToken = localStorage.getItem('auth_token');
        if (!savedToken) {
          console.error('Токен не найден в localStorage после сохранения');
          setLoading(false);
          toast.error('Ошибка: токен не был сохранен. Попробуйте еще раз.');
          return;
        }

        // Получаем данные пользователя и проверяем согласие (152-ФЗ)
        try {
          const user = await getMe();
          if (user) {
            setUser(user);
            setLoading(false);
            try {
              const [status, docs] = await Promise.all([getConsentStatus(), listLegalDocuments()]);
              const targets = resolvePublishedConsentTargets(docs);
              if (
                targets.privacy &&
                targets.terms &&
                !hasAcceptedRequiredConsents(status.accepted || [], targets)
              ) {
                setConsentTargets(targets);
                setShowConsentModal(true);
                return;
              }
            } catch (_) {}
            toast.success('Вход выполнен успешно!');
            closeAuth();
            if (nextPath) navigate(nextPath);
            else navigate('/dashboard');
          } else {
            console.error('getMe вернул null после входа');
            setLoading(false);
            localStorage.removeItem('auth_token');
            toast.error('Не удалось получить данные пользователя. Проверьте учетные данные.');
          }
        } catch (meError: any) {
          console.error('Ошибка при получении данных пользователя:', meError?.status ?? 'unknown');
          setLoading(false);
          if (meError.status === 401) {
            localStorage.removeItem('auth_token');
            toast.error('Сессия недействительна. Попробуйте войти еще раз.');
          } else {
            toast.error(
              'Ошибка при получении данных пользователя: ' +
                (meError.message || 'Неизвестная ошибка')
            );
          }
        }
      }
    } catch (error: any) {
      // Обработка ошибок с детальными сообщениями
      let errorMessage = 'Произошла ошибка. Попробуйте позже.';

      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      // Переводы некоторых стандартных сообщений и привязка к полям
      if (errorMessage.toLowerCase().includes('invalid credentials')) {
        setEmailError('Неверный email или пароль');
        setPasswordError('Неверный email или пароль');
      } else if (errorMessage.toLowerCase().includes('password')) {
        setPasswordError(errorMessage);
      } else {
        // Для других ошибок показываем toast
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeAuth();
    }
  };

  if (!authModalOpen) return null;

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px',
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        ref={modalRef}
        className="bf-auth-panel"
        style={{
          maxWidth: '480px',
          width: '100%',
          background: 'var(--bf-shell-bg)',
          borderRadius: 'var(--bf-shell-radius)',
          border: '1px solid var(--bf-shell-border)',
          boxShadow: 'var(--bf-shell-shadow)',
          padding: '32px',
          position: 'relative',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={closeAuth}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '24px',
            cursor: 'pointer',
            padding: '4px 8px',
          }}
          aria-label="Закрыть"
        >
          ×
        </button>

        <h2
          id="auth-modal-title"
          style={{ fontSize: '28px', marginBottom: '8px', textAlign: 'center' }}
        >
          Войдите или зарегистрируйтесь
        </h2>
        <p
          style={{
            color: 'var(--text-muted)',
            marginBottom: '16px',
            textAlign: 'center',
            fontSize: '14px',
          }}
        >
          Войдите по почте или создайте аккаунт
        </p>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '0',
            marginBottom: '24px',
          }}
        >
          <button
            onClick={() => setTab('login')}
            style={{
              flex: 1,
              padding: '12px',
              background: tab === 'login' ? 'var(--accent)' : 'transparent',
              border: 'none',
              borderRadius: '20px 0 0 20px',
              color: tab === 'login' ? '#000' : 'var(--text)',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 700,
              transition: 'all 0.2s',
            }}
          >
            Вход
          </button>
          <button
            onClick={() => setTab('register')}
            style={{
              flex: 1,
              padding: '12px',
              background: tab === 'register' ? 'var(--accent)' : 'transparent',
              border: 'none',
              borderRadius: '0 20px 20px 0',
              color: tab === 'register' ? '#000' : 'var(--text)',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 700,
              transition: 'all 0.2s',
            }}
          >
            Регистрация
          </button>
        </div>

        {/* Login Tab */}
        {tab === 'login' &&
          (emailMode === 'reset' ? (
            <form
              onSubmit={async event => {
                event.preventDefault();
                setLoading(true);
                try {
                  await requestPasswordReset(email);
                  toast.info(
                    'Если адрес подтверждён и почта доступна, новое письмо придёт. Откройте последнее письмо.'
                  );
                  setEmailMode('login');
                } catch (reason: any) {
                  toast.error(
                    reason?.status === 429
                      ? reason.message
                      : 'Не удалось обработать запрос. Попробуйте позже.'
                  );
                } finally {
                  setLoading(false);
                }
              }}
            >
              <h3>Восстановление пароля</h3>
              <p>
                Введите подтверждённый адрес почты. Если аккаунт существует, придёт ссылка для смены
                пароля.
              </p>
              <label htmlFor="reset-email">Электронная почта</label>
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                style={{
                  width: '100%',
                  minHeight: 44,
                  boxSizing: 'border-box',
                  margin: '8px 0 16px',
                  padding: 12,
                  borderRadius: 10,
                  background: 'var(--card)',
                  color: 'var(--text)',
                }}
              />
              <button
                type="submit"
                disabled={loading}
                style={{
                  minHeight: 44,
                  padding: '10px 16px',
                  background: '#FFB300',
                  color: '#0A1B3D',
                  border: 0,
                  borderRadius: 10,
                  fontWeight: 700,
                }}
              >
                Отправить ссылку
              </button>
              <button
                type="button"
                onClick={() => setEmailMode('login')}
                style={{
                  marginLeft: 12,
                  minHeight: 44,
                  background: 'transparent',
                  color: 'var(--accent)',
                  border: 0,
                }}
              >
                Вернуться ко входу
              </button>
            </form>
          ) : (
            <form onSubmit={handleEmailAuth}>
              <div style={{ marginBottom: '12px' }}>
                <input
                  type="text"
                  placeholder="Электронная почта"
                  value={email}
                  disabled={!!twoFactorChallenge}
                  onChange={e => {
                    setEmail(e.target.value);
                    setEmailError('');
                  }}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'var(--card)',
                    border: emailError ? '1px solid #ef4444' : '1px solid var(--border)',
                    borderRadius: '20px',
                    color: 'var(--text)',
                    fontSize: '14px',
                  }}
                />
                {emailError && (
                  <div
                    style={{
                      color: '#ef4444',
                      fontSize: '12px',
                      marginTop: '4px',
                      marginLeft: '12px',
                    }}
                  >
                    {emailError}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ position: 'relative' }}>
                  <input
                    ref={passwordInputRef}
                    aria-label="Пароль для входа"
                    autoComplete="current-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Пароль"
                    value={password}
                    disabled={!!twoFactorChallenge}
                    onChange={e => {
                      setPassword(e.target.value);
                      setPasswordError('');
                    }}
                    required
                    minLength={8}
                    style={{
                      width: '100%',
                      padding: '12px 40px 12px 12px',
                      background: 'var(--card)',
                      border: passwordError ? '1px solid #ef4444' : '1px solid var(--border)',
                      borderRadius: '20px',
                      color: 'var(--text)',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      lineHeight: '1.5',
                    }}
                  />
                  <button
                    type="button"
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => toggleVisibility(passwordInputRef.current, setShowPassword)}
                    aria-label={`${showPassword ? 'Скрыть' : 'Показать'} пароль`}
                    aria-pressed={showPassword}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '0',
                      width: '44px',
                      height: '44px',
                    }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {passwordError && (
                  <div
                    style={{
                      color: '#ef4444',
                      fontSize: '12px',
                      marginTop: '4px',
                      marginLeft: '12px',
                    }}
                  >
                    {passwordError}
                  </div>
                )}
              </div>

              {twoFactorChallenge && (
                <div style={{ marginBottom: '16px' }}>
                  <label htmlFor="login-two-factor">Код из приложения или резервный код</label>
                  <input
                    id="login-two-factor"
                    value={twoFactorCode}
                    onChange={e => setTwoFactorCode(e.target.value)}
                    autoComplete="one-time-code"
                    required
                    style={{ width: '100%', minHeight: 44, marginTop: 8, boxSizing: 'border-box' }}
                  />
                </div>
              )}

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  style={{
                    width: '16px',
                    height: '16px',
                    accentColor: 'var(--accent)',
                    cursor: 'pointer',
                  }}
                />
                <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Запомнить меня</span>
              </label>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'var(--accent)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '20px',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  marginBottom: '16px',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? 'Загрузка...' : twoFactorChallenge ? 'Подтвердить вход' : 'Войти'}
              </button>

              {!twoFactorChallenge && (
                <button
                  type="button"
                  onClick={() => {
                    setPassword('');
                    setEmailMode('reset');
                  }}
                  style={{
                    display: 'block',
                    minHeight: 44,
                    background: 'transparent',
                    color: 'var(--accent)',
                    border: 0,
                    cursor: 'pointer',
                  }}
                >
                  Забыли пароль?
                </button>
              )}
            </form>
          ))}

        {/* Register Tab */}
        {tab === 'register' && (
          <form onSubmit={handleEmailAuth}>
            <div style={{ marginBottom: '12px' }}>
              <input
                type="email"
                placeholder="Почта"
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  setEmailError('');
                }}
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'var(--card)',
                  border: emailError ? '1px solid #ef4444' : '1px solid var(--border)',
                  borderRadius: '20px',
                  color: 'var(--text)',
                  fontSize: '14px',
                }}
              />
              {emailError && (
                <div
                  style={{
                    color: '#ef4444',
                    fontSize: '12px',
                    marginTop: '4px',
                    marginLeft: '12px',
                  }}
                >
                  {emailError}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                placeholder="Отображаемое имя"
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  setNameError('');
                }}
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'var(--card)',
                  border: nameError ? '1px solid #ef4444' : '1px solid var(--border)',
                  borderRadius: '20px',
                  color: 'var(--text)',
                  fontSize: '14px',
                }}
              />
              {nameError && (
                <div
                  style={{
                    color: '#ef4444',
                    fontSize: '12px',
                    marginTop: '4px',
                    marginLeft: '12px',
                  }}
                >
                  {nameError}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label htmlFor="register-username">
                Публичный ник — после выбора изменить нельзя
              </label>
              <input
                id="register-username"
                type="text"
                value={username}
                minLength={3}
                maxLength={30}
                autoComplete="off"
                required
                aria-describedby="register-username-status"
                onChange={event => {
                  setUsername(event.target.value);
                  setUsernameError('');
                }}
                style={{
                  width: '100%',
                  minHeight: 44,
                  boxSizing: 'border-box',
                  padding: 12,
                  background: 'var(--card)',
                  color: 'var(--text)',
                  borderRadius: 20,
                  border: usernameError ? '1px solid #ef4444' : '1px solid var(--border)',
                }}
              />
              <small>Кириллица или латиница, цифры, _, - и точка; без смешения алфавитов.</small>
              <div id="register-username-status" role="status" aria-live="polite">
                {usernameError || usernameAvailability}
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label htmlFor="register-date-of-birth" style={{ display: 'block', marginBottom: 6 }}>
                Дата рождения
              </label>
              <input
                id="register-date-of-birth"
                className="bf-auth-date-input"
                type="date"
                value={dateOfBirth}
                onChange={e => {
                  setDateOfBirth(e.target.value);
                  setDateOfBirthError('');
                }}
                required
                max={new Date().toISOString().slice(0, 10)}
                aria-invalid={Boolean(dateOfBirthError)}
                aria-describedby={dateOfBirthError ? 'register-date-of-birth-error' : undefined}
              />
              <small>Регистрация доступна с 18 лет.</small>
              {dateOfBirthError && (
                <div
                  id="register-date-of-birth-error"
                  role="alert"
                  style={{ color: 'var(--error)', fontSize: 12 }}
                >
                  {dateOfBirthError}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div style={{ position: 'relative' }}>
                <input
                  ref={passwordInputRef}
                  aria-label="Пароль для регистрации"
                  autoComplete="new-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Пароль"
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    setPasswordError('');
                  }}
                  required
                  minLength={8}
                  style={{
                    width: '100%',
                    padding: '12px 40px 12px 12px',
                    background: 'var(--card)',
                    border: passwordError ? '1px solid #ef4444' : '1px solid var(--border)',
                    borderRadius: '20px',
                    color: 'var(--text)',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    lineHeight: '1.5',
                  }}
                />
                <button
                  type="button"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => toggleVisibility(passwordInputRef.current, setShowPassword)}
                  aria-label={`${showPassword ? 'Скрыть' : 'Показать'} пароль`}
                  aria-pressed={showPassword}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '0',
                    width: '44px',
                    height: '44px',
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {passwordError && (
                <div
                  style={{
                    color: '#ef4444',
                    fontSize: '12px',
                    marginTop: '4px',
                    marginLeft: '12px',
                  }}
                >
                  {passwordError}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ position: 'relative' }}>
                <input
                  ref={confirmInputRef}
                  aria-label="Подтверждение пароля"
                  autoComplete="new-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Повтор пароля"
                  value={confirmPassword}
                  onChange={e => {
                    setConfirmPassword(e.target.value);
                    setConfirmPasswordError('');
                  }}
                  required
                  minLength={8}
                  style={{
                    width: '100%',
                    padding: '12px 40px 12px 12px',
                    background: 'var(--card)',
                    border: confirmPasswordError ? '1px solid #ef4444' : '1px solid var(--border)',
                    borderRadius: '20px',
                    color: 'var(--text)',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    lineHeight: '1.5',
                  }}
                />
                <button
                  type="button"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => toggleVisibility(confirmInputRef.current, setShowConfirmPassword)}
                  aria-label={`${showConfirmPassword ? 'Скрыть' : 'Показать'} подтверждение пароля`}
                  aria-pressed={showConfirmPassword}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '0',
                    width: '44px',
                    height: '44px',
                  }}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {confirmPasswordError && (
                <div
                  style={{
                    color: '#ef4444',
                    fontSize: '12px',
                    marginTop: '4px',
                    marginLeft: '12px',
                  }}
                >
                  {confirmPasswordError}
                </div>
              )}
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                marginBottom: '16px',
                cursor: 'pointer',
                fontSize: '13px',
                color: 'var(--text)',
              }}
            >
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={e => setTermsAccepted(e.target.checked)}
                style={{ marginTop: '3px', accentColor: 'var(--accent)' }}
              />
              <span>
                Я принимаю{' '}
                <a
                  href="/legal/public-offer"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent)' }}
                >
                  Публичную оферту
                </a>
              </span>
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                marginBottom: 16,
                color: 'var(--text)',
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={privacyAcknowledged}
                onChange={e => setPrivacyAcknowledged(e.target.checked)}
                style={{ marginTop: 3, accentColor: 'var(--accent)' }}
              />
              <span>
                Я ознакомился с{' '}
                <a
                  href="/legal/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent)' }}
                >
                  Политикой обработки персональных данных
                </a>
              </span>
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                marginBottom: 16,
                color: 'var(--text)',
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={personalDataConsentAccepted}
                onChange={e => setPersonalDataConsentAccepted(e.target.checked)}
                style={{ marginTop: 3, accentColor: 'var(--accent)' }}
              />
              <span>
                Я даю отдельное{' '}
                <a
                  href="/legal/personal-data-consent"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent)' }}
                >
                  Согласие на обработку персональных данных
                </a>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                background: 'var(--accent)',
                color: '#000',
                border: 'none',
                borderRadius: '20px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                marginBottom: '16px',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Загрузка...' : 'Зарегистрироваться'}
            </button>
          </form>
        )}

        {/* Модальное окно согласия при первом входе (152-ФЗ) */}
        {showConsentModal && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 20,
              padding: '16px',
            }}
          >
            <div
              style={{
                background: 'var(--card)',
                borderRadius: '16px',
                padding: '24px',
                maxWidth: '420px',
                width: '100%',
              }}
            >
              <h3 style={{ marginBottom: '12px', fontSize: '18px' }}>
                Согласие на обработку персональных данных
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Для продолжения необходимо принять{' '}
                <a
                  href={
                    consentTargets?.privacy
                      ? `/legal/${consentTargets.privacy.slug}`
                      : '/legal/privacy-policy'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent)' }}
                >
                  Политику ПДн
                </a>{' '}
                и{' '}
                <a
                  href={
                    consentTargets?.terms
                      ? `/legal/${consentTargets.terms.slug}`
                      : '/legal/public-offer'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent)' }}
                >
                  Публичную оферту
                </a>
                .
              </p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    if (!consentTargets?.privacy || !consentTargets?.terms) {
                      toast.error('Опубликованные версии документов недоступны');
                      return;
                    }
                    const privacyRes = await acceptPublishedConsent(consentTargets.privacy);
                    const termsRes = await acceptPublishedConsent(consentTargets.terms);
                    if (!privacyRes?.ok || !termsRes?.ok) {
                      toast.error('Не удалось сохранить согласие: нет опубликованной версии');
                      return;
                    }
                    setShowConsentModal(false);
                    setConsentTargets(null);
                    toast.success('Согласие принято');
                    closeAuth();
                    if (nextPath) navigate(nextPath);
                    else navigate('/dashboard');
                  } catch (e) {
                    toast.error('Не удалось сохранить согласие');
                  }
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'var(--accent)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Принять и продолжить
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
