import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Alert, Async, BarList, Button, Card, KV, PageHeader, StatusBadge, useConfirm, useToast } from '../../components/ui.jsx';
import { compensationText, dt, label } from '../../lib/format.js';

export default function DriveReview() {
  const { id } = useParams();
  usePageTitle('Drive review');
  const toast = useToast(); const [dialog, ask] = useConfirm();
  const state = useAsync(() => api.get(`/admin/drives/${id}`), [id]);
  const act = (path, cfg) => ask({ confirmLabel: cfg.label, ...cfg, onConfirm: async (reason) => { await api.post(`/admin/drives/${id}/${path}`, { reason }); toast.success(cfg.done); state.reload(); } });
  return (
    <Async state={state}>
      {({ drive: x, company, rounds, ruleVersions, applicationsByStatus }) => {
        const A = x.approvalStatus; const P = x.publicationStatus;
        const total = Object.values(applicationsByStatus).reduce((a, b) => a + b, 0);
        return (
          <>
            {dialog}
            <PageHeader back={<Link to="/admin/drives" className="back">← Drives</Link>} title={x.jobTitle} subtitle={`${company?.name || ''} · rules v${x.rulesVersion}`}
              actions={<><StatusBadge status={A} /><StatusBadge status={P} /></>} />
            {company?.verificationStatus !== 'verified' && <Alert kind="warn">The company is <StatusBadge status={company?.verificationStatus} /> — a drive can only be published for a verified company. <Link to={`/admin/companies/${company?._id}`}>Open company</Link></Alert>}
            {x.statusReason && <Alert kind="info"><strong>Latest note:</strong> {x.statusReason}</Alert>}
            <Card title="Decision">
              <div className="row gap-sm wrap">
                {A === 'submitted' && <Button onClick={() => act('review', { title: 'Start review?', done: 'Moved to under review', label: 'Start review' })}>Start review</Button>}
                {['submitted', 'under_review'].includes(A) && <>
                  <Button variant="success" onClick={() => act('approve', { title: 'Approve this drive?', message: 'Depending on policy it is published immediately and eligible students are notified.', done: 'Drive approved', label: 'Approve' })}>Approve</Button>
                  <Button onClick={() => act('request-changes', { title: 'Request changes', reasonLabel: 'What should the recruiter change?', reasonRequired: true, done: 'Changes requested', label: 'Send request' })}>Request changes</Button>
                  <Button variant="danger" onClick={() => act('reject', { title: 'Reject this drive?', reasonLabel: 'Reason', reasonRequired: true, danger: true, done: 'Drive rejected', label: 'Reject' })}>Reject</Button></>}
                {A === 'approved' && P === 'unpublished' && <Button variant="primary" onClick={() => act('publish', { title: 'Publish this drive?', message: 'Students become able to see and apply to it.', done: 'Drive published', label: 'Publish' })}>Publish</Button>}
                {P === 'published' && <Button onClick={() => act('pause', { title: 'Pause this drive?', reasonLabel: 'Reason', reasonRequired: true, done: 'Drive paused', label: 'Pause' })}>Pause</Button>}
                {P === 'paused' && <Button variant="primary" onClick={() => act('resume', { title: 'Resume this drive?', done: 'Drive resumed', label: 'Resume' })}>Resume</Button>}
                {['published', 'paused'].includes(P) && <Button onClick={() => act('close', { title: 'Close applications?', message: 'No new applications are accepted.', done: 'Drive closed', label: 'Close' })}>Close</Button>}
                {!['cancelled', 'closed'].includes(P) && A !== 'draft' && <Button variant="danger" onClick={() => act('cancel', { title: 'Cancel this drive?', message: 'Students with applications are notified.', reasonLabel: 'Reason', reasonRequired: true, danger: true, done: 'Drive cancelled', label: 'Cancel drive' })}>Cancel drive</Button>}
                {['draft'].includes(A) && <span className="muted">The recruiter has not submitted this drive yet.</span>}
              </div>
            </Card>
            <div className="grid grid-2">
              <Card title="Job"><KV items={[['Type', label(x.employmentType)], ['Mode', label(x.workMode)], ['Locations', (x.locations || []).join(', ')], ['Vacancies', x.vacancies], ['Compensation', compensationText(x.compensation)], ['Opens', dt(x.applicationOpensAt)], ['Deadline', dt(x.applicationDeadline)], ['Submitted', dt(x.submittedAt)]]} /><h3 style={{ marginTop: '1rem' }}>Description</h3><p style={{ whiteSpace: 'pre-wrap' }}>{x.description}</p></Card>
              <div>
                <Card title="Eligibility rules"><KV items={[['Min CGPA', x.eligibilityRules?.minimumCgpa], ['Max active backlogs', x.eligibilityRules?.maximumActiveBacklogs], ['Max total backlogs', x.eligibilityRules?.maximumTotalBacklogs], ['Min 10th %', x.eligibilityRules?.minimumTenthPercentage], ['Min 12th %', x.eligibilityRules?.minimumTwelfthPercentage], ['Degrees', (x.eligibilityRules?.degrees || []).join(', ') || 'Any'], ['Departments', (x.allowedDepartments || []).join(', ') || 'All'], ['Graduation years', (x.graduationYears || []).join(', ') || 'All'], ['Additional', x.eligibilityRules?.additionalRequirements]]} /></Card>
                <Card title={`Applications (${total})`}>{total ? <BarList items={Object.entries(applicationsByStatus).map(([k, v]) => ({ label: label(k), value: v }))} /> : <p className="muted">None yet.</p>}</Card>
                <Card title="Rounds">{rounds.length ? <ol>{rounds.map((r) => <li key={r._id}>{r.name} <span className="muted small">{label(r.type)} · {label(r.status)}</span></li>)}</ol> : <p className="muted">No rounds defined.</p>}</Card>
              </div>
            </div>
            <Card title="Rules version history">{ruleVersions.length ? <ul>{ruleVersions.map((v) => <li key={v._id}>v{v.version} · {dt(v.createdAt)} {v.changeSummary ? `· ${v.changeSummary}` : ''}</li>)}</ul> : <p className="muted">No changes since creation.</p>}</Card>
          </>
        );
      }}
    </Async>
  );
}
