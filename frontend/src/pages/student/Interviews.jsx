import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Async, Card, DataTable, Empty, PageHeader, StatusBadge } from '../../components/ui.jsx';
import { dt, label } from '../../lib/format.js';

export default function Interviews() {
  usePageTitle('Interviews');
  const state = useAsync(() => api.get('/student/interviews'), []);
  return (
    <>
      <PageHeader title="My interviews" subtitle="Schedules from recruiters. Changes are notified to you." />
      <Card pad={false}>
        <Async state={state} empty={<Empty title="No interviews yet">When a recruiter schedules one, it will appear here.</Empty>}>
          {(items) => (
            <DataTable rows={items} columns={[
              { key: 'startsAt', header: 'When', render: (i) => <strong>{dt(i.startsAt)}</strong> },
              { key: 'job', header: 'Job', render: (i) => `${i.jobTitle || '—'} · ${i.company || ''}` },
              { key: 'round', header: 'Round', render: (i) => i.roundId?.name },
              { key: 'mode', header: 'Mode', render: (i) => label(i.mode) },
              { key: 'where', header: 'Location / link', render: (i) => (/^https?:\/\//.test(i.locationOrLink || '') ? <a href={i.locationOrLink} target="_blank" rel="noopener noreferrer">Join link</a> : (i.locationOrLink || '—')) },
              { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
            ]} />
          )}
        </Async>
      </Card>
    </>
  );
}
