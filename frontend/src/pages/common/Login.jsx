import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, ROLE_HOME } from '../../lib/auth.jsx';
import { Alert, Button, Card, Input } from '../../components/ui.jsx';
import { usePageTitle } from '../../lib/hooks.js';

export default function Login({ mode = 'student' }) {
  const isStudentPanel = mode === 'student';
  const allowedRoles = isStudentPanel ? ['student'] : ['recruiter', 'tpo', 'super_admin'];
  usePageTitle(isStudentPanel ? 'Student login' : 'Faculty login');
  const { user, login, logout } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={user.mustChangePassword ? '/first-login' : user.mustCompleteProfile ? '/student/profile' : ROLE_HOME[user.role]} replace />;

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const d = await login(form.identifier.trim(), form.password);
      if (!allowedRoles.includes(d.user.role)) {
        await logout();
        throw new Error(isStudentPanel ? 'This account uses the Faculty login.' : 'This account uses the Student login.');
      }
      const destination = d.user.mustChangePassword
        ? '/first-login'
        : d.user.mustCompleteProfile
          ? '/student/profile'
          : ROLE_HOME[d.user.role];
      nav(destination, { replace: true });
    } catch (err) { setError(err); setBusy(false); }
  };
  return (
    <div className="auth-wrap">
      <div className="auth-card stack">
        <Link to="/" className="brand" style={{ color: 'var(--text)' }}><img className="brand-logo" src="/logo.png" alt="" /> CPMS</Link>
        <Card title={isStudentPanel ? 'Student login' : 'Faculty login'}>
          <form onSubmit={submit} className="stack-sm" noValidate>
            {error && <Alert kind="error">{error.message}{error.code === 'EMAIL_NOT_VERIFIED' && <> <Link to="/verify-email">Verify your e-mail</Link></>}</Alert>}
            {isStudentPanel && <Alert kind="info">Use the College ID provided by your faculty. Your temporary password is your date of birth in YYYY-MM-DD format; you will set a private password at first login.</Alert>}
            <Input label={isStudentPanel ? 'College ID' : 'Faculty / recruiter e-mail'} type={isStudentPanel ? 'text' : 'email'} autoComplete="username" required value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} />
            <Input label="Password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <Button type="submit" variant="primary" loading={busy} className="btn-block">Log in</Button>
          </form>
          {!isStudentPanel && <p className="small" style={{ marginTop: '1rem' }}><Link to="/forgot-password">Forgot password?</Link></p>}
        </Card>
      </div>
    </div>
  );
}
