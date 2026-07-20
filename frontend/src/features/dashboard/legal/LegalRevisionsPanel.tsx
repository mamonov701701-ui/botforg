import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, RefreshCw } from 'lucide-react';
import {
  createAdminLegalDraft,
  deleteAdminLegalDraft,
  listAdminLegalRevisions,
  publishAdminLegalRevision,
  safeLegalAdminErrorMessage,
  updateAdminLegalDraft,
  type LegalRevisionAdmin,
} from '../../../api/legalAdmin';
import { ApiError } from '../../../api/client';
import { toast } from '../../../utils/toast';
import { docMarkdownToSafeHtml } from '../../../pages/features/renderDocMarkdown';
import {
  LEGAL_COLORS,
  LEGAL_DOC_TYPE_OPTIONS,
  canDeleteLegalDraft,
  canEditLegalDraft,
  canPublishLegal,
  formatLegalDate,
  formatLegalDateShort,
  isLegalDraftStatus,
  legalDocTypeLabel,
  legalPrimaryBtnStyle,
  legalSecondaryBtnStyle,
  legalStatusLabel,
  suggestNextVersion,
  type LegalListTabId,
} from './legalHelpers';

type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';
type ViewMode = 'list' | 'edit' | 'preview';

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

export default function LegalRevisionsPanel({ mode }: { mode: LegalListTabId }) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [items, setItems] = useState<LegalRevisionAdmin[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const [draftDocType, setDraftDocType] = useState('public_offer');
  const [draftVersion, setDraftVersion] = useState('1.0');
  const [draftTitle, setDraftTitle] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const selected = useMemo(() => items.find(i => i.id === selectedId) ?? null, [items, selectedId]);

  const activePublished = useMemo(() => items.filter(i => i.status === 'published'), [items]);
  const activeDrafts = useMemo(() => items.filter(i => isLegalDraftStatus(i.status)), [items]);
  const archived = useMemo(() => items.filter(i => i.status === 'archived'), [items]);

  const listEmpty =
    mode === 'archive' ? archived.length === 0 : activePublished.length + activeDrafts.length === 0;

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
        return;
      }
      setLoadState('error');
      setErrorMsg(safeLegalAdminErrorMessage(err, 'Не удалось загрузить документы'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedId(null);
    setViewMode('list');
    setCreating(false);
  }, [mode]);

  useEffect(() => {
    if (!selected) return;
    setEditTitle(selected.title);
    setEditBody(selected.body_markdown || '');
    setEditNotes(selected.internal_notes || '');
  }, [selected]);

  const openCreateForm = (seed?: { doc_type?: string; version?: string; title?: string }) => {
    if (seed?.doc_type) setDraftDocType(seed.doc_type);
    if (seed?.version) setDraftVersion(seed.version);
    if (seed?.title !== undefined) setDraftTitle(seed.title);
    setCreating(true);
    setSelectedId(null);
    setViewMode('list');
  };

  const openRevision = (id: number, next: ViewMode) => {
    setCreating(false);
    setSelectedId(id);
    setViewMode(next);
  };

  const runPublish = async (id: number) => {
    const row = items.find(i => i.id === id);
    if (!row || !canPublishLegal(row.status)) return;
    const ok = window.confirm(
      `Опубликовать «${row.title}» (версия ${row.version})?\n\n` +
        'Предыдущая действующая версия этого документа будет переведена в архив.'
    );
    if (!ok) return;
    setBusy(true);
    try {
      if (viewMode === 'edit' && selectedId === id) {
        await updateAdminLegalDraft(id, {
          title: editTitle.trim(),
          body_markdown: editBody,
          internal_notes: editNotes.trim() || null,
          clear_internal_notes: !editNotes.trim(),
        });
      }
      await publishAdminLegalRevision(id);
      toast.success('Документ опубликован');
      await load();
      setSelectedId(null);
      setViewMode('list');
    } catch (err) {
      toast.error(safeLegalAdminErrorMessage(err, 'Не удалось опубликовать'));
    } finally {
      setBusy(false);
    }
  };

  const onCreate = async () => {
    if (!draftTitle.trim() || !draftVersion.trim()) {
      toast.error('Укажите версию и название');
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
      await load();
      openRevision(row.id, 'edit');
    } catch (err) {
      toast.error(safeLegalAdminErrorMessage(err, 'Не удалось создать документ'));
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    if (!selected || !canEditLegalDraft(selected.status)) return;
    setBusy(true);
    try {
      await updateAdminLegalDraft(selected.id, {
        title: editTitle.trim(),
        body_markdown: editBody,
        internal_notes: editNotes.trim() || null,
        clear_internal_notes: !editNotes.trim(),
      });
      toast.success('Сохранено');
      await load();
    } catch (err) {
      toast.error(safeLegalAdminErrorMessage(err, 'Не удалось сохранить'));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!selected || !canDeleteLegalDraft(selected.status)) return;
    if (!window.confirm(`Удалить черновик «${selected.title}»?`)) return;
    setBusy(true);
    try {
      await deleteAdminLegalDraft(selected.id);
      toast.success('Черновик удалён');
      setSelectedId(null);
      setViewMode('list');
      await load();
    } catch (err) {
      toast.error(safeLegalAdminErrorMessage(err, 'Не удалось удалить'));
    } finally {
      setBusy(false);
    }
  };

  if (loadState === 'forbidden') {
    return (
      <div data-testid="legal-revisions-forbidden" style={{ color: LEGAL_COLORS.textSecondary }}>
        Доступ только для администраторов платформы.
      </div>
    );
  }

  if (selected && viewMode !== 'list') {
    const editable = canEditLegalDraft(selected.status) && viewMode === 'edit';
    const html = docMarkdownToSafeHtml(editable ? editBody : selected.body_markdown || '');
    const archiveOnly = mode === 'archive' || selected.status === 'archived';
    return (
      <div data-testid="legal-revision-detail">
        <button
          type="button"
          style={{
            ...legalSecondaryBtnStyle,
            marginBottom: 16,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
          onClick={() => {
            setSelectedId(null);
            setViewMode('list');
          }}
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: LEGAL_COLORS.textSecondary }}>Документ</div>
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
            {selected.published_at ? (
              <div>
                <div style={{ fontSize: 12, color: LEGAL_COLORS.textSecondary }}>
                  Дата публикации
                </div>
                <div>{formatLegalDate(selected.published_at)}</div>
              </div>
            ) : null}
          </div>

          {editable ? (
            <>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>Название</div>
                <input
                  style={fieldStyle}
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  data-testid="legal-edit-title"
                />
              </label>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>Текст документа</div>
                <textarea
                  style={{ ...fieldStyle, minHeight: 260 }}
                  value={editBody}
                  onChange={e => setEditBody(e.target.value)}
                  data-testid="legal-edit-body"
                />
              </label>
              <label style={{ display: 'block', marginBottom: 16 }}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>Внутренние заметки</div>
                <textarea
                  style={{ ...fieldStyle, minHeight: 72 }}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>{selected.title}</h3>
              <div
                data-testid="legal-preview-body"
                className="block-doc-md"
                style={{
                  background: LEGAL_COLORS.fieldBg,
                  borderRadius: 8,
                  padding: 16,
                  maxHeight: 420,
                  overflow: 'auto',
                }}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {!archiveOnly && canEditLegalDraft(selected.status) && viewMode === 'preview' ? (
              <button
                type="button"
                style={legalPrimaryBtnStyle}
                data-testid="legal-action-edit"
                onClick={() => setViewMode('edit')}
              >
                Редактировать
              </button>
            ) : null}
            {editable ? (
              <>
                <button
                  type="button"
                  style={legalPrimaryBtnStyle}
                  disabled={busy}
                  data-testid="legal-action-save"
                  onClick={() => void onSave()}
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  style={legalSecondaryBtnStyle}
                  data-testid="legal-action-preview"
                  onClick={() => setViewMode('preview')}
                >
                  Предпросмотр
                </button>
              </>
            ) : null}
            {!archiveOnly && canPublishLegal(selected.status) ? (
              <button
                type="button"
                style={legalPrimaryBtnStyle}
                disabled={busy}
                data-testid="legal-action-publish"
                onClick={() => void runPublish(selected.id)}
              >
                Опубликовать
              </button>
            ) : null}
            {!archiveOnly && canDeleteLegalDraft(selected.status) ? (
              <button
                type="button"
                style={legalSecondaryBtnStyle}
                disabled={busy}
                data-testid="legal-action-delete"
                onClick={() => void onDelete()}
              >
                Удалить черновик
              </button>
            ) : null}
            {!archiveOnly && selected.status === 'published' ? (
              <button
                type="button"
                style={legalPrimaryBtnStyle}
                data-testid="legal-action-new-revision"
                onClick={() =>
                  openCreateForm({
                    doc_type: selected.doc_type,
                    version: suggestNextVersion(selected.version),
                    title: selected.title,
                  })
                }
              >
                Новая редакция
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="legal-revisions-panel" data-mode={mode}>
      {mode === 'active' ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button
            type="button"
            style={{
              ...legalPrimaryBtnStyle,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
            onClick={() => openCreateForm()}
            data-testid="legal-create-toggle"
          >
            <Plus size={16} /> Новый документ
          </button>
          <button
            type="button"
            style={{
              ...legalSecondaryBtnStyle,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
            onClick={() => void load()}
          >
            <RefreshCw size={16} /> Обновить
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            style={{
              ...legalSecondaryBtnStyle,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
            onClick={() => void load()}
          >
            <RefreshCw size={16} /> Обновить
          </button>
        </div>
      )}

      {creating && mode === 'active' ? (
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
            />
          </label>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Название</div>
            <input
              style={fieldStyle}
              value={draftTitle}
              onChange={e => setDraftTitle(e.target.value)}
              data-testid="legal-create-title"
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              style={legalPrimaryBtnStyle}
              disabled={busy}
              data-testid="legal-create-submit"
              onClick={() => void onCreate()}
            >
              Создать
            </button>
            <button type="button" style={legalSecondaryBtnStyle} onClick={() => setCreating(false)}>
              Отмена
            </button>
          </div>
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

      {loadState !== 'loading' && listEmpty && !creating ? (
        <div
          data-testid="legal-revisions-empty"
          style={{
            padding: 16,
            borderRadius: 12,
            border: `1px solid ${LEGAL_COLORS.accentBorder}`,
            background: LEGAL_COLORS.panelBgElevated,
            color: LEGAL_COLORS.textSecondary,
          }}
        >
          {mode === 'archive'
            ? 'В архиве пока нет документов.'
            : 'Действующих документов и черновиков пока нет. Создайте новый документ.'}
        </div>
      ) : null}

      {mode === 'active' && loadState === 'ready' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section data-testid="legal-active-published">
            <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Опубликованные</h3>
            {activePublished.length === 0 ? (
              <p style={{ color: LEGAL_COLORS.textSecondary, margin: 0 }}>Нет опубликованных</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activePublished.map(item => (
                  <ActivePublishedRow
                    key={item.id}
                    item={item}
                    onOpen={() => openRevision(item.id, 'preview')}
                    onNew={() =>
                      openCreateForm({
                        doc_type: item.doc_type,
                        version: suggestNextVersion(item.version),
                        title: item.title,
                      })
                    }
                  />
                ))}
              </div>
            )}
          </section>
          <section data-testid="legal-active-drafts">
            <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Черновики</h3>
            {activeDrafts.length === 0 ? (
              <p style={{ color: LEGAL_COLORS.textSecondary, margin: 0 }}>Нет черновиков</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeDrafts.map(item => (
                  <ActiveDraftRow
                    key={item.id}
                    item={item}
                    busy={busy}
                    onEdit={() => openRevision(item.id, 'edit')}
                    onPreview={() => openRevision(item.id, 'preview')}
                    onPublish={() => void runPublish(item.id)}
                    onDelete={async () => {
                      if (!window.confirm(`Удалить черновик «${item.title}»?`)) return;
                      setBusy(true);
                      try {
                        await deleteAdminLegalDraft(item.id);
                        toast.success('Черновик удалён');
                        await load();
                      } catch (err) {
                        toast.error(safeLegalAdminErrorMessage(err, 'Не удалось удалить'));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {mode === 'archive' && archived.length > 0 ? (
        <div
          data-testid="legal-archive-list"
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {archived.map(item => (
            <div
              key={item.id}
              data-testid={`legal-revision-row-${item.id}`}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 12,
                borderRadius: 10,
                border: `1px solid ${LEGAL_COLORS.accentBorder}`,
                background: LEGAL_COLORS.panelBgElevated,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{item.title}</div>
                <div style={{ fontSize: 13, color: LEGAL_COLORS.textSecondary }}>
                  Версия {item.version}
                  {item.published_at ? ` · ${formatLegalDateShort(item.published_at)}` : ''}
                </div>
              </div>
              <button
                type="button"
                style={legalPrimaryBtnStyle}
                data-testid={`legal-archive-open-${item.id}`}
                onClick={() => openRevision(item.id, 'preview')}
              >
                Открыть
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ActivePublishedRow({
  item,
  onOpen,
  onNew,
}: {
  item: LegalRevisionAdmin;
  onOpen: () => void;
  onNew: () => void;
}) {
  return (
    <div
      data-testid={`legal-revision-row-${item.id}`}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        borderRadius: 10,
        border: `1px solid ${LEGAL_COLORS.accentBorder}`,
        background: LEGAL_COLORS.panelBgElevated,
      }}
    >
      <div>
        <div style={{ fontWeight: 600 }}>{item.title}</div>
        <div style={{ fontSize: 13, color: LEGAL_COLORS.textSecondary }}>
          {legalDocTypeLabel(item.doc_type)} · версия {item.version}
          {item.published_at ? ` · ${formatLegalDateShort(item.published_at)}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={legalPrimaryBtnStyle} onClick={onOpen}>
          Открыть
        </button>
        <button
          type="button"
          style={legalSecondaryBtnStyle}
          data-testid={`legal-new-revision-${item.id}`}
          onClick={onNew}
        >
          Новая редакция
        </button>
      </div>
    </div>
  );
}

function ActiveDraftRow({
  item,
  busy,
  onEdit,
  onPreview,
  onPublish,
  onDelete,
}: {
  item: LegalRevisionAdmin;
  busy: boolean;
  onEdit: () => void;
  onPreview: () => void;
  onPublish: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      data-testid={`legal-revision-row-${item.id}`}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        borderRadius: 10,
        border: `1px solid ${LEGAL_COLORS.accentBorder}`,
        background: LEGAL_COLORS.fieldBg,
      }}
    >
      <div>
        <div style={{ fontWeight: 600 }}>{item.title}</div>
        <div style={{ fontSize: 13, color: LEGAL_COLORS.textSecondary }}>
          {legalDocTypeLabel(item.doc_type)} · версия {item.version} · Черновик
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={legalPrimaryBtnStyle} onClick={onEdit}>
          Редактировать
        </button>
        <button type="button" style={legalSecondaryBtnStyle} onClick={onPreview}>
          Предпросмотр
        </button>
        {item.status === 'draft' ? (
          <button
            type="button"
            style={legalPrimaryBtnStyle}
            disabled={busy}
            data-testid={`legal-list-publish-${item.id}`}
            onClick={onPublish}
          >
            Опубликовать
          </button>
        ) : null}
        {item.status === 'draft' ? (
          <button type="button" style={legalSecondaryBtnStyle} disabled={busy} onClick={onDelete}>
            Удалить черновик
          </button>
        ) : null}
      </div>
    </div>
  );
}
