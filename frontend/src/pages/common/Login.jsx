import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, ROLE_HOME } from '../../lib/auth.jsx';
import { Alert, Button, Card, Input } from '../../components/ui.jsx';
import { usePageTitle } from '../../lib/hooks.js';

export default function Login() {
  usePageTitle('Log in');
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={loc.state?.from || ROLE_HOME[user.role]} replace />;

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const d = await login(form.email.trim(), form.password);
      nav(loc.state?.from && loc.state.from.startsWith(`/${d.user.role === 'student' ? 'student' : d.user.role === 'recruiter' ? 'recruiter' : 'admin'}`) ? loc.state.from : ROLE_HOME[d.user.role], { replace: true });
    } catch (err) { setError(err); setBusy(false); }
  };
  return (
    <div className="auth-wrap">
      <div className="auth-card stack">
        <Link to="/" className="brand" style={{ color: 'var(--text)' }}><img className="brand-logo" src="/logo.png" alt="" /> CPMS</Link>
        <Card title="Log in">
          <form onSubmit={submit} className="stack-sm" noValidate>
            {error && <Alert kind="error">{error.message}{error.code === 'EMAIL_NOT_VERIFIED' && <> <Link to="/verify-email">Verify your e-mail</Link></>}</Alert>}
            {loc.state?.registered && <Alert kind="success">Account created. Log in to continue.</Alert>}
            <Input label="E-mail" type="email" autoComplete="username" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <Button type="submit" variant="primary" loading={busy} className="btn-block">Log in</Button>
          </form>
          <p className="small" style={{ marginTop: '1rem' }}><Link to="/forgot-password">Forgot password?</Link></p>
          <p className="small muted">New here? <Link to="/register?role=student">Register as a student</Link> or <Link to="/register?role=recruiter">as a recruiter</Link>. Placement officers get accounts from an administrator.</p>
        </Card>
      </div>
    </div>
  );
}
