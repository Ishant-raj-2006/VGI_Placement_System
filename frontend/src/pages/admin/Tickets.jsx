import { useState } from 'react';
import { api } from '../../lib/api.js';
import { TICKET_STATUS, TICKET_TYPES } from '../../lib/constants.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Alert, Async, Badge, Button, Card, DataTable, Empty, FilterBar, FormGrid, PageHeader, Pagination, Select, StatusBadge, Textarea, useListState, useToast } from '../../components/ui.jsx';
import { EditModal } from '../../components/Crud.jsx';
import { dt, label } from '../../lib/format.js';

export default function Tickets() {
  usePageTitle('Tickets');
  const toast = useToast();
  const list = useListState({ limit: 25 });
  const state = useAsync(() => api.get('/admin/tickets', list.params), [JSON.stringify(list.params)]);
  const [open, setOpen] = useState(null);
  const save = async (v) => { await api.put(`/admin/tickets/${open._id}`, { status: v.status, response: v.response || undefined }); toast.success('Ticket updated'); state.reload(); };
  return (
    <>
      <PageHeader title="Tickets & complaints" subtitle="Support requests, complaints, correction requests and contact-form messages." />
      <FilterBar>
        <Select label="Status" placeholder="All" options={TICKET_STATUS} value={list.params.status || ''} onChange={(e) => list.setFilter('status', e.target.value)} />
        <Select label="Type" placeholder="All" options={TICKET_TYPES} value={list.params.type || ''} onChange={(e) => list.setFilter('type', e.target.value)} />
      </FilterBar>
      <Card pad={false}>
        <Async state={state} empty={<Empty title="No tickets" />}>
          {(items, meta) => (
            <>
              <DataTable rows={items} columns={[
                { key: 't', header: 'Type', render: (t) => <Badge tone="blue">{label(t.type)}</Badge> }, { key: 's', header: 'Subject', render: (t) => <strong>{t.subject}</strong> },
                { key: 'by', header: 'From', render: (t) => (t.createdBy ? `${t.createdBy.name} (${t.createdBy.role})` : `${t.contactName || ''} <${t.contactEmail || ''}>`) },
                { key: 'st', header: 'Status', render: (t) => <StatusBadge status={t.status} /> }, { key: 'd', header: 'Raised', render: (t) => dt(t.createdAt) },
                { key: 'a', header: '', render: (t) => <Button size="sm" onClick={() => setOpen(t)}>Open</Button> },
              ]} />
              <div style={{ padding: '0 1.1rem 1rem' }}><Pagination meta={meta} onPage={list.setPage} /></div>
            </>
          )}
        </Async>
      </Card>
      {open && (
        <EditModal title={open.subject} initial={{ status: open.status, response: '' }} onSave={save} onClose={() => setOpen(null)} wide>
          {({ bind }) => <>
            <p style={{ whiteSpace: 'pre-wrap' }}>{open.message}</p>
            {open.payload?.field && <Alert kind="info">Correction requested: <strong>{open.payload.field}</strong> → {String(open.payload.requestedValue)}. Apply it from the student page, then resolve this ticket.</Alert>}
            {open.responses?.map((r, i) => <Alert key={i} kind="info"><strong>{r.by?.name || 'Staff'}</strong>: {r.message}</Alert>)}
            <FormGrid><Select label="Status" options={TICKET_STATUS} {...bind('status')} /><Textarea label="Reply to the requester" rows={3} {...bind('response')} /></FormGrid>
          </>}
        </EditModal>
      )}
    </>
  );
}
