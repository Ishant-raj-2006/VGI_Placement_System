import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAsync, useForm, usePageTitle } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth.jsx';
import { Alert, Async, Button, Card, FormGrid, Input, KV, PageHeader, StatusBadge, Textarea, useToast } from '../../components/ui.jsx';
import { clean, dt } from '../../lib/format.js';

export default function Company() {
  usePageTitle('Company profile');
  const toast = useToast();
  const { refresh, membership } = useAuth();
  const state = useAsync(() => api.get('/recruiter/company'), []);
  const f = useForm({});
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const canEdit = ['owner', 'hr_manager'].includes(membership?.companyRole);
  useEffect(() => {
    const c = state.data?.company; if (!c) return;
    f.setValues({ website: c.website || '', industry: c.industry || '', headquarters: c.headquarters || '', contactEmail: c.contactEmail || '', contactPhone: c.contactPhone || '', registrationNumber: c.registrationNumber || '', description: c.description || '' });
  }, [state.data?.company?._id]); // eslint-disable-line
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError(null); f.setErrors({});
    try { await api.put('/recruiter/company', clean(f.values)); toast.success('Company profile saved'); state.reload(); refresh(); } catch (err) { setError(err); f.setErrors(err.fieldErrors); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Company profile" subtitle="Shown to students on your drives." />
      <Async state={state}>
        {({ company }) => (
          <>
            <Card title={company.name} actions={<StatusBadge status={company.verificationStatus} />}>
              <KV items={[['Registered', dt(company.createdAt)], ['Verified on', company.verifiedAt ? dt(company.verifiedAt) : '—']]} />
              <p className="small muted" style={{ marginTop: '.75rem' }}>The company name can only be changed by the placement cell.</p>
            </Card>
            <Card title="Details">
              {!canEdit && <Alert kind="info">Only the company owner or HR manager can edit these details.</Alert>}
              {error && <Alert kind="error">{error.message}</Alert>}
              <form onSubmit={save}>
                <FormGrid>
                  <Input label="Website" type="url" placeholder="https://" disabled={!canEdit} {...f.bind('website')} />
                  <Input label="Industry" disabled={!canEdit} {...f.bind('industry')} />
                  <Input label="Headquarters" disabled={!canEdit} {...f.bind('headquarters')} />
                  <Input label="Registration number" disabled={!canEdit} {...f.bind('registrationNumber')} />
                  <Input label="Contact e-mail" type="email" disabled={!canEdit} {...f.bind('contactEmail')} />
                  <Input label="Contact phone" disabled={!canEdit} {...f.bind('contactPhone')} />
                  <Textarea label="About the company" rows={5} disabled={!canEdit} {...f.bind('description')} />
                </FormGrid>
                {canEdit && <div className="form-actions"><Button type="submit" variant="primary" loading={busy}>Save</Button></div>}
              </form>
            </Card>
          </>
        )}
      </Async>
    </>
  );
}
