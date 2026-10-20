import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useAsync, useDebounced, usePageTitle } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth.jsx';
import { Async, Badge, Button, Card, DataTable, FilterBar, FormGrid, Input, PageHeader, Pagination, SearchInput, Select, StatusBadge, useConfirm, useListState, useToast } from '../../components/ui.jsx';
import { EditModal } from '../../components/Crud.jsx';
import { dt, label } from '../../lib/format.js';

export default function Users() {
  usePageTitle('User management');
  const toast = useToast(); const { user: me } = useAuth(); const [dialog, ask] = useConfirm();
  const list = useListState({ limit: 25 });
  const [q, setQ] = useState(''); const dq = useDebounced(q);
  const params = { ...list.params, q: dq };
  const state = useAsync(() => api.get('/admin/users', params), [JSON.stringify(params)]);
  const [create, setCreate] = useState(false);
  const run = async (fn, msg) => { try { await fn(); toast.success(msg); state.reload(); } catch (e) { toast.error(e); } };
  return (
    <>
      {dialog}
      <PageHeader title="User management" subtitle="Create staff accounts, change staff roles, lock/unlock and revoke sessions." actions={<Button variant="primary" onClick={() => setCreate(true)}>Create staff account</Button>} />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Name or e-mail…" />
        <Select label="Role" placeholder="All" options={['student', 'recruiter', 'tpo', 'super_admin']} value={list.params.role || ''} onChange={(e) => list.setFilter('role', e.target.value)} />
        <Select label="Account" placeholder="All" options={['active', 'deactivated', 'pending_activation']} value={list.params.accountStatus || ''} onChange={(e) => list.setFilter('accountStatus', e.target.value)} />
      </FilterBar>
      <Card pad={false}>
        <Async state={state}>
          {(items, meta) => (
            <>
              <DataTable rows={items} columns={[
                { key: 'n', header: 'Name', render: (u) => <>{u.name}{u._id === me._id && <Badge tone="blue"> you</Badge>}</> }, { key: 'e', header: 'E-mail', render: (u) => u.email },
                { key: 'r', header: 'Role', render: (u) => (['tpo', 'super_admin'].includes(u.role) && u._id !== me._id ? <select aria-label={`Role for ${u.name}`} value={u.role} onChange={(e) => ask({ title: 'Change role?', message: `${u.name} will become ${label(e.target.value)} and be signed out everywhere.`, confirmLabel: 'Change role', onConfirm: async () => { await api.put(`/admin/users/${u._id}/role`, { role: e.target.value }); toast.success('Role changed'); state.reload(); } })}><option value="tpo">TPO</option><option value="super_admin">Super admin</option></select> : <StatusBadge status={u.role} />) },
                { key: 's', header: 'Status', render: (u) => <><StatusBadge status={u.accountStatus} />{u.locked && <> <Badge tone="red">Locked</Badge></>}</> }, { key: 'l', header: 'Last login', render: (u) => dt(u.lastLoginAt) },
                { key: 'a', header: '', render: (u) => u._id === me._id ? null : <div className="row gap-sm wrap">
                  {u.locked && <Button size="sm" onClick={() => run(() => api.post(`/admin/users/${u._id}/unlock`), 'Unlocked')}>Unlock</Button>}
                  <Button size="sm" onClick={() => run(() => api.post(`/admin/users/${u._id}/revoke-sessions`), 'Sessions revoked')}>Sign out everywhere</Button>
                  {u.accountStatus === 'deactivated' ? <Button size="sm" onClick={() => run(() => api.post(`/admin/users/${u._id}/activate`), 'Activated')}>Activate</Button> : <Button size="sm" variant="danger" onClick={() => ask({ title: `Deactivate ${u.name}?`, message: 'They are signed out and cannot log in.', danger: true, confirmLabel: 'Deactivate', onConfirm: async () => { await api.post(`/admin/users/${u._id}/deactivate`); toast.success('Deactivated'); state.reload(); } })}>Deactivate</Button>}
                </div> },
              ]} />
              <div style={{ padding: '0 1.1rem 1rem' }}><Pagination meta={meta} onPage={list.setPage} /></div>
            </>
          )}
        </Async>
      </Card>
      {create && (
        <EditModal title="Create staff account" initial={{ name: '', email: '', password: '', role: 'tpo' }} onClose={(saved) => { setCreate(false); if (saved) state.reload(); }} onSave={async (v) => { await api.post('/admin/users', v); toast.success('Account created'); }} wide>
          {({ bind }) => <FormGrid><Input label="Name" required {...bind('name')} /><Input label="E-mail" type="email" required {...bind('email')} /><Input label="Temporary password" type="password" required hint="8+ chars with upper-case, lower-case, digit. Ask the user to change it after first login." {...bind('password')} /><Select label="Role" options={[{ value: 'tpo', label: 'Training & Placement Officer' }, { value: 'super_admin', label: 'Super admin' }]} {...bind('role')} /></FormGrid>}
        </EditModal>
      )}
    </>
  );
}
