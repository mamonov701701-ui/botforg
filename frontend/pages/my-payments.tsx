import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useEffect, useState } from 'react';
import { getMyPayments } from '@/api/payments';
import Link from 'next/link';

function exportToCSV(data: any[], filename: string) {
  if (!data.length) return;
  const csv = [
    Object.keys(data[0]).join(','),
    ...data.map((row) => Object.values(row).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'В ожидании',
  success: 'Оплачен',
  failed: 'Ошибка',
};
const METHOD_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  yookassa: 'ЮKassa',
  stripe: 'Stripe',
  cloudpayments: 'СБП',
};

export default function MyPaymentsPage() {
  const { user, loading } = useRequireAuth();
  const [payments, setPayments] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadPayments = async () => {
    setLoadingPayments(true);
    setError("");
    try {
      const params: any = {};
      if (status) params.status = status;
      if (method) params.method = method;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const data = await getMyPayments(params);
      setPayments(data);
    } catch {
      setError("Ошибка загрузки оплат");
    } finally {
      setLoadingPayments(false);
    }
  };

  useEffect(() => {
    loadPayments();
    // eslint-disable-next-line
  }, [status, method, dateFrom, dateTo]);

  const totalSum = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  if (loading || loadingPayments) return <div>Загрузка...</div>;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Мои оплаты</h1>
      <div className="flex gap-4 mb-4 items-end">
        <div>
          <label className="block text-xs mb-1">Статус</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="border rounded px-2 py-1 text-xs"
          >
            <option value="">Все</option>
            <option value="pending">В ожидании</option>
            <option value="success">Оплачен</option>
            <option value="failed">Ошибка</option>
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1">Метод</label>
          <select
            value={method}
            onChange={e => setMethod(e.target.value)}
            className="border rounded px-2 py-1 text-xs"
          >
            <option value="">Все</option>
            <option value="telegram">Telegram</option>
            <option value="yookassa">ЮKassa</option>
            <option value="stripe">Stripe</option>
            <option value="cloudpayments">СБП</option>
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1">С даты</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="border rounded px-2 py-1 text-xs"
          />
        </div>
        <div>
          <label className="block text-xs mb-1">По дату</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="border rounded px-2 py-1 text-xs"
          />
        </div>
        <button
          className="bg-blue-600 text-white rounded px-4 py-1 text-xs"
          onClick={() => exportToCSV(payments, 'my_payments.csv')}
        >
          Экспорт в CSV
        </button>
      </div>
      <div className="mb-4 text-sm text-gray-600">Всего: {payments.length} | Сумма: {totalSum} ₽</div>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {payments.length === 0 ? (
        <div>У вас пока нет оплат</div>
      ) : (
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border">Шаблон</th>
              <th className="p-2 border">Сумма</th>
              <th className="p-2 border">Метод</th>
              <th className="p-2 border">Статус</th>
              <th className="p-2 border">Дата</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p: any) => (
              <tr key={p.id}>
                <td className="p-2 border">
                  <Link href={`/template/${p.template_id}`} className="text-blue-600 underline">
                    {p.template?.name || `Шаблон #${p.template_id}`}
                  </Link>
                </td>
                <td className="p-2 border">{p.amount} {p.currency}</td>
                <td className="p-2 border">{METHOD_LABELS[p.provider] || p.provider}</td>
                <td className="p-2 border">{STATUS_LABELS[p.status] || p.status}</td>
                <td className="p-2 border">{new Date(p.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
} 