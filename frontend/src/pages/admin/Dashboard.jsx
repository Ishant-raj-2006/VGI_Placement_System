import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Alert, Async, Card, PageHeader, Stat } from '../../components/ui.jsx';
import { label } from '../../lib/format.js';

export default function AdminDashboard() {
  usePageTitle('Dashboard');
  const state = useAsync(() => api.get('/admin/dashboard'), []);
  return (
    <>
      <PageHeader title="Placement dashboard" subtitle="Live overview. Every number has a definition below." />
      <Async state={state}>
        {({ totals: t, pending: p, definitions }) => (
          <>
            {(p.drivesAwaitingApproval + p.companiesAwaitingVerification + p.studentsAwaitingVerification) > 0 && (
              <Alert kind="warn"><span><strong>Needs attention:</strong> {p.drivesAwaitingApproval > 0 && <><Link to="/admin/drives/pending">{p.drivesAwaitingApproval} drive(s) awaiting approval</Link>{' · '}</>}{p.companiesAwaitingVerification > 0 && <><Link to="/admin/companies?status=pending">{p.companiesAwaitingVerification} company verification(s)</Link>{' · '}</>}{p.studentsAwaitingVerification > 0 && <Link to="/admin/students?verificationStatus=pending_verification">{p.studentsAwaitingVerification} student(s) awaiting verification</Link>}</span></Alert>
            )}
            <div className="stats">
              <Stat label="Registered students" value={t.totalStudents} /><Stat label="Verified students" value={t.verifiedStudentProfiles} />
              <Stat label="Registered companies" value={t.registeredCompanies} /><Stat label="Verified companies" value={t.verifiedCompanies} />
              <Stat label="Active drives" value={t.activeDrives} /><Stat label="Applications" value={t.totalApplications} />
              <Stat label="Shortlisted" value={t.shortlisted} /><Stat label="Offers issued" value={t.offersIssued} />
              <Stat label="Offers accepted" value={t.offersAccepted} /><Stat label="Offers declined" value={t.offersDeclined} />
              <Stat label="Students placed" value={t.studentsPlaced} tone="good" hint="Unique students with ≥1 accepted offer" />
            </div>
            <Card title="How these numbers are defined">
              <dl className="kv">{Object.entries(definitions).map(([k, v]) => <div key={k}><dt>{label(k)}</dt><dd className="small" style={{ fontWeight: 400 }}>{v}</dd></div>)}</dl>
            </Card>
          </>
        )}
      </Async>
    </>
  );
}
