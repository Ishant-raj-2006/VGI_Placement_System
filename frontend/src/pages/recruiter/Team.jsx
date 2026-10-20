import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth.jsx';
import { Alert, Async, Button, Card, DataTable, PageHeader, StatusBadge, useConfirm, useToast } from '../../components/ui.jsx';
import { COMPANY_ROLES } from '../../lib/constants.js';
import { label } from '../../lib/format.js';

export default function Team() {
  usePageTitle('Team');
  const toast = useToast(); const { user, company } = useAuth();
  const [dialog, ask] = useConfirm();
  const state = useAsync(() => api.get('/recruiter/team'), []);
  const run = async (fn, msg) => { try { await fn(); toast.success(msg); state.reload(); } catch (e) { toast.error(e); } };
  return (
    <>
      {dialog}
      <PageHeader title="Team" subtitle="Colleagues who can manage recruitment for your company." />
      <Alert kind="info">To invite a colleague, ask them to register as a recruiter and choose “join an existing company” using this company ID: <code>{company?._id}</code>. Their access appears here for your approval.</Alert>
      <Card pad={false}>
        <Async state={state}>
          {(items) => (
            <DataTable rows={items} columns={[
              { key: 'name', header: 'Name', render: (m) => m.user?.name }, { key: 'email', header: 'E-mail', render: (m) => m.user?.email },
              { key: 'role', header: 'Role', render: (m) => String(m.user?._id) === String(user._id) || m.companyRole === 'owner' ? label(m.companyRole) : <select aria-label="Company role" value={m.companyRole} onChange={(e) => run(() => api.put(`/recruiter/team/${m._id}/role`, { companyRole: e.target.value }), 'Role updated')}>{COMPANY_ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}</select> },
              { key: 'status', header: 'Access', render: (m) => <StatusBadge status={m.status} /> },
              { key: 'a', header: '', render: (m) => m.companyRole === 'owner' ? null : <div className="row gap-sm">
                {m.status === 'pending' && <Button size="sm" variant="primary" onClick={() => run(() => api.post(`/recruiter/team/${m._id}/approve`), 'Access approved')}>Approve</Button>}
                <Button size="sm" variant="danger" onClick={() => ask({ title: `Remove ${m.user?.name}?`, message: 'They will lose access to this company immediately.', confirmLabel: 'Remove', danger: true, onConfirm: () => api.post(`/recruiter/team/${m._id}/remove`).then(() => { toast.success('Removed'); state.reload(); }) })}>Remove</Button></div> },
            ]} />
          )}
        </Async>
      </Card>
    </>
  );
}
