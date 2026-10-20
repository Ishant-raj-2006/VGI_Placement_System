import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Async, Badge, Button, Card, Empty, FormGrid, Input, PageHeader, Select, Textarea } from '../../components/ui.jsx';
import { EditModal, RowActions } from '../../components/Crud.jsx';
import { d, label, toInputDate } from '../../lib/format.js';

const TYPES = ['internship', 'certification', 'achievement', 'experience'];
const blank = { type: 'internship', title: '', organization: '', description: '', startDate: '', endDate: '', url: '' };

export default function Experience() {
  usePageTitle('Experience & certificates');
  const state = useAsync(() => api.get('/student/profile'), []);
  const [edit, setEdit] = useState(null);
  const save = async (v) => {
    const body = { type: v.type, title: v.title, organization: v.organization || undefined, description: v.description || undefined, startDate: v.startDate || undefined, endDate: v.endDate || undefined, url: v.url || undefined };
    if (v._id) await api.put(`/student/experiences/${v._id}`, body); else await api.post('/student/experiences', body);
    state.reload();
  };
  return (
    <>
      <PageHeader title="Experience & certificates" subtitle="Internships, certifications and achievements." actions={<Button variant="primary" onClick={() => setEdit({ ...blank })}>Add entry</Button>} />
      <Async state={state}>
        {({ profile }) => profile.experiences?.length ? profile.experiences.map((e) => (
          <Card key={e._id} title={e.title} actions={<><Badge tone="blue">{label(e.type)}</Badge><RowActions onEdit={() => setEdit({ ...blank, ...e, startDate: toInputDate(e.startDate), endDate: toInputDate(e.endDate), organization: e.organization || '', description: e.description || '', url: e.url || '' })} onDelete={async () => { await api.del(`/student/experiences/${e._id}`); state.reload(); }} /></>}>
            <div className="muted small">{e.organization}{(e.startDate || e.endDate) && ` · ${d(e.startDate)} – ${e.endDate ? d(e.endDate) : 'present'}`}</div>
            {e.description && <p>{e.description}</p>}
            {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer">{e.url}</a>}
          </Card>
        )) : <Card><Empty title="No entries yet">Add internships, certifications or achievements to strengthen your profile.</Empty></Card>}
      </Async>
      {edit && (
        <EditModal title={edit._id ? 'Edit entry' : 'Add entry'} initial={edit} onSave={save} onClose={() => setEdit(null)} wide>
          {({ bind }) => <FormGrid>
            <Select label="Type" options={TYPES} {...bind('type')} />
            <Input label="Title" required {...bind('title')} />
            <Input label="Organization" {...bind('organization')} />
            <Input label="Link" type="url" placeholder="https://" {...bind('url')} />
            <Input label="Start date" type="date" {...bind('startDate')} />
            <Input label="End date" type="date" {...bind('endDate')} />
            <Textarea label="Description" rows={3} {...bind('description')} />
          </FormGrid>}
        </EditModal>
      )}
    </>
  );
}
