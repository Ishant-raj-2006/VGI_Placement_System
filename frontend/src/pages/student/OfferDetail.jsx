import { Link, useParams } from 'react-router-dom';
import { api, downloadFile } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Alert, Async, Button, Card, KV, PageHeader, StatusBadge, useConfirm, useToast } from '../../components/ui.jsx';
import { d, dt, money, timeLeft } from '../../lib/format.js';

export default function OfferDetail() {
  const { id } = useParams();
  usePageTitle('Offer');
  const toast = useToast();
  const [dialog, ask] = useConfirm();
  const state = useAsync(() => api.get(`/student/offers/${id}`), [id]);
  const respond = (decision) => ask({
    title: decision === 'accept' ? 'Accept this offer?' : 'Decline this offer?',
    message: decision === 'accept' ? 'Accepting is final. Depending on college policy, your other active offers may be closed and new applications blocked.' : 'Declining is final. The company will be informed.',
    confirmLabel: decision === 'accept' ? 'Accept offer' : 'Decline offer', danger: decision === 'decline',
    onConfirm: async () => { await api.post(`/student/offers/${id}/respond`, { decision }); toast.success(decision === 'accept' ? 'Offer accepted. Congratulations!' : 'Offer declined'); state.reload(); },
  });
  return (
    <Async state={state}>
      {({ offer, company, history, hasDocument }) => {
        const expired = new Date(offer.responseDeadline) < new Date();
        const canRespond = offer.status === 'issued' && offer.isCurrent && !expired;
        return (
          <>
            {dialog}
            <PageHeader back={<Link to="/student/offers" className="back">← My offers</Link>} title={offer.jobTitle} subtitle={`${company?.name || ''} · version ${offer.version}`} actions={<StatusBadge status={offer.status} />} />
            {canRespond && <Alert kind="info">Please respond by <strong>{dt(offer.responseDeadline)}</strong> ({timeLeft(offer.responseDeadline)}). If you do not respond, the offer expires.</Alert>}
            {offer.status === 'issued' && expired && <Alert kind="error">The response deadline has passed. Contact the placement cell if you need help.</Alert>}
            {!offer.isCurrent && <Alert kind="warn">This offer was replaced by a newer version.</Alert>}
            {offer.statusReason && <Alert kind="warn">{offer.statusReason}</Alert>}
            <Card title="Offer details">
              <KV items={[['Compensation', money(offer.compensation?.amount, offer.compensation?.currency, offer.compensation?.kind)], ['Joining date', d(offer.joiningDate)], ['Response deadline', dt(offer.responseDeadline)], ['Issued', dt(offer.issuedAt)], ['Responded', dt(offer.respondedAt)], ['Notes', offer.compensation?.notes]]} />
              {hasDocument && <p style={{ marginTop: '1rem' }}><Button onClick={() => downloadFile(`/files/offers/${offer._id}/document`, 'offer-letter.pdf').catch(toast.error)}>Download offer letter (PDF)</Button></p>}
              {canRespond && <div className="form-actions"><Button variant="danger" onClick={() => respond('decline')}>Decline</Button><Button variant="success" onClick={() => respond('accept')}>Accept offer</Button></div>}
            </Card>
            {history?.length > 1 && <Card title="Version history"><ul>{history.map((h) => <li key={h._id}>v{h.version} · {money(h.compensation?.amount, h.compensation?.currency, h.compensation?.kind)} · <StatusBadge status={h.status} />{h.issuedAt ? ` · issued ${dt(h.issuedAt)}` : ''}</li>)}</ul></Card>}
          </>
        );
      }}
    </Async>
  );
}
