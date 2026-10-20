import { useRef, useState } from 'react';
import { api, downloadFile, openFile } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Alert, Async, Button, Card, DataTable, Empty, PageHeader, useToast } from '../../components/ui.jsx';
import { RowActions } from '../../components/Crud.jsx';
import { dt } from '../../lib/format.js';

const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function Resumes() {
  usePageTitle('Resumes');
  const toast = useToast();
  const state = useAsync(() => api.get('/student/resumes'), []);
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const upload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    try { await api.upload('/student/resumes', file); toast.success('Resume uploaded'); state.reload(); } catch (err) { toast.error(err); } finally { setBusy(false); e.target.value = ''; }
  };
  return (
    <>
      <PageHeader title="Resumes" subtitle="Upload up to 5 resumes (PDF or DOCX, max 2 MB each). Only you, the placement cell and recruiters you apply to can open them." actions={<><input ref={input} type="file" hidden accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={upload} aria-label="Choose resume file" /><Button variant="primary" loading={busy} onClick={() => input.current.click()}>Upload resume</Button></>} />
      <Card pad={false}>
        <Async state={state} empty={<Empty title="No resume uploaded">You need at least one resume to apply to most drives.</Empty>}>
          {(items) => (
            <DataTable rows={items} columns={[
              { key: 'originalName', header: 'File' }, { key: 'sizeBytes', header: 'Size', render: (r) => size(r.sizeBytes) }, { key: 'uploadedAt', header: 'Uploaded', render: (r) => dt(r.uploadedAt) },
              { key: 'a', header: '', render: (r) => <div className="row gap-sm"><Button size="sm" onClick={() => openFile(`/files/resumes/${r._id}`).catch(toast.error)}>View</Button><Button size="sm" onClick={() => downloadFile(`/files/resumes/${r._id}`, r.originalName).catch(toast.error)}>Download</Button><RowActions onDelete={async () => { await api.del(`/student/resumes/${r._id}`); state.reload(); }} deleteMessage="Resumes already used in applications stay available to those recruiters." /></div> },
            ]} />
          )}
        </Async>
      </Card>
    </>
  );
}
