import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { login, register } from "@/api/useAuthApi";

export default function AuthModal({ open, onClose }) {
  const [tab, setTab] = useState("login");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Очищаем ошибки и поля при открытии/переключении
  useEffect(() => {
    setError("");
  }, [open, tab]);

  if (!open) return null;

  function handleSuccess(token) {
    localStorage.setItem("token", token);
    onClose();
    navigate("/account");
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />
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
                tab === "login"
                  ? "bg-yellow-400 text-black"
                  : "bg-transparent text-white hover:bg-white/10"
              }`}
              onClick={() => setTab("login")}
            >
              Вход
            </button>
            <button
              className={`flex-1 py-2 font-bold rounded-r-2xl transition ${
                tab === "register"
                  ? "bg-yellow-400 text-black"
                  : "bg-transparent text-white hover:bg-white/10"
              }`}
              onClick={() => setTab("register")}
            >
              Регистрация
            </button>
          </div>
          {tab === "login" ? (
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const data = await login(email, password);
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
        placeholder="Email"
        className="rounded-lg px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Пароль"
        className="rounded-lg px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
        required
        value={password}
        onChange={e => setPassword(e.target.value)}
      />
      <button
        type="submit"
        className="bg-yellow-400 text-black font-semibold py-3 rounded-full hover:bg-yellow-300 transition"
        disabled={isLoading}
      >
        {isLoading ? "Вход..." : "Войти"}
      </button>
      {error && <div className="text-red-400 text-sm mt-2">{error}</div>}
      <div className="flex justify-between items-center mt-2">
        <a href="#" className="text-xs text-gray-400 hover:text-yellow-400 transition">Забыли пароль?</a>
        <span className="text-xs text-gray-400">или</span>
        <button
          type="button"
          className="text-xs text-yellow-400 hover:underline"
          onClick={() => alert('Вход через Telegram (заглушка)')}
        >
          Войти через Telegram
        </button>
      </div>
    </form>
  );
}

function RegisterForm({ onSuccess, setError, error, isLoading, setIsLoading }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    if (password !== confirm) {
      setError("Пароли не совпадают");
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
        placeholder="Email"
        className="rounded-lg px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <input
        type="text"
        placeholder="Имя пользователя"
        className="rounded-lg px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
        required
        value={username}
        onChange={e => setUsername(e.target.value)}
      />
      <input
        type="password"
        placeholder="Пароль"
        className="rounded-lg px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
        required
        value={password}
        onChange={e => setPassword(e.target.value)}
      />
      <input
        type="password"
        placeholder="Повтор пароля"
        className="rounded-lg px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
        required
        value={confirm}
        onChange={e => setConfirm(e.target.value)}
      />
      <button
        type="submit"
        className="bg-yellow-400 text-black font-semibold py-3 rounded-full hover:bg-yellow-300 transition"
        disabled={isLoading}
      >
        {isLoading ? "Регистрация..." : "Зарегистрироваться"}
      </button>
      {error && <div className="text-red-400 text-sm mt-2">{error}</div>}
      <div className="flex justify-end items-center mt-2">
        <button
          type="button"
          className="text-xs text-yellow-400 hover:underline"
          onClick={() => alert('Вход через Telegram (заглушка)')}
        >
          Войти через Telegram
        </button>
      </div>
    </form>
  );
} 