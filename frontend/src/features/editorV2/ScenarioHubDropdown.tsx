import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  ChevronDown,
  Trash2,
  Pencil,
  Home,
  Package,
  CreditCard,
  HelpCircle,
  Headphones,
  ShoppingCart,
  FileText,
  Gift,
  LucideIcon,
  Plus,
} from 'lucide-react';
import type { Scenario } from '../../api/scenarios';

const ICON_MAP: Record<string, LucideIcon> = {
  Home,
  Package,
  CreditCard,
  HelpCircle,
  Headphones,
  ShoppingCart,
  FileText,
  Gift,
};

function getIconComponent(iconName?: string | null): LucideIcon {
  if (!iconName) return FileText;
  return ICON_MAP[iconName] || FileText;
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  padding: '8px 10px 6px',
  margin: 0,
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: 'rgba(51, 65, 85, 0.9)',
  margin: '8px 8px',
};

/** Панель меню: без общего скролла; прокрутка только у списка сценариев бота */
const menuShellStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: 6,
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: 12,
  padding: '6px 0 8px',
  minWidth: 280,
  maxWidth: 320,
  overflow: 'hidden',
  boxShadow: '0 10px 40px rgba(0,0,0,0.45)',
  zIndex: 1000,
};

export interface ScenarioHubDropdownProps {
  botScenarios: Scenario[];
  currentScenarioId: number | null;
  isLoading: boolean;
  isReadOnly: boolean;
  busy?: boolean;
  onSelectScenario: (scenarioId: number) => void;
  onRequestCreate: () => void;
  onRequestAddFromMine: () => void;
  onImportJson: () => void;
  onDeleteScenario?: (scenarioId: number) => void;
  /** Переименование через API; при ошибке должен бросать исключение */
  onRenameScenario?: (scenarioId: number, name: string) => Promise<void>;
}

export default function ScenarioHubDropdown({
  botScenarios,
  currentScenarioId,
  isLoading,
  isReadOnly,
  busy = false,
  onSelectScenario,
  onRequestCreate,
  onRequestAddFromMine,
  onImportJson,
  onDeleteScenario,
  onRenameScenario,
}: ScenarioHubDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);

  const editingIdRef = useRef<number | null>(null);
  const editDraftRef = useRef('');
  const renameOriginalRef = useRef('');
  editingIdRef.current = editingId;
  editDraftRef.current = editDraft;

  const currentScenario = useMemo(
    () => botScenarios.find(s => s.id === currentScenarioId),
    [botScenarios, currentScenarioId]
  );

  const CurrentIcon = getIconComponent(currentScenario?.icon);

  const displayName = isLoading ? 'Загрузка…' : currentScenario?.name || 'Выберите сценарий';

  /**
   * Завершение переименования.
   * Клик вне поля (и вне меню): как blur — сохранить, если имя непустое и изменилось; иначе отмена.
   * Esc: всегда отмена без сохранения.
   */
  const attemptFinishRename = useCallback(
    async (forceCancel: boolean): Promise<boolean> => {
      const id = editingIdRef.current;
      if (id === null) return true;
      if (forceCancel) {
        setEditingId(null);
        setEditDraft('');
        return true;
      }
      const trimmed = editDraftRef.current.trim();
      if (!trimmed) {
        setEditingId(null);
        setEditDraft('');
        return true;
      }
      if (trimmed === renameOriginalRef.current) {
        setEditingId(null);
        setEditDraft('');
        return true;
      }
      if (!onRenameScenario) {
        setEditingId(null);
        setEditDraft('');
        return true;
      }
      setRenamingId(id);
      try {
        await onRenameScenario(id, trimmed);
        setEditingId(null);
        setEditDraft('');
        return true;
      } catch {
        return false;
      } finally {
        setRenamingId(null);
      }
    },
    [onRenameScenario]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (event.target instanceof HTMLElement && dropdownRef.current?.contains(event.target)) {
        return;
      }
      void (async () => {
        if (editingIdRef.current !== null) {
          const ok = await attemptFinishRename(false);
          if (!ok) return;
        }
        setIsOpen(false);
      })();
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, attemptFinishRename]);

  const botEmpty = !isLoading && botScenarios.length === 0;

  const iconActionStyle: React.CSSProperties = {
    flexShrink: 0,
    width: 32,
    height: 32,
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const rowButton = (
    active: boolean,
    onClick: () => void,
    children: React.ReactNode,
    opts?: { disabled?: boolean }
  ) => (
    <button
      type="button"
      disabled={opts?.disabled}
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        background: active ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
        border: 'none',
        borderRadius: 8,
        cursor: opts?.disabled ? 'not-allowed' : 'pointer',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? '#e0f2fe' : '#f1f5f9',
        textAlign: 'left',
        opacity: opts?.disabled ? 0.5 : 1,
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={e => {
        if (opts?.disabled) return;
        if (!active) e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
      }}
      onMouseLeave={e => {
        if (opts?.disabled) return;
        e.currentTarget.style.background = active ? 'rgba(59, 130, 246, 0.12)' : 'transparent';
      }}
    >
      {children}
    </button>
  );

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => {
          if (isLoading) return;
          setIsOpen(v => !v);
        }}
        style={{
          background: '#0f172a',
          color: '#fff',
          border: '1px solid #334155',
          borderRadius: 10,
          padding: '8px 12px',
          fontSize: 13,
          fontWeight: 600,
          cursor: isLoading ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          maxWidth: 260,
          minWidth: 0,
          opacity: isLoading ? 0.65 : 1,
        }}
        title="Сценарии этого бота и быстрые действия"
      >
        <span style={{ fontSize: 16, lineHeight: 1 }} aria-hidden>
          📄
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'left',
          }}
        >
          {displayName}
        </span>
        <CurrentIcon size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
        <ChevronDown
          size={16}
          style={{
            flexShrink: 0,
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s ease',
            color: '#94a3b8',
          }}
        />
      </button>

      {isOpen && (
        <div style={menuShellStyle} role="menu">
          <div style={sectionTitleStyle}>Используемые в этом боте</div>
          <div
            style={{
              maxHeight: 200,
              overflowY: 'auto',
              padding: '0 8px',
            }}
          >
            {botEmpty ? (
              <div style={{ padding: '8px 10px 12px', color: '#94a3b8', fontSize: 13 }}>
                У этого бота пока нет сценариев
              </div>
            ) : (
              botScenarios.map(scenario => {
                const isActive = scenario.id === currentScenarioId;
                const Icon = getIconComponent(scenario.icon);
                const isEditing = editingId === scenario.id;
                const canDelete =
                  Boolean(onDeleteScenario) &&
                  !isReadOnly &&
                  botScenarios.length > 1 &&
                  !scenario.is_main;
                const canRename = Boolean(onRenameScenario) && !isReadOnly && !busy;
                const rowBusy = renamingId === scenario.id;

                return (
                  <div
                    key={scenario.id}
                    data-scenario-row={scenario.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 2 }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isEditing ? (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 10px',
                            borderRadius: 8,
                            background: isActive
                              ? 'rgba(59, 130, 246, 0.12)'
                              : 'rgba(51, 65, 85, 0.35)',
                            border: '1px solid #475569',
                          }}
                        >
                          <Icon size={16} style={{ color: '#94a3b8', flexShrink: 0 }} />
                          <input
                            type="text"
                            value={editDraft}
                            disabled={rowBusy}
                            autoFocus
                            aria-label="Название сценария"
                            onChange={e => setEditDraft(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                void attemptFinishRename(true);
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                const t = editDraftRef.current.trim();
                                if (!t) return;
                                void attemptFinishRename(false);
                              }
                            }}
                            onBlur={() => {
                              window.setTimeout(() => {
                                if (editingIdRef.current !== scenario.id) return;
                                const row = dropdownRef.current?.querySelector(
                                  `[data-scenario-row="${scenario.id}"]`
                                );
                                const ae = document.activeElement;
                                if (row && ae && row.contains(ae as Node)) return;
                                void attemptFinishRename(false);
                              }, 0);
                            }}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              padding: '4px 8px',
                              borderRadius: 6,
                              border: '1px solid #334155',
                              background: '#020617',
                              color: '#f1f5f9',
                              fontSize: 13,
                              outline: 'none',
                            }}
                          />
                          {scenario.is_main && (
                            <span style={{ fontSize: 10, color: '#64748b', flexShrink: 0 }}>
                              главный
                            </span>
                          )}
                        </div>
                      ) : (
                        rowButton(
                          isActive,
                          () => {
                            onSelectScenario(scenario.id);
                            setIsOpen(false);
                          },
                          <>
                            <Icon size={16} style={{ color: isActive ? '#7dd3fc' : '#94a3b8' }} />
                            <span
                              style={{
                                flex: 1,
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {scenario.name}
                            </span>
                            {scenario.is_main && (
                              <span style={{ fontSize: 10, color: '#64748b', flexShrink: 0 }}>
                                главный
                              </span>
                            )}
                            {isActive && (
                              <span style={{ color: '#38bdf8', fontSize: 12, flexShrink: 0 }}>
                                ✓
                              </span>
                            )}
                          </>
                        )
                      )}
                    </div>
                    {canRename && !isEditing && (
                      <button
                        type="button"
                        title="Переименовать"
                        disabled={Boolean(renamingId)}
                        onMouseDown={e => e.preventDefault()}
                        onClick={e => {
                          e.stopPropagation();
                          void (async () => {
                            const cur = editingIdRef.current;
                            if (cur !== null && cur !== scenario.id) {
                              const ok = await attemptFinishRename(false);
                              if (!ok) return;
                            }
                            if (editingIdRef.current === scenario.id) return;
                            renameOriginalRef.current = scenario.name;
                            setEditingId(scenario.id);
                            setEditDraft(scenario.name);
                          })();
                        }}
                        style={{
                          ...iconActionStyle,
                          opacity: renamingId ? 0.45 : 1,
                          cursor: renamingId ? 'not-allowed' : 'pointer',
                        }}
                        onMouseEnter={e => {
                          if (renamingId) return;
                          e.currentTarget.style.background = 'rgba(59, 130, 246, 0.12)';
                          e.currentTarget.style.color = '#7dd3fc';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = '#64748b';
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    {canDelete && !isEditing && (
                      <button
                        type="button"
                        title="Удалить сценарий"
                        onMouseDown={e => e.preventDefault()}
                        onClick={e => {
                          e.stopPropagation();
                          onDeleteScenario!(scenario.id);
                        }}
                        style={iconActionStyle}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
                          e.currentTarget.style.color = '#f87171';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = '#64748b';
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                );
              })
            )}
            {botEmpty && !isReadOnly && (
              <div style={{ paddingBottom: 8 }}>
                {rowButton(
                  false,
                  () => {
                    onRequestCreate();
                    setIsOpen(false);
                  },
                  <>
                    <Plus size={16} style={{ color: '#4ade80' }} />
                    <span>Создать первый сценарий</span>
                  </>,
                  { disabled: busy }
                )}
              </div>
            )}
          </div>

          <div style={dividerStyle} />

          <div style={{ padding: '0 8px 4px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {rowButton(
              false,
              () => {
                if (!isReadOnly) {
                  onRequestCreate();
                  setIsOpen(false);
                }
              },
              <>
                <Plus size={16} style={{ color: '#4ade80' }} />
                <span>Новый сценарий</span>
              </>,
              { disabled: isReadOnly || busy }
            )}
            {rowButton(
              false,
              () => {
                if (!isReadOnly) {
                  onRequestAddFromMine();
                  setIsOpen(false);
                }
              },
              <>
                <span style={{ fontSize: 15, width: 16, textAlign: 'center' }} aria-hidden>
                  ⊕
                </span>
                <span>Добавить из моих сценариев</span>
              </>,
              { disabled: isReadOnly || busy }
            )}
            {rowButton(
              false,
              () => {
                if (!isReadOnly) {
                  onImportJson();
                  setIsOpen(false);
                }
              },
              <>
                <span style={{ fontSize: 15, lineHeight: 1 }} aria-hidden>
                  📥
                </span>
                <span>Импорт JSON</span>
              </>,
              { disabled: isReadOnly || busy }
            )}
          </div>
        </div>
      )}
    </div>
  );
}
