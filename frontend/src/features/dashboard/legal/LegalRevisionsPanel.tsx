import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, RefreshCw } from 'lucide-react';
import {
  archiveAdminLegalRevision,
  approveAdminLegalLawyer,
  createAdminLegalDraft,
  listAdminLegalRevisions,
  publishAdminLegalRevision,
  safeLegalAdminErrorMessage,
  submitAdminLegalReview,
  updateAdminLegalDraft,
  type LegalRevisionAdmin,
} from '../../../api/legalAdmin';
import { ApiError } from '../../../api/client';
import { toast } from '../../../utils/toast';
import {
  LEGAL_COLORS,
  LEGAL_DOC_TYPE_OPTIONS,
  canArchiveLegal,
  canEditLegalDraft,
  canLawyerApprove,
  canPublishLegal,
  canSubmitLegalReview,
  formatLegalDate,
  legalDocTypeLabel,
  legalStatusLabel,
} from './legalHelpers';

type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${LEGAL_COLORS.accentBorder}`,
  background: LEGAL_COLORS.fieldBg,
  color: LEGAL_COLORS.text,
  fontSize: 14,
  boxSizing: 'border-box',
};

const btnBase: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: `1px solid ${LEGAL_COLORS.accentBorder}`,
  background: LEGAL_COLORS.panelBgElevated,
  color: LEGAL_COLORS.text,
  fontSize: 14,
  cursor: 'pointer',
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: LEGAL_COLORS.accent,
  borderColor: LEGAL_COLORS.accent,
  color: '#fff',
  fontWeight: 600,
};

export default function LegalRevisionsPanel() {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [items, setItems] = useState<LegalRevisionAdmin[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const [draftDocType, setDraftDocType] = useState('public_offer');
  const [draftVersion, setDraftVersion] = useState('1.0');
  const [draftTitle, setDraftTitle] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const selected = useMemo(() => items.find(i => i.id === selectedId) ?? null, [items, selectedId]);

  const load = useCallback(async () => {
    setLoadState('loading');
    setErrorMsg('');
    try {
      const rows = await listAdminLegalRevisions();
      setItems(rows);
      setLoadState(rows.length ? 'ready' : 'empty');
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setLoadState('forbidden');
        setErrorMsg('Недостаточно прав');
        return;
      }
      setLoadState('error');
      setErrorMsg(safeLegalAdminErrorMessage(err, 'Не удалось загрузить редакции'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setEditTitle(selected.title);
    setEditBody(selected.body_markdown || '');
    setEditNotes(selected.internal_notes || '');
  }, [selected]);

  const runAction = async (fn: () => Promise<LegalRevisionAdmin>, okMsg: string) => {
    setBusy(true);
    try {
      const updated = await fn();
      setItems(prev => {
        const next = prev.filter(i => i.id !== updated.id);
        return [updated, ...next].sort((a, b) => b.id - a.id);
      });
      setSelectedId(updated.id);
      toast.success(okMsg);
      await load();
    } catch (err) {
      toast.error(safeLegalAdminErrorMessage(err, 'Операция не выполнена'));
    } finally {
      setBusy(false);
    }
  };

  const onCreate = async () => {
    if (!draftTitle.trim() || !draftVersion.trim()) {
      toast.error('Укажите версию и заголовок');
      return;
    }
    setBusy(true);
    try {
      const row = await createAdminLegalDraft({
        doc_type: draftDocType,
        version: draftVersion.trim(),
        title: draftTitle.trim(),
        body_markdown: '',
      });
      toast.success('Черновик создан');
      setCreating(false);
      setDraftTitle('');
      setSelectedId(row.id);
      await load();
    } catch (err) {
      toast.error(safeLegalAdminErrorMessage(err, 'Не удалось создать черновик'));
    } finally {
      setBusy(false);
    }
  };

  const onSaveDraft = async () => {
    if (!selected || !canEditLegalDraft(selected.status)) return;
    await runAction(
      () =>
        updateAdminLegalDraft(selected.id, {
          title: editTitle.trim(),
          body_markdown: editBody,
          internal_notes: editNotes.trim() || null,
          clear_internal_notes: !editNotes.trim(),
        }),
      'Черновик сохранён'
    );
  };

  if (loadState === 'forbidden') {
    return (
      <div data-testid="legal-revisions-forbidden" style={{ color: LEGAL_COLORS.textSecondary }}>
        Доступ только для администраторов платформы.
      </div>
    );
  }

  if (selected) {
    return (
      <div data-testid="legal-revision-detail">
        <button
          type="button"
          style={{
            ...btnBase,
            marginBottom: 16,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
          onClick={() => setSelectedId(null)}
        >
          <ArrowLeft size={16} /> К списку
        </button>
        <div
          style={{
            background: LEGAL_COLORS.panelBgElevated,
            border: `1px solid ${LEGAL_COLORS.accentBorder}`,
            borderRadius: 12,
            padding: 20,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: LEGAL_COLORS.textSecondary }}>Тип</div>
              <div>{legalDocTypeLabel(selected.doc_type)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: LEGAL_COLORS.textSecondary }}>Версия</div>
              <div>{selected.version}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: LEGAL_COLORS.textSecondary }}>Статус</div>
              <div data-testid="legal-revision-status">{legalStatusLabel(selected.status)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: LEGAL_COLORS.textSecondary }}>Slug</div>
              <div>{selected.slug}</div>
            </div>
          </div>

          {canEditLegalDraft(selected.status) ? (
            <>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>Заголовок</div>
                <input
                  style={fieldStyle}
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  data-testid="legal-edit-title"
                />
              </label>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>Текст (markdown)</div>
                <textarea
                  style={{ ...fieldStyle, minHeight: 220, fontFamily: 'inherit' }}
                  value={editBody}
                  onChange={e => setEditBody(e.target.value)}
                  data-testid="legal-edit-body"
                />
              </label>
              <label style={{ display: 'block', marginBottom: 16 }}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>Внутренние заметки</div>
                <textarea
                  style={{ ...fieldStyle, minHeight: 80 }}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  data-testid="legal-edit-notes"
                />
              </label>
              <button
                type="button"
                style={{ ...btnPrimary, marginRight: 8 }}
                disabled={busy}
                onClick={() => void onSaveDraft()}
              >
                Сохранить
              </button>
            </>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>{selected.title}</h3>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  background: LEGAL_COLORS.fieldBg,
                  padding: 12,
                  borderRadius: 8,
                  maxHeight: 360,
                  overflow: 'auto',
                }}
              >
                {selected.body_markdown || '—'}
              </pre>
              {selected.internal_notes ? (
                <p style={{ color: LEGAL_COLORS.textSecondary, fontSize: 13 }}>
                  Внутренние заметки: {selected.internal_notes}
                </p>
              ) : null}
            </>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {canSubmitLegalReview(selected.status) ? (
              <button
                type="button"
                style={btnPrimary}
                disabled={busy}
                data-testid="legal-action-submit"
                onClick={() =>
                  void runAction(() => submitAdminLegalReview(selected.id), 'Передано на проверку')
                }
              >
                На проверку
              </button>
            ) : null}
            {canLawyerApprove(selected.status) ? (
              <button
                type="button"
                style={btnPrimary}
                disabled={busy}
                data-testid="legal-action-lawyer"
                onClick={() =>
                  void runAction(
                    () => approveAdminLegalLawyer(selected.id),
                    'Отмечено одобрение юриста'
                  )
                }
              >
                Одобрение юриста
              </button>
            ) : null}
            {canPublishLegal(selected.status) ? (
              <button
                type="button"
                style={btnPrimary}
                disabled={busy}
                data-testid="legal-action-publish"
                onClick={() =>
                  void runAction(() => publishAdminLegalRevision(selected.id), 'Опубликовано')
                }
              >
                Опубликовать
              </button>
            ) : null}
            {canArchiveLegal(selected.status) ? (
              <button
                type="button"
                style={btnBase}
                disabled={busy}
                data-testid="legal-action-archive"
                onClick={() =>
                  void runAction(() => archiveAdminLegalRevision(selected.id), 'В архиве')
                }
              >
                Архивировать
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="legal-revisions-panel">
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          type="button"
          style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 8 }}
          onClick={() => setCreating(v => !v)}
          data-testid="legal-create-toggle"
        >
          <Plus size={16} /> Новый черновик
        </button>
        <button
          type="button"
          style={{ ...btnBase, display: 'inline-flex', alignItems: 'center', gap: 8 }}
          onClick={() => void load()}
          data-testid="legal-revisions-refresh"
        >
          <RefreshCw size={16} /> Обновить
        </button>
      </div>

      {creating ? (
        <div
          data-testid="legal-create-form"
          style={{
            background: LEGAL_COLORS.panelBgElevated,
            border: `1px solid ${LEGAL_COLORS.accentBorder}`,
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <label style={{ display: 'block', marginBottom: 12 }}>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Тип документа</div>
            <select
              style={fieldStyle}
              value={draftDocType}
              onChange={e => setDraftDocType(e.target.value)}
              data-testid="legal-create-doc-type"
            >
              {LEGAL_DOC_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Версия</div>
            <input
              style={fieldStyle}
              value={draftVersion}
              onChange={e => setDraftVersion(e.target.value)}
              data-testid="legal-create-version"
            />
          </label>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Заголовок</div>
            <input
              style={fieldStyle}
              value={draftTitle}
              onChange={e => setDraftTitle(e.target.value)}
              data-testid="legal-create-title"
            />
          </label>
          <button
            type="button"
            style={btnPrimary}
            disabled={busy}
            onClick={() => void onCreate()}
            data-testid="legal-create-submit"
          >
            Создать
          </button>
        </div>
      ) : null}

      {loadState === 'loading' ? (
        <p style={{ color: LEGAL_COLORS.textSecondary }}>Загрузка…</p>
      ) : null}
      {loadState === 'error' ? (
        <p data-testid="legal-revisions-error" style={{ color: LEGAL_COLORS.danger }}>
          {errorMsg}
        </p>
      ) : null}
      {loadState === 'empty' ? (
        <p data-testid="legal-revisions-empty" style={{ color: LEGAL_COLORS.textSecondary }}>
          Редакций пока нет. Создайте черновик.
        </p>
      ) : null}

      {loadState === 'ready' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => (
            <button
              key={item.id}
              type="button"
              data-testid={`legal-revision-row-${item.id}`}
              onClick={() => setSelectedId(item.id)}
              style={{
                textAlign: 'left',
                padding: 14,
                borderRadius: 10,
                border: `1px solid ${LEGAL_COLORS.accentBorder}`,
                background: LEGAL_COLORS.panelBgElevated,
                color: LEGAL_COLORS.text,
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600 }}>{item.title}</div>
              <div style={{ fontSize: 13, color: LEGAL_COLORS.textSecondary, marginTop: 4 }}>
                {legalDocTypeLabel(item.doc_type)} · v{item.version} ·{' '}
                {legalStatusLabel(item.status)}
                {item.published_at ? ` · ${formatLegalDate(item.published_at)}` : ''}
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
