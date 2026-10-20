import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth.jsx';
import { Alert, Async, BarList, Card, PageHeader, Stat, StatusBadge } from '../../components/ui.jsx';
import { label } from '../../lib/format.js';

export default function RecruiterDashboard() {
  usePageTitle('Dashboard');
  const { company, membership } = useAuth();
  const state = useAsync(() => api.get('/recruiter/dashboard'), []);
  return (
    <>
      <PageHeader title={company?.name || 'Recruiter dashboard'} subtitle={`Your role: ${label(membership?.companyRole)}`} actions={<Link className="btn btn-primary" to="/recruiter/drives/new">Create drive</Link>} />
      {membership?.status === 'pending' && <Alert kind="warn">Your access to this company is waiting for approval by the company owner.</Alert>}
      {company && company.verificationStatus !== 'verified' && <Alert kind="warn">Your company is <StatusBadge status={company.verificationStatus} />. You can prepare drafts, but drives can only be submitted for approval after the placement cell verifies the company. <Link to="/recruiter/verification">View status</Link></Alert>}
      <Async state={state}>
        {(d) => (
          <>
            <div className="stats">
              <Stat label="Active drives" value={d.activeDrives} /><Stat label="Total applicants" value={d.totalApplicants} /><Stat label="Eligible applicants" value={d.eligibleApplicants} />
              <Stat label="Shortlisted" value={d.shortlisted} hint="Reached shortlist or later" /><Stat label="Upcoming interviews" value={d.upcomingInterviews} /><Stat label="Pending round results" value={d.pendingResults} tone={d.pendingResults ? 'warn' : undefined} />
              <Stat label="Selected" value={d.selected} /><Stat label="Offers issued" value={d.offersIssued} />
            </div>
            <Card title="Applicants by current status">
              {Object.keys(d.statusBreakdown || {}).length ? <BarList items={Object.entries(d.statusBreakdown).map(([k, v]) => ({ label: label(k), value: v }))} /> : <p className="muted">No applications yet.</p>}
            </Card>
          </>
        )}
      </Async>
    </>
  );
}
