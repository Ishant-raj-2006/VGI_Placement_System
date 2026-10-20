import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Async, Button, Card, Empty, FormGrid, Input, PageHeader, Textarea } from '../../components/ui.jsx';
import { EditModal, RowActions } from '../../components/Crud.jsx';
import { csv } from '../../lib/format.js';

const blank = { title: '', description: '', technologies: '', projectUrl: '', repositoryUrl: '' };

export default function Projects() {
  usePageTitle('Projects');
  const state = useAsync(() => api.get('/student/projects'), []);
  const [edit, setEdit] = useState(null);
  const save = async (v) => {
    const body = { title: v.title, description: v.description || undefined, technologies: csv(v.technologies), projectUrl: v.projectUrl || undefined, repositoryUrl: v.repositoryUrl || undefined };
    if (v._id) await api.put(`/student/projects/${v._id}`, body); else await api.post('/student/projects', body);
    state.reload();
  };
  return (
    <>
      <PageHeader title="Projects" subtitle="Showcase what you have built." actions={<Button variant="primary" onClick={() => setEdit({ ...blank })}>Add project</Button>} />
      <Async state={state} empty={<Card><Empty title="No projects yet">Add academic or personal projects.</Empty></Card>}>
        {(items) => items.map((p) => (
          <Card key={p._id} title={p.title} actions={<RowActions onEdit={() => setEdit({ ...blank, ...p, technologies: (p.technologies || []).join(', '), description: p.description || '', projectUrl: p.projectUrl || '', repositoryUrl: p.repositoryUrl || '' })} onDelete={async () => { await api.del(`/student/projects/${p._id}`); state.reload(); }} />}>
            {p.description && <p>{p.description}</p>}
            {p.technologies?.length > 0 && <div className="chips">{p.technologies.map((t) => <span className="chip" key={t}>{t}</span>)}</div>}
            <div className="row gap wrap small" style={{ marginTop: '.5rem' }}>{p.projectUrl && <a href={p.projectUrl} target="_blank" rel="noopener noreferrer">Live link</a>}{p.repositoryUrl && <a href={p.repositoryUrl} target="_blank" rel="noopener noreferrer">Repository</a>}</div>
          </Card>
        ))}
      </Async>
      {edit && (
        <EditModal title={edit._id ? 'Edit project' : 'Add project'} initial={edit} onSave={save} onClose={() => setEdit(null)} wide>
          {({ bind }) => <FormGrid>
            <Input label="Title" required wide {...bind('title')} />
            <Textarea label="Description" rows={4} {...bind('description')} />
            <Input label="Technologies" hint="Comma separated" wide {...bind('technologies')} />
            <Input label="Project link" type="url" placeholder="https://" {...bind('projectUrl')} />
            <Input label="Repository link" type="url" placeholder="https://" {...bind('repositoryUrl')} />
          </FormGrid>}
        </EditModal>
      )}
    </>
  );
}
