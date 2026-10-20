import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Async, Card, DataTable, Empty, FilterBar, PageHeader, Pagination, Select, StatusBadge, useListState } from '../../components/ui.jsx';
import { compensationText, d } from '../../lib/format.js';

export default function Drives() {
  usePageTitle('Job drives');
  const nav = useNavigate();
  const list = useListState({ limit: 20 });
  const state = useAsync(() => api.get('/recruiter/drives', list.params), [JSON.stringify(list.params)]);
  return (
    <>
      <PageHeader title="Job drives" subtitle="Create drives, submit them for approval and follow applicants." actions={<Link className="btn btn-primary" to="/recruiter/drives/new">Create drive</Link>} />
      <FilterBar>
        <Select label="Approval" placeholder="All" options={['draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'rejected']} value={list.params.approvalStatus || ''} onChange={(e) => list.setFilter('approvalStatus', e.target.value)} />
        <Select label="Publication" placeholder="All" options={['unpublished', 'published', 'paused', 'closed', 'cancelled']} value={list.params.publicationStatus || ''} onChange={(e) => list.setFilter('publicationStatus', e.target.value)} />
      </FilterBar>
      <Card pad={false}>
        <Async state={state} empty={<Empty title="No drives yet" action={<Link className="btn btn-primary" to="/recruiter/drives/new">Create your first drive</Link>}>Drives start as drafts and must be approved before students see them.</Empty>}>
          {(items, meta) => (
            <>
              <DataTable rows={items} onRowClick={(r) => nav(`/recruiter/drives/${r._id}`)} columns={[
                { key: 'jobTitle', header: 'Job', render: (r) => <Link to={`/recruiter/drives/${r._id}`}>{r.jobTitle}</Link> },
                { key: 'approval', header: 'Approval', render: (r) => <StatusBadge status={r.approvalStatus} /> },
                { key: 'pub', header: 'Publication', render: (r) => <StatusBadge status={r.publicationStatus} /> },
                { key: 'pay', header: 'Compensation', render: (r) => compensationText(r.compensation) },
                { key: 'deadline', header: 'Deadline', render: (r) => d(r.applicationDeadline) },
                { key: 'n', header: 'Applicants', className: 'num', render: (r) => r.applicantCount },
              ]} />
              <div style={{ padding: '0 1.1rem 1rem' }}><Pagination meta={meta} onPage={list.setPage} /></div>
            </>
          )}
        </Async>
      </Card>
    </>
  );
}
