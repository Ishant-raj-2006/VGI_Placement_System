import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Async, Button, Card, DataTable, Empty, FormGrid, Input, PageHeader, Select, StatusBadge, Textarea, useToast } from '../../components/ui.jsx';
import { EditModal } from '../../components/Crud.jsx';
import { INTERVIEW_MODES, INTERVIEW_STATUS } from '../../lib/constants.js';
import { dt, fromInputDateTime, label, toInputDateTime } from '../../lib/format.js';

export default function Interviews() {
  const { id } = useParams();
  usePageTitle('Interviews');
  const toast = useToast();
  const drive = useAsync(() => api.get(`/recruiter/drives/${id}`), [id]);
  const state = useAsync(() => api.get(`/recruiter/drives/${id}/interviews`), [id]);
  const [edit, setEdit] = useState(null);
  const setStatus = async (i, status) => { try { await api.put(`/recruiter/interviews/${i._id}`, { status }); toast.success('Status updated'); state.reload(); } catch (e) { toast.error(e); } };
  const save = async (v) => {
    await api.put(`/recruiter/interviews/${edit._id}`, { startsAt: fromInputDateTime(v.startsAt), endsAt: fromInputDateTime(v.endsAt), mode: v.mode, locationOrLink: v.locationOrLink || undefined, instructions: v.instructions || undefined, reason: v.reason || undefined });
    toast.success('Interview rescheduled. The candidate was notified.'); state.reload();
  };
  return (
    <>
      <PageHeader back={<Link to={`/recruiter/drives/${id}`} className="back">← {drive.data?.drive?.jobTitle || 'Drive'}</Link>} title="Interviews" subtitle="Schedule interviews from the round page. Reschedules keep a history and notify the candidate." actions={<Link className="btn" to={`/recruiter/drives/${id}/rounds`}>Go to rounds</Link>} />
      <Card pad={false}>
        <Async state={state} empty={<Empty title="No interviews scheduled">Open a round, select candidates and choose “Schedule interview”.</Empty>}>
          {(items) => (
            <DataTable rows={items} columns={[
              { key: 'when', header: 'When', render: (i) => <strong>{dt(i.startsAt)}</strong> }, { key: 'c', header: 'Candidate', render: (i) => <Link to={`/recruiter/applications/${i.applicationId}`}>{i.candidateName}</Link> },
              { key: 'r', header: 'Round', render: (i) => i.roundId?.name }, { key: 'm', header: 'Mode', render: (i) => label(i.mode) }, { key: 'l', header: 'Location / link', render: (i) => i.locationOrLink || '—' },
              { key: 's', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
              { key: 'a', header: '', render: (i) => ['scheduled', 'rescheduled'].includes(i.status) ? <div className="row gap-sm wrap">
                <Button size="sm" onClick={() => setEdit({ ...i, startsAt: toInputDateTime(i.startsAt), endsAt: toInputDateTime(i.endsAt), locationOrLink: i.locationOrLink || '', instructions: i.instructions || '', reason: '' })}>Reschedule</Button>
                <Button size="sm" onClick={() => setStatus(i, 'completed')}>Mark completed</Button><Button size="sm" onClick={() => setStatus(i, 'no_show')}>No-show</Button><Button size="sm" variant="danger" onClick={() => setStatus(i, 'cancelled')}>Cancel</Button></div> : null },
            ]} />
          )}
        </Async>
      </Card>
      {edit && (
        <EditModal title={`Reschedule — ${edit.candidateName}`} initial={edit} onSave={save} onClose={() => setEdit(null)} wide>
          {({ bind }) => <FormGrid>
            <Input label="Starts" type="datetime-local" required {...bind('startsAt')} /><Input label="Ends" type="datetime-local" {...bind('endsAt')} />
            <Select label="Mode" options={INTERVIEW_MODES} {...bind('mode')} /><Input label="Location / link" {...bind('locationOrLink')} />
            <Input label="Reason for change" wide {...bind('reason')} /><Textarea label="Instructions" rows={3} {...bind('instructions')} />
          </FormGrid>}
        </EditModal>
      )}
    </>
  );
}
