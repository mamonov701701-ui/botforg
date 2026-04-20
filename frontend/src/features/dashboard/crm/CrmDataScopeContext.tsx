import React, { createContext, useContext, useMemo, useState } from 'react';
import type { CrmEnvironmentFilter } from '../../../api/botCrm';

/** Режим отображения данных: реальные / тестовые / все (соответствует query environment в API). */
export type CrmShowMode = CrmEnvironmentFilter;

interface CrmDataScopeValue {
  showMode: CrmShowMode;
  setShowMode: (m: CrmShowMode) => void;
}

const CrmDataScopeContext = createContext<CrmDataScopeValue | null>(null);

export function CrmDataScopeProvider({ children }: { children: React.ReactNode }) {
  const [showMode, setShowMode] = useState<CrmShowMode>('prod');
  const value = useMemo(() => ({ showMode, setShowMode }), [showMode]);
  return <CrmDataScopeContext.Provider value={value}>{children}</CrmDataScopeContext.Provider>;
}

export function useCrmDataScope(): CrmDataScopeValue {
  const ctx = useContext(CrmDataScopeContext);
  if (!ctx) {
    throw new Error('useCrmDataScope: провайдер не найден');
  }
  return ctx;
}
