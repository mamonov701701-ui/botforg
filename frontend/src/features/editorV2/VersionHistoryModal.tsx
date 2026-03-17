import React, { useState, useEffect } from 'react';
import { X, History, RotateCcw } from 'lucide-react';
import {
  getScenarioVersions,
  restoreScenarioVersion,
  type ScenarioVersion,
} from '../../api/scenarios';
import { AccessLocked } from '../../components/AccessLocked';
import { hasAccessToAction } from '../../constants/roles';
import { useAuthStore } from '../../stores/authStore';
import { useEditorStore } from '../../stores/editorStore';

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenarioId: number | null;
  scenarioName: string;
  onRestoreSuccess: () => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function VersionHistoryModal({
  isOpen,
  onClose,
  scenarioId,
  scenarioName,
  onRestoreSuccess,
}: VersionHistoryModalProps) {
  const [versions, setVersions] = useState<ScenarioVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<number | null>(null);
  const { user } = useAuthStore();
  const { showToast } = useEditorStore();

  const canRestore = hasAccessToAction(user?.role, 'scenario_edit');

  useEffect(() => {
    if (isOpen && scenarioId) {
      setLoading(true);
      getScenarioVersions(scenarioId)
        .then(data => {
          setVersions(data.sort((a, b) => b.version - a.version));
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setVersions([]);
    }
  }, [isOpen, scenarioId]);

  const handleRestore = (version: ScenarioVersion) => {
    if (!scenarioId) return;
    if (
      !confirm(
        `Вы уверены, что хотите восстановить версию ${version.version}? Текущие изменения будут перезаписаны.`
      )
    ) {
      return;
    }

    setRestoring(version.id);
    restoreScenarioVersion(scenarioId, version.id)
      .then(() => {
        showToast('Версия успешно восстановлена', 'success');
        onRestoreSuccess();
        onClose();
      })
      .catch((err: any) => {
        showToast(err?.message || 'Ошибка при восстановлении', 'error');
      })
      .finally(() => setRestoring(null));
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: '80vh',
          background: '#0f1729',
          borderRadius: 12,
          border: '1px solid #1f2937',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1f2937',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <History size={24} style={{ color: 'var(--primary)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>История изменений</div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>{scenarioName}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              padding: 8,
              display: 'flex',
              borderRadius: 8,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {loading ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: 40,
                color: '#9ca3af',
              }}
            >
              Загрузка...
            </div>
          ) : versions.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 40,
                color: '#9ca3af',
                fontSize: 14,
              }}
            >
              История изменений пуста
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {versions.map(v => (
                <VersionRow
                  key={v.id}
                  version={v}
                  canRestore={canRestore}
                  restoring={restoring}
                  onRestore={handleRestore}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface VersionRowProps {
  version: ScenarioVersion;
  canRestore: boolean;
  restoring: number | null;
  onRestore: (v: ScenarioVersion) => void;
}

function VersionRow({ version, canRestore, restoring, onRestore }: VersionRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '12px 16px',
        background: version.is_active ? 'rgba(255, 210, 76, 0.1)' : 'rgba(31, 41, 55, 0.5)',
        borderRadius: 8,
        border: version.is_active ? '1px solid rgba(255, 210, 76, 0.3)' : '1px solid transparent',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: '#fff' }}>
            Версия {version.version}
          </span>
          {version.is_active && (
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                background: 'var(--primary)',
                color: '#000',
              }}
            >
              Текущая
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
          {formatDate(version.created_at)}
        </div>
      </div>
      {!version.is_active && (
        <AccessLocked hasAccess={canRestore} actionKey="scenario_edit">
          <button
            onClick={() => onRestore(version)}
            disabled={restoring === version.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              background: 'var(--primary)',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: restoring === version.id ? 'wait' : 'pointer',
              opacity: restoring === version.id ? 0.7 : 1,
            }}
          >
            <RotateCcw size={14} />
            Восстановить
          </button>
        </AccessLocked>
      )}
    </div>
  );
}
