import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { usePageTitle } from '../../lib/hooks.js';
import { Alert, Button, Card, Input } from '../../components/ui.jsx';

export default function ResetPassword() {
  usePageTitle('Set a new password');
  const [sp] = useSearchParams();
  const [token, setToken] = useState(sp.get('token') || '');
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [state, setState] = useState({ busy: false, done: false, error: null });
  const submit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) { setState({ busy: false, done: false, error: { message: 'Passwords do not match' } }); return; }
    setState({ busy: true, done: false, error: null });
    try { await api.post('/auth/reset-password', { token, password: pw }); setState({ busy: false, done: true, error: null }); }
    catch (err) { setState({ busy: false, done: false, error: err }); }
  };
  return (
    <div className="auth-wrap"><div className="auth-card"><Card title="Set a new password">
      {state.done ? <><Alert kind="success">Password updated. All other sessions were signed out.</Alert><Link className="btn btn-primary" to="/login">Log in</Link></> : <form onSubmit={submit} className="stack-sm">
        {state.error && <Alert kind="error">{state.error.message}</Alert>}
        {!sp.get('token') && <Input label="Reset token" required value={token} onChange={(e) => setToken(e.target.value)} hint="Paste the token from your e-mail" />}
        <Input label="New password" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} hint="8+ characters with upper-case, lower-case and a digit" />
        <Input label="Confirm new password" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
        <Button type="submit" variant="primary" loading={state.busy} className="btn-block">Update password</Button>
      </form>}
    </Card></div></div>
  );
}
