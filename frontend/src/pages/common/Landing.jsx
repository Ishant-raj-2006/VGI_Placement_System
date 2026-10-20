import { Link } from 'react-router-dom';
import { useAuth, ROLE_HOME } from '../../lib/auth.jsx';
import { usePageTitle } from '../../lib/hooks.js';

const FEATURES = [
  ['For students', 'Build one verified profile, see only the drives you qualify for, apply once and track every stage from application to offer.'],
  ['For recruiters', 'Register your company, post drives, review eligible applicants, run rounds and interviews, and issue offers in one place.'],
  ['For the placement cell', 'Verify students and companies, approve drives, apply placement policies consistently and monitor results with auditable reports.'],
  ['Fair and transparent', 'Eligibility is decided by the system from verified data, and every decision shows the reason. Nothing is hidden or edited silently.'],
  ['Secure by design', 'Role-based access, private document storage, session control, rate limiting and a full audit trail of important actions.'],
  ['Accurate reports', 'Unique placed students, offers and acceptances are counted separately and defined on screen, so numbers can be trusted.'],
];

export default function Landing() {
  usePageTitle('Campus Placement Management System');
  const { user } = useAuth();
  return (
    <>
      <nav className="public-nav" aria-label="Site">
        <Link to="/" className="brand"><img className="brand-logo" src="/logo.png" alt="" /> CPMS</Link>
        <div className="row gap-sm">
          <Link to="/contact" className="btn btn-ghost">Contact</Link>
          {user ? <Link className="btn btn-primary" to={ROLE_HOME[user.role]}>Open dashboard</Link> : <><Link className="btn" to="/login">Log in</Link><Link className="btn btn-primary" to="/register">Register</Link></>}
        </div>
      </nav>
      <header className="hero">
        <h1>One platform for campus placements</h1>
        <p>Students, recruiters and the placement cell work from the same verified data — from eligibility to offer acceptance.</p>
      </header>
      <section className="section" aria-labelledby="features">
        <h2 id="features" style={{ marginBottom: '1rem' }}>What it does</h2>
        <div className="grid grid-3">{FEATURES.map(([t, p]) => <div className="feature" key={t}><h3>{t}</h3><p className="muted">{p}</p></div>)}</div>
      </section>
      <section className="section">
        <h2 style={{ marginBottom: '1rem' }}>How a placement works here</h2>
        <ol className="stack-sm">
          <li><strong>Profile verified</strong> — students enter details; the placement cell verifies academics.</li>
          <li><strong>Drive approved</strong> — recruiters draft a drive; the placement cell approves and publishes it.</li>
          <li><strong>Eligibility checked</strong> — students see whether they qualify, and why, before applying.</li>
          <li><strong>Rounds and interviews</strong> — recruiters shortlist, run rounds and schedule interviews; students are notified.</li>
          <li><strong>Offers</strong> — recruiters issue offers; students accept or decline within the deadline, following college policy.</li>
        </ol>
      </section>
      <footer className="footer">VGI Campus Placement System Designed by Team Sync (Ishant Raj, Anuska Sherya, Anjali Kumari, Aarti Barhela).</footer>
    </>
  );
}
