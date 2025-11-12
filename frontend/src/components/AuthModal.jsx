import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { login, register } from '@/api/useAuthApi';
import { Eye, EyeOff } from 'lucide-react';

export default function AuthModal({ open, onClose }) {
  const [tab, setTab] = useState('login');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Очищаем ошибки и поля при открытии/переключении
  useEffect(() => {
    setError('');
  }, [open, tab]);

  if (!open) return null;

  function handleSuccess(token) {
    localStorage.setItem('token', token);
    onClose();
    navigate('/dashboard');
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          className="relative z-10 bg-[#181f2a] rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 text-white"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
        >
          <button
            className="absolute top-4 right-4 text-gray-400 hover:text-yellow-400 text-2xl"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
          <div className="flex mb-8">
            <button
              className={`flex-1 py-2 font-bold rounded-l-2xl transition ${
                tab === 'login'
                  ? 'bg-yellow-400 text-black'
                  : 'bg-transparent text-white hover:bg-white/10'
              }`}
              onClick={() => setTab('login')}
            >
              Вход
            </button>
            <button
              className={`flex-1 py-2 font-bold rounded-r-2xl transition ${
                tab === 'register'
                  ? 'bg-yellow-400 text-black'
                  : 'bg-transparent text-white hover:bg-white/10'
              }`}
              onClick={() => setTab('register')}
            >
              Регистрация
            </button>
          </div>
          {tab === 'login' ? (
            <LoginForm
              onSuccess={handleSuccess}
              setError={setError}
              error={error}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
            />
          ) : (
            <RegisterForm
              onSuccess={handleSuccess}
              setError={setError}
              error={error}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
            />
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function LoginForm({ onSuccess, setError, error, isLoading, setIsLoading }) {
  const [emailOrLogin, setEmailOrLogin] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const data = await login(emailOrLogin, password);
      onSuccess(data.access_token);
      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Почта или логин"
        className="rounded-lg px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
        required
        value={emailOrLogin}
        onChange={e => setEmailOrLogin(e.target.value)}
      />
      <input
        type="password"
        placeholder="Пароль"
        className="rounded-lg px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
        required
        value={password}
        onChange={e => setPassword(e.target.value)}
      />

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={e => setRememberMe(e.target.checked)}
          className="w-4 h-4 accent-yellow-400"
        />
        <span className="text-sm text-gray-300">Запомнить меня</span>
      </label>

      <button
        type="submit"
        className="bg-yellow-400 text-black font-semibold py-3 rounded-full hover:bg-yellow-300 transition"
        disabled={isLoading}
      >
        {isLoading ? 'Вход...' : 'Войти'}
      </button>
      {error && <div className="text-red-400 text-sm mt-2">{error}</div>}

      <div className="flex items-center justify-center gap-4 mt-4">
        <OAuthButton provider="google" onClick={() => alert('Вход через Google (в разработке)')} />
        <OAuthButton
          provider="yandex"
          onClick={() => alert('Вход через Яндекс ID (в разработке)')}
        />
        <OAuthButton provider="mailru" onClick={() => alert('Вход через Mail.ru (в разработке)')} />
      </div>
    </form>
  );
}

function RegisterForm({ onSuccess, setError, error, isLoading, setIsLoading }) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Валидация пароля
  const validatePassword = pwd => {
    const hasDigit = /\d/.test(pwd);
    const hasLowerCase = /[a-z]/.test(pwd);
    const hasUpperCase = /[A-Z]/.test(pwd);
    return hasDigit && hasLowerCase && hasUpperCase && pwd.length >= 8;
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!validatePassword(password)) {
      setError('Пароль должен содержать минимум 8 символов: цифры, строчные и заглавные буквы');
      setIsLoading(false);
      return;
    }

    if (password !== confirm) {
      setError('Пароли не совпадают');
      setIsLoading(false);
      return;
    }

    try {
      const data = await register(email, username, password);
      onSuccess(data.access_token);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <input
        type="email"
        placeholder="Почта"
        className="rounded-lg px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <input
        type="text"
        placeholder="Логин"
        className="rounded-lg px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
        required
        value={username}
        onChange={e => setUsername(e.target.value)}
      />

      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          placeholder="Пароль"
          className="rounded-lg px-4 py-3 pr-12 bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 w-full"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-yellow-400"
        >
          {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>

      <div className="relative">
        <input
          type={showConfirm ? 'text' : 'password'}
          placeholder="Повтор пароля"
          className="rounded-lg px-4 py-3 pr-12 bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400 w-full"
          required
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setShowConfirm(!showConfirm)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-yellow-400"
        >
          {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>

      <button
        type="submit"
        className="bg-yellow-400 text-black font-semibold py-3 rounded-full hover:bg-yellow-300 transition"
        disabled={isLoading}
      >
        {isLoading ? 'Регистрация...' : 'Зарегистрироваться'}
      </button>
      {error && <div className="text-red-400 text-sm mt-2">{error}</div>}

      <div className="flex items-center justify-center gap-4 mt-4">
        <OAuthButton
          provider="google"
          onClick={() => alert('Регистрация через Google (в разработке)')}
        />
        <OAuthButton
          provider="yandex"
          onClick={() => alert('Регистрация через Яндекс ID (в разработке)')}
        />
        <OAuthButton
          provider="mailru"
          onClick={() => alert('Регистрация через Mail.ru (в разработке)')}
        />
      </div>
    </form>
  );
}

// Компонент кнопки OAuth с логотипами
function OAuthButton({ provider, onClick }) {
  const logos = {
    google: (
      <svg viewBox="0 0 24 24" className="w-8 h-8">
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
    ),
    yandex: (
      <svg viewBox="0 0 24 24" className="w-8 h-8">
        <path
          fill="#FF0000"
          d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm3.9 18.7h-2.4l-3.1-7.4h-.1v7.4H8.1V5.3h3.4c2.9 0 4.7 1.5 4.7 4 0 2-1.2 3.3-2.8 3.7l3.5 5.7zm-3.7-9.5c1.4 0 2.3-.8 2.3-2.1s-.9-2.1-2.3-2.1h-1.9v4.2h1.9z"
        />
      </svg>
    ),
    mailru: (
      <svg viewBox="0 0 24 24" className="w-8 h-8">
        <path
          fill="#168DE2"
          d="M11.585 5.267c1.834 0 3.558.811 4.824 2.08v.004c0-.609.41-1.068.979-1.068h.145c.891 0 1.073.842 1.073 1.109l.005 9.475c-.063.621.64.941 1.029.543 1.521-1.564 3.342-8.038-.946-11.79-3.996-3.497-9.357-2.921-12.209-.955-3.031 2.091-4.971 6.718-3.086 11.064 2.054 4.74 7.931 6.152 11.424 4.744 1.769-.715 2.586 1.676.749 2.457-2.776 1.184-10.502 1.064-14.11-5.188C-.977 13.521-.847 6.093 5.62 2.245 10.567-.698 17.09.117 21.022 4.224c4.111 4.294 3.872 12.334-.139 15.461-1.816 1.42-4.516.037-4.498-2.031l-.019-.678c-1.265 1.256-2.948 1.988-4.782 1.988-3.625 0-6.813-3.189-6.813-6.812 0-3.659 3.189-6.885 6.814-6.885zm4.561 6.623c-.137-2.653-2.106-4.249-4.484-4.249h-.09c-2.745 0-4.268 2.159-4.268 4.61 0 2.747 1.842 4.481 4.256 4.481 2.693 0 4.464-1.973 4.592-4.306l-.006-.536z"
        />
      </svg>
    ),
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-12 h-12 rounded-full bg-white hover:bg-gray-100 flex items-center justify-center transition-all hover:scale-110"
      aria-label={`Войти через ${provider}`}
    >
      {logos[provider]}
    </button>
  );
}
