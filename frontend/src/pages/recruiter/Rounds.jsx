import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Async, Button, Card, Empty, FormGrid, Input, PageHeader, Select, StatusBadge, Textarea, Badge } from '../../components/ui.jsx';
import { EditModal, RowActions } from '../../components/Crud.jsx';
import { ROUND_STATUS, ROUND_TYPES } from '../../lib/constants.js';
import { fromInputDateTime, label, toInputDateTime } from '../../lib/format.js';

const blank = { name: '', type: 'technical_interview', isOptional: false, instructions: '', status: 'planned', startsAt: '', endsAt: '', mode: '', locationOrLink: '' };

export default function Rounds() {
  const { id } = useParams();
  usePageTitle('Rounds');
  const nav = useNavigate();
  const drive = useAsync(() => api.get(`/recruiter/drives/${id}`), [id]);
  const state = useAsync(() => api.get(`/recruiter/drives/${id}/rounds`), [id]);
  const [edit, setEdit] = useState(null);
  const save = async (v) => {
    const body = { name: v.name, type: v.type, isOptional: !!v.isOptional, instructions: v.instructions || undefined, status: v.status,
      schedule: { startsAt: fromInputDateTime(v.startsAt), endsAt: fromInputDateTime(v.endsAt), mode: v.mode || undefined, locationOrLink: v.locationOrLink || undefined } };
    if (v._id) await api.put(`/recruiter/rounds/${v._id}`, body); else await api.post(`/recruiter/drives/${id}/rounds`, body);
    state.reload();
  };
  return (
    <>
      <PageHeader back={<Link to={`/recruiter/drives/${id}`} className="back">← {drive.data?.drive?.jobTitle || 'Drive'}</Link>} title="Recruitment rounds" subtitle="Add candidates to each round, record results and schedule interviews." actions={<Button variant="primary" onClick={() => setEdit({ ...blank })}>Add round</Button>} />
      <Async state={state} empty={<Card><Empty title="No rounds yet">Create rounds such as aptitude, coding, technical interview and HR.</Empty></Card>}>
        {(rounds) => rounds.map((r) => (
          <Card key={r._id} title={`${r.sequence}. ${r.name}`} actions={<><Badge tone="blue">{label(r.type)}</Badge>{r.isOptional && <Badge>Optional</Badge>}<StatusBadge status={r.status} /></>}>
            <div className="row between wrap gap">
              <div className="small muted">{Object.entries(r.participants || {}).map(([k, v]) => `${label(k)}: ${v}`).join(' · ') || 'No candidates yet'}</div>
              <div className="row gap-sm">
                <Button size="sm" variant="primary" onClick={() => nav(`/recruiter/rounds/${r._id}`)}>Candidates & results</Button>
                <RowActions onEdit={() => setEdit({ ...blank, ...r, startsAt: toInputDateTime(r.schedule?.startsAt), endsAt: toInputDateTime(r.schedule?.endsAt), mode: r.schedule?.mode || '', locationOrLink: r.schedule?.locationOrLink || '', instructions: r.instructions || '' })} onDelete={async () => { await api.del(`/recruiter/rounds/${r._id}`); state.reload(); }} deleteMessage="Rounds that already have candidates cannot be deleted; cancel them instead." />
              </div>
            </div>
          </Card>
        ))}
      </Async>
      {edit && (
        <EditModal title={edit._id ? 'Edit round' : 'Add round'} initial={edit} onSave={save} onClose={() => setEdit(null)} wide>
          {({ bind, values, set }) => <FormGrid>
            <Input label="Round name" required {...bind('name')} />
            <Select label="Type" options={ROUND_TYPES} {...bind('type')} />
            <Select label="Status" options={ROUND_STATUS} {...bind('status')} />
            <label className="check"><input type="checkbox" checked={!!values.isOptional} onChange={(e) => set('isOptional', e.target.checked)} /> <span>Optional round</span></label>
            <Input label="Starts" type="datetime-local" {...bind('startsAt')} />
            <Input label="Ends" type="datetime-local" {...bind('endsAt')} />
            <Select label="Mode" placeholder="—" options={['online', 'offline', 'hybrid']} {...bind('mode')} />
            <Input label="Location / link" {...bind('locationOrLink')} />
            <Textarea label="Instructions for candidates" rows={3} {...bind('instructions')} />
          </FormGrid>}
        </EditModal>
      )}
    </>
  );
}
