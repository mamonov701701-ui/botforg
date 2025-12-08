import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useUiStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { useNavigate } from 'react-router-dom';
import {
  getLoginUrl,
  loginEmail,
  registerEmail,
  requestPasswordReset,
  getMe,
} from '../../api/auth';
import { toast } from '../../utils/toast';
import { Eye, EyeOff } from 'lucide-react';

type Tab = 'login' | 'register';
type EmailMode = 'login' | 'register' | 'reset';

export default function AuthModal() {
  const { authModalOpen, nextPath, closeAuth } = useUiStore();
  const { setUser } = useAuthStore();
  const navigate = useNavigate();
  const modalRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<Tab>('login');
  const [emailMode, setEmailMode] = useState<EmailMode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  // Локальные ошибки валидации для каждого поля
  const [emailError, setEmailError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');

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
      setUsernameError('');
      setPasswordError('');
      setConfirmPasswordError('');
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

    try {
      if (tab === 'register') {
        let hasErrors = false;

        // Валидация email
        if (!email || !email.includes('@')) {
          setEmailError('Введите корректный email адрес');
          hasErrors = true;
        }

        // Валидация логина
        if (!username || username.trim().length < 2) {
          setUsernameError('Логин должен содержать минимум 2 символа');
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

        if (hasErrors) {
          setLoading(false);
          return;
        }

        // Регистрация
        const response = await registerEmail(email, password, username);

        // Если получили токен - автоматически входим
        if (response?.access_token) {
          toast.success('Регистрация успешна! Выполняется вход...');

          // Получаем данные пользователя
          const user = await getMe();
          if (user) {
            setUser(user);
            closeAuth();
            if (nextPath) {
              navigate(nextPath);
            } else {
              navigate('/dashboard');
            }
          } else {
            // Если не удалось получить пользователя, переключаемся на вкладку входа
            setTab('login');
            setPassword('');
            setConfirmPassword('');
          }
        } else {
          toast.success('Регистрация успешна! Теперь вы можете войти.');
          setTab('login');
          setPassword('');
          setConfirmPassword('');
        }
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

        // Проверяем, что токен сохранился
        const token = localStorage.getItem('auth_token');
        if (!token) {
          console.error('Токен не был сохранен после входа. Ответ сервера:', loginResponse);
          toast.error('Ошибка: токен не был сохранен. Попробуйте еще раз.');
          setLoading(false);
          return;
        }

        console.log('Токен сохранен, длина:', token.length);

        // Сохраняем флаг "запомнить меня"
        if (rememberMe) {
          localStorage.setItem('rememberMe', 'true');
          localStorage.setItem('rememberedEmail', email);
        } else {
          localStorage.removeItem('rememberMe');
          localStorage.removeItem('rememberedEmail');
        }

        // Получаем данные пользователя
        try {
          const user = await getMe();
          if (user) {
            console.log('Пользователь получен:', user);
            setUser(user);
            toast.success('Вход выполнен успешно!');
            closeAuth();
            if (nextPath) {
              navigate(nextPath);
            } else {
              navigate('/dashboard');
            }
          } else {
            console.error('getMe вернул null, токен:', token.substring(0, 20) + '...');
            // Если не удалось получить пользователя, возможно токен невалидный
            localStorage.removeItem('auth_token');
            toast.error('Не удалось получить данные пользователя. Проверьте учетные данные.');
          }
        } catch (meError: any) {
          console.error('Ошибка при получении данных пользователя:', meError);
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
      if (errorMessage.toLowerCase().includes('user exists')) {
        setEmailError('Пользователь с таким email уже существует');
      } else if (errorMessage.toLowerCase().includes('invalid credentials')) {
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

  const providers = [
    { id: 'google', name: 'Google', color: '#4285F4', icon: '🔵' },
    { id: 'yandex', name: 'Яндекс ID', color: '#FC3F1D', icon: '🔴' },
    { id: 'mailru', name: 'Mail.ru', color: '#005FF9', icon: '📧' },
  ];

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
        style={{
          maxWidth: '480px',
          width: '100%',
          background: 'var(--surface)',
          borderRadius: '12px',
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
            marginBottom: '24px',
            textAlign: 'center',
            fontSize: '14px',
          }}
        >
          Выберите способ авторизации
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
        {tab === 'login' && (
          <form onSubmit={handleEmailAuth}>
            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                placeholder="Почта или логин"
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
              <div style={{ position: 'relative' }}>
                <input
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
                  onClick={() => setShowPassword(!showPassword)}
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
                    width: '32px',
                    height: '32px',
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
              {loading ? 'Загрузка...' : 'Войти'}
            </button>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
              }}
            >
              {providers.map(provider => {
                const loginUrl = `${getLoginUrl(provider.id as any)}${
                  nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''
                }`;
                return (
                  <a
                    key={provider.id}
                    href={loginUrl}
                    title={`Войти через ${provider.name}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '48px',
                      height: '48px',
                      background: '#fff',
                      borderRadius: '50%',
                      transition: 'all 0.2s',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    {provider.id === 'google' && (
                      <svg viewBox="0 0 24 24" style={{ width: '32px', height: '32px' }}>
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                    )}
                    {provider.id === 'yandex' && (
                      <svg viewBox="0 0 48 48" style={{ width: '32px', height: '32px' }}>
                        <circle cx="24" cy="24" r="24" fill="#FC3F1D" />
                        <path
                          d="M28 13h-4.5c-3.3 0-5.5 1.8-5.5 5 0 2.4 1.5 4.2 3.7 4.6L17 33h3.7l4.2-9.2h1.1V33H28V13zm-2 8.3h-1.3c-1.7 0-2.7-.9-2.7-2.4s1-2.4 2.7-2.4H26v4.8z"
                          fill="#FFFFFF"
                        />
                      </svg>
                    )}
                    {provider.id === 'mailru' && (
                      <svg viewBox="0 0 24 24" style={{ width: '32px', height: '32px' }}>
                        <path
                          fill="#168DE2"
                          d="M11.585 5.267c1.834 0 3.558.811 4.824 2.08v.004c0-.609.41-1.068.979-1.068h.145c.891 0 1.073.842 1.073 1.109l.005 9.475c-.063.621.64.941 1.029.543 1.521-1.564 3.342-8.038-.946-11.79-3.996-3.497-9.357-2.921-12.209-.955-3.031 2.091-4.971 6.718-3.086 11.064 2.054 4.74 7.931 6.152 11.424 4.744 1.769-.715 2.586 1.676.749 2.457-2.776 1.184-10.502 1.064-14.11-5.188C-.977 13.521-.847 6.093 5.62 2.245 10.567-.698 17.09.117 21.022 4.224c4.111 4.294 3.872 12.334-.139 15.461-1.816 1.42-4.516.037-4.498-2.031l-.019-.678c-1.265 1.256-2.948 1.988-4.782 1.988-3.625 0-6.813-3.189-6.813-6.812 0-3.659 3.189-6.885 6.814-6.885zm4.561 6.623c-.137-2.653-2.106-4.249-4.484-4.249h-.09c-2.745 0-4.268 2.159-4.268 4.61 0 2.747 1.842 4.481 4.256 4.481 2.693 0 4.464-1.973 4.592-4.306l-.006-.536z"
                        />
                      </svg>
                    )}
                  </a>
                );
              })}
            </div>
          </form>
        )}

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
                placeholder="Логин"
                value={username}
                onChange={e => {
                  setUsername(e.target.value);
                  setUsernameError('');
                }}
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'var(--card)',
                  border: usernameError ? '1px solid #ef4444' : '1px solid var(--border)',
                  borderRadius: '20px',
                  color: 'var(--text)',
                  fontSize: '14px',
                }}
              />
              {usernameError && (
                <div
                  style={{
                    color: '#ef4444',
                    fontSize: '12px',
                    marginTop: '4px',
                    marginLeft: '12px',
                  }}
                >
                  {usernameError}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div style={{ position: 'relative' }}>
                <input
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
                  onClick={() => setShowPassword(!showPassword)}
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
                    width: '32px',
                    height: '32px',
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
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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
                    width: '32px',
                    height: '32px',
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

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
              }}
            >
              {providers.map(provider => {
                const loginUrl = `${getLoginUrl(provider.id as any)}${
                  nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''
                }`;
                return (
                  <a
                    key={provider.id}
                    href={loginUrl}
                    title={`Зарегистрироваться через ${provider.name}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '48px',
                      height: '48px',
                      background: '#fff',
                      borderRadius: '50%',
                      transition: 'all 0.2s',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    {provider.id === 'google' && (
                      <svg viewBox="0 0 24 24" style={{ width: '32px', height: '32px' }}>
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                    )}
                    {provider.id === 'yandex' && (
                      <svg viewBox="0 0 48 48" style={{ width: '32px', height: '32px' }}>
                        <circle cx="24" cy="24" r="24" fill="#FC3F1D" />
                        <path
                          d="M28 13h-4.5c-3.3 0-5.5 1.8-5.5 5 0 2.4 1.5 4.2 3.7 4.6L17 33h3.7l4.2-9.2h1.1V33H28V13zm-2 8.3h-1.3c-1.7 0-2.7-.9-2.7-2.4s1-2.4 2.7-2.4H26v4.8z"
                          fill="#FFFFFF"
                        />
                      </svg>
                    )}
                    {provider.id === 'mailru' && (
                      <svg viewBox="0 0 24 24" style={{ width: '32px', height: '32px' }}>
                        <path
                          fill="#168DE2"
                          d="M11.585 5.267c1.834 0 3.558.811 4.824 2.08v.004c0-.609.41-1.068.979-1.068h.145c.891 0 1.073.842 1.073 1.109l.005 9.475c-.063.621.64.941 1.029.543 1.521-1.564 3.342-8.038-.946-11.79-3.996-3.497-9.357-2.921-12.209-.955-3.031 2.091-4.971 6.718-3.086 11.064 2.054 4.74 7.931 6.152 11.424 4.744 1.769-.715 2.586 1.676.749 2.457-2.776 1.184-10.502 1.064-14.11-5.188C-.977 13.521-.847 6.093 5.62 2.245 10.567-.698 17.09.117 21.022 4.224c4.111 4.294 3.872 12.334-.139 15.461-1.816 1.42-4.516.037-4.498-2.031l-.019-.678c-1.265 1.256-2.948 1.988-4.782 1.988-3.625 0-6.813-3.189-6.813-6.812 0-3.659 3.189-6.885 6.814-6.885zm4.561 6.623c-.137-2.653-2.106-4.249-4.484-4.249h-.09c-2.745 0-4.268 2.159-4.268 4.61 0 2.747 1.842 4.481 4.256 4.481 2.693 0 4.464-1.973 4.592-4.306l-.006-.536z"
                        />
                      </svg>
                    )}
                  </a>
                );
              })}
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
