import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Plus, Bot, Settings, Copy } from 'lucide-react';

interface BotItem {
  id: number;
  title: string;
  username: string;
  is_active: boolean;
}

interface BotsDropdownProps {
  bots: BotItem[];
  currentBotId: number | null;
  onSelectBot: (botId: number) => void;
  onCreateBot?: () => void;
  onCreateFromTemplate?: () => void;
}

export default function BotsDropdown({
  bots,
  currentBotId,
  onSelectBot,
  onCreateBot,
  onCreateFromTemplate,
}: BotsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const currentBot = bots.find(b => b.id === currentBotId);

  // Если боты еще загружаются
  const isLoading = bots.length === 0 && !currentBotId;
  const displayName = currentBot?.title || (isLoading ? 'Загрузка...' : 'Выберите бота');

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        event.target instanceof HTMLElement &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectBot = (botId: number) => {
    onSelectBot(botId);
    navigate(`/editor/${botId}`);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: '#1f2937',
          border: '1px solid #374151',
          borderRadius: 8,
          color: '#f3f4f6',
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
          minWidth: 180,
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = '#374151';
          e.currentTarget.style.borderColor = '#4b5563';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = '#1f2937';
          e.currentTarget.style.borderColor = '#374151';
        }}
      >
        <Bot size={16} style={{ color: currentBot?.is_active ? '#10b981' : '#6b7280' }} />
        <span
          style={{
            flex: 1,
            textAlign: 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displayName}
        </span>
        <ChevronDown
          size={16}
          style={{
            color: '#9ca3af',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.2s',
          }}
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: 280,
            background: '#1f2937',
            border: '1px solid #374151',
            borderRadius: 8,
            boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          {/* Мои боты */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #374151' }}>
            <span
              style={{
                fontSize: 11,
                color: '#6b7280',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              Мои боты
            </span>
          </div>

          {/* Список ботов */}
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {bots.length === 0 ? (
              <div
                style={{
                  padding: '16px 12px',
                  color: '#6b7280',
                  fontSize: 13,
                  textAlign: 'center',
                }}
              >
                Нет созданных ботов
              </div>
            ) : (
              bots.map(bot => (
                <button
                  key={bot.id}
                  onClick={() => handleSelectBot(bot.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    background: bot.id === currentBotId ? '#374151' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => {
                    if (bot.id !== currentBotId) e.currentTarget.style.background = '#374151';
                  }}
                  onMouseLeave={e => {
                    if (bot.id !== currentBotId) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <Bot size={18} style={{ color: bot.is_active ? '#10b981' : '#6b7280' }} />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ color: '#f3f4f6', fontSize: 14, fontWeight: 500 }}>
                      {bot.title}
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: 12 }}>@{bot.username}</div>
                  </div>
                  <div
                    style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 500,
                      background: bot.is_active
                        ? 'rgba(16, 185, 129, 0.2)'
                        : 'rgba(107, 114, 128, 0.2)',
                      color: bot.is_active ? '#10b981' : '#6b7280',
                    }}
                  >
                    {bot.is_active ? 'Активен' : 'Неактивен'}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Действия */}
          <div style={{ borderTop: '1px solid #374151' }}>
            {onCreateBot && (
              <button
                onClick={() => {
                  onCreateBot();
                  setIsOpen(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#fbbf24',
                  fontSize: 14,
                  fontWeight: 500,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#374151')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Plus size={18} />
                Создать нового бота
              </button>
            )}
            {onCreateFromTemplate && (
              <button
                onClick={() => {
                  onCreateFromTemplate();
                  setIsOpen(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#9ca3af',
                  fontSize: 14,
                  fontWeight: 500,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#374151')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Copy size={18} />
                Создать из шаблона
              </button>
            )}
            <button
              onClick={() => {
                navigate('/dashboard/bots');
                setIsOpen(false);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#9ca3af',
                fontSize: 14,
                fontWeight: 500,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#374151')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <Settings size={18} />
              Управление ботами
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
