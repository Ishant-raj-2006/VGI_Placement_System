import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth.jsx';
import { Alert, Async, Button, Card, KV, PageHeader, StatusBadge, useConfirm, useToast } from '../../components/ui.jsx';
import { dt } from '../../lib/format.js';

const COPY = {
  pending: 'Your company is waiting for the placement cell to start reviewing it.',
  under_review: 'The placement cell is reviewing your company details.',
  verified: 'Your company is verified. You can submit drives for approval.',
  rejected: 'Your company was not approved. Fix the details mentioned below and submit again.',
  suspended: 'Your company is suspended. Drives are paused and recruiters cannot act until the placement cell lifts the suspension.',
};
export default function Verification() {
  usePageTitle('Company verification');
  const toast = useToast(); const { refresh, membership } = useAuth();
  const [dialog, ask] = useConfirm();
  const state = useAsync(() => api.get('/recruiter/company/verification'), []);
  return (
    <>
      {dialog}
      <PageHeader title="Company verification" subtitle="The placement cell verifies every company before its drives go live." />
      <Async state={state}>
        {(v) => (
          <Card title="Status" actions={<StatusBadge status={v.status} />}>
            <Alert kind={v.status === 'verified' ? 'success' : v.status === 'rejected' || v.status === 'suspended' ? 'error' : 'info'}>{COPY[v.status]}{v.reason && <div style={{ marginTop: '.4rem' }}><strong>Reason:</strong> {v.reason}</div>}</Alert>
            <KV items={[['Submitted', dt(v.submittedAt)], ['Verified', dt(v.verifiedAt)], ['Can submit drives', v.canSubmitDrives ? 'Yes' : 'Not yet']]} />
            {v.status === 'rejected' && ['owner', 'hr_manager'].includes(membership?.companyRole) && (
              <div className="form-actions"><Button variant="primary" onClick={() => ask({ title: 'Submit for verification again?', message: 'Make sure you updated the company profile first.', confirmLabel: 'Submit', onConfirm: async () => { await api.post('/recruiter/company/submit-verification'); toast.success('Submitted for verification'); state.reload(); refresh(); } })}>Resubmit for verification</Button></div>
            )}
          </Card>
        )}
      </Async>
    </>
  );
}
