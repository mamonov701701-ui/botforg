import React, { useState } from 'react';
import { X, Bot, Plus, Send, MessageCircle, Zap, Store, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from '../../utils/toast';

interface NewBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBotCreated?: (botId: number) => void;
}

type Step = 'name' | 'type' | 'channel' | 'connect';
type BotType = 'connect' | 'marketplace';
type Channel = 'telegram' | 'whatsapp' | 'max';

const CHANNELS = [
  {
    id: 'telegram' as Channel,
    name: 'Telegram',
    icon: Send,
    color: '#0088cc',
    description: 'Самый популярный мессенджер для ботов',
    tokenPlaceholder: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz',
    tokenHelp: 'Получите токен у @BotFather в Telegram',
  },
  {
    id: 'whatsapp' as Channel,
    name: 'WhatsApp',
    icon: MessageCircle,
    color: '#25D366',
    description: 'Бизнес-мессенджер с широкой аудиторией',
    tokenPlaceholder: 'Введите API ключ WhatsApp Business',
    tokenHelp: 'Используйте WhatsApp Business API',
  },
  {
    id: 'max' as Channel,
    name: 'Max',
    icon: Zap,
    color: '#FF6B00',
    description: 'Новый перспективный мессенджер',
    tokenPlaceholder: 'Введите токен Max бота',
    tokenHelp: 'Создайте бота в настройках Max',
  },
];

export default function NewBotModal({ isOpen, onClose, onBotCreated }: NewBotModalProps) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [botType, setBotType] = useState<BotType | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>('name');

  if (!isOpen) return null;

  const selectedChannel = CHANNELS.find(c => c.id === channel);

  const handleNext = () => {
    if (step === 'name') {
      if (!name.trim()) {
        toast.error('Введите название бота');
        return;
      }
      setStep('type');
    } else if (step === 'type') {
      if (!botType) {
        toast.error('Выберите тип бота');
        return;
      }
      if (botType === 'marketplace') {
        handleCreateForMarketplace();
      } else {
        setStep('channel');
      }
    } else if (step === 'channel') {
      if (!channel) {
        toast.error('Выберите канал');
        return;
      }
      setStep('connect');
    }
  };

  const handleBack = () => {
    if (step === 'type') setStep('name');
    else if (step === 'channel') setStep('type');
    else if (step === 'connect') setStep('channel');
  };

  const handleCreateForMarketplace = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/bots/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({
          title: name.trim(),
          description: '',
          is_template: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Ошибка при создании бота');
      }

      const bot = await response.json();
      toast.success(`Бот "${bot.title}" создан! Настройте сценарии в редакторе.`);

      if (onBotCreated) {
        onBotCreated(bot.id);
      }

      navigate(`/editor/${bot.id}`);
      handleClose();
    } catch (error: any) {
      toast.error(error.message || 'Не удалось создать бота');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!token.trim()) {
      toast.error('Введите токен');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/bots/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({
          token: token.trim(),
          channel: channel,
          title: name.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Ошибка при подключении бота');
      }

      const bot = await response.json();
      toast.success(`Бот "${bot.title || bot.username}" подключён к ${selectedChannel?.name}!`);

      if (onBotCreated) {
        onBotCreated(bot.id);
      }

      navigate(`/editor/${bot.id}`);
      handleClose();
    } catch (error: any) {
      toast.error(error.message || 'Не удалось подключить бота');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setBotType(null);
    setChannel(null);
    setToken('');
    setStep('name');
    onClose();
  };

  const getStepTitle = () => {
    switch (step) {
      case 'name':
        return 'Шаг 1: Название';
      case 'type':
        return 'Шаг 2: Тип бота';
      case 'channel':
        return 'Шаг 3: Канал';
      case 'connect':
        return `Шаг 4: Подключение к ${selectedChannel?.name}`;
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: '#1f2937',
          borderRadius: 12,
          width: '100%',
          maxWidth: 480,
          padding: 24,
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: 'rgba(251, 191, 36, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bot size={20} style={{ color: '#fbbf24' }} />
            </div>
            <div>
              <h2 style={{ color: '#f3f4f6', fontSize: 18, fontWeight: 600, margin: 0 }}>
                Создать бота
              </h2>
              <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>{getStepTitle()}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 8,
              borderRadius: 6,
            }}
          >
            <X size={20} style={{ color: '#9ca3af' }} />
          </button>
        </div>

        {/* Step 1: Name */}
        {step === 'name' && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>
              Название бота
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Например: Бот поддержки"
              autoFocus
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '#111827',
                border: '1px solid #374151',
                borderRadius: 8,
                color: '#f3f4f6',
                fontSize: 14,
                outline: 'none',
              }}
              onKeyDown={e => e.key === 'Enter' && handleNext()}
            />
            <p style={{ color: '#6b7280', fontSize: 12, marginTop: 8 }}>
              Это название будет отображаться в списке ваших ботов
            </p>
          </div>
        )}

        {/* Step 2: Bot Type */}
        {step === 'type' && (
          <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              type="button"
              onClick={() => setBotType('connect')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: 16,
                background: botType === 'connect' ? 'rgba(251, 191, 36, 0.1)' : '#111827',
                border: `2px solid ${botType === 'connect' ? '#fbbf24' : '#374151'}`,
                borderRadius: 12,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 10,
                  background: 'rgba(59, 130, 246, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Send size={24} style={{ color: '#3b82f6' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#f3f4f6', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                  Подключить к каналу
                </div>
                <div style={{ color: '#9ca3af', fontSize: 13 }}>
                  Telegram, WhatsApp, Max — для работы с клиентами
                </div>
              </div>
              <ArrowRight size={20} style={{ color: '#6b7280' }} />
            </button>

            <button
              type="button"
              onClick={() => setBotType('marketplace')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: 16,
                background: botType === 'marketplace' ? 'rgba(251, 191, 36, 0.1)' : '#111827',
                border: `2px solid ${botType === 'marketplace' ? '#fbbf24' : '#374151'}`,
                borderRadius: 12,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 10,
                  background: 'rgba(168, 85, 247, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Store size={24} style={{ color: '#a855f7' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#f3f4f6', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                  Создать для маркетплейса
                </div>
                <div style={{ color: '#9ca3af', fontSize: 13 }}>
                  Шаблон бота для продажи другим пользователям
                </div>
              </div>
              <ArrowRight size={20} style={{ color: '#6b7280' }} />
            </button>
          </div>
        )}

        {/* Step 3: Channel Selection */}
        {step === 'channel' && (
          <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {CHANNELS.map(ch => {
              const Icon = ch.icon;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setChannel(ch.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: 16,
                    background: channel === ch.id ? 'rgba(251, 191, 36, 0.1)' : '#111827',
                    border: `2px solid ${channel === ch.id ? '#fbbf24' : '#374151'}`,
                    borderRadius: 12,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 10,
                      background: `${ch.color}20`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={24} style={{ color: ch.color }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{ color: '#f3f4f6', fontSize: 15, fontWeight: 600, marginBottom: 4 }}
                    >
                      {ch.name}
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: 13 }}>{ch.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Step 4: Connect */}
        {step === 'connect' && selectedChannel && (
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 12,
                background: `${selectedChannel.color}15`,
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              <selectedChannel.icon size={20} style={{ color: selectedChannel.color }} />
              <span style={{ color: '#f3f4f6', fontSize: 14 }}>
                Подключение к {selectedChannel.name}
              </span>
            </div>

            <label style={{ display: 'block', color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>
              Токен / API ключ
            </label>
            <input
              type="text"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder={selectedChannel.tokenPlaceholder}
              autoFocus
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '#111827',
                border: '1px solid #374151',
                borderRadius: 8,
                color: '#f3f4f6',
                fontSize: 14,
                fontFamily: 'monospace',
                outline: 'none',
              }}
            />
            <p style={{ color: '#6b7280', fontSize: 12, marginTop: 8 }}>
              {selectedChannel.tokenHelp}
            </p>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12 }}>
          {step !== 'name' && (
            <button
              type="button"
              onClick={handleBack}
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '12px 20px',
                background: 'transparent',
                border: '1px solid #374151',
                borderRadius: 8,
                color: '#9ca3af',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Назад
            </button>
          )}
          <button
            type="button"
            onClick={step === 'connect' ? handleConnect : handleNext}
            disabled={isLoading}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '12px 20px',
              background: '#fbbf24',
              border: 'none',
              borderRadius: 8,
              color: '#000',
              fontSize: 14,
              fontWeight: 600,
              cursor: isLoading ? 'wait' : 'pointer',
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? (
              'Создание...'
            ) : step === 'connect' ? (
              <>
                <Plus size={18} />
                Подключить
              </>
            ) : step === 'type' && botType === 'marketplace' ? (
              'Создать бота'
            ) : (
              'Далее'
            )}
          </button>
        </div>

        {/* Info */}
        {step === 'type' && botType === 'marketplace' && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: 'rgba(168, 85, 247, 0.1)',
              borderRadius: 8,
              border: '1px solid rgba(168, 85, 247, 0.2)',
            }}
          >
            <p style={{ color: '#c4b5fd', fontSize: 13, margin: 0 }}>
              🏪 Бот будет создан как шаблон. Вы сможете настроить сценарии и выставить его на
              маркетплейс.
            </p>
          </div>
        )}

        {step === 'connect' && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: 'rgba(59, 130, 246, 0.1)',
              borderRadius: 8,
              border: '1px solid rgba(59, 130, 246, 0.2)',
            }}
          >
            <p style={{ color: '#93c5fd', fontSize: 13, margin: 0 }}>
              💡 После подключения бот автоматически получит webhook и будет готов к работе
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
