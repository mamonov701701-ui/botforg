import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import LegalRevisionsPanel from '../legal/LegalRevisionsPanel';
import { LEGAL_LIST_TABS, type LegalListTabId } from '../legal/legalHelpers';
import PageShell from '../../../ui/PageShell';

const VALID = new Set<string>(LEGAL_LIST_TABS.map(t => t.id));

function tabFromSearch(raw: string | null): LegalListTabId {
  if (raw && VALID.has(raw)) return raw as LegalListTabId;
  return 'active';
}

export default function PlatformLegalPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<LegalListTabId>(() => tabFromSearch(searchParams.get('tab')));

  useEffect(() => {
    setTab(tabFromSearch(searchParams.get('tab')));
  }, [searchParams]);

  const setTabAndUrl = (id: LegalListTabId) => {
    setTab(id);
    if (id === 'active') setSearchParams({}, { replace: true });
    else setSearchParams({ tab: id }, { replace: true });
  };

  return (
    <PageShell
      testId="legal-admin-shell"
      title={<span data-testid="legal-admin-shell-title">Юридические документы</span>}
      subtitle={
        <span data-testid="legal-admin-shell-subtitle">
          {tab === 'archive' ? 'Архивные редакции документов' : 'Действующие документы и черновики'}
        </span>
      }
      tabs={LEGAL_LIST_TABS.map(item => ({
        id: item.id,
        label: item.label,
        testId: `legal-admin-tab-${item.id}`,
      }))}
      activeTabId={tab}
      onTabChange={id => setTabAndUrl(id as LegalListTabId)}
      tabsAriaLabel="Действующие и архив"
    >
      <LegalRevisionsPanel mode={tab} />
    </PageShell>
  );
}
