import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth.jsx';
import { Alert, Async, BarList, Button, Card, KV, PageHeader, StatusBadge, useConfirm, useToast } from '../../components/ui.jsx';
import { compensationText, dt, label } from '../../lib/format.js';

export const DriveStateAlert = ({ drive }) => {
  if (drive.approvalStatus === 'changes_requested') return <Alert kind="warn"><strong>The placement cell requested changes:</strong> {drive.statusReason || 'See the drive details.'} Edit the drive and submit it again.</Alert>;
  if (drive.approvalStatus === 'rejected') return <Alert kind="error"><strong>Rejected:</strong> {drive.statusReason}</Alert>;
  if (['paused', 'cancelled'].includes(drive.publicationStatus)) return <Alert kind="warn">This drive is <strong>{drive.publicationStatus}</strong>{drive.statusReason ? `: ${drive.statusReason}` : ''}.</Alert>;
  if (['submitted', 'under_review'].includes(drive.approvalStatus)) return <Alert kind="info">Waiting for placement cell approval. You can still view the drive but major edits are locked until a decision.</Alert>;
  return null;
};

export default function RecruiterDriveDetail() {
  const { id } = useParams();
  const toast = useToast(); const { membership, company } = useAuth();
  const [dialog, ask] = useConfirm();
  const state = useAsync(() => api.get(`/recruiter/drives/${id}`), [id]);
  usePageTitle(state.data?.drive?.jobTitle || 'Drive');
  const isManager = ['owner', 'hr_manager'].includes(membership?.companyRole);
  return (
    <Async state={state}>
      {({ drive, rounds, applicationsByStatus, ruleVersions }) => {
        const canSubmit = ['draft', 'changes_requested'].includes(drive.approvalStatus) && company?.verificationStatus === 'verified';
        const canEdit = !['submitted', 'under_review'].includes(drive.approvalStatus) && !['closed', 'cancelled'].includes(drive.publicationStatus);
        const total = Object.values(applicationsByStatus).reduce((a, b) => a + b, 0);
        return (
          <>
            {dialog}
            <PageHeader back={<Link to="/recruiter/drives" className="back">← All drives</Link>} title={drive.jobTitle} subtitle={`Rules version ${drive.rulesVersion}`}
              actions={<>
                <StatusBadge status={drive.approvalStatus} /><StatusBadge status={drive.publicationStatus} />
                {canEdit && <Link className="btn" to={`/recruiter/drives/${id}/edit`}>Edit</Link>}
                {canSubmit && <Button variant="primary" onClick={() => ask({ title: 'Submit for approval?', message: 'The placement cell will review this drive. You will be notified of the decision.', confirmLabel: 'Submit', onConfirm: async () => { await api.post(`/recruiter/drives/${id}/submit`); toast.success('Submitted for approval'); state.reload(); } })}>Submit for approval</Button>}
                {isManager && drive.approvalStatus === 'approved' && !['closed', 'cancelled'].includes(drive.publicationStatus) && <Button variant="danger" onClick={() => ask({ title: 'Close this drive?', message: 'No new applications will be accepted. Existing applications continue.', danger: true, confirmLabel: 'Close drive', onConfirm: async () => { await api.post(`/recruiter/drives/${id}/close`); toast.success('Drive closed'); state.reload(); } })}>Close drive</Button>}
              </>} />
            {!canSubmit && ['draft', 'changes_requested'].includes(drive.approvalStatus) && company?.verificationStatus !== 'verified' && <Alert kind="warn">Your company must be verified before you can submit drives. <Link to="/recruiter/verification">View status</Link></Alert>}
            <DriveStateAlert drive={drive} />
            <div className="row gap-sm wrap" style={{ marginBottom: '1rem' }}>
              <Link className="btn" to={`/recruiter/drives/${id}/applicants`}>Applicants ({total})</Link>
              <Link className="btn" to={`/recruiter/drives/${id}/rounds`}>Rounds ({rounds.length})</Link>
              <Link className="btn" to={`/recruiter/drives/${id}/interviews`}>Interviews</Link>
              <Link className="btn" to={`/recruiter/offers?driveId=${id}`}>Offers</Link>
            </div>
            <div className="grid grid-2">
              <Card title="Summary">
                <KV items={[['Employment', label(drive.employmentType)], ['Work mode', label(drive.workMode)], ['Locations', (drive.locations || []).join(', ')], ['Vacancies', drive.vacancies], ['Compensation', compensationText(drive.compensation)], ['Opens', dt(drive.applicationOpensAt)], ['Deadline', dt(drive.applicationDeadline)], ['Drive start', dt(drive.driveStartDate)]]} />
                <h3 style={{ marginTop: '1rem' }}>Description</h3><p style={{ whiteSpace: 'pre-wrap' }}>{drive.description}</p>
              </Card>
              <div>
                <Card title="Eligibility rules (current)">
                  <KV items={[['Min CGPA', drive.eligibilityRules?.minimumCgpa], ['Max active backlogs', drive.eligibilityRules?.maximumActiveBacklogs], ['Max total backlogs', drive.eligibilityRules?.maximumTotalBacklogs], ['Min 10th %', drive.eligibilityRules?.minimumTenthPercentage], ['Min 12th %', drive.eligibilityRules?.minimumTwelfthPercentage], ['Degrees', (drive.eligibilityRules?.degrees || []).join(', ') || 'Any'], ['Departments', (drive.allowedDepartments || []).join(', ') || 'All'], ['Graduation years', (drive.graduationYears || []).join(', ') || 'All']]} />
                </Card>
                <Card title="Applications by status">{total ? <BarList items={Object.entries(applicationsByStatus).map(([k, v]) => ({ label: label(k), value: v }))} /> : <p className="muted">No applications yet.</p>}</Card>
              </div>
            </div>
            <Card title="Rules version history">
              {ruleVersions.length ? <ul className="stack-sm" style={{ paddingLeft: '1.1rem' }}>{ruleVersions.map((v) => <li key={v._id}><strong>v{v.version}</strong> · {dt(v.createdAt)} {v.changeSummary ? `· ${v.changeSummary}` : ''}<div className="small muted">Applicants are evaluated against the version in force when they applied.</div></li>)}</ul> : <p className="muted">No changes recorded.</p>}
            </Card>
          </>
        );
      }}
    </Async>
  );
}
