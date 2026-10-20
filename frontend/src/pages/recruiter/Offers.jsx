import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, downloadFile } from '../../lib/api.js';
import { OFFER_STATUSES } from '../../lib/constants.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth.jsx';
import { Async, Button, Card, DataTable, Empty, FilterBar, PageHeader, Pagination, Select, StatusBadge, useConfirm, useListState, useToast } from '../../components/ui.jsx';
import { OfferModal } from './ApplicantDetail.jsx';
import { dt, money } from '../../lib/format.js';

export default function Offers() {
  usePageTitle('Offers');
  const [sp] = useSearchParams();
  const toast = useToast(); const { membership } = useAuth();
  const [dialog, ask] = useConfirm();
  const list = useListState({ limit: 20, driveId: sp.get('driveId') || undefined });
  const state = useAsync(() => api.get('/recruiter/offers', list.params), [JSON.stringify(list.params)]);
  const [edit, setEdit] = useState(null);
  const fileRef = useRef(null); const [uploadFor, setUploadFor] = useState(null);
  const isManager = ['owner', 'hr_manager'].includes(membership?.companyRole);
  const run = async (fn, msg) => { try { await fn(); toast.success(msg); state.reload(); } catch (e) { toast.error(e); } };
  const upload = async (e) => { const f = e.target.files?.[0]; if (!f || !uploadFor) return; await run(() => api.upload(`/recruiter/offers/${uploadFor}/document`, f), 'Offer letter uploaded'); e.target.value = ''; };
  return (
    <>
      {dialog}
      <PageHeader title="Offers" subtitle="Create offers from the applicant page once a candidate is selected. Only the owner or HR manager can issue, withdraw or revise." />
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={upload} aria-label="Choose offer letter PDF" />
      <FilterBar><Select label="Status" placeholder="All" options={OFFER_STATUSES} value={list.params.status || ''} onChange={(e) => list.setFilter('status', e.target.value)} />
        {list.params.driveId && <Button onClick={() => list.setFilter('driveId', undefined)}>Clear drive filter</Button>}</FilterBar>
      <Card pad={false}>
        <Async state={state} empty={<Empty title="No offers yet">Select a candidate in a drive, then create an offer.</Empty>}>
          {(items, meta) => (
            <>
              <DataTable rows={items} columns={[
                { key: 'c', header: 'Candidate', render: (o) => <Link to={`/recruiter/applications/${o.applicationId}`}>{o.candidateName}</Link> }, { key: 'j', header: 'Job', render: (o) => o.jobTitle },
                { key: 'pay', header: 'Compensation', render: (o) => money(o.compensation?.amount, o.compensation?.currency, o.compensation?.kind) }, { key: 'v', header: 'Version', render: (o) => `v${o.version}${o.isCurrent ? '' : ' (old)'}` },
                { key: 'dl', header: 'Respond by', render: (o) => dt(o.responseDeadline) }, { key: 's', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
                { key: 'a', header: '', render: (o) => o.isCurrent ? <div className="row gap-sm wrap">
                  {o.status === 'draft' && <Button size="sm" onClick={() => setEdit(o)}>Edit</Button>}
                  {o.status === 'draft' && isManager && <Button size="sm" variant="primary" onClick={() => ask({ title: 'Issue this offer?', message: 'The student will be notified and can accept or decline.', confirmLabel: 'Issue offer', onConfirm: async () => { await api.post(`/recruiter/offers/${o._id}/issue`); toast.success('Offer issued'); state.reload(); } })}>Issue</Button>}
                  {['issued'].includes(o.status) && isManager && <Button size="sm" onClick={() => setEdit({ ...o, mode: 'revise' })}>Revise</Button>}
                  {['draft', 'issued'].includes(o.status) && isManager && <Button size="sm" variant="danger" onClick={() => ask({ title: 'Withdraw offer?', message: 'The student will be notified.', danger: true, confirmLabel: 'Withdraw', reasonLabel: 'Reason', reasonRequired: true, onConfirm: async (reason) => { await api.post(`/recruiter/offers/${o._id}/withdraw`, { reason }); toast.success('Offer withdrawn'); state.reload(); } })}>Withdraw</Button>}
                  {['draft', 'issued'].includes(o.status) && <Button size="sm" onClick={() => { setUploadFor(o._id); setTimeout(() => fileRef.current?.click(), 0); }}>{o.hasDocument ? 'Replace letter' : 'Attach letter'}</Button>}
                  {o.hasDocument && <Button size="sm" onClick={() => downloadFile(`/files/offers/${o._id}/document`, 'offer-letter.pdf').catch(toast.error)}>Letter</Button>}
                </div> : null },
              ]} />
              <div style={{ padding: '0 1.1rem 1rem' }}><Pagination meta={meta} onPage={list.setPage} /></div>
            </>
          )}
        </Async>
      </Card>
      {edit && <OfferModal offer={edit} jobTitle={edit.jobTitle} onClose={(saved) => { setEdit(null); if (saved) state.reload(); }} />}
    </>
  );
}
