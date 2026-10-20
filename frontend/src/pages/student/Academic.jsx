import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAsync, useForm, usePageTitle } from '../../lib/hooks.js';
import { Alert, Async, Button, Card, DataTable, FormGrid, Input, PageHeader, Select, StatusBadge } from '../../components/ui.jsx';
import { EditModal, RowActions } from '../../components/Crud.jsx';
import { label, num } from '../../lib/format.js';
import { useToast } from '../../components/ui.jsx';

const TYPES = [['class_10', 'Class 10'], ['class_12', 'Class 12'], ['diploma', 'Diploma'], ['semester', 'Semester result'], ['degree_completion', 'Degree completion']].map(([value, l]) => ({ value, label: l }));
const SCALES = [['cgpa_10', 'CGPA (out of 10)'], ['cgpa_4', 'CGPA (out of 4)'], ['percentage', 'Percentage']].map(([value, l]) => ({ value, label: l }));
const blank = { recordType: 'semester', semester: '', score: '', scoreScale: 'cgpa_10', institution: '', board: '', yearOfPassing: '' };

export default function Academic() {
  usePageTitle('Academic details');
  const toast = useToast();
  const state = useAsync(() => api.get('/student/profile'), []);
  const f = useForm({ cgpa: '', activeBacklogs: '', totalBacklogs: '', tenthPercentage: '', twelfthPercentage: '', diplomaPercentage: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const [edit, setEdit] = useState(null);
  const d = state.data;
  useEffect(() => {
    if (!d) return;
    const e = d.profile.academicSummary?.entered || {};
    f.setValues(Object.fromEntries(['cgpa', 'activeBacklogs', 'totalBacklogs', 'tenthPercentage', 'twelfthPercentage', 'diplomaPercentage'].map((k) => [k, e[k] ?? ''])));
  }, [d?.profile?._id, d?.profile?.academicSummary]); // eslint-disable-line

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError(null); f.setErrors({});
    const body = Object.fromEntries(Object.entries(f.values).map(([k, v]) => [k, v === '' ? null : Number(v)]));
    try {
      const { data } = await api.put('/student/profile', { academic: body });
      toast.success(data.verificationReset ? 'Saved. The placement cell will verify the updated values.' : 'Saved'); state.reload();
    } catch (err) { setError(err); f.setErrors(err.fieldErrors); } finally { setBusy(false); }
  };

  const saveRecord = async (v) => {
    const body = { recordType: v.recordType, score: Number(v.score), scoreScale: v.scoreScale, ...(v.recordType === 'semester' ? { semester: Number(v.semester) } : {}), institution: v.institution || undefined, board: v.board || undefined, yearOfPassing: v.yearOfPassing ? Number(v.yearOfPassing) : undefined };
    if (v._id) await api.put(`/student/academic-records/${v._id}`, body); else await api.post('/student/academic-records', body);
    state.reload();
  };

  return (
    <>
      <PageHeader title="Academic details" subtitle="These values are used to decide your eligibility once the placement cell verifies them." />
      <Async state={state}>
        {(data) => {
          const ver = data.profile.academicSummary?.verified;
          return (
            <>
              <Alert kind={data.profile.verificationStatus === 'verified' ? 'success' : 'warn'}>
                Verification status: <StatusBadge status={data.profile.verificationStatus} /> {data.profile.verificationNote ? `— ${data.profile.verificationNote}` : ''}
                <div className="small">Values you enter are never treated as verified. Editing them asks the placement cell to verify again.</div>
              </Alert>
              <Card title="Academic summary">
                {error && <Alert kind="error">{error.message}</Alert>}
                <form onSubmit={save}>
                  <FormGrid>
                    <Input label="Current CGPA" type="number" step="0.01" min="0" max="10" {...f.bind('cgpa')} />
                    <Input label="Active backlogs" type="number" min="0" {...f.bind('activeBacklogs')} />
                    <Input label="Total backlogs (history)" type="number" min="0" {...f.bind('totalBacklogs')} />
                    <Input label="10th percentage" type="number" step="0.01" min="0" max="100" {...f.bind('tenthPercentage')} />
                    <Input label="12th percentage" type="number" step="0.01" min="0" max="100" {...f.bind('twelfthPercentage')} />
                    <Input label="Diploma percentage" type="number" step="0.01" min="0" max="100" hint="If you did a diploma instead of 12th" {...f.bind('diplomaPercentage')} />
                  </FormGrid>
                  <div className="form-actions"><Button type="submit" variant="primary" loading={busy}>Save academic summary</Button></div>
                </form>
                {ver?.cgpa != null && <p className="small muted" style={{ marginTop: '.75rem' }}>Verified by the placement cell: CGPA {num(ver.cgpa, 2)}, active backlogs {num(ver.activeBacklogs)}.</p>}
              </Card>
              <Card title="Detailed records" actions={<Button variant="primary" size="sm" onClick={() => setEdit({ ...blank })}>Add record</Button>} pad={false}>
                <DataTable rows={data.academicRecords} empty={<p className="muted" style={{ padding: '1rem' }}>No detailed records yet (optional: semester results, board marks).</p>} columns={[
                  { key: 'recordType', header: 'Type', render: (r) => `${label(r.recordType)}${r.semester ? ` ${r.semester}` : ''}` },
                  { key: 'score', header: 'Score', render: (r) => `${r.score} ${r.scoreScale === 'percentage' ? '%' : r.scoreScale === 'cgpa_4' ? '/ 4' : '/ 10'}` },
                  { key: 'institution', header: 'Institution / board', render: (r) => r.institution || r.board || '—' },
                  { key: 'yearOfPassing', header: 'Year' },
                  { key: 'verificationStatus', header: 'Status', render: (r) => <StatusBadge status={r.verificationStatus} /> },
                  { key: 'a', header: '', render: (r) => <RowActions onEdit={() => setEdit({ ...r, semester: r.semester ?? '', institution: r.institution ?? '', board: r.board ?? '', yearOfPassing: r.yearOfPassing ?? '' })} onDelete={async () => { await api.del(`/student/academic-records/${r._id}`); state.reload(); }} /> },
                ]} />
              </Card>
              {edit && (
                <EditModal title={edit._id ? 'Edit record' : 'Add academic record'} initial={edit} onSave={saveRecord} onClose={() => setEdit(null)}>
                  {({ values, bind }) => (
                    <FormGrid>
                      <Select label="Record type" options={TYPES} {...bind('recordType')} />
                      {values.recordType === 'semester' && <Input label="Semester" type="number" min="1" max="12" required {...bind('semester')} />}
                      <Input label="Score" type="number" step="0.01" required {...bind('score')} />
                      <Select label="Scale" options={SCALES} {...bind('scoreScale')} />
                      <Input label="Institution" {...bind('institution')} />
                      <Input label="Board / university" {...bind('board')} />
                      <Input label="Year of passing" type="number" {...bind('yearOfPassing')} />
                    </FormGrid>
                  )}
                </EditModal>
              )}
            </>
          );
        }}
      </Async>
    </>
  );
}
