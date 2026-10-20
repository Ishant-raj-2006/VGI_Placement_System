import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Async, Button, Card, Empty, Badge, PageHeader, Pagination, useListState, useToast } from '../../components/ui.jsx';
import { dt, label } from '../../lib/format.js';

export function entityLink(role, rel) {
  if (!rel?.kind) return null;
  const base = role === 'student' ? '/student' : role === 'recruiter' ? '/recruiter' : '/admin';
  const m = {
    student: { drive: `${base}/drives/${rel.id}`, application: `${base}/applications/${rel.id}`, offer: `${base}/offers/${rel.id}`, profile: `${base}/verification` },
    recruiter: { drive: `${base}/drives/${rel.id}`, application: `${base}/applications/${rel.id}`, offer: `${base}/offers`, company: `${base}/verification` },
    admin: { drive: `${base}/drives/${rel.id}`, company: `${base}/companies/${rel.id}`, profile: `${base}/students/${rel.id}`, ticket: `${base}/tickets` },
  };
  return (m[role === 'student' ? 'student' : role === 'recruiter' ? 'recruiter' : 'admin'] || {})[rel.kind] || null;
}

export default function Notifications({ role }) {
  usePageTitle('Notifications');
  const toast = useToast();
  const list = useListState({ limit: 20 });
  const state = useAsync(() => api.get('/notifications', list.params), [JSON.stringify(list.params)]);
  const read = async (n) => { if (!n.readAt) { await api.post(`/notifications/${n._id}/read`).catch(() => {}); state.reload(); } };
  const readAll = async () => { try { await api.post('/notifications/read-all'); state.reload(); toast.success('All notifications marked as read'); } catch (e) { toast.error(e); } };
  return (
    <>
      <PageHeader title="Notifications" subtitle="Updates about your applications, drives, interviews and offers." actions={<Button onClick={readAll}>Mark all as read</Button>} />
      <Card pad={false}>
        <Async state={state} empty={<Empty title="You are all caught up">New notifications will appear here.</Empty>}>
          {(items, meta) => (
            <>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {items.map((n) => {
                  const link = entityLink(role, n.relatedEntity);
                  return (
                    <li key={n._id} style={{ padding: '.85rem 1.1rem', borderBottom: '1px solid var(--border)', background: n.readAt ? undefined : 'var(--primary-l)' }}>
                      <div className="row between gap wrap">
                        <strong>{n.title}</strong>
                        <span className="muted small">{dt(n.createdAt)}</span>
                      </div>
                      <div>{n.message}</div>
                      <div className="row gap-sm" style={{ marginTop: '.4rem' }}>
                        <Badge tone="gray">{label(n.type)}</Badge>
                        {link && <Link to={link} onClick={() => read(n)} className="small">View</Link>}
                        {!n.readAt && <button className="btn btn-sm btn-ghost" onClick={() => read(n)}>Mark as read</button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div style={{ padding: '0 1.1rem 1rem' }}><Pagination meta={meta} onPage={list.setPage} /></div>
            </>
          )}
        </Async>
      </Card>
    </>
  );
}
