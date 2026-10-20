import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Async, Card, Empty, PageHeader } from '../../components/ui.jsx';

export default function Duplicates() {
  usePageTitle('Possible duplicates');
  const state = useAsync(() => api.get('/admin/students/duplicates'), []);
  return (
    <>
      <PageHeader back={<Link to="/admin/students" className="back">← Students</Link>} title="Possible duplicate students" subtitle="Records that share a name, department and batch, or a contact number. Review manually; nothing is merged automatically." />
      <Async state={state} empty={<Card><Empty title="No duplicates found" /></Card>}>
        {(groups) => groups.map((g, i) => (
          <Card key={i} title={g.reason}>
            <ul>{g.records.map((r) => <li key={r._id}><Link to={`/admin/students/${r._id}`}>{r.name}</Link> · {r.studentId} · {r.rollNumber} · {r.email}</li>)}</ul>
          </Card>
        ))}
      </Async>
    </>
  );
}
