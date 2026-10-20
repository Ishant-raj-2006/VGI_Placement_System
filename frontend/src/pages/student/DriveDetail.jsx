import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import EligibilityPanel from '../../components/Eligibility.jsx';
import { Alert, Async, Badge, Button, Card, KV, Modal, PageHeader, Select, StatusBadge, ErrorBox, useToast } from '../../components/ui.jsx';
import { compensationText, d, dt, label, timeLeft } from '../../lib/format.js';

function ApplyModal({ drive, evaluation, onClose, onDone }) {
  const resumes = useAsync(() => api.get('/student/resumes'), []);
  const [resumeId, setResumeId] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const list = resumes.data || [];
  const effective = resumeId || list[0]?._id || '';
  const submit = async () => {
    setBusy(true); setError(null);
    try { const { data } = await api.post(`/drives/${drive._id}/applications`, effective ? { resumeId: effective } : {}); onDone(data); } catch (e) { setError(e); setBusy(false); }
  };
  return (
    <Modal title={`Apply to ${drive.jobTitle}`} onClose={() => !busy && onClose()} footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Submit application</Button></>}>
      <ErrorBox error={error} />
      {evaluation.result === 'pending_verification' && <Alert kind="warn">Your academic data is not verified yet. If the college policy allows, your application will be accepted but marked <strong>pending verification</strong>.</Alert>}
      <p>You are applying to <strong>{drive.company?.name}</strong>. You can apply only once per drive.</p>
      {resumes.loading ? <p className="muted">Loading resumes…</p> : list.length ? (
        <Select label="Resume to attach" value={effective} onChange={(e) => setResumeId(e.target.value)} options={list.map((r) => ({ value: r._id, label: r.originalName }))} />
      ) : <Alert kind="warn">You have no resume uploaded. <Link to="/student/resumes">Upload one</Link> first if this drive requires it.</Alert>}
    </Modal>
  );
}

export default function DriveDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const state = useAsync(() => api.get(`/drives/${id}`), [id]);
  const [applying, setApplying] = useState(false);
  usePageTitle(state.data?.drive?.jobTitle || 'Drive');
  return (
    <Async state={state}>
      {({ drive, eligibility, open, application }) => (
        <>
          <PageHeader back={<Link to="/student/drives" className="back">← All drives</Link>} title={drive.jobTitle} subtitle={`${drive.company?.name || ''}${drive.company?.industry ? ' · ' + drive.company.industry : ''}`}
            actions={application ? <><StatusBadge status={application.status} /><Link className="btn" to="/student/applications">My applications</Link></> : open.open ? <Button variant="primary" onClick={() => setApplying(true)}>Apply now</Button> : <Badge tone="red">{open.message}</Badge>} />
          {!application && open.open && eligibility.result === 'ineligible' && <Alert kind="error">You do not meet the eligibility criteria for this drive (see the reasons below). The system will not accept an application.</Alert>}
          {application && <Alert kind="success">You applied on {dt(application.appliedAt)}. Current status: <strong>{label(application.status)}</strong>.</Alert>}
          <div className="grid grid-2">
            <Card title="Job details">
              <KV items={[['Employment type', label(drive.employmentType)], ['Work mode', label(drive.workMode)], ['Locations', (drive.locations || []).join(', ') || '—'], ['Compensation', compensationText(drive.compensation)], ['Vacancies', drive.vacancies], ['Applications open', dt(drive.applicationOpensAt)], ['Deadline', `${dt(drive.applicationDeadline)} (${timeLeft(drive.applicationDeadline)})`], ['Drive start', drive.driveStartDate ? d(drive.driveStartDate) : null]]} />
              <h3 style={{ marginTop: '1rem' }}>Description</h3><p style={{ whiteSpace: 'pre-wrap' }}>{drive.description}</p>
              {drive.responsibilities && <><h3>Responsibilities</h3><p style={{ whiteSpace: 'pre-wrap' }}>{drive.responsibilities}</p></>}
              {drive.qualifications && <><h3>Qualifications</h3><p style={{ whiteSpace: 'pre-wrap' }}>{drive.qualifications}</p></>}
              {drive.requiredSkills?.length > 0 && <><h3>Skills</h3><div className="chips">{drive.requiredSkills.map((s) => <span className="chip" key={s}>{s}</span>)}</div></>}
            </Card>
            <div>
              <Card title="Your eligibility"><EligibilityPanel evaluation={eligibility} /></Card>
              <Card title="Selection process">
                {drive.rounds?.length ? <ol>{drive.rounds.map((r) => <li key={r._id}>{r.name} <span className="muted small">({label(r.type)}{r.isOptional ? ', optional' : ''})</span></li>)}</ol> : (drive.selectionProcess?.length ? <ol>{drive.selectionProcess.map((r, i) => <li key={i}>{r.name}</li>)}</ol> : <p className="muted">The recruiter has not published the rounds yet.</p>)}
              </Card>
              <Card title="About the company">
                <p>{drive.company?.description || 'No description provided.'}</p>
                <div className="small muted">{drive.company?.headquarters}{drive.company?.website && <> · <a href={drive.company.website} target="_blank" rel="noopener noreferrer">Website</a></>}</div>
              </Card>
            </div>
          </div>
          {applying && <ApplyModal drive={drive} evaluation={eligibility} onClose={() => setApplying(false)} onDone={(r) => { toast.success(r.message || 'Application submitted'); nav(`/student/applications/${r.application._id}`); }} />}
        </>
      )}
    </Async>
  );
}
