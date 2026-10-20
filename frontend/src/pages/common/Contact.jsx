import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useForm, usePageTitle } from '../../lib/hooks.js';
import { Alert, Button, Card, FormGrid, Input, Textarea } from '../../components/ui.jsx';

export default function Contact() {
  usePageTitle('Contact the placement cell');
  const f = useForm({ name: '', email: '', subject: '', message: '' });
  const [state, setState] = useState({ busy: false, done: null, error: null });
  const submit = async (e) => {
    e.preventDefault(); f.setErrors({}); setState({ busy: true, done: null, error: null });
    try { const { data } = await api.post('/support/contact', f.values); setState({ busy: false, done: data, error: null }); f.reset(); }
    catch (err) { f.setErrors(err.fieldErrors); setState({ busy: false, done: null, error: err }); }
  };
  return (
    <div className="auth-wrap"><div className="auth-card wide stack">
      <Link to="/" className="brand" style={{ color: 'var(--text)' }}><img className="brand-logo" src="/logo.png" alt="" /> CPMS</Link>
      <Card title="Contact / support">
        {state.done && <Alert kind="success">{state.done.message}</Alert>}
        {state.error && <Alert kind="error">{state.error.message}</Alert>}
        <p className="muted">Use this form for questions before you have an account. Logged-in users can raise tickets from the Support page.</p>
        <form onSubmit={submit}>
          <FormGrid>
            <Input label="Your name" required {...f.bind('name')} />
            <Input label="E-mail" type="email" required {...f.bind('email')} />
            <Input label="Subject" required wide {...f.bind('subject')} />
            <Textarea label="Message" required rows={6} {...f.bind('message')} />
          </FormGrid>
          <div className="form-actions"><Button type="submit" variant="primary" loading={state.busy}>Send message</Button></div>
        </form>
      </Card>
    </div></div>
  );
}
