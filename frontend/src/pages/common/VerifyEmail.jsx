import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { usePageTitle } from '../../lib/hooks.js';
import { Alert, Button, Card, Input, Spinner } from '../../components/ui.jsx';

export default function VerifyEmail() {
  usePageTitle('Verify e-mail');
  const [sp] = useSearchParams();
  const token = sp.get('token');
  const [state, setState] = useState({ status: token ? 'working' : 'idle', error: null });
  const [email, setEmail] = useState(''); const [resent, setResent] = useState(null);
  const ran = useRef(false);
  useEffect(() => {
    if (!token || ran.current) return; ran.current = true;
    api.post('/auth/verify-email', { token }).then(() => setState({ status: 'ok' })).catch((error) => setState({ status: 'error', error }));
  }, [token]);
  const resend = async (e) => {
    e.preventDefault();
    try { const { data } = await api.post('/auth/resend-verification', { email }); setResent(data); } catch (err) { setResent({ message: err.message }); }
  };
  return (
    <div className="auth-wrap"><div className="auth-card"><Card title="E-mail verification">
      {state.status === 'working' && <Spinner text="Verifying…" />}
      {state.status === 'ok' && <><Alert kind="success">Your e-mail is verified. You can now log in.</Alert><Link className="btn btn-primary" to="/faculty-login">Faculty Login</Link></>}
      {state.status === 'error' && <Alert kind="error">{state.error.message}</Alert>}
      {state.status !== 'ok' && state.status !== 'working' && <form onSubmit={resend} className="stack-sm">
        <p className="muted">Need a new verification link?</p>
        <Input label="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit">Send a new link</Button>
        {resent && <Alert kind="info">{resent.message}{resent.devVerificationToken && <> <Link to={`/verify-email?token=${resent.devVerificationToken}`}>Verify now (dev)</Link></>}</Alert>}
      </form>}
    </Card></div></div>
  );
}
