import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadFile } from '../../lib/api.js';
import { usePageTitle } from '../../lib/hooks.js';
import { Alert, Badge, Button, Card, DataTable, ErrorBox, PageHeader, useToast } from '../../components/ui.jsx';
import { label } from '../../lib/format.js';

export default function ImportStudents() {
  usePageTitle('Import students');
  const toast = useToast();
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null); const [committed, setCommitted] = useState(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const choose = (e) => { setFile(e.target.files?.[0] || null); setPreview(null); setCommitted(null); setError(null); };
  const send = async (dryRun) => {
    setBusy(true); setError(null);
    try { const { data } = await api.upload('/admin/students/import', file, {}, { query: { dryRun } }); dryRun ? setPreview(data) : (setCommitted(data), setPreview(null), toast.success('Import complete')); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const res = committed || preview;
  return (
    <>
      <PageHeader back={<Link to="/admin/students" className="back">← Students</Link>} title="Import students (CSV)" subtitle="Institutional data is treated as verified. Always run a dry-run first." actions={<Button onClick={() => downloadFile('/admin/students/import/template', 'student_import_template.csv').catch(toast.error)}>Download template</Button>} />
      <Alert kind="info">Rows are matched by student ID: existing students are updated, new ones are created as inactive accounts that set their own password through “Forgot password”. Nothing is written until you confirm.</Alert>
      <Card title="1. Choose a file">
        <input ref={input} type="file" accept=".csv,text/csv" onChange={choose} aria-label="CSV file" />
        <div className="form-actions"><Button disabled={!file} loading={busy} onClick={() => send(true)}>Validate (dry run)</Button></div>
        <ErrorBox error={error} />
      </Card>
      {res && (
        <Card title={committed ? 'Import result' : '2. Preview'}>
          <div className="stats">{Object.entries(res.summary).map(([k, v]) => <div className="stat" key={k}><div className="stat-value">{v}</div><div className="stat-label">{label(k)}</div></div>)}</div>
          {res.invalid?.length > 0 && <><h3>Rows with problems</h3><DataTable rows={res.invalid.map((r, i) => ({ ...r, _id: i }))} columns={[{ key: 'row', header: 'Row' }, { key: 'e', header: 'Problems', render: (r) => r.errors.join('; ') }]} /></>}
          {res.preview?.length > 0 && <><h3 style={{ marginTop: '1rem' }}>First rows</h3><DataTable rows={res.preview.map((r) => ({ ...r, _id: r.row }))} columns={[{ key: 'row', header: 'Row' }, { key: 'action', header: 'Action', render: (r) => <Badge tone={r.action === 'create' ? 'green' : 'blue'}>{label(r.action)}</Badge> }, { key: 'studentId', header: 'Student ID' }, { key: 'name', header: 'Name' }, { key: 'email', header: 'E-mail' }, { key: 'department', header: 'Dept' }, { key: 'cgpa', header: 'CGPA' }]} /></>}
          {preview && <div className="form-actions"><Button variant="primary" loading={busy} onClick={() => send(false)} disabled={!preview.summary.validRows}>Import {preview.summary.validRows ?? ''} valid row(s)</Button></div>}
        </Card>
      )}
    </>
  );
}
