import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Alert, Async, Button, Card, DataTable, ErrorBox, FormGrid, Input, Modal, PageHeader, Select, StatusBadge, Textarea, useConfirm, useToast } from '../../components/ui.jsx';
import { EditModal } from '../../components/Crud.jsx';
import { INTERVIEW_MODES, PARTICIPANT_RESULT } from '../../lib/constants.js';
import { dt, fromInputDateTime, label } from '../../lib/format.js';

function AddCandidates({ round, onClose }) {
  const toast = useToast();
  const cands = useAsync(async () => {
    const out = [];
    for (const status of ['shortlisted', 'assessment', 'interview']) { const { data } = await api.get(`/recruiter/drives/${round.driveId}/applications`, { status, limit: 100 }); out.push(...data); }
    return { data: out };
  }, [round._id]);
  const parts = useAsync(() => api.get(`/recruiter/rounds/${round._id}/participants`), [round._id]);
  const already = new Set((parts.data?.participants || []).map((p) => String(p.applicationId)));
  const rows = (cands.data || []).filter((c) => !already.has(String(c.applicationId))).map((c) => ({ ...c, _id: c.applicationId }));
  const [sel, setSel] = useState(new Set()); const [busy, setBusy] = useState(false); const [error, setError] = useState(null); const [ok, setOk] = useState(false);
  const submit = async () => {
    setBusy(true); setError(null);
    try { const { data } = await api.post(`/recruiter/rounds/${round._id}/participants`, { applicationIds: [...sel], confirm: true }); toast.success(`${data.added} candidate(s) added`); const failed = data.results.filter((r) => !r.ok); if (failed.length) toast.error(`${failed.length} could not be added: ${failed[0].error}`); onClose(true); } catch (e) { setError(e); setBusy(false); }
  };
  return (
    <Modal wide title={`Add candidates to “${round.name}”`} onClose={() => !busy && onClose(false)} footer={<><Button onClick={() => onClose(false)} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} disabled={!sel.size || (sel.size > 1 && !ok)} onClick={submit}>Add {sel.size || ''} selected</Button></>}>
      <ErrorBox error={error} />
      <p className="muted small">Only shortlisted candidates (or those already in process) can be added to a round.</p>
      <Async state={cands} empty={<p className="muted">No shortlisted candidates available. Shortlist applicants first.</p>}>
        {() => rows.length ? <><DataTable rows={rows} selectable selected={sel} onSelect={setSel} columns={[{ key: 'n', header: 'Candidate', render: (r) => r.student.name }, { key: 'd', header: 'Dept', render: (r) => r.student.department }, { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> }]} />
          {sel.size > 1 && <label className="check" style={{ marginTop: '.75rem' }}><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> <span>I confirm adding {sel.size} candidates in bulk.</span></label>}</> : <p className="muted">Everyone eligible is already in this round.</p>}
      </Async>
    </Modal>
  );
}

function ScheduleModal({ round, applicationIds, onClose }) {
  const toast = useToast();
  const initial = { startsAt: '', endsAt: '', mode: 'online', locationOrLink: '', instructions: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  const save = async (v) => {
    const { data } = await api.post(`/recruiter/rounds/${round._id}/interviews`, { schedules: applicationIds.map((applicationId) => ({ applicationId, startsAt: fromInputDateTime(v.startsAt), endsAt: fromInputDateTime(v.endsAt), mode: v.mode, locationOrLink: v.locationOrLink || undefined, instructions: v.instructions || undefined, timezone: v.timezone })) });
    const failed = data.results.filter((r) => !r.ok);
    if (failed.length === data.results.length) throw new Error(failed[0].error);
    toast.success(`${data.scheduled} interview(s) scheduled`); if (failed.length) toast.error(`${failed.length} failed: ${failed[0].error}`);
  };
  return (
    <EditModal title={`Schedule interview${applicationIds.length > 1 ? 's' : ''} (${applicationIds.length})`} initial={initial} onSave={save} onClose={onClose} wide>
      {({ bind }) => <FormGrid>
        <Input label="Starts" type="datetime-local" required {...bind('startsAt')} />
        <Input label="Ends" type="datetime-local" {...bind('endsAt')} />
        <Select label="Mode" options={INTERVIEW_MODES} {...bind('mode')} />
        <Input label="Location / meeting link" {...bind('locationOrLink')} />
        <Textarea label="Instructions for the candidate" rows={3} {...bind('instructions')} />
        <p className="hint field-wide">The same time is used for every selected candidate. Schedule individually for different slots. Students are notified automatically.</p>
      </FormGrid>}
    </EditModal>
  );
}

function ResultModal({ round, p, onClose }) {
  const save = async (v) => api.put(`/recruiter/rounds/${round._id}/participants/${p._id}`, { result: v.result, score: v.score === '' ? undefined : Number(v.score), remarks: v.remarks || undefined, autoReject: !!v.autoReject });
  return (
    <EditModal title={`Result — ${p.name}`} initial={{ result: p.result, score: p.score ?? '', remarks: p.remarks || '', autoReject: false }} onSave={save} onClose={onClose}>
      {({ bind, values, set }) => <FormGrid>
        <Select label="Result" options={PARTICIPANT_RESULT} {...bind('result')} />
        <Input label="Score" type="number" step="0.01" {...bind('score')} />
        <Textarea label="Remarks" rows={3} {...bind('remarks')} />
        {values.result === 'failed' && <label className="check field-wide"><input type="checkbox" checked={!!values.autoReject} onChange={(e) => set('autoReject', e.target.checked)} /> <span>Also reject the application (the student is notified).</span></label>}
      </FormGrid>}
    </EditModal>
  );
}

export default function RoundDetail() {
  const { id } = useParams();
  usePageTitle('Round');
  const toast = useToast(); const [dialog, ask] = useConfirm();
  const state = useAsync(() => api.get(`/recruiter/rounds/${id}/participants`), [id]);
  const [sel, setSel] = useState(new Set());
  const [modal, setModal] = useState(null);
  const done = (reload) => { setModal(null); if (reload !== false) { state.reload(); setSel(new Set()); } };
  const complete = async (force) => { await api.post(`/recruiter/rounds/${id}/complete`, { force }); toast.success('Round marked completed'); state.reload(); };
  return (
    <Async state={state}>
      {({ round, participants }) => {
        const rows = participants.map((p) => ({ ...p, _id: p._id }));
        return (
          <>
            {dialog}
            <PageHeader back={<Link to={`/recruiter/drives/${round.driveId}/rounds`} className="back">← All rounds</Link>} title={`${round.sequence}. ${round.name}`} subtitle={`${label(round.type)} · ${label(round.status)}`}
              actions={<><Button variant="primary" onClick={() => setModal({ t: 'add' })}>Add candidates</Button>
                <Button disabled={!sel.size} onClick={() => setModal({ t: 'schedule', ids: rows.filter((r) => sel.has(r._id)).map((r) => r.applicationId) })}>Schedule interview ({sel.size})</Button>
                {round.status !== 'completed' && <Button onClick={async () => { try { await complete(false); } catch (e) { if (e.code === 'RESULTS_PENDING') ask({ title: 'Results still pending', message: `${e.details?.pending} candidate(s) have no result. Complete the round anyway?`, confirmLabel: 'Complete anyway', onConfirm: () => complete(true) }); else toast.error(e); } }}>Complete round</Button>}</>} />
            <Card pad={false}>
              <DataTable rows={rows} selectable selected={sel} onSelect={setSel} empty={<div style={{ padding: '1.5rem' }}><Alert kind="info">No candidates in this round yet. Use “Add candidates”.</Alert></div>} columns={[
                { key: 'name', header: 'Candidate', render: (p) => <Link to={`/recruiter/applications/${p.applicationId}`}>{p.name}</Link> },
                { key: 'dept', header: 'Dept', render: (p) => p.department }, { key: 'app', header: 'Application', render: (p) => <StatusBadge status={p.applicationStatus} /> },
                { key: 'result', header: 'Result', render: (p) => <StatusBadge status={p.result} /> }, { key: 'score', header: 'Score', render: (p) => p.score ?? '—' },
                { key: 'int', header: 'Interview', render: (p) => (p.interview ? <span className="small">{dt(p.interview.startsAt)} <StatusBadge status={p.interview.status} /></span> : '—') },
                { key: 'a', header: '', render: (p) => <Button size="sm" onClick={() => setModal({ t: 'result', p })}>Set result</Button> },
              ]} />
            </Card>
            {modal?.t === 'add' && <AddCandidates round={round} onClose={done} />}
            {modal?.t === 'schedule' && <ScheduleModal round={round} applicationIds={modal.ids} onClose={done} />}
            {modal?.t === 'result' && <ResultModal round={round} p={modal.p} onClose={done} />}
          </>
        );
      }}
    </Async>
  );
}
