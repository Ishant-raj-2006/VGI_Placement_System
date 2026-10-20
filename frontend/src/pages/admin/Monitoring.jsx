import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { APP_STATUSES, OFFER_STATUSES } from '../../lib/constants.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Async, Card, DataTable, Empty, FilterBar, PageHeader, Pagination, Select, StatusBadge, useListState } from '../../components/ui.jsx';
import { d, dt, money } from '../../lib/format.js';

export function Applications() {
  usePageTitle('Applications');
  const list = useListState({ limit: 25 });
  const state = useAsync(() => api.get('/admin/applications', list.params), [JSON.stringify(list.params)]);
  return (
    <>
      <PageHeader title="Applications" subtitle="Monitoring view — students are identified by ID and name only." />
      <FilterBar>
        <Select label="Status" placeholder="All" options={APP_STATUSES} value={list.params.status || ''} onChange={(e) => list.setFilter('status', e.target.value)} />
        <Select label="Department" placeholder="All" options={['CSE', 'IT', 'ECE', 'EEE', 'MECH', 'CIVIL']} value={list.params.department || ''} onChange={(e) => list.setFilter('department', e.target.value)} />
      </FilterBar>
      <Card pad={false}>
        <Async state={state} empty={<Empty title="No applications match" />}>
          {(items, meta) => (
            <>
              <DataTable rows={items} columns={[
                { key: 's', header: 'Student', render: (a) => `${a.student?.name || '—'} (${a.student?.studentId || ''})` }, { key: 'dp', header: 'Dept', render: (a) => a.student?.department },
                { key: 'j', header: 'Drive', render: (a) => <Link to={`/admin/drives/${a.drive?._id}`}>{a.drive?.jobTitle}</Link> }, { key: 'c', header: 'Company', render: (a) => a.company?.name },
                { key: 'st', header: 'Status', render: (a) => <StatusBadge status={a.status} /> }, { key: 'e', header: 'Eligibility', render: (a) => <StatusBadge status={a.eligibility} /> }, { key: 'ap', header: 'Applied', render: (a) => d(a.appliedAt) },
              ]} />
              <div style={{ padding: '0 1.1rem 1rem' }}><Pagination meta={meta} onPage={list.setPage} /></div>
            </>
          )}
        </Async>
      </Card>
    </>
  );
}

export function Offers() {
  usePageTitle('Offers');
  const list = useListState({ limit: 25 });
  const state = useAsync(() => api.get('/admin/offers', list.params), [JSON.stringify(list.params)]);
  return (
    <>
      <PageHeader title="Offers" subtitle="All offers across companies." />
      <FilterBar><Select label="Status" placeholder="All" options={OFFER_STATUSES} value={list.params.status || ''} onChange={(e) => list.setFilter('status', e.target.value)} /></FilterBar>
      <Card pad={false}>
        <Async state={state} empty={<Empty title="No offers yet" />}>
          {(items, meta) => (
            <>
              <DataTable rows={items} columns={[
                { key: 's', header: 'Student', render: (o) => `${o.student?.name || '—'} (${o.student?.studentId || ''})` }, { key: 'dp', header: 'Dept', render: (o) => o.student?.department }, { key: 'c', header: 'Company', render: (o) => o.company?.name }, { key: 'j', header: 'Job', render: (o) => o.jobTitle },
                { key: 'pay', header: 'Compensation', render: (o) => money(o.compensation?.amount, o.compensation?.currency, o.compensation?.kind) }, { key: 'v', header: 'Ver.', render: (o) => `v${o.version}${o.isCurrent ? '' : ' (old)'}` }, { key: 'st', header: 'Status', render: (o) => <StatusBadge status={o.status} /> }, { key: 'dl', header: 'Respond by', render: (o) => dt(o.responseDeadline) },
              ]} />
              <div style={{ padding: '0 1.1rem 1rem' }}><Pagination meta={meta} onPage={list.setPage} /></div>
            </>
          )}
        </Async>
      </Card>
    </>
  );
}

export function RecruitmentMonitoring() {
  usePageTitle('Recruitment monitoring');
  const state = useAsync(() => api.get('/admin/recruitment'), []);
  return (
    <>
      <PageHeader title="Recruitment monitoring" subtitle="Progress of every live drive: applicants, shortlists, interviews and offers." />
      <Card pad={false}>
        <Async state={state} empty={<Empty title="No live drives" />}>
          {(items) => (
            <DataTable rows={items.map((x) => ({ ...x, _id: x.driveId }))} columns={[
              { key: 'j', header: 'Drive', render: (x) => <Link to={`/admin/drives/${x.driveId}`}>{x.jobTitle}</Link> }, { key: 'c', header: 'Company', render: (x) => x.company }, { key: 'p', header: 'Publication', render: (x) => <StatusBadge status={x.publicationStatus} /> },
              { key: 'dl', header: 'Deadline', render: (x) => d(x.applicationDeadline) }, { key: 't', header: 'Applied', className: 'num', render: (x) => x.totalApplications }, { key: 'sh', header: 'Shortlisted+', className: 'num', render: (x) => x.shortlisted },
              { key: 'se', header: 'Selected', className: 'num', render: (x) => x.selected }, { key: 'o', header: 'Offered', className: 'num', render: (x) => x.offered }, { key: 'a', header: 'Accepted', className: 'num', render: (x) => x.accepted },
              { key: 'pi', header: 'Upcoming interviews', className: 'num', render: (x) => x.pendingInterviews }, { key: 'pr', header: 'Pending results', className: 'num', render: (x) => x.pendingResults },
            ]} />
          )}
        </Async>
      </Card>
    </>
  );
}
