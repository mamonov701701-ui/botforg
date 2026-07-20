import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import LegalRevisionsPanel from '../legal/LegalRevisionsPanel';
import LegalReadinessPanel from '../legal/LegalReadinessPanel';
import { LEGAL_ADMIN_TABS, type LegalAdminTabId } from '../legal/legalHelpers';
import PageShell from '../../../ui/PageShell';

const VALID_TABS = new Set<string>(LEGAL_ADMIN_TABS.map(t => t.id));

function tabFromSearch(raw: string | null): LegalAdminTabId {
  if (raw && VALID_TABS.has(raw)) return raw as LegalAdminTabId;
  return 'documents';
}

export default function PlatformLegalPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<LegalAdminTabId>(() => tabFromSearch(searchParams.get('tab')));

  useEffect(() => {
    setTab(tabFromSearch(searchParams.get('tab')));
  }, [searchParams]);

  const setTabAndUrl = (id: LegalAdminTabId) => {
    setTab(id);
    if (id === 'documents') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: id }, { replace: true });
    }
  };

  const subtitle = useMemo(() => {
    if (tab === 'readiness') {
      return 'Checklist и итог legal_launch_ready для production-платежей';
    }
    return 'Редакции юридических документов: черновик → проверка → публикация';
  }, [tab]);

  return (
    <PageShell
      testId="legal-admin-shell"
      title={<span data-testid="legal-admin-shell-title">Юридические документы</span>}
      subtitle={<span data-testid="legal-admin-shell-subtitle">{subtitle}</span>}
      tabs={LEGAL_ADMIN_TABS.map(item => ({
        id: item.id,
        label: item.label,
        testId: `legal-admin-tab-${item.id}`,
      }))}
      activeTabId={tab}
      onTabChange={id => setTabAndUrl(id as LegalAdminTabId)}
      tabsAriaLabel="Разделы юридических документов"
    >
      {tab === 'documents' ? <LegalRevisionsPanel /> : <LegalReadinessPanel />}
    </PageShell>
  );
}
