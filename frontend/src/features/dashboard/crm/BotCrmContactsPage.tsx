import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Calendar,
  ChevronsUpDown,
  ChevronDown,
} from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { toast } from '../../../utils/toast';
import {
  crmListUsers,
  crmListTags,
  crmListVariableDefs,
  crmStatusesSummary,
  crmUserVariables,
  type CrmUserListItem,
  type CrmTagDef,
  type CrmUserVariable,
  type CrmUserListSort,
} from '../../../api/botCrm';
import { useCrmDataScope } from './CrmDataScopeContext';
import { buildContactFieldsTableCell, type ContactFieldLine } from './contactVariableSummary';

type TriState = '' | 'yes' | 'no';
type HeaderMenu = 'tags' | 'status' | 'phone' | 'email';

type MenuPos = { top: number; left: number; minWidth: number };

type FieldPopoverState = {
  userId: number;
  top: number;
  left: number;
  width: number;
  lines: ContactFieldLine[];
};

function pluralZapisiRu(n: number): string {
  const a = n % 100;
  const l = n % 10;
  if (l === 1 && a !== 11) return `${n} запись`;
  if (l >= 2 && l <= 4 && (a < 12 || a > 14)) return `${n} записи`;
  return `${n} записей`;
}

function pluralPoljaRu(n: number): string {
  const a = n % 100;
  const l = n % 10;
  if (l === 1 && a !== 11) return `${n} поле`;
  if (l >= 2 && l <= 4 && (a < 12 || a > 14)) return `${n} поля`;
  return `${n} полей`;
}

export default function BotCrmContactsPage() {
  const { botId } = useParams<{ botId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const id = Number(botId);
  const { showMode, setShowMode } = useCrmDataScope();

  const [items, setItems] = useState<CrmUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  /** Строка поиска, реально ушедшая в API (только по «Найти» или Enter). */
  const [appliedSearch, setAppliedSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  /** Скрытый фильтр по session_status: только из query `dialog`. В UI не показывается. */
  const [sessionFilter, setSessionFilter] = useState('');
  const [activeSinceFilter, setActiveSinceFilter] = useState('');
  const [activeUntilFilter, setActiveUntilFilter] = useState('');
  const [contactStatusFilter, setContactStatusFilter] = useState('');
  const [hasPhoneFilter, setHasPhoneFilter] = useState<TriState>('');
  const [hasEmailFilter, setHasEmailFilter] = useState<TriState>('');
  const [sortBy, setSortBy] = useState<CrmUserListSort>('activity');
  const [tagOptions, setTagOptions] = useState<CrmTagDef[]>([]);
  const [contactStatusOptions, setContactStatusOptions] = useState<string[]>([]);
  const [fieldCellsByUserId, setFieldCellsByUserId] = useState<
    Record<number, { count: number; lines: ContactFieldLine[] }>
  >({});
  const [fieldCellsLoading, setFieldCellsLoading] = useState(false);
  const fieldCellsReq = useRef(0);
  const [fieldPopover, setFieldPopover] = useState<FieldPopoverState | null>(null);
  const prevDialogUrl = useRef<string | null>(null);

  const [openMenu, setOpenMenu] = useState<HeaderMenu | null>(null);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);

  useEffect(() => {
    const showUrl = searchParams.get('show');
    const envLegacy = searchParams.get('environment');
    const raw = showUrl || envLegacy;
    if (raw === 'dev' || raw === 'prod' || raw === 'all') {
      setShowMode(raw);
    }
  }, [searchParams, setShowMode]);

  useEffect(() => {
    const t = searchParams.get('tag');
    if (t) {
      setTagFilter(t);
      setPage(1);
    }
    const rawDialog = searchParams.get('dialog');
    const nextDialog = rawDialog?.trim() ? rawDialog : '';
    if (prevDialogUrl.current !== nextDialog) {
      prevDialogUrl.current = nextDialog;
      setPage(1);
    }
    setSessionFilter(nextDialog);
    const cs = searchParams.get('cstatus');
    if (cs !== null && cs !== '') {
      setContactStatusFilter(cs);
      setPage(1);
    }
    const srt = searchParams.get('srt');
    if (srt === 'activity' || srt === 'name' || srt === 'created') {
      setSortBy(srt);
    }
    const as = searchParams.get('asince');
    const au = searchParams.get('auntil');
    setActiveSinceFilter(as?.trim() || '');
    setActiveUntilFilter(au?.trim() || '');
  }, [searchParams]);

  useEffect(() => {
    if (!openMenu) return;
    const onScroll = () => {
      setOpenMenu(null);
      setMenuPos(null);
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu) return;
    const close = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('[data-crm-th-menu]') || el.closest('[data-crm-th-trigger]')) return;
      setOpenMenu(null);
      setMenuPos(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openMenu]);

  useEffect(() => {
    if (!fieldPopover) return;
    const close = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('[data-crm-fields-popover]') || el.closest('[data-crm-fields-cell]')) return;
      setFieldPopover(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [fieldPopover]);

  useEffect(() => {
    if (!fieldPopover) return;
    const onScroll = () => setFieldPopover(null);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [fieldPopover]);

  useEffect(() => {
    setFieldPopover(prev => (prev && !items.some(r => r.id === prev.userId) ? null : prev));
  }, [items]);

  const baseListParams = useMemo(
    () => ({
      q: appliedSearch || undefined,
      tag_keys: tagFilter.trim() || undefined,
      active_since: activeSinceFilter.trim() || undefined,
      active_until: activeUntilFilter.trim() || undefined,
      contact_status: contactStatusFilter.trim() || undefined,
      session_status: sessionFilter.trim() || undefined,
      has_phone: hasPhoneFilter === 'yes' ? true : hasPhoneFilter === 'no' ? false : undefined,
      has_email: hasEmailFilter === 'yes' ? true : hasEmailFilter === 'no' ? false : undefined,
      sort: sortBy,
      environment: showMode,
    }),
    [
      appliedSearch,
      tagFilter,
      activeSinceFilter,
      activeUntilFilter,
      contactStatusFilter,
      sessionFilter,
      hasPhoneFilter,
      hasEmailFilter,
      sortBy,
      showMode,
    ]
  );

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    (async () => {
      try {
        const summary = await crmStatusesSummary(id, showMode);
        if (cancelled) return;
        setContactStatusOptions(summary.contact_statuses.map(r => r.name));
      } catch {
        if (!cancelled) {
          setContactStatusOptions([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, showMode]);

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setLoading(true);
    try {
      const res = await crmListUsers(id, {
        ...baseListParams,
        page,
        page_size: pageSize,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Не удалось загрузить контакты';
      toast.error(msg);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [id, page, pageSize, baseListParams]);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    crmListTags(id, showMode)
      .then(setTagOptions)
      .catch(() => setTagOptions([]));
  }, [id, showMode]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!Number.isFinite(id) || items.length === 0) {
      setFieldCellsByUserId({});
      setFieldCellsLoading(false);
      return;
    }
    const req = ++fieldCellsReq.current;
    setFieldCellsLoading(true);
    setFieldCellsByUserId({});

    (async () => {
      try {
        const defs = await crmListVariableDefs(id, false, showMode);
        if (req !== fieldCellsReq.current) return;
        const next: Record<number, { count: number; lines: ContactFieldLine[] }> = {};
        const chunkSize = 8;
        for (let i = 0; i < items.length; i += chunkSize) {
          const chunk = items.slice(i, i + chunkSize);
          const varsList = await Promise.all(
            chunk.map(row =>
              crmUserVariables(id, row.id, showMode).catch(() => [] as CrmUserVariable[])
            )
          );
          if (req !== fieldCellsReq.current) return;
          chunk.forEach((row, j) => {
            next[row.id] = buildContactFieldsTableCell(varsList[j], defs);
          });
        }
        if (req !== fieldCellsReq.current) return;
        setFieldCellsByUserId(next);
      } catch {
        if (req === fieldCellsReq.current) setFieldCellsByUserId({});
      } finally {
        if (req === fieldCellsReq.current) setFieldCellsLoading(false);
      }
    })();
  }, [id, items, showMode]);

  useEffect(() => {
    setPage(1);
  }, [
    appliedSearch,
    tagFilter,
    showMode,
    sessionFilter,
    contactStatusFilter,
    hasPhoneFilter,
    hasEmailFilter,
    sortBy,
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (appliedSearch.trim()) n += 1;
    if (tagFilter.trim()) n += 1;
    if (contactStatusFilter.trim()) n += 1;
    if (activeSinceFilter.trim() || activeUntilFilter.trim()) n += 1;
    if (hasPhoneFilter) n += 1;
    if (hasEmailFilter) n += 1;
    return n;
  }, [
    appliedSearch,
    tagFilter,
    activeSinceFilter,
    activeUntilFilter,
    contactStatusFilter,
    hasPhoneFilter,
    hasEmailFilter,
  ]);

  const syncTagToUrl = (next: string) => {
    setTagFilter(next);
    const nextParams = new URLSearchParams(searchParams);
    if (next) nextParams.set('tag', next);
    else nextParams.delete('tag');
    setSearchParams(nextParams, { replace: true });
  };

  const syncContactStatusToUrl = (next: string) => {
    setContactStatusFilter(next);
    const nextParams = new URLSearchParams(searchParams);
    if (next) nextParams.set('cstatus', next);
    else nextParams.delete('cstatus');
    setSearchParams(nextParams, { replace: true });
  };

  const openHeaderMenu = (kind: HeaderMenu, el: HTMLButtonElement) => {
    const r = el.getBoundingClientRect();
    setMenuPos({
      top: r.bottom + 6,
      left: r.left,
      minWidth: Math.max(200, r.width),
    });
    setOpenMenu(kind);
  };

  const pickTri = (field: 'phone' | 'email', v: TriState) => {
    if (field === 'phone') setHasPhoneFilter(v);
    else setHasEmailFilter(v);
    setOpenMenu(null);
    setMenuPos(null);
  };

  const applySearch = useCallback(() => {
    setAppliedSearch(q.trim());
    setPage(1);
  }, [q]);

  const resetAll = () => {
    setQ('');
    setAppliedSearch('');
    setTagFilter('');
    setContactStatusFilter('');
    setHasPhoneFilter('');
    setHasEmailFilter('');
    setSortBy('activity');
    setSessionFilter('');
    prevDialogUrl.current = '';
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('tag');
    nextParams.delete('srt');
    nextParams.delete('asince');
    nextParams.delete('auntil');
    nextParams.delete('cstatus');
    nextParams.delete('dialog');
    setSearchParams(nextParams, { replace: true });
    setPage(1);
    setOpenMenu(null);
    setMenuPos(null);
    setFieldPopover(null);
  };

  const onNameSortClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setSortBy(prev => (prev === 'name' ? 'activity' : 'name'));
    setOpenMenu(null);
    setMenuPos(null);
  };

  const onActivitySortClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setSortBy(prev => {
      if (prev === 'activity') return 'created';
      if (prev === 'created') return 'activity';
      return 'activity';
    });
    setOpenMenu(null);
    setMenuPos(null);
  };

  const dash = (v: string | null | undefined) =>
    v && String(v).trim() ? v : <span className="crm-ellipsis">—</span>;

  const openOrToggleFieldsPopover = (
    rowId: number,
    cell: { count: number; lines: ContactFieldLine[] },
    anchor: HTMLButtonElement
  ) => {
    if (cell.count === 0) return;
    if (fieldPopover?.userId === rowId) {
      setFieldPopover(null);
      return;
    }
    const r = anchor.getBoundingClientRect();
    const width = Math.min(360, Math.max(260, window.innerWidth - 24));
    let left = r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    setFieldPopover({
      userId: rowId,
      top: r.bottom + 6,
      left,
      width,
      lines: cell.lines,
    });
  };

  const fieldsPopoverPortal =
    fieldPopover &&
    createPortal(
      <div
        className="crm-fields-popover"
        data-crm-fields-popover
        role="dialog"
        aria-label="Поля контакта"
        style={{
          position: 'fixed',
          top: fieldPopover.top,
          left: fieldPopover.left,
          width: fieldPopover.width,
          zIndex: 410,
        }}
      >
        <div className="crm-fields-popover__list">
          {fieldPopover.lines.map((line, i) => (
            <div key={i} className="crm-fields-popover__row">
              <div className="crm-fields-popover__line">
                <span className="crm-fields-popover__key">{line.keyLabel}</span>
                <span className="crm-fields-popover__colon">: </span>
                <span className="crm-fields-popover__val">{line.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>,
      document.body
    );

  const filterMenuPortal =
    openMenu &&
    menuPos &&
    createPortal(
      <div
        className="crm-th-menu"
        data-crm-th-menu
        role="listbox"
        style={{
          position: 'fixed',
          top: menuPos.top,
          left: menuPos.left,
          minWidth: menuPos.minWidth,
          zIndex: 400,
        }}
      >
        {openMenu === 'tags' && (
          <>
            <button
              type="button"
              className={`crm-th-menu__item ${!tagFilter ? 'crm-th-menu__item--active' : ''}`}
              onClick={() => {
                syncTagToUrl('');
                setOpenMenu(null);
                setMenuPos(null);
              }}
            >
              Все теги
            </button>
            {tagOptions.map(t => (
              <button
                key={t.id}
                type="button"
                className={`crm-th-menu__item ${tagFilter === t.key ? 'crm-th-menu__item--active' : ''}`}
                onClick={() => {
                  syncTagToUrl(t.key);
                  setOpenMenu(null);
                  setMenuPos(null);
                }}
              >
                {t.label || t.key}
              </button>
            ))}
          </>
        )}
        {openMenu === 'status' && (
          <>
            <button
              type="button"
              className={`crm-th-menu__item ${!contactStatusFilter ? 'crm-th-menu__item--active' : ''}`}
              onClick={() => {
                syncContactStatusToUrl('');
                setOpenMenu(null);
                setMenuPos(null);
              }}
            >
              Все статусы
            </button>
            {contactStatusOptions.map(s => (
              <button
                key={s}
                type="button"
                className={`crm-th-menu__item ${contactStatusFilter === s ? 'crm-th-menu__item--active' : ''}`}
                onClick={() => {
                  syncContactStatusToUrl(s);
                  setOpenMenu(null);
                  setMenuPos(null);
                }}
              >
                {s}
              </button>
            ))}
          </>
        )}
        {openMenu === 'phone' && (
          <>
            <button
              type="button"
              className={`crm-th-menu__item ${hasPhoneFilter === '' ? 'crm-th-menu__item--active' : ''}`}
              onClick={() => pickTri('phone', '')}
            >
              Все
            </button>
            <button
              type="button"
              className={`crm-th-menu__item ${hasPhoneFilter === 'yes' ? 'crm-th-menu__item--active' : ''}`}
              onClick={() => pickTri('phone', 'yes')}
            >
              С телефоном
            </button>
            <button
              type="button"
              className={`crm-th-menu__item ${hasPhoneFilter === 'no' ? 'crm-th-menu__item--active' : ''}`}
              onClick={() => pickTri('phone', 'no')}
            >
              Без телефона
            </button>
          </>
        )}
        {openMenu === 'email' && (
          <>
            <button
              type="button"
              className={`crm-th-menu__item ${hasEmailFilter === '' ? 'crm-th-menu__item--active' : ''}`}
              onClick={() => pickTri('email', '')}
            >
              Все
            </button>
            <button
              type="button"
              className={`crm-th-menu__item ${hasEmailFilter === 'yes' ? 'crm-th-menu__item--active' : ''}`}
              onClick={() => pickTri('email', 'yes')}
            >
              С email
            </button>
            <button
              type="button"
              className={`crm-th-menu__item ${hasEmailFilter === 'no' ? 'crm-th-menu__item--active' : ''}`}
              onClick={() => pickTri('email', 'no')}
            >
              Без email
            </button>
          </>
        )}
      </div>,
      document.body
    );

  return (
    <DashboardPage title="" subtitle="">
      <Card className="crm-panel" padding="22px 24px">
        <div className="crm-contacts-toolbar">
          <div className="crm-field crm-field--grow" style={{ marginBottom: 0 }}>
            <span className="crm-label">Поиск</span>
            <div className="crm-search-wrap">
              <Search className="crm-search-icon" size={17} strokeWidth={2} />
              <input
                className="crm-input"
                placeholder="Имя, телефон, почта…"
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applySearch();
                  }
                }}
              />
            </div>
          </div>
          <div className="crm-contacts-toolbar__actions">
            <button type="button" className="crm-btn crm-btn--primary" onClick={applySearch}>
              Найти
            </button>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={resetAll}>
              Сбросить
            </button>
          </div>
          {activeFilterCount > 0 ? (
            <span className="crm-contacts-toolbar__meta">Фильтры: {activeFilterCount}</span>
          ) : null}
        </div>

        <p className="crm-hint crm-hint--contacts-lead">
          Справочник полей — в разделе «Поля»; значения у контакта — в карточке.
        </p>

        <div className="crm-table-wrap crm-contacts-table-wrap">
          <table className="crm-table crm-contacts-table">
            <thead>
              <tr>
                <th className="crm-th-sortable">
                  <button
                    type="button"
                    className="crm-th-sortable__btn"
                    onClick={onNameSortClick}
                    title={
                      sortBy === 'name'
                        ? 'Сортировка по имени (А→Я). Нажмите — сбросить на активность'
                        : 'Сортировать по имени'
                    }
                  >
                    <span>Имя</span>
                    {sortBy === 'name' ? (
                      <ArrowUp
                        size={14}
                        className="crm-th-sortable__icon crm-th-sortable__icon--on"
                      />
                    ) : (
                      <ChevronsUpDown
                        size={14}
                        className="crm-th-sortable__icon crm-th-sortable__icon--muted"
                      />
                    )}
                  </button>
                </th>
                <th className="crm-th-filter">
                  <button
                    type="button"
                    data-crm-th-trigger
                    className={`crm-th-filter__btn ${hasPhoneFilter ? 'crm-th-filter__btn--active' : ''}`}
                    onClick={e => {
                      e.stopPropagation();
                      if (openMenu === 'phone') {
                        setOpenMenu(null);
                        setMenuPos(null);
                      } else openHeaderMenu('phone', e.currentTarget);
                    }}
                  >
                    Телефон
                    <ChevronDown size={14} className="crm-th-filter__chev" />
                  </button>
                </th>
                <th className="crm-th-filter">
                  <button
                    type="button"
                    data-crm-th-trigger
                    className={`crm-th-filter__btn ${hasEmailFilter ? 'crm-th-filter__btn--active' : ''}`}
                    onClick={e => {
                      e.stopPropagation();
                      if (openMenu === 'email') {
                        setOpenMenu(null);
                        setMenuPos(null);
                      } else openHeaderMenu('email', e.currentTarget);
                    }}
                  >
                    Email
                    <ChevronDown size={14} className="crm-th-filter__chev" />
                  </button>
                </th>
                <th className="crm-th-filter">
                  <button
                    type="button"
                    data-crm-th-trigger
                    className={`crm-th-filter__btn ${tagFilter ? 'crm-th-filter__btn--active' : ''}`}
                    onClick={e => {
                      e.stopPropagation();
                      if (openMenu === 'tags') {
                        setOpenMenu(null);
                        setMenuPos(null);
                      } else openHeaderMenu('tags', e.currentTarget);
                    }}
                  >
                    Теги
                    <ChevronDown size={14} className="crm-th-filter__chev" />
                  </button>
                </th>
                <th className="crm-th-filter">
                  <button
                    type="button"
                    data-crm-th-trigger
                    className={`crm-th-filter__btn ${contactStatusFilter ? 'crm-th-filter__btn--active' : ''}`}
                    onClick={e => {
                      e.stopPropagation();
                      if (openMenu === 'status') {
                        setOpenMenu(null);
                        setMenuPos(null);
                      } else openHeaderMenu('status', e.currentTarget);
                    }}
                  >
                    Статус контакта
                    <ChevronDown size={14} className="crm-th-filter__chev" />
                  </button>
                </th>
                <th>Поля</th>
                <th className="crm-th-sortable">
                  <button
                    type="button"
                    className="crm-th-sortable__btn"
                    onClick={onActivitySortClick}
                    title={
                      sortBy === 'created'
                        ? 'Сортировка по дате создания (новые сверху). Нажмите — по активности'
                        : sortBy === 'activity'
                          ? 'Сортировка по последней активности. Нажмите — по дате создания'
                          : 'Сортировать по активности'
                    }
                  >
                    <span>Активность</span>
                    {sortBy === 'activity' ? (
                      <ArrowDown
                        size={14}
                        className="crm-th-sortable__icon crm-th-sortable__icon--on"
                      />
                    ) : sortBy === 'created' ? (
                      <Calendar
                        size={14}
                        className="crm-th-sortable__icon crm-th-sortable__icon--on"
                      />
                    ) : (
                      <ChevronsUpDown
                        size={14}
                        className="crm-th-sortable__icon crm-th-sortable__icon--muted"
                      />
                    )}
                  </button>
                </th>
                <th className="crm-table__col-go" aria-label="Открыть" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '28px 16px' }}>
                    <p className="crm-muted" style={{ margin: 0 }}>
                      Загрузка…
                    </p>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '28px 16px' }}>
                    <div
                      className="crm-empty"
                      style={{ padding: 24, border: 'none', background: 'transparent' }}
                    >
                      <p className="crm-empty__title">Нет контактов</p>
                      <p className="crm-empty__text">
                        {showMode === 'prod'
                          ? 'Подходящих контактов нет. Данные предпросмотра смотрите при «Показывать: тестовые» или «все».'
                          : 'Подходящих контактов нет — измените фильтры или загрузите список позже.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map(row => (
                  <tr
                    key={row.id}
                    className="crm-row-click"
                    onClick={() =>
                      navigate(`/dashboard/bots/${id}/crm/contacts/${row.id}?show=${showMode}`)
                    }
                  >
                    <td style={{ fontWeight: 600 }}>{row.display_name}</td>
                    <td className="crm-cell-clip" title={row.phone?.trim() || undefined}>
                      {dash(row.phone)}
                    </td>
                    <td className="crm-cell-clip" title={row.email?.trim() || undefined}>
                      {dash(row.email)}
                    </td>
                    <td>
                      {row.tags?.length ? (
                        row.tags.map(t => (
                          <span
                            key={t.key}
                            className="crm-badge"
                            style={
                              t.color
                                ? {
                                    borderColor: `${t.color}40`,
                                    background: `${t.color}24`,
                                  }
                                : undefined
                            }
                          >
                            {t.label || t.key}
                          </span>
                        ))
                      ) : (
                        <span className="crm-ellipsis">—</span>
                      )}
                    </td>
                    <td>{dash(row.contact_status ?? 'active')}</td>
                    <td className="crm-cell-fields crm-cell-fields--count">
                      {fieldCellsLoading ? (
                        <span className="crm-muted">…</span>
                      ) : (
                        (() => {
                          const cell = fieldCellsByUserId[row.id];
                          const count = cell?.count ?? 0;
                          if (count === 0) {
                            return <span className="crm-ellipsis">—</span>;
                          }
                          const label = pluralPoljaRu(count);
                          return (
                            <button
                              type="button"
                              data-crm-fields-cell
                              className={`crm-fields-cell-btn crm-fields-cell-btn--full ${fieldPopover?.userId === row.id ? 'crm-fields-cell-btn--open' : ''}`}
                              onClick={e => {
                                e.stopPropagation();
                                if (cell) openOrToggleFieldsPopover(row.id, cell, e.currentTarget);
                              }}
                            >
                              {label}
                            </button>
                          );
                        })()
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {row.last_message_at
                        ? new Date(row.last_message_at).toLocaleString('ru-RU')
                        : dash(null)}
                    </td>
                    <td className="crm-table__col-go" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        className="crm-icon-btn"
                        title="Открыть карточку"
                        aria-label="Открыть карточку"
                        onClick={e => {
                          e.stopPropagation();
                          navigate(`/dashboard/bots/${id}/crm/contacts/${row.id}?show=${showMode}`);
                        }}
                      >
                        <ArrowRight size={18} strokeWidth={2} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filterMenuPortal}
        {fieldsPopoverPortal}

        <div className="crm-toolbar">
          <span className="crm-muted crm-toolbar__summary">
            {appliedSearch.trim() ? (
              <>
                <span className="crm-toolbar-found">Найдено: {total}</span>
                <span className="crm-toolbar-sep"> · </span>
                <span>
                  стр. {page} / {totalPages}
                </span>
              </>
            ) : (
              <>
                {pluralZapisiRu(total)} · стр. {page} / {totalPages}
              </>
            )}
          </span>
          <div className="crm-pager">
            <button
              type="button"
              disabled={page <= 1}
              className="crm-btn crm-btn--ghost crm-btn--sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              className="crm-btn crm-btn--ghost crm-btn--sm"
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </Card>
    </DashboardPage>
  );
}
