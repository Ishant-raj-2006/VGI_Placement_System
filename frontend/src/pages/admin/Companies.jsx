import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { COMPANY_STATUSES } from '../../lib/constants.js';
import { useAsync, useDebounced, usePageTitle } from '../../lib/hooks.js';
import { Async, Card, DataTable, FilterBar, PageHeader, Pagination, SearchInput, Select, StatusBadge, useListState } from '../../components/ui.jsx';
import { d } from '../../lib/format.js';

export default function Companies() {
  usePageTitle('Companies');
  const nav = useNavigate(); const [sp] = useSearchParams();
  const list = useListState({ limit: 25, status: sp.get('status') || undefined });
  const [q, setQ] = useState(''); const dq = useDebounced(q);
  const params = { ...list.params, q: dq };
  const state = useAsync(() => api.get('/admin/companies', params), [JSON.stringify(params)]);
  return (
    <>
      <PageHeader title="Companies" subtitle="Verify companies before their drives can be published." />
      <FilterBar><SearchInput value={q} onChange={setQ} placeholder="Company name…" /><Select label="Status" placeholder="All" options={COMPANY_STATUSES} value={list.params.status || ''} onChange={(e) => list.setFilter('status', e.target.value)} /></FilterBar>
      <Card pad={false}>
        <Async state={state}>
          {(items, meta) => (
            <>
              <DataTable rows={items} onRowClick={(c) => nav(`/admin/companies/${c._id}`)} columns={[
                { key: 'name', header: 'Company', render: (c) => <Link to={`/admin/companies/${c._id}`}>{c.name}</Link> }, { key: 'ind', header: 'Industry', render: (c) => c.industry || '—' },
                { key: 's', header: 'Status', render: (c) => <StatusBadge status={c.verificationStatus} /> }, { key: 'n', header: 'Drives', className: 'num', render: (c) => c.driveCount }, { key: 'd', header: 'Registered', render: (c) => d(c.createdAt) },
              ]} />
              <div style={{ padding: '0 1.1rem 1rem' }}><Pagination meta={meta} onPage={list.setPage} /></div>
            </>
          )}
        </Async>
      </Card>
    </>
  );
}
