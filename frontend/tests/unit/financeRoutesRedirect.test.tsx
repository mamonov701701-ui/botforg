import { describe, it, expect } from 'vitest';
import { MemoryRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function LegacyTariffRefundRedirect() {
  const { refundId } = useParams();
  return <Navigate to={`/dashboard/finance/refunds/${refundId}`} replace />;
}

/** Mirrors legacy redirects from main.jsx (finance merge). */
describe('finance legacy route redirects', () => {
  function renderAt(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/dashboard/finance" element={<LocationProbe />} />
          <Route path="/dashboard/finance/refunds" element={<LocationProbe />} />
          <Route path="/dashboard/finance/refunds/:refundId" element={<LocationProbe />} />
          <Route path="/dashboard/balance" element={<Navigate to="/dashboard/finance" replace />} />
          <Route path="/dashboard/tariff" element={<Navigate to="/dashboard/finance" replace />} />
          <Route
            path="/dashboard/tariff/refunds"
            element={<Navigate to="/dashboard/finance/refunds" replace />}
          />
          <Route
            path="/dashboard/tariff/refunds/:refundId"
            element={<LegacyTariffRefundRedirect />}
          />
        </Routes>
      </MemoryRouter>
    );
  }

  it('redirects /dashboard/balance → /dashboard/finance', async () => {
    renderAt('/dashboard/balance');
    await waitFor(() => {
      expect(screen.getByTestId('loc').textContent).toBe('/dashboard/finance');
    });
  });

  it('redirects /dashboard/tariff → /dashboard/finance', async () => {
    renderAt('/dashboard/tariff');
    await waitFor(() => {
      expect(screen.getByTestId('loc').textContent).toBe('/dashboard/finance');
    });
  });

  it('redirects /dashboard/tariff/refunds → /dashboard/finance/refunds', async () => {
    renderAt('/dashboard/tariff/refunds');
    await waitFor(() => {
      expect(screen.getByTestId('loc').textContent).toBe('/dashboard/finance/refunds');
    });
  });

  it('redirects /dashboard/tariff/refunds/:id → finance detail', async () => {
    renderAt('/dashboard/tariff/refunds/42');
    await waitFor(() => {
      expect(screen.getByTestId('loc').textContent).toBe('/dashboard/finance/refunds/42');
    });
  });
});
