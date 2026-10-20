import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, downloadFile } from '../../lib/api.js';
import { APP_STATUSES } from '../../lib/constants.js';
import { useAsync, useDebounced, usePageTitle } from '../../lib/hooks.js';
import { Alert, Async, Button, Card, DataTable, FilterBar, Input, PageHeader, Pagination, SearchInput, Select, StatusBadge, Modal, Textarea, ErrorBox, useListState, useToast } from '../../components/ui.jsx';
import { num } from '../../lib/format.js';

function BulkDialog({ action, ids, onClose, onDone }) {
  const [reason, setReason] = useState(''); const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null); const [result, setResult] = useState(null);
  const run = async () => {
    setBusy(true); setError(null);
    try { const { data } = await api.post('/recruiter/applications/bulk', { applicationIds: ids, action, reason: reason || undefined, confirm: true }); setResult(data); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Bulk ${action} — ${ids.length} applicant(s)`} onClose={() => (result ? onDone() : onClose())} footer={result ? <Button variant="primary" onClick={onDone}>Done</Button> : <><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant={action === 'reject' ? 'danger' : 'primary'} loading={busy} disabled={!ok} onClick={run}>Confirm {action}</Button></>}>
      <ErrorBox error={error} />
      {result ? <>
        <Alert kind={result.failed ? 'warn' : 'success'}>{result.succeeded} succeeded, {result.failed} failed.</Alert>
        {result.results.filter((r) => !r.ok).map((r) => <div key={r.applicationId} className="small">• {r.applicationId}: {r.error}</div>)}
      </> : <>
        <p>This will <strong>{action}</strong> {ids.length} selected applicant(s). Applicants whose current status does not allow it are skipped and reported.</p>
        <Textarea label="Reason / note (sent to students, optional)" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> <span>I confirm this bulk action.</span></label>
      </>}
    </Modal>
  );
}

export default function Applicants() {
  const { id } = useParams();
  usePageTitle('Applicants');
  const toast = useToast();
  const list = useListState({ limit: 25 });
  const [q, setQ] = useState(''); const dq = useDebounced(q);
  const [selected, setSelected] = useState(new Set());
  const [bulk, setBulk] = useState(null);
  const params = { ...list.params, q: dq };
  const drive = useAsync(() => api.get(`/recruiter/drives/${id}`), [id]);
  const state = useAsync(() => api.get(`/recruiter/drives/${id}/applications`, params), [id, JSON.stringify(params)]);
  const rows = (state.data || []).map((r) => ({ ...r, _id: r.applicationId }));
  const act = async (appId, action) => { try { await api.post(`/recruiter/applications/${appId}/${action}`); toast.success('Updated'); state.reload(); } catch (e) { toast.error(e); } };
  const exportCsv = () => {
    const header = ['Name', 'Department', 'Graduation year', 'CGPA (verified)', 'Active backlogs', 'Eligibility', 'Status', 'Skills'];
    const lines = [header, ...rows.map((r) => [r.student.name, r.student.department, r.student.graduationYear, r.student.cgpa ?? '', r.student.activeBacklogs ?? '', r.eligibility?.result, r.status, (r.student.skills || []).join('; ')])];
    const esc = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const blob = new Blob([lines.map((l) => l.map(esc).join(',')).join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'applicants.csv'; a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <>
      <PageHeader back={<Link to={`/recruiter/drives/${id}`} className="back">← {drive.data?.drive?.jobTitle || 'Drive'}</Link>} title="Applicants" subtitle="Academic values shown are placement-cell verified. Contact details unlock once a candidate is shortlisted." actions={<Button onClick={exportCsv} disabled={!rows.length}>Export page (CSV)</Button>} />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Search by name…" />
        <Select label="Status" placeholder="All" options={APP_STATUSES} value={list.params.status || ''} onChange={(e) => { list.setFilter('status', e.target.value); setSelected(new Set()); }} />
        <Select label="Eligibility" placeholder="All" options={['eligible', 'ineligible', 'pending_verification']} value={list.params.eligibility || ''} onChange={(e) => list.setFilter('eligibility', e.target.value)} />
        <Input label="Department" placeholder="CSE,IT" value={list.params.department || ''} onChange={(e) => list.setFilter('department', e.target.value)} />
        <Input label="Min CGPA" type="number" step="0.1" min="0" max="10" value={list.params.minCgpa || ''} onChange={(e) => list.setFilter('minCgpa', e.target.value)} />
        <Input label="Skill" placeholder="Java" value={list.params.skills || ''} onChange={(e) => list.setFilter('skills', e.target.value)} />
        <Input label="Grad. year" type="number" value={list.params.graduationYear || ''} onChange={(e) => list.setFilter('graduationYear', e.target.value)} />
      </FilterBar>
      {selected.size > 0 && <Alert kind="info"><span><strong>{selected.size}</strong> selected</span><span className="row gap-sm"><Button size="sm" onClick={() => setBulk('review')}>Mark under review</Button><Button size="sm" variant="primary" onClick={() => setBulk('shortlist')}>Shortlist</Button><Button size="sm" variant="danger" onClick={() => setBulk('reject')}>Reject</Button></span></Alert>}
      <Card pad={false}>
        <Async state={state}>
          {(_, meta) => (
            <>
              <DataTable rows={rows} selectable selected={selected} onSelect={setSelected} columns={[
                { key: 'name', header: 'Candidate', render: (r) => <Link to={`/recruiter/applications/${r.applicationId}`}>{r.student.name}</Link> },
                { key: 'dept', header: 'Dept / year', render: (r) => `${r.student.department || '—'} · ${r.student.graduationYear || '—'}` },
                { key: 'cgpa', header: 'CGPA', className: 'num', render: (r) => (r.student.academicVerified ? num(r.student.cgpa, 2) : <span className="muted" title="Not verified yet">unverified</span>) },
                { key: 'bl', header: 'Backlogs', className: 'num', render: (r) => (r.student.academicVerified ? r.student.activeBacklogs : '—') },
                { key: 'elig', header: 'Eligibility', render: (r) => <StatusBadge status={r.eligibility?.result} /> },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'resume', header: 'Resume', render: (r) => (r.resume ? <Button size="sm" onClick={() => downloadFile(`/files/resumes/${r.resume.id}`, r.resume.name).catch(toast.error)}>Download</Button> : '—') },
                { key: 'a', header: 'Quick actions', render: (r) => <div className="row gap-sm">
                  {['applied', 'under_review'].includes(r.status) && <Button size="sm" variant="primary" onClick={() => act(r.applicationId, 'shortlist')}>Shortlist</Button>}
                  {['applied', 'under_review', 'shortlisted'].includes(r.status) && <Button size="sm" onClick={() => act(r.applicationId, 'reject')}>Reject</Button>}
                </div> },
              ]} />
              <div style={{ padding: '0 1.1rem 1rem' }}><Pagination meta={meta} onPage={(p) => { list.setPage(p); setSelected(new Set()); }} /></div>
            </>
          )}
        </Async>
      </Card>
      {bulk && <BulkDialog action={bulk} ids={[...selected]} onClose={() => setBulk(null)} onDone={() => { setBulk(null); setSelected(new Set()); state.reload(); }} />}
    </>
  );
}
