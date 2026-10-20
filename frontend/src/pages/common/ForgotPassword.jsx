import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { usePageTitle } from '../../lib/hooks.js';
import { Alert, Button, Card, Input } from '../../components/ui.jsx';

export default function ForgotPassword() {
  usePageTitle('Forgot password');
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ busy: false, done: null, error: null });
  const submit = async (e) => {
    e.preventDefault(); setState({ busy: true, done: null, error: null });
    try { const { data } = await api.post('/auth/forgot-password', { email }); setState({ busy: false, done: data, error: null }); }
    catch (err) { setState({ busy: false, done: null, error: err }); }
  };
  return (
    <div className="auth-wrap"><div className="auth-card"><Card title="Reset your password">
      {state.error && <Alert kind="error">{state.error.message}</Alert>}
      {state.done ? <>
        <Alert kind="success">{state.done.message}</Alert>
        {state.done.devResetToken && <Alert kind="warn">Development mode: <Link to={`/reset-password?token=${state.done.devResetToken}`}>open reset page</Link></Alert>}
      </> : <form onSubmit={submit} className="stack-sm">
        <p className="muted">Enter your account e-mail. If it exists, we will send a reset link that is valid for a short time.</p>
        <Input label="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" variant="primary" loading={state.busy} className="btn-block">Send reset link</Button>
      </form>}
      <p className="small"><Link to="/login">Back to log in</Link></p>
    </Card></div></div>
  );
}
