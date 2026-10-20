import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useForm, usePageTitle } from '../../lib/hooks.js';
import { Alert, Button, Card, Input } from '../../components/ui.jsx';

export default function FirstLogin() {
  usePageTitle('Set your password');
  const { user, refresh, logout } = useAuth();
  const nav = useNavigate();
  const f = useForm({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!user) return <Navigate to="/student-login" replace />;
  if (!user.mustChangePassword) return <Navigate to={user.mustCompleteProfile ? '/student/profile' : '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    f.setErrors({});
    if (f.values.newPassword !== f.values.confirm) {
      f.setErrors({ confirm: 'Passwords do not match' });
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: f.values.currentPassword, newPassword: f.values.newPassword });
      await refresh();
      nav('/student/profile', { replace: true });
    } catch (err) {
      setError(err);
      f.setErrors(err.fieldErrors || {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Card title="Set a new password">
          <p className="muted">Your date-of-birth password is temporary. Set a private password before continuing.</p>
          {error && <Alert kind="error">{error.message}</Alert>}
          <form onSubmit={submit} className="stack-sm">
            <Input label="Temporary password (date of birth)" type="password" autoComplete="current-password" required {...f.bind('currentPassword')} />
            <Input label="New password" type="password" autoComplete="new-password" required hint="8+ characters with upper-case, lower-case and a digit" {...f.bind('newPassword')} />
            <Input label="Confirm new password" type="password" autoComplete="new-password" required {...f.bind('confirm')} />
            <Button type="submit" variant="primary" loading={busy} className="btn-block">Update password</Button>
          </form>
          <p className="small" style={{ marginTop: '1rem' }}><button className="btn btn-ghost btn-sm" type="button" onClick={async () => { await logout(); nav('/student-login', { replace: true }); }}>Log out</button></p>
        </Card>
      </div>
    </div>
  );
}
