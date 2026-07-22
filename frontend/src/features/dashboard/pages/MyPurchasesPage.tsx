import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { ApiError } from '../../../api/client';
import { listCheckoutIntents, type PurchaseListItem } from '../../../api/checkout';
import {
  PURCHASES_PAGE_SIZE,
  PURCHASE_PRODUCT_TYPE_OPTIONS,
  PURCHASE_STATUS_FILTER_OPTIONS,
  formatPurchaseAmount,
  formatPurchaseDate,
  purchaseListRangeLabel,
  purchaseProductTypeFilterToApi,
  purchaseProductTypeLabel,
  purchaseStatusFilterToApi,
  purchaseStatusLabel,
  type PurchaseProductTypeFilter,
  type PurchaseStatusFilter,
} from '../purchases/purchaseDisplay';
import '../purchases/PurchasesPage.css';

const LOAD_ERROR = 'Не удалось загрузить историю покупок. Обновите страницу или попробуйте позже.';

function loadErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0 || /сервер недоступен|сети|network|fetch/i.test(err.message)) {
      return 'Нет связи с сервером. Проверьте интернет и попробуйте снова.';
    }
    return err.message || LOAD_ERROR;
  }
  if (err instanceof Error && /failed to fetch|network|abort/i.test(err.message)) {
    return 'Нет связи с сервером. Проверьте интернет и попробуйте снова.';
  }
  return LOAD_ERROR;
}

export default function MyPurchasesPage() {
  const [items, setItems] = useState<PurchaseListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PURCHASES_PAGE_SIZE);
  const [offset, setOffset] = useState(0);
  const [productTypeFilter, setProductTypeFilter] = useState<PurchaseProductTypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<PurchaseStatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listCheckoutIntents({
        limit: PURCHASES_PAGE_SIZE,
        offset,
        product_type: purchaseProductTypeFilterToApi(productTypeFilter),
        status: purchaseStatusFilterToApi(statusFilter),
      });
      setItems(data.items);
      setTotal(data.total);
      setLimit(data.limit);
    } catch (e) {
      setError(loadErrorMessage(e));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [offset, productTypeFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const canPrev = offset > 0 && !loading;
  const canNext = offset + items.length < total && !loading && items.length > 0;

  const onProductTypeChange = (value: PurchaseProductTypeFilter) => {
    setProductTypeFilter(value);
    setOffset(0);
  };

  const onStatusChange = (value: PurchaseStatusFilter) => {
    setStatusFilter(value);
    setOffset(0);
  };

  const refreshButton = (
    <button
      type="button"
      data-testid="purchases-refresh"
      onClick={() => load()}
      disabled={loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 40,
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontWeight: 600,
        fontSize: 14,
        cursor: loading ? 'not-allowed' : 'pointer',
      }}
    >
      <RefreshCw size={16} />
      Обновить
    </button>
  );

  return (
    <DashboardPage
      title="Мои покупки"
      subtitle="История оплат тарифов и дополнительных пакетов."
      breadcrumbs={[
        { label: 'Финансы и лимиты', path: '/dashboard/finance' },
        { label: 'Мои покупки' },
      ]}
      actions={refreshButton}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card>
          <div className="purchases-filters" data-testid="purchases-filters">
            <div className="purchases-filter">
              <label htmlFor="purchases-filter-type">Тип</label>
              <select
                id="purchases-filter-type"
                data-testid="purchases-filter-product-type"
                value={productTypeFilter}
                onChange={ev => onProductTypeChange(ev.target.value as PurchaseProductTypeFilter)}
                disabled={loading}
              >
                {PURCHASE_PRODUCT_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="purchases-filter">
              <label htmlFor="purchases-filter-status">Статус</label>
              <select
                id="purchases-filter-status"
                data-testid="purchases-filter-status"
                value={statusFilter}
                onChange={ev => onStatusChange(ev.target.value as PurchaseStatusFilter)}
                disabled={loading}
              >
                {PURCHASE_STATUS_FILTER_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {loading && (
          <Card>
            <p data-testid="purchases-loading" style={{ margin: 0, color: 'var(--text-muted)' }}>
              Загрузка покупок…
            </p>
          </Card>
        )}

        {!loading && error && (
          <Card>
            <div
              data-testid="purchases-error"
              style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}
            >
              <AlertTriangle size={18} style={{ color: '#ef4444', marginTop: 2 }} />
              <div>
                <p style={{ margin: '0 0 10px', color: '#ef4444' }}>{error}</p>
                <button
                  type="button"
                  data-testid="purchases-error-retry"
                  className="purchases-btn"
                  onClick={() => load()}
                >
                  Повторить
                </button>
              </div>
            </div>
          </Card>
        )}

        {!loading && !error && total === 0 && (
          <Card>
            <div data-testid="purchases-empty">
              <p style={{ margin: '0 0 12px', fontSize: 15 }}>У вас пока нет покупок.</p>
              <Link to="/pricing" data-testid="purchases-empty-pricing" className="purchases-link">
                Перейти к тарифам
              </Link>
            </div>
          </Card>
        )}

        {!loading && !error && items.length > 0 && (
          <Card>
            <div data-testid="purchases-list">
              <div className="purchases-table-wrap" data-testid="purchases-table-desktop">
                <table className="purchases-table">
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Продукт</th>
                      <th>Тип</th>
                      <th>Сумма</th>
                      <th>Статус</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item.id} data-testid={`purchases-row-${item.id}`}>
                        <td>{formatPurchaseDate(item.created_at)}</td>
                        <td className="purchases-name">{item.product_name}</td>
                        <td className="purchases-type">
                          {purchaseProductTypeLabel(item.product_type)}
                        </td>
                        <td className="purchases-amount">
                          {formatPurchaseAmount(item.amount, item.currency)}
                        </td>
                        <td
                          className="purchases-status"
                          data-testid={`purchases-status-${item.id}`}
                        >
                          {purchaseStatusLabel(item.purchase_status)}
                        </td>
                        <td>
                          <Link
                            to={`/dashboard/finance/purchases/${item.id}`}
                            data-testid={`purchases-detail-link-${item.id}`}
                            className="purchases-link"
                          >
                            Подробнее
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="purchases-cards" data-testid="purchases-cards-mobile">
                {items.map(item => (
                  <div
                    key={item.id}
                    className="purchases-card"
                    data-testid={`purchases-card-${item.id}`}
                  >
                    <div className="purchases-card-top">
                      <div>
                        <div className="purchases-name">{item.product_name}</div>
                        <div className="purchases-type">
                          {purchaseProductTypeLabel(item.product_type)}
                        </div>
                      </div>
                      <Link
                        to={`/dashboard/finance/purchases/${item.id}`}
                        data-testid={`purchases-card-detail-${item.id}`}
                        className="purchases-link"
                      >
                        Подробнее
                      </Link>
                    </div>
                    <div className="purchases-card-meta">
                      <span>{formatPurchaseDate(item.created_at)}</span>
                      <span className="purchases-amount">
                        {formatPurchaseAmount(item.amount, item.currency)}
                      </span>
                      <span data-testid={`purchases-card-status-${item.id}`}>
                        {purchaseStatusLabel(item.purchase_status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="purchases-pagination" data-testid="purchases-pagination">
              <span className="purchases-pagination-range" data-testid="purchases-pagination-range">
                {purchaseListRangeLabel(offset, limit, total, items.length)}
              </span>
              <div className="purchases-pagination-actions">
                <button
                  type="button"
                  data-testid="purchases-prev"
                  className="purchases-btn"
                  disabled={!canPrev}
                  onClick={() => setOffset(Math.max(0, offset - PURCHASES_PAGE_SIZE))}
                >
                  Назад
                </button>
                <button
                  type="button"
                  data-testid="purchases-next"
                  className="purchases-btn"
                  disabled={!canNext}
                  onClick={() => setOffset(offset + PURCHASES_PAGE_SIZE)}
                >
                  Вперёд
                </button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </DashboardPage>
  );
}
