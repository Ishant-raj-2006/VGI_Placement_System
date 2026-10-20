import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Alert, Async, Card, KV, PageHeader, StatusBadge } from '../../components/ui.jsx';
import { dt, num } from '../../lib/format.js';

const COPY = {
  verified: 'Your academic details are verified. Eligibility for drives uses these verified values.',
  pending_verification: 'The placement cell has not verified your academic details yet. You can browse drives, but eligibility that depends on academics shows “pending verification” until then.',
  correction_required: 'The placement cell found a problem with your details. Please correct them (see the note below) and save — this asks for verification again.',
  not_submitted: 'Add your academic details to request verification.',
};

export default function Verification() {
  usePageTitle('Verification status');
  const state = useAsync(() => api.get('/student/profile'), []);
  return (
    <>
      <PageHeader title="Verification status" subtitle="The placement cell verifies the academic data used for eligibility." />
      <Async state={state}>
        {({ profile, academicRecords }) => {
          const entered = profile.academicSummary?.entered || {}; const ver = profile.academicSummary?.verified || {};
          return (
            <>
              <Alert kind={profile.verificationStatus === 'verified' ? 'success' : profile.verificationStatus === 'correction_required' ? 'error' : 'warn'}>
                <StatusBadge status={profile.verificationStatus} /> {COPY[profile.verificationStatus] || ''}
                {profile.verificationNote && <div style={{ marginTop: '.4rem' }}><strong>Note from placement cell:</strong> {profile.verificationNote}</div>}
              </Alert>
              <Card title="Entered vs verified values">
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>Field</th><th>You entered</th><th>Verified</th></tr></thead>
                  <tbody>{[['CGPA', 'cgpa'], ['Active backlogs', 'activeBacklogs'], ['Total backlogs', 'totalBacklogs'], ['10th %', 'tenthPercentage'], ['12th %', 'twelfthPercentage'], ['Diploma %', 'diplomaPercentage']].map(([l, k]) => (
                    <tr key={k}><td>{l}</td><td>{num(entered[k], 2)}</td><td>{profile.verificationStatus === 'verified' ? num(ver[k], 2) : '—'}</td></tr>
                  ))}</tbody>
                </table></div>
                {ver.verifiedAt && <p className="small muted">Last verified {dt(ver.verifiedAt)}</p>}
              </Card>
              <Card title="Records">
                <p className="muted small">{academicRecords.filter((r) => r.verificationStatus === 'verified').length} of {academicRecords.length} detailed records verified.</p>
                <p>Something wrong that you cannot edit (for example your student ID)? <Link to="/student/support">Raise a correction request</Link>.</p>
              </Card>
            </>
          );
        }}
      </Async>
    </>
  );
}
