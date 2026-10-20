import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth.jsx';
import { Alert, Async, BarList, Card, PageHeader, ProgressBar, Stat, StatusBadge } from '../../components/ui.jsx';
import { dt, label } from '../../lib/format.js';

export default function StudentDashboard() {
  usePageTitle('Dashboard');
  const { user } = useAuth();
  const state = useAsync(() => api.get('/student/dashboard'), []);
  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(' ')[0]}`} subtitle="Your placement journey at a glance." />
      <Async state={state}>
        {(d) => (
          <>
            {d.verificationStatus !== 'verified' && <Alert kind="warn">Your academic details are <strong>{label(d.verificationStatus)}</strong>. Drives that need verified academics will show “pending verification” until the placement cell verifies them. <Link to="/student/verification">See status</Link></Alert>}
            {d.pendingOffers?.length > 0 && <Alert kind="info"><strong>You have {d.pendingOffers.length} offer(s) awaiting your response.</strong> <Link to="/student/offers">Respond now</Link></Alert>}
            <div className="stats">
              <Stat label="Open drives" value={d.openDrives} />
              <Stat label="Applications" value={d.totalApplications} />
              <Stat label="Upcoming interviews" value={d.upcomingInterviews?.length ?? 0} />
              <Stat label="Unread notifications" value={d.unreadNotifications} tone={d.unreadNotifications ? 'warn' : undefined} />
            </div>
            <div className="grid grid-2">
              <Card title="Profile completion" actions={<Link to="/student/profile" className="small">Edit profile</Link>}>
                <ProgressBar value={d.completion?.percentage} label="Profile completion" />
                {d.completion?.missing?.length > 0 ? <p className="small muted" style={{ marginTop: '.75rem' }}>Still missing: {d.completion.missing.map(label).join(', ')}.</p> : <p className="small muted" style={{ marginTop: '.75rem' }}>Your profile is complete.</p>}
                <p className="small">Academic verification: <StatusBadge status={d.verificationStatus} /></p>
              </Card>
              <Card title="Applications by status">
                {d.totalApplications ? <BarList items={Object.entries(d.applicationsByStatus).map(([k, v]) => ({ label: label(k), value: v }))} /> : <p className="muted">You have not applied to any drive yet. <Link to="/student/drives">Browse drives</Link></p>}
              </Card>
              <Card title="Upcoming interviews" actions={<Link to="/student/interviews" className="small">All interviews</Link>}>
                {d.upcomingInterviews?.length ? <ul className="stack-sm" style={{ paddingLeft: '1.1rem' }}>{d.upcomingInterviews.map((i) => <li key={i._id}><strong>{dt(i.startsAt)}</strong> · {label(i.mode)}{i.locationOrLink ? ` · ${i.locationOrLink}` : ''}</li>)}</ul> : <p className="muted">No interviews scheduled.</p>}
              </Card>
              <Card title="Offers awaiting response" actions={<Link to="/student/offers" className="small">All offers</Link>}>
                {d.pendingOffers?.length ? <ul className="stack-sm" style={{ paddingLeft: '1.1rem' }}>{d.pendingOffers.map((o) => <li key={o._id}><Link to={`/student/offers/${o._id}`}>{o.jobTitle}</Link> at {o.companyId?.name} — respond by <strong>{dt(o.responseDeadline)}</strong></li>)}</ul> : <p className="muted">No pending offers.</p>}
              </Card>
            </div>
          </>
        )}
      </Async>
    </>
  );
}
