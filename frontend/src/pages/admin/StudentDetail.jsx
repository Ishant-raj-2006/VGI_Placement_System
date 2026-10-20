import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, downloadFile } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Alert, Async, Button, Card, DataTable, FormGrid, Input, KV, PageHeader, StatusBadge, Textarea, useConfirm, useToast } from '../../components/ui.jsx';
import { EditModal } from '../../components/Crud.jsx';
import { dt, label, num } from '../../lib/format.js';

const FIELDS = [['cgpa', 'CGPA'], ['activeBacklogs', 'Active backlogs'], ['totalBacklogs', 'Total backlogs'], ['tenthPercentage', '10th %'], ['twelfthPercentage', '12th %'], ['diplomaPercentage', 'Diploma %']];
const MAX_GRADUATION_YEAR = new Date().getFullYear() + 4;

export default function StudentDetail() {
  const { id } = useParams();
  usePageTitle('Student');
  const toast = useToast(); const [dialog, ask] = useConfirm();
  const state = useAsync(() => api.get(`/admin/students/${id}`), [id]);
  const [modal, setModal] = useState(null);
  const run = async (fn, msg) => { try { await fn(); toast.success(msg); state.reload(); } catch (e) { toast.error(e); } };
  return (
    <Async state={state}>
      {({ user, profile, academicRecords, projects, resumes, applications }) => {
        const e = profile.academicSummary?.entered || {}; const v = profile.academicSummary?.verified || {};
        return (
          <>
            {dialog}
            <PageHeader back={<Link to="/admin/students" className="back">← Students</Link>} title={user.name} subtitle={`${profile.studentId} · ${profile.rollNumber} · ${user.email}`}
              actions={<><StatusBadge status={profile.verificationStatus} /><StatusBadge status={user.accountStatus} />
                <Button onClick={() => setModal('correct')}>Correct record</Button>
                {user.accountStatus === 'deactivated' ? <Button onClick={() => run(() => api.post(`/admin/students/${id}/activate`), 'Account activated')}>Activate</Button> : <Button variant="danger" onClick={() => ask({ title: 'Deactivate this account?', message: 'The student is signed out and cannot log in until re-activated.', danger: true, confirmLabel: 'Deactivate', onConfirm: async () => { await api.post(`/admin/students/${id}/deactivate`); toast.success('Deactivated'); state.reload(); } })}>Deactivate</Button>}</>} />
            <Card title="Academic verification" actions={<><Button variant="primary" onClick={() => setModal('verify')}>Verify…</Button><Button variant="danger" onClick={() => ask({ title: 'Request correction', message: 'The student is asked to correct their details.', confirmLabel: 'Send', reasonLabel: 'What needs to be corrected?', reasonRequired: true, onConfirm: async (note) => { await api.post(`/admin/students/${id}/reject-verification`, { note }); toast.success('Correction requested'); state.reload(); } })}>Request correction</Button></>}>
              {profile.verificationNote && <Alert kind="info">Note: {profile.verificationNote}</Alert>}
              <div className="table-wrap"><table className="table"><thead><tr><th>Field</th><th>Entered by student</th><th>Verified</th></tr></thead>
                <tbody>{FIELDS.map(([k, l]) => <tr key={k}><td>{l}</td><td>{num(e[k], 2)}</td><td>{profile.verificationStatus === 'verified' ? num(v[k], 2) : '—'}</td></tr>)}</tbody></table></div>
              {v.verifiedAt && <p className="small muted">Last verified {dt(v.verifiedAt)} ({v.source || 'tpo'})</p>}
            </Card>
            <div className="grid grid-2">
              <Card title="Profile"><KV items={[['Department', profile.department], ['Degree', profile.degree], ['Graduation year', profile.graduationYear], ['Semester', profile.currentSemester], ['College', profile.collegeName], ['Phone', profile.personal?.contactNumber], ['Skills', (profile.skills || []).join(', ')], ['Last login', dt(user.lastLoginAt)]]} /></Card>
              <Card title="Resumes">{resumes.length ? resumes.map((r) => <div key={r._id} className="row between" style={{ padding: '.3rem 0' }}><span>{r.originalName}</span><Button size="sm" onClick={() => downloadFile(`/files/resumes/${r._id}`, r.originalName).catch(toast.error)}>Download</Button></div>) : <p className="muted">None uploaded.</p>}</Card>
            </div>
            <Card title="Detailed academic records" pad={false}>
              <DataTable rows={academicRecords} empty={<p className="muted" style={{ padding: '1rem' }}>No detailed records.</p>} columns={[
                { key: 't', header: 'Type', render: (r) => `${label(r.recordType)}${r.semester ? ` ${r.semester}` : ''}` }, { key: 's', header: 'Score', render: (r) => `${r.score} (${label(r.scoreScale)})` }, { key: 'i', header: 'Institution', render: (r) => r.institution || r.board || '—' },
                { key: 'v', header: 'Status', render: (r) => <StatusBadge status={r.verificationStatus} /> },
                { key: 'a', header: '', render: (r) => <div className="row gap-sm"><Button size="sm" onClick={() => run(() => api.post(`/admin/academic-records/${r._id}/verify`), 'Record verified')}>Verify</Button><Button size="sm" onClick={() => run(() => api.post(`/admin/academic-records/${r._id}/reject`, { note: 'Please re-check this record' }), 'Marked for correction')}>Reject</Button></div> },
              ]} />
            </Card>
            <Card title="Applications" pad={false}>
              <DataTable rows={applications} empty={<p className="muted" style={{ padding: '1rem' }}>No applications.</p>} columns={[
                { key: 'j', header: 'Job', render: (a) => a.drive?.jobTitle }, { key: 'c', header: 'Company', render: (a) => a.company?.name }, { key: 's', header: 'Status', render: (a) => <StatusBadge status={a.status} /> }, { key: 'e', header: 'Eligibility', render: (a) => <StatusBadge status={a.eligibilitySnapshot?.result} /> }, { key: 'd', header: 'Applied', render: (a) => dt(a.appliedAt) },
              ]} />
            </Card>
            {projects.length > 0 && <Card title="Projects">{projects.map((p) => <div key={p._id}><strong>{p.title}</strong> <span className="muted small">{(p.technologies || []).join(', ')}</span></div>)}</Card>}
            {modal === 'verify' && (
              <EditModal title="Verify academic details" initial={{ ...Object.fromEntries(FIELDS.map(([k]) => [k, ''])), note: '' }} onClose={(saved) => { setModal(null); if (saved) state.reload(); }}
                onSave={async (vals) => { const overrides = Object.fromEntries(FIELDS.map(([k]) => [k, vals[k] === '' ? undefined : Number(vals[k])]).filter(([, x]) => x !== undefined)); await api.post(`/admin/students/${id}/verify`, { overrides, note: vals.note || undefined }); toast.success('Student verified'); }} wide>
                {({ bind }) => <>
                  <Alert kind="info">Student-entered values are copied as verified. To correct a value while verifying, type the corrected value below (leave blank to accept what the student entered).</Alert>
                  <FormGrid>{FIELDS.map(([k, l]) => <Input key={k} label={`${l} (entered: ${e[k] ?? '—'})`} type="number" step="0.01" {...bind(k)} />)}<Textarea label="Note (optional)" rows={2} {...bind('note')} /></FormGrid>
                </>}
              </EditModal>
            )}
            {modal === 'correct' && (
              <EditModal title="Authorised record correction" initial={{ name: user.name, studentId: profile.studentId, rollNumber: profile.rollNumber, department: profile.department, degree: profile.degree || '', graduationYear: profile.graduationYear, reason: '' }} onClose={(saved) => { setModal(null); if (saved) state.reload(); }}
                onSave={async (vals) => { await api.put(`/admin/students/${id}`, { name: vals.name, studentId: vals.studentId, rollNumber: vals.rollNumber, department: vals.department, degree: vals.degree || undefined, graduationYear: Number(vals.graduationYear), reason: vals.reason }); toast.success('Record corrected and audit-logged'); }} wide>
                {({ bind }) => <><Alert kind="warn">Corrections are written to the audit log with before/after values, and the student is notified.</Alert>
                  <FormGrid><Input label="Name" {...bind('name')} /><Input label="Student ID" {...bind('studentId')} /><Input label="Roll number" {...bind('rollNumber')} /><Input label="Department" {...bind('department')} /><Input label="Degree" {...bind('degree')} /><Input label="Graduation year" type="number" max={MAX_GRADUATION_YEAR} {...bind('graduationYear')} /><Textarea label="Reason for correction (required)" required rows={2} {...bind('reason')} /></FormGrid></>}
              </EditModal>
            )}
          </>
        );
      }}
    </Async>
  );
}
