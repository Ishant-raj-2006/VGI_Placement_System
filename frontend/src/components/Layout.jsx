import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { label } from '../lib/format.js';

const NAV = {
  student: [
    ['Overview', [['/student', 'Dashboard', true], ['/student/drives', 'Placement drives'], ['/student/applications', 'My applications'], ['/student/interviews', 'Interviews'], ['/student/offers', 'Offers']]],
    ['My profile', [['/student/profile', 'Personal details'], ['/student/academic', 'Academic details'], ['/student/verification', 'Verification status'], ['/student/skills', 'Skills'], ['/student/experience', 'Experience & certificates'], ['/student/projects', 'Projects'], ['/student/resumes', 'Resumes']]],
    ['Help', [['/student/notifications', 'Notifications', false, 'bell'], ['/student/support', 'Support & complaints'], ['/student/settings', 'Account settings']]],
  ],
  recruiter: [
    ['Recruitment', [['/recruiter', 'Dashboard', true], ['/recruiter/drives', 'Job drives'], ['/recruiter/offers', 'Offers']]],
    ['Company', [['/recruiter/company', 'Company profile'], ['/recruiter/verification', 'Verification status'], ['/recruiter/team', 'Team']]],
    ['Help', [['/recruiter/notifications', 'Notifications', false, 'bell'], ['/recruiter/support', 'Support'], ['/recruiter/settings', 'Account settings']]],
  ],
  admin: [
    ['Overview', [['/admin', 'Dashboard', true], ['/admin/recruitment', 'Recruitment monitoring'], ['/admin/reports', 'Reports & analytics']]],
    ['Approvals', [['/admin/drives/pending', 'Drive approvals', false, 'pendingDrives'], ['/admin/companies', 'Companies'], ['/admin/students', 'Students'], ['/admin/students/import', 'Import students']]],
    ['Monitoring', [['/admin/drives', 'All drives'], ['/admin/applications', 'Applications'], ['/admin/offers', 'Offers']]],
    ['Governance', [['/admin/policies', 'Policies'], ['/admin/tickets', 'Tickets & complaints'], ['/admin/audit-logs', 'Audit logs']]],
    ['Account', [['/admin/notifications', 'Notifications', false, 'bell'], ['/admin/settings', 'Account settings']]],
  ],
};
const SUPER = ['System', [['/admin/users', 'User management'], ['/admin/system', 'System health & settings']]];

export default function Layout() {
  const { user, logout, company, membership } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [pendingDrives, setPendingDrives] = useState(0);
  const base = user.role === 'student' ? '/student' : user.role === 'recruiter' ? '/recruiter' : '/admin';
  const groups = user.role === 'student' ? NAV.student : user.role === 'recruiter' ? NAV.recruiter : [...NAV.admin.slice(0, 4), ...(user.role === 'super_admin' ? [SUPER] : []), NAV.admin[4]];

  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const { data } = await api.get('/notifications/unread-count');
        if (live) setUnread(data.unread);
        if (base === '/admin') { const r = await api.get('/admin/dashboard'); if (live) setPendingDrives(r.data.pending?.drivesAwaitingApproval || 0); }
      } catch { /* non-critical */ }
    };
    tick();
    const t = setInterval(tick, 60000);
    return () => { live = false; clearInterval(t); };
  }, [base, loc.pathname]);

  const badge = { bell: unread, pendingDrives };
  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <Link to={base} className="brand"><img className="brand-logo" src="/logo.png" alt="" /> CPMS</Link>
        {groups.map(([title, links]) => (
          <div key={title}>
            <div className="nav-group">{title}</div>
            {links.map(([to, text, end, b]) => (
              <NavLink key={to} to={to} end={!!end || to === base} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                {text}{badge[b] > 0 && <span className="nav-badge">{badge[b]}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost menu-btn" aria-label="Open menu" onClick={() => setOpen(true)}>☰</button>
          <div className="grow muted small">
            {user.role === 'recruiter' && company ? <>{company.name} · <span>{label(company.verificationStatus)}</span>{membership ? ` · ${label(membership.companyRole)}` : ''}</> : label(user.role)}
          </div>
          <Link to={`${base}/notifications`} className="btn btn-ghost bell" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>🔔{unread > 0 && <span className="nav-badge">{unread > 99 ? '99+' : unread}</span>}</Link>
          <div className="user-chip">
            <span className="avatar" aria-hidden="true">{(user.name || '?')[0].toUpperCase()}</span>
            <span className="uname small">{user.name}</span>
            <button className="btn btn-sm" onClick={async () => { await logout(); nav('/login'); }}>Log out</button>
          </div>
        </header>
        <main id="main" className="content" tabIndex={-1}><Outlet /></main>
        <footer className="footer">Campus Placement Management System</footer>
      </div>
    </div>
  );
}
