import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync, useDebounced, usePageTitle } from '../../lib/hooks.js';
import { Async, Card, DataTable, Empty, FilterBar, PageHeader, Pagination, SearchInput, Select, StatusBadge, useListState } from '../../components/ui.jsx';
import { compensationText, d, dt } from '../../lib/format.js';

export function PendingDrives() {
  usePageTitle('Drive approvals');
  const nav = useNavigate();
  const state = useAsync(() => api.get('/admin/drives/pending'), []);
  return (
    <>
      <PageHeader title="Drive approvals" subtitle="Submitted drives waiting for a decision, oldest first." />
      <Card pad={false}>
        <Async state={state} empty={<Empty title="Nothing waiting">All submitted drives have been reviewed.</Empty>}>
          {(items) => (
            <DataTable rows={items} onRowClick={(x) => nav(`/admin/drives/${x._id}`)} columns={[
              { key: 'j', header: 'Job', render: (x) => <Link to={`/admin/drives/${x._id}`}>{x.jobTitle}</Link> }, { key: 'c', header: 'Company', render: (x) => <>{x.company?.name} <StatusBadge status={x.company?.verificationStatus} /></> },
              { key: 'p', header: 'Compensation', render: (x) => compensationText(x.compensation) }, { key: 's', header: 'Submitted', render: (x) => dt(x.submittedAt) }, { key: 'st', header: 'Status', render: (x) => <StatusBadge status={x.approvalStatus} /> },
              { key: 'r', header: 'Rules', render: (x) => `v${x.rulesVersion}` },
            ]} />
          )}
        </Async>
      </Card>
    </>
  );
}

export function AllDrives() {
  usePageTitle('All drives');
  const nav = useNavigate();
  const list = useListState({ limit: 25 });
  const [q, setQ] = useState(''); const dq = useDebounced(q);
  const params = { ...list.params, q: dq };
  const state = useAsync(() => api.get('/admin/drives', params), [JSON.stringify(params)]);
  return (
    <>
      <PageHeader title="All drives" />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Job title…" />
        <Select label="Approval" placeholder="All" options={['draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'rejected']} value={list.params.approvalStatus || ''} onChange={(e) => list.setFilter('approvalStatus', e.target.value)} />
        <Select label="Publication" placeholder="All" options={['unpublished', 'published', 'paused', 'closed', 'cancelled']} value={list.params.publicationStatus || ''} onChange={(e) => list.setFilter('publicationStatus', e.target.value)} />
      </FilterBar>
      <Card pad={false}>
        <Async state={state}>
          {(items, meta) => (
            <>
              <DataTable rows={items} onRowClick={(x) => nav(`/admin/drives/${x._id}`)} columns={[
                { key: 'j', header: 'Job', render: (x) => <Link to={`/admin/drives/${x._id}`}>{x.jobTitle}</Link> }, { key: 'c', header: 'Company', render: (x) => x.company?.name },
                { key: 'a', header: 'Approval', render: (x) => <StatusBadge status={x.approvalStatus} /> }, { key: 'p', header: 'Publication', render: (x) => <StatusBadge status={x.publicationStatus} /> },
                { key: 'd', header: 'Deadline', render: (x) => d(x.applicationDeadline) }, { key: 'n', header: 'Applicants', className: 'num', render: (x) => x.applicantCount },
              ]} />
              <div style={{ padding: '0 1.1rem 1rem' }}><Pagination meta={meta} onPage={list.setPage} /></div>
            </>
          )}
        </Async>
      </Card>
    </>
  );
}
