/**
 * Вкладка «Заявки на доступ» для автора marketplace (MessagesPage).
 */
import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, KeyRound, Check, X } from 'lucide-react';
import { toast } from '../../../utils/toast';
import Card from '../components/Card';
import {
  canAuthorActOnMarketAccessRequest,
  formatMarketAccessItemType,
  formatMarketAccessRequestStatus,
  getMarketAccessRequestActionErrorMessage,
  getMarketAccessRequests,
  grantMarketAccessRequest,
  rejectMarketAccessRequest,
  resolveMarketAccessRequestChatRoomId,
  type MarketAccessRequestListItem,
} from '../../../api/market';

type MessagesAccessRequestsPanelProps = {
  onOpenChat: (roomId: number) => void;
};

function formatRequestDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '—';
  return (
    date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' +
    date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  );
}

function getRequesterLabel(row: MarketAccessRequestListItem): string {
  const requester = row.requester;
  if (!requester) return '—';
  const name = requester.name?.trim();
  if (name) return name;
  if (requester.email?.trim()) return requester.email;
  return `Пользователь #${requester.id ?? '—'}`;
}

export default function MessagesAccessRequestsPanel({
  onOpenChat,
}: MessagesAccessRequestsPanelProps) {
  const [items, setItems] = useState<MarketAccessRequestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionRequestId, setActionRequestId] = useState<number | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getMarketAccessRequests({ role: 'author' });
      setItems(response.items ?? []);
    } catch (err: unknown) {
      console.error('Failed to load author access requests:', err);
      setError(getMarketAccessRequestActionErrorMessage(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const handleOpenChat = (row: MarketAccessRequestListItem) => {
    const roomId = resolveMarketAccessRequestChatRoomId(row);
    if (roomId == null) {
      toast.error('Чат для этой заявки не найден');
      return;
    }
    onOpenChat(roomId);
  };

  const handleGrant = async (requestId: number) => {
    setActionRequestId(requestId);
    try {
      await grantMarketAccessRequest(requestId);
      toast.success('Доступ выдан');
      await loadRequests();
    } catch (err: unknown) {
      toast.error(getMarketAccessRequestActionErrorMessage(err));
    } finally {
      setActionRequestId(null);
    }
  };

  const handleReject = async (requestId: number) => {
    setActionRequestId(requestId);
    try {
      await rejectMarketAccessRequest(requestId);
      toast.success('Заявка отклонена');
      await loadRequests();
    } catch (err: unknown) {
      toast.error(getMarketAccessRequestActionErrorMessage(err));
    } finally {
      setActionRequestId(null);
    }
  };

  return (
    <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <KeyRound size={20} style={{ color: 'var(--primary)' }} />
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>Заявки на доступ</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Запросы покупателей к вашим платным товарам на маркетплейсе
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
            Загрузка заявок...
          </div>
        ) : error ? (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 20px',
              color: 'var(--text-muted)',
            }}
          >
            <p style={{ color: '#ef4444', marginBottom: '12px' }}>{error}</p>
            <button
              type="button"
              onClick={() => void loadRequests()}
              style={{
                padding: '10px 20px',
                background: 'var(--primary)',
                color: 'var(--text-on-primary)',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Повторить
            </button>
          </div>
        ) : items.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 20px',
              color: 'var(--text-muted)',
            }}
          >
            <KeyRound size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
            <p>Заявок на доступ пока нет</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {items.map(row => {
              const requestId = row.request?.id;
              const status = row.request?.status;
              const canAct = canAuthorActOnMarketAccessRequest(status);
              const isBusy = actionRequestId === requestId;
              const title = row.market_item?.title?.trim() || 'Товар без названия';
              const itemType = formatMarketAccessItemType(row.market_item?.item_type);

              return (
                <div
                  key={requestId ?? `${row.market_item?.id}-${row.request?.created_at}`}
                  style={{
                    padding: '16px',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    background: 'var(--surface)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '12px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>
                        {title}
                      </div>
                      <div
                        style={{
                          fontSize: '13px',
                          color: 'var(--text-muted)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        <span>Тип: {itemType}</span>
                        <span>Статус: {formatMarketAccessRequestStatus(status)}</span>
                        <span>Заявитель: {getRequesterLabel(row)}</span>
                        <span>Создана: {formatRequestDate(row.request?.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '8px',
                      marginTop: '14px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenChat(row)}
                      disabled={isBusy}
                      style={{
                        padding: '8px 14px',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '13px',
                        cursor: isBusy ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: isBusy ? 0.6 : 1,
                      }}
                    >
                      <MessageCircle size={14} />
                      Открыть чат
                    </button>
                    <button
                      type="button"
                      onClick={() => requestId != null && void handleGrant(requestId)}
                      disabled={!canAct || isBusy || requestId == null}
                      style={{
                        padding: '8px 14px',
                        background: canAct && !isBusy ? 'var(--primary)' : 'var(--surface)',
                        color: canAct && !isBusy ? 'var(--text-on-primary)' : 'var(--text-muted)',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        cursor: !canAct || isBusy ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: !canAct || isBusy ? 0.6 : 1,
                      }}
                    >
                      <Check size={14} />
                      Выдать доступ
                    </button>
                    <button
                      type="button"
                      onClick={() => requestId != null && void handleReject(requestId)}
                      disabled={!canAct || isBusy || requestId == null}
                      style={{
                        padding: '8px 14px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        cursor: !canAct || isBusy ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: !canAct || isBusy ? 0.6 : 1,
                      }}
                    >
                      <X size={14} />
                      Отклонить
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
