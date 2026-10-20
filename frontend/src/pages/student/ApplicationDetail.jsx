import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import EligibilityPanel from '../../components/Eligibility.jsx';
import { Alert, Async, Button, Card, KV, PageHeader, StatusBadge, Timeline, useConfirm, useToast } from '../../components/ui.jsx';
import { compensationText, dt, label, money } from '../../lib/format.js';

export default function ApplicationDetail() {
  const { id } = useParams();
  usePageTitle('Application');
  const toast = useToast();
  const [dialog, ask] = useConfirm();
  const state = useAsync(() => api.get(`/student/applications/${id}`), [id]);
  return (
    <Async state={state}>
      {({ application: a, drive, company, timeline, interviews, offers, resume }) => {
        const canWithdraw = !['withdrawn', 'rejected', 'offer_accepted', 'offer_declined'].includes(a.status);
        return (
          <>
            {dialog}
            <PageHeader back={<Link to="/student/applications" className="back">← My applications</Link>} title={drive?.jobTitle || 'Application'} subtitle={company?.name}
              actions={<><StatusBadge status={a.status} />{canWithdraw && <Button variant="danger" onClick={() => ask({ title: 'Withdraw application?', message: 'The recruiter will be told you withdrew. Depending on college policy you may not be able to re-apply.', confirmLabel: 'Withdraw', danger: true, reasonLabel: 'Reason (optional)', onConfirm: async (reason) => { await api.post(`/student/applications/${id}/withdraw`, { reason }); toast.success('Application withdrawn'); state.reload(); } })}>Withdraw</Button>}</>} />
            {a.status === 'selected' && <Alert kind="success">Congratulations — you have been selected. The company may issue a formal offer soon.</Alert>}
            {offers?.some((o) => o.status === 'issued') && <Alert kind="info">You have an offer waiting. <Link to="/student/offers">Respond to it</Link></Alert>}
            <div className="grid grid-2">
              <Card title="Status history"><Timeline events={timeline} /></Card>
              <div>
                <Card title="Summary"><KV items={[['Applied on', dt(a.appliedAt)], ['Resume', resume?.originalName], ['Drive', drive ? <Link to={`/student/drives/${a.driveId}`}>{drive.jobTitle}</Link> : null], ['Compensation', compensationText(drive?.compensation)], ['Deadline', dt(drive?.applicationDeadline)]]} /></Card>
                <Card title="Eligibility when you applied"><EligibilityPanel evaluation={a.eligibilitySnapshot} /><p className="small muted">This is a saved snapshot, so later changes to rules or your data do not rewrite history.</p></Card>
              </div>
            </div>
            <Card title="Interviews">
              {interviews?.length ? <ul className="stack-sm" style={{ paddingLeft: '1.1rem' }}>{interviews.map((i) => <li key={i._id}><strong>{dt(i.startsAt)}</strong> — {i.roundId?.name} · {label(i.mode)}{i.locationOrLink ? ` · ${i.locationOrLink}` : ''} <StatusBadge status={i.status} />{i.instructions && <div className="small muted">{i.instructions}</div>}</li>)}</ul> : <p className="muted">No interviews scheduled.</p>}
            </Card>
            {offers?.length > 0 && <Card title="Offers">{offers.map((o) => <div key={o._id} className="row between wrap" style={{ padding: '.4rem 0' }}><span>Version {o.version}: {money(o.compensation?.amount, o.compensation?.currency, o.compensation?.kind)}</span><span className="row gap-sm"><StatusBadge status={o.status} /><Link to={`/student/offers/${o._id}`}>Open</Link></span></div>)}</Card>}
          </>
        );
      }}
    </Async>
  );
}
