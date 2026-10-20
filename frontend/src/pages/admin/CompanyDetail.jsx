import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Alert, Async, Button, Card, DataTable, KV, PageHeader, StatusBadge, useConfirm, useToast } from '../../components/ui.jsx';
import { d, dt, label } from '../../lib/format.js';

export default function CompanyDetail() {
  const { id } = useParams();
  usePageTitle('Company');
  const toast = useToast(); const [dialog, ask] = useConfirm();
  const state = useAsync(() => api.get(`/admin/companies/${id}`), [id]);
  const action = (path, cfg) => ask({ confirmLabel: cfg.label, ...cfg, onConfirm: async (reason) => { const { data } = await api.post(`/admin/companies/${id}/${path}`, { reason }); toast.success(data.pausedDrives ? `${cfg.done}. ${data.pausedDrives} drive(s) paused.` : cfg.done); state.reload(); } });
  return (
    <Async state={state}>
      {({ company: c, members, drives }) => (
        <>
          {dialog}
          <PageHeader back={<Link to="/admin/companies" className="back">← Companies</Link>} title={c.name} subtitle={c.industry} actions={<>
            <StatusBadge status={c.verificationStatus} />
            {c.verificationStatus === 'pending' && <Button onClick={() => action('review', { title: 'Start review?', done: 'Moved to under review', label: 'Start review' })}>Start review</Button>}
            {c.verificationStatus !== 'verified' && <Button variant="success" onClick={() => action('approve', { title: 'Verify this company?', message: 'Recruiters can then submit drives for approval.', done: 'Company verified', label: 'Verify' })}>Verify</Button>}
            {['pending', 'under_review', 'verified'].includes(c.verificationStatus) && <Button variant="danger" onClick={() => action('reject', { title: 'Reject this company?', reasonLabel: 'Reason (shown to the company)', reasonRequired: true, danger: true, done: 'Company rejected', label: 'Reject' })}>Reject</Button>}
            {c.verificationStatus !== 'suspended' && <Button variant="danger" onClick={() => action('suspend', { title: 'Suspend this company?', message: 'Its published drives are paused (per policy) and its recruiters lose access to actions until reinstated.', reasonLabel: 'Reason', reasonRequired: true, danger: true, done: 'Company suspended', label: 'Suspend' })}>Suspend</Button>}
          </>} />
          {c.statusReason && <Alert kind="warn"><strong>Last decision note:</strong> {c.statusReason}</Alert>}
          <div className="grid grid-2">
            <Card title="Company details"><KV items={[['Website', c.website ? <a href={c.website} target="_blank" rel="noopener noreferrer">{c.website}</a> : null], ['Headquarters', c.headquarters], ['Registration no.', c.registrationNumber], ['Contact e-mail', c.contactEmail], ['Contact phone', c.contactPhone], ['Registered', dt(c.createdAt)], ['Verified', dt(c.verifiedAt)]]} />{c.description && <p style={{ marginTop: '.75rem' }}>{c.description}</p>}</Card>
            <Card title="Team" pad={false}><DataTable rows={members} columns={[{ key: 'n', header: 'Name', render: (m) => m.user?.name }, { key: 'e', header: 'E-mail', render: (m) => m.user?.email }, { key: 'r', header: 'Role', render: (m) => label(m.companyRole) }, { key: 's', header: 'Access', render: (m) => <StatusBadge status={m.status} /> }]} /></Card>
          </div>
          <Card title="Drives" pad={false}><DataTable rows={drives} empty={<p className="muted" style={{ padding: '1rem' }}>No drives.</p>} columns={[{ key: 'j', header: 'Job', render: (x) => <Link to={`/admin/drives/${x._id}`}>{x.jobTitle}</Link> }, { key: 'a', header: 'Approval', render: (x) => <StatusBadge status={x.approvalStatus} /> }, { key: 'p', header: 'Publication', render: (x) => <StatusBadge status={x.publicationStatus} /> }, { key: 'd', header: 'Deadline', render: (x) => d(x.applicationDeadline) }]} /></Card>
        </>
      )}
    </Async>
  );
}
