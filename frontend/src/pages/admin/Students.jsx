import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { DEPARTMENTS, PROFILE_VERIFICATION } from '../../lib/constants.js';
import { useAsync, useDebounced, usePageTitle } from '../../lib/hooks.js';
import { Async, Card, DataTable, FilterBar, PageHeader, Pagination, SearchInput, Select, StatusBadge, Input, useListState } from '../../components/ui.jsx';
import { num } from '../../lib/format.js';

export default function Students() {
  usePageTitle('Students');
  const nav = useNavigate(); const [sp] = useSearchParams();
  const list = useListState({ limit: 25, verificationStatus: sp.get('verificationStatus') || undefined });
  const [q, setQ] = useState(''); const dq = useDebounced(q);
  const params = { ...list.params, q: dq };
  const state = useAsync(() => api.get('/admin/students', params), [JSON.stringify(params)]);
  return (
    <>
      <PageHeader title="Students" subtitle="Verify academic records and manage student accounts." actions={<><Link className="btn" to="/admin/students/duplicates">Possible duplicates</Link><Link className="btn btn-primary" to="/admin/students/import">Import CSV</Link></>} />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Name, e-mail, student ID, roll no…" />
        <Select label="Verification" placeholder="All" options={PROFILE_VERIFICATION} value={list.params.verificationStatus || ''} onChange={(e) => list.setFilter('verificationStatus', e.target.value)} />
        <Select label="Department" placeholder="All" options={DEPARTMENTS} value={list.params.department || ''} onChange={(e) => list.setFilter('department', e.target.value)} />
        <Input label="Graduation year" type="number" value={list.params.graduationYear || ''} onChange={(e) => list.setFilter('graduationYear', e.target.value)} />
        <Select label="Account" placeholder="All" options={['active', 'deactivated', 'pending_activation']} value={list.params.accountStatus || ''} onChange={(e) => list.setFilter('accountStatus', e.target.value)} />
      </FilterBar>
      <Card pad={false}>
        <Async state={state}>
          {(items, meta) => (
            <>
              <DataTable rows={items} onRowClick={(s) => nav(`/admin/students/${s._id}`)} columns={[
                { key: 'name', header: 'Name', render: (s) => <Link to={`/admin/students/${s._id}`}>{s.user?.name}</Link> }, { key: 'sid', header: 'Student ID', render: (s) => s.studentId },
                { key: 'dept', header: 'Dept / year', render: (s) => `${s.department} · ${s.graduationYear}` },
                { key: 'cgpa', header: 'CGPA entered / verified', className: 'num', render: (s) => `${num(s.cgpaEntered, 2)} / ${num(s.cgpaVerified, 2)}` },
                { key: 'v', header: 'Verification', render: (s) => <StatusBadge status={s.verificationStatus} /> }, { key: 'acc', header: 'Account', render: (s) => <StatusBadge status={s.user?.accountStatus} /> },
              ]} />
              <div style={{ padding: '0 1.1rem 1rem' }}><Pagination meta={meta} onPage={list.setPage} /></div>
            </>
          )}
        </Async>
      </Card>
    </>
  );
}
