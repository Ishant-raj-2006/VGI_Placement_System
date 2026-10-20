import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useAsync, useForm, usePageTitle } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth.jsx';
import { Alert, Async, Button, Card, Empty, FormGrid, Input, Modal, PageHeader, Select, StatusBadge, Textarea, useToast } from '../../components/ui.jsx';
import { dt, label } from '../../lib/format.js';

export default function Support() {
  usePageTitle('Support');
  const { user } = useAuth();
  const toast = useToast();
  const state = useAsync(() => api.get('/support/tickets'), []);
  const [open, setOpen] = useState(false);
  const types = user.role === 'student' ? ['support', 'complaint', 'correction_request'] : ['support', 'complaint'];
  const f = useForm({ type: 'support', subject: '', message: '', field: '', requestedValue: '' });
  const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null); f.setErrors({});
    const v = f.values;
    try {
      await api.post('/support/tickets', { type: v.type, subject: v.subject, message: v.message, ...(v.type === 'correction_request' && v.field ? { payload: { field: v.field, requestedValue: v.requestedValue } } : {}) });
      toast.success('Your request was submitted'); setOpen(false); f.reset(); state.reload();
    } catch (e2) { setErr(e2); f.setErrors(e2.fieldErrors); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Support & complaints" subtitle="Ask a question, raise a complaint or request a correction to your record." actions={<Button variant="primary" onClick={() => setOpen(true)}>New request</Button>} />
      <Async state={state} empty={<Card><Empty title="No requests yet">Use “New request” to contact the placement cell.</Empty></Card>}>
        {(items) => items.map((t) => (
          <Card key={t._id} title={t.subject} actions={<><StatusBadge status={t.status} /><span className="muted small">{label(t.type)}</span></>}>
            <p style={{ whiteSpace: 'pre-wrap' }}>{t.message}</p>
            <div className="muted small">Raised {dt(t.createdAt)}</div>
            {t.responses?.length > 0 && <div className="stack-sm" style={{ marginTop: '.8rem' }}>{t.responses.map((r, i) => <Alert key={i} kind="info"><strong>{r.by?.name || 'Placement cell'}</strong> · <span className="small muted">{dt(r.createdAt)}</span><br />{r.message}</Alert>)}</div>}
          </Card>
        ))}
      </Async>
      {open && (
        <Modal title="New request" onClose={() => setOpen(false)} footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Submit</Button></>}>
          {err && <Alert kind="error">{err.message}</Alert>}
          <form onSubmit={submit}><FormGrid>
            <Select label="Type" options={types} wide {...f.bind('type')} />
            <Input label="Subject" required wide {...f.bind('subject')} />
            {f.values.type === 'correction_request' && <>
              <Input label="Field to correct" placeholder="e.g. CGPA" {...f.bind('field')} />
              <Input label="Correct value" {...f.bind('requestedValue')} />
            </>}
            <Textarea label="Details" required rows={5} {...f.bind('message')} />
          </FormGrid></form>
        </Modal>
      )}
    </>
  );
}
