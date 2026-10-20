import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { APP_STATUSES } from '../../lib/constants.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Async, Card, DataTable, Empty, FilterBar, PageHeader, Pagination, Select, StatusBadge, useListState } from '../../components/ui.jsx';
import { d, dt } from '../../lib/format.js';

export default function Applications() {
  usePageTitle('My applications');
  const list = useListState({ limit: 20 });
  const state = useAsync(() => api.get('/student/applications', list.params), [JSON.stringify(list.params)]);
  return (
    <>
      <PageHeader title="My applications" subtitle="Track every application and its stage." />
      <FilterBar><Select label="Status" placeholder="All statuses" options={APP_STATUSES} value={list.params.status || ''} onChange={(e) => list.setFilter('status', e.target.value)} /></FilterBar>
      <Card pad={false}>
        <Async state={state} empty={<Empty title="No applications yet" action={<Link className="btn btn-primary" to="/student/drives">Browse drives</Link>}>Apply to drives you are eligible for.</Empty>}>
          {(items, meta) => (
            <>
              <DataTable rows={items} columns={[
                { key: 'job', header: 'Job', render: (a) => <Link to={`/student/applications/${a._id}`}>{a.drive?.jobTitle || '—'}</Link> },
                { key: 'company', header: 'Company', render: (a) => a.company?.name },
                { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
                { key: 'elig', header: 'Eligibility at apply', render: (a) => <StatusBadge status={a.eligibilitySnapshot?.result} /> },
                { key: 'appliedAt', header: 'Applied', render: (a) => d(a.appliedAt) },
                { key: 'upd', header: 'Last update', render: (a) => dt(a.statusUpdatedAt || a.updatedAt) },
              ]} />
              <div style={{ padding: '0 1.1rem 1rem' }}><Pagination meta={meta} onPage={list.setPage} /></div>
            </>
          )}
        </Async>
      </Card>
    </>
  );
}
