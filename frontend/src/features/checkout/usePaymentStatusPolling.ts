/**
 * Polling статуса оплаты CheckoutIntent (Этап 6.11.4).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCheckoutPaymentStatus,
  safePaymentErrorMessage,
  type PaymentStatus,
} from '@/api/checkoutPay';

export const DEFAULT_PAYMENT_POLL_INTERVAL_MS = 3000;

export interface UsePaymentStatusPollingOptions {
  intentId: number | null | undefined;
  enabled?: boolean;
  intervalMs?: number;
}

export interface UsePaymentStatusPollingResult {
  status: PaymentStatus | null;
  loading: boolean;
  error: string | null;
  isPolling: boolean;
  refresh: () => Promise<void>;
}

export function usePaymentStatusPolling(
  options: UsePaymentStatusPollingOptions
): UsePaymentStatusPollingResult {
  const { intentId, enabled = true, intervalMs = DEFAULT_PAYMENT_POLL_INTERVAL_MS } = options;

  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const statusRef = useRef<PaymentStatus | null>(null);
  const intentIdRef = useRef(intentId);
  intentIdRef.current = intentId;

  const fetchOnce = useCallback(async () => {
    const id = intentIdRef.current;
    if (id == null || !Number.isFinite(id) || id <= 0) return;
    if (inFlightRef.current) return;
    if (statusRef.current?.is_final) return;

    inFlightRef.current = true;
    if (mountedRef.current) setLoading(true);
    try {
      const next = await getCheckoutPaymentStatus(id);
      if (!mountedRef.current) return;
      statusRef.current = next;
      setStatus(next);
      setError(null);
      if (next.is_final) {
        setIsPolling(false);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(safePaymentErrorMessage(err));
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    // Manual retry may re-check even after transient error; clear final gate only if not final.
    if (statusRef.current?.is_final) {
      // Still allow refresh of final status once (no parallel).
      if (inFlightRef.current) return;
      const id = intentIdRef.current;
      if (id == null || id <= 0) return;
      inFlightRef.current = true;
      if (mountedRef.current) setLoading(true);
      try {
        const next = await getCheckoutPaymentStatus(id);
        if (!mountedRef.current) return;
        statusRef.current = next;
        setStatus(next);
        setError(null);
      } catch (err) {
        if (!mountedRef.current) return;
        setError(safePaymentErrorMessage(err));
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) setLoading(false);
      }
      return;
    }
    await fetchOnce();
  }, [fetchOnce]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    statusRef.current = null;
    setStatus(null);
    setError(null);
    setIsPolling(false);

    if (!enabled || intentId == null || intentId <= 0) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = async () => {
      setIsPolling(true);
      await fetchOnce();
      if (cancelled || !mountedRef.current) return;
      if (statusRef.current?.is_final) {
        setIsPolling(false);
        return;
      }
      timer = setInterval(
        () => {
          if (cancelled || !mountedRef.current) return;
          if (statusRef.current?.is_final) {
            if (timer) clearInterval(timer);
            timer = null;
            setIsPolling(false);
            return;
          }
          void fetchOnce();
        },
        Math.max(200, intervalMs)
      );
    };

    void start();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      setIsPolling(false);
    };
  }, [enabled, intentId, intervalMs, fetchOnce]);

  return {
    status,
    loading,
    error,
    isPolling: isPolling && !status?.is_final,
    refresh,
  };
}
