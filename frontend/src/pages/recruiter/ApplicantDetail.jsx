import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, downloadFile, openFile } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import EligibilityPanel from '../../components/Eligibility.jsx';
import { Alert, Async, Button, Card, FormGrid, Input, KV, PageHeader, Select, StatusBadge, Timeline, useConfirm, useToast } from '../../components/ui.jsx';
import { EditModal } from '../../components/Crud.jsx';
import { COMPENSATION_KINDS } from '../../lib/constants.js';
import { dt, fromInputDateTime, label, money, num } from '../../lib/format.js';

const OUTCOMES = ['selected', 'not_selected', 'on_hold', 'further_evaluation'];

export default function ApplicantDetail() {
  const { id } = useParams();
  usePageTitle('Applicant');
  const toast = useToast();
  const [dialog, ask] = useConfirm();
  const [offerOpen, setOfferOpen] = useState(false);
  const state = useAsync(() => api.get(`/recruiter/applications/${id}`), [id]);
  const run = async (fn, msg) => { try { await fn(); toast.success(msg); state.reload(); } catch (e) { toast.error(e); } };

  return (
    <Async state={state}>
      {(a) => {
        const s = a.student;
        const canOffer = a.status === 'selected' && !a.offers?.some((o) => o.isCurrent && ['draft', 'issued', 'accepted'].includes(o.status));
        return (
          <>
            {dialog}
            <PageHeader back={<Link to={`/recruiter/drives/${a.drive?._id || ''}/applicants`} className="back">← Applicants</Link>} title={s.name} subtitle={`${s.department || ''} · ${s.degree || ''} · batch ${s.graduationYear || ''} — applied for ${a.drive?.jobTitle || ''}`}
              actions={<>
                <StatusBadge status={a.status} />
                {['applied'].includes(a.status) && <Button onClick={() => run(() => api.post(`/recruiter/applications/${id}/review`), 'Marked under review')}>Under review</Button>}
                {['applied', 'under_review'].includes(a.status) && <Button variant="primary" onClick={() => run(() => api.post(`/recruiter/applications/${id}/shortlist`), 'Shortlisted')}>Shortlist</Button>}
                {['applied', 'under_review', 'shortlisted', 'assessment', 'interview'].includes(a.status) && <Button variant="danger" onClick={() => ask({ title: 'Reject this applicant?', message: 'The student will be notified.', danger: true, confirmLabel: 'Reject', reasonLabel: 'Reason (shared with the student)', onConfirm: async (reason) => { await api.post(`/recruiter/applications/${id}/reject`, { reason }); toast.success('Rejected'); state.reload(); } })}>Reject</Button>}
              </>} />
            <div className="grid grid-2">
              <div>
                <Card title="Academic (verified)">
                  <KV items={[['Verification', s.academicVerified ? 'Verified by placement cell' : 'Not verified'], ['CGPA', s.academicVerified ? num(s.cgpa, 2) : '—'], ['Active backlogs', s.academicVerified ? s.activeBacklogs : '—'], ['College', s.collegeName], ['Semester', s.currentSemester], ['E-mail', s.email || 'Visible after shortlisting'], ['Phone', s.contactNumber || (s.email ? '—' : 'Visible after shortlisting')]]} />
                  {a.resume && <div className="row gap-sm" style={{ marginTop: '1rem' }}><Button onClick={() => openFile(`/files/resumes/${a.resume.id}`).catch(toast.error)}>View resume</Button><Button onClick={() => downloadFile(`/files/resumes/${a.resume.id}`, a.resume.name).catch(toast.error)}>Download</Button></div>}
                </Card>
                <Card title="Skills & interests">
                  <div className="chips">{(s.skills || []).map((x) => <span className="chip" key={x}>{x}</span>)}{!s.skills?.length && <span className="muted">None listed</span>}</div>
                  {s.interests?.length > 0 && <p className="small muted" style={{ marginTop: '.5rem' }}>Interests: {s.interests.join(', ')}</p>}
                </Card>
                <Card title="Projects & experience">
                  {s.projects?.map((p) => <div key={p._id} style={{ marginBottom: '.7rem' }}><strong>{p.title}</strong><div className="small">{p.description}</div><div className="small muted">{(p.technologies || []).join(', ')}</div></div>)}
                  {s.experiences?.map((e) => <div key={e._id} style={{ marginBottom: '.7rem' }}><strong>{e.title}</strong> <span className="muted small">{label(e.type)} · {e.organization}</span></div>)}
                  {!s.projects?.length && !s.experiences?.length && <p className="muted">Nothing added.</p>}
                </Card>
              </div>
              <div>
                <Card title="Eligibility when applying"><EligibilityPanel evaluation={a.eligibility} /></Card>
                <Card title="History"><Timeline events={a.timeline} /></Card>
              </div>
            </div>
            <Card title="Rounds & interviews">
              {a.rounds?.length ? <ul className="stack-sm" style={{ paddingLeft: '1.1rem' }}>{a.rounds.map((r) => <li key={r._id}><strong>{r.roundId?.name}</strong> — <StatusBadge status={r.result} />{r.score != null ? ` · score ${r.score}` : ''}{r.remarks ? <div className="small muted">{r.remarks}</div> : null}</li>)}</ul> : <p className="muted">Not added to any round yet. <Link to={`/recruiter/drives/${a.drive?._id}/rounds`}>Manage rounds</Link></p>}
              {a.interviews?.map((i) => <div key={i._id} className="small" style={{ marginTop: '.4rem' }}>🗓 {dt(i.startsAt)} · {i.roundId?.name} · {label(i.mode)} <StatusBadge status={i.status} /></div>)}
            </Card>
            <Card title="Selection & offer">
              {['interview', 'assessment', 'shortlisted'].includes(a.status) && (
                <div className="row gap-sm wrap" style={{ marginBottom: '1rem' }}>
                  <strong>Selection outcome:</strong>
                  {OUTCOMES.map((o) => <Button key={o} size="sm" variant={o === 'selected' ? 'primary' : o === 'not_selected' ? 'danger' : 'default'} onClick={() => ask({ title: `Mark as ${label(o)}?`, message: o === 'selected' ? 'The candidate will be notified and an offer can be created.' : undefined, confirmLabel: 'Confirm', reasonLabel: 'Note (optional)', onConfirm: async (reason) => { await api.post(`/recruiter/applications/${id}/selection`, { outcome: o, reason }); toast.success('Outcome saved'); state.reload(); } })}>{label(o)}</Button>)}
                </div>
              )}
              {a.selectionOutcome && <p>Current outcome: <StatusBadge status={a.selectionOutcome} /></p>}
              {a.status === 'shortlisted' && <p className="small muted">Selecting directly from “shortlisted” needs the candidate to go through at least one round, depending on how your drive is configured.</p>}
              {a.offers?.length > 0 && <ul style={{ paddingLeft: '1.1rem' }}>{a.offers.map((o) => <li key={o._id}>v{o.version}: {money(o.compensation?.amount, o.compensation?.currency, o.compensation?.kind)} <StatusBadge status={o.status} /></li>)}<li className="small"><Link to="/recruiter/offers">Manage offers</Link></li></ul>}
              {canOffer && <Button variant="primary" onClick={() => setOfferOpen(true)}>Create offer</Button>}
              {a.status === 'selected' && !canOffer && !a.offers?.length && <Alert kind="info">An active offer already exists.</Alert>}
            </Card>
            {offerOpen && <OfferModal appId={id} onClose={(saved) => { setOfferOpen(false); if (saved) state.reload(); }} />}
          </>
        );
      }}
    </Async>
  );
}

export function OfferModal({ appId, offer, onClose, jobTitle }) {
  const toast = useToast();
  const initial = offer
    ? { jobTitle: offer.jobTitle || '', kind: offer.compensation?.kind || 'annual_ctc', amount: offer.compensation?.amount ?? '', currency: offer.compensation?.currency || 'INR', notes: offer.compensation?.notes || '', responseDeadline: offer.responseDeadline ? new Date(offer.responseDeadline).toISOString().slice(0, 16) : '', joiningDate: offer.joiningDate ? new Date(offer.joiningDate).toISOString().slice(0, 10) : '', issueNow: false }
    : { jobTitle: jobTitle || '', kind: 'annual_ctc', amount: '', currency: 'INR', notes: '', responseDeadline: '', joiningDate: '', issueNow: false };
  const save = async (v) => {
    const body = { ...(v.jobTitle ? { jobTitle: v.jobTitle } : {}), compensation: { kind: v.kind, amount: Number(v.amount), currency: v.currency || 'INR', notes: v.notes || undefined }, responseDeadline: fromInputDateTime(v.responseDeadline), ...(v.joiningDate ? { joiningDate: v.joiningDate } : {}) };
    if (offer?.mode === 'revise') await api.post(`/recruiter/offers/${offer._id}/revise`, body);
    else if (offer) await api.put(`/recruiter/offers/${offer._id}`, body);
    else await api.post(`/recruiter/applications/${appId}/offers`, { ...body, issueNow: !!v.issueNow });
    toast.success(offer?.mode === 'revise' ? 'Revised offer created as a new version' : 'Offer saved');
  };
  return (
    <EditModal title={offer?.mode === 'revise' ? 'Revise offer (new version)' : offer ? 'Edit draft offer' : 'Create offer'} initial={initial} onSave={save} onClose={onClose} wide>
      {({ bind, values }) => (
        <FormGrid>
          <Input label="Job title" {...bind('jobTitle')} />
          <Select label="Compensation type" options={COMPENSATION_KINDS} {...bind('kind')} />
          <Input label={values.kind === 'monthly_stipend' ? 'Stipend per month' : 'CTC per year'} type="number" min="0" required {...bind('amount')} />
          <Input label="Currency" maxLength={3} {...bind('currency')} />
          <Input label="Respond by" type="datetime-local" required {...bind('responseDeadline')} />
          <Input label="Joining date" type="date" {...bind('joiningDate')} />
          <Input label="Notes" wide {...bind('notes')} />
          {!offer && <label className="check field-wide"><input type="checkbox" checked={!!values.issueNow} onChange={(e) => bind('issueNow').onChange(e.target.checked)} /> <span>Issue immediately (owner / HR manager only). Otherwise it is saved as a draft.</span></label>}
        </FormGrid>
      )}
    </EditModal>
  );
}
