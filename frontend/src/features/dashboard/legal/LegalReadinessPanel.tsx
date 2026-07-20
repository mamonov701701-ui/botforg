import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  getAdminLegalChecklist,
  getAdminLegalLaunchStatus,
  safeLegalAdminErrorMessage,
  updateAdminLegalChecklistItem,
  type LegalChecklistItem,
  type LegalLaunchStatus,
} from '../../../api/legalAdmin';
import { ApiError } from '../../../api/client';
import { toast } from '../../../utils/toast';
import { LEGAL_COLORS, formatLegalDate, legalDocTypeLabel } from './legalHelpers';

type LoadState = 'loading' | 'ready' | 'error' | 'forbidden';

const btnBase: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: `1px solid ${LEGAL_COLORS.accentBorder}`,
  background: LEGAL_COLORS.panelBgElevated,
  color: LEGAL_COLORS.text,
  fontSize: 14,
  cursor: 'pointer',
};

export default function LegalReadinessPanel() {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [checklist, setChecklist] = useState<LegalChecklistItem[]>([]);
  const [status, setStatus] = useState<LegalLaunchStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadState('loading');
    setErrorMsg('');
    try {
      const [items, launch] = await Promise.all([
        getAdminLegalChecklist(),
        getAdminLegalLaunchStatus(),
      ]);
      setChecklist(items);
      setStatus(launch);
      setLoadState('ready');
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setLoadState('forbidden');
        return;
      }
      setLoadState('error');
      setErrorMsg(safeLegalAdminErrorMessage(err, 'Не удалось загрузить готовность'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleItem = async (item: LegalChecklistItem) => {
    setBusyKey(item.item_key);
    try {
      const updated = await updateAdminLegalChecklistItem(item.item_key, {
        is_completed: !item.is_completed,
      });
      setChecklist(prev => prev.map(r => (r.item_key === updated.item_key ? updated : r)));
      const launch = await getAdminLegalLaunchStatus();
      setStatus(launch);
      toast.success(updated.is_completed ? 'Пункт отмечен' : 'Отметка снята');
    } catch (err) {
      toast.error(safeLegalAdminErrorMessage(err, 'Не удалось обновить пункт'));
    } finally {
      setBusyKey(null);
    }
  };

  if (loadState === 'forbidden') {
    return (
      <div data-testid="legal-readiness-forbidden" style={{ color: LEGAL_COLORS.textSecondary }}>
        Доступ только для администраторов платформы.
      </div>
    );
  }

  return (
    <div data-testid="legal-readiness-panel">
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          style={{ ...btnBase, display: 'inline-flex', alignItems: 'center', gap: 8 }}
          onClick={() => void load()}
        >
          <RefreshCw size={16} /> Обновить
        </button>
      </div>

      {loadState === 'loading' ? (
        <p style={{ color: LEGAL_COLORS.textSecondary }}>Загрузка…</p>
      ) : null}
      {loadState === 'error' ? <p style={{ color: LEGAL_COLORS.danger }}>{errorMsg}</p> : null}

      {status ? (
        <div
          data-testid="legal-launch-status"
          style={{
            background: LEGAL_COLORS.panelBgElevated,
            border: `1px solid ${LEGAL_COLORS.accentBorder}`,
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            legal_launch_ready:{' '}
            <span data-testid="legal-launch-ready-value">
              {status.legal_launch_ready ? 'true' : 'false'}
            </span>
          </div>
          <div style={{ fontSize: 13, color: LEGAL_COLORS.textSecondary, lineHeight: 1.6 }}>
            <div>Окружение: {status.environment}</div>
            <div>Платежи заблокированы: {status.payments_blocked ? 'да' : 'нет'}</div>
            <div>Checklist заполнен: {status.checklist_complete ? 'да' : 'нет'}</div>
            <div>
              Обязательные документы опубликованы: {status.required_docs_published ? 'да' : 'нет'}
            </div>
            {status.missing_doc_types.length > 0 ? (
              <div>Нет published: {status.missing_doc_types.map(legalDocTypeLabel).join(', ')}</div>
            ) : null}
            {status.missing_checklist_keys.length > 0 ? (
              <div>Не отмечены: {status.missing_checklist_keys.join(', ')}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {loadState === 'ready' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {checklist.map(item => (
            <label
              key={item.item_key}
              data-testid={`legal-checklist-${item.item_key}`}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                padding: 14,
                borderRadius: 10,
                border: `1px solid ${LEGAL_COLORS.accentBorder}`,
                background: LEGAL_COLORS.panelBgElevated,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={item.is_completed}
                disabled={busyKey === item.item_key}
                onChange={() => void toggleItem(item)}
                style={{ marginTop: 3 }}
              />
              <div>
                <div style={{ fontWeight: 500 }}>{item.label_ru}</div>
                <div style={{ fontSize: 12, color: LEGAL_COLORS.textSecondary, marginTop: 4 }}>
                  {item.item_key}
                  {item.completed_at ? ` · ${formatLegalDate(item.completed_at)}` : ''}
                </div>
                {item.note ? <div style={{ fontSize: 13, marginTop: 4 }}>{item.note}</div> : null}
              </div>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
