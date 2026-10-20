import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Async, Card, DataTable, Empty, PageHeader, StatusBadge } from '../../components/ui.jsx';
import { dt, money } from '../../lib/format.js';

export default function Offers() {
  usePageTitle('Offers');
  const state = useAsync(() => api.get('/student/offers'), []);
  return (
    <>
      <PageHeader title="My offers" subtitle="Offers issued to you. Respond before the deadline." />
      <Card pad={false}>
        <Async state={state} empty={<Empty title="No offers yet">Offers from companies will appear here.</Empty>}>
          {(items) => (
            <DataTable rows={items} columns={[
              { key: 'job', header: 'Job', render: (o) => <Link to={`/student/offers/${o._id}`}>{o.jobTitle}</Link> },
              { key: 'company', header: 'Company', render: (o) => o.company?.name },
              { key: 'pay', header: 'Compensation', render: (o) => money(o.compensation?.amount, o.compensation?.currency, o.compensation?.kind) },
              { key: 'v', header: 'Version', render: (o) => `v${o.version}${o.isCurrent ? '' : ' (old)'}` },
              { key: 'deadline', header: 'Respond by', render: (o) => dt(o.responseDeadline) },
              { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
            ]} />
          )}
        </Async>
      </Card>
    </>
  );
}
