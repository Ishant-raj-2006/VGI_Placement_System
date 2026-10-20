import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Async, Card, DataTable, Empty, FilterBar, Input, Modal, PageHeader, Pagination, Button, useListState } from '../../components/ui.jsx';
import { dt, fromInputDateTime } from '../../lib/format.js';

export default function AuditLogs() {
  usePageTitle('Audit logs');
  const list = useListState({ limit: 50 });
  const [view, setView] = useState(null);
  const params = { ...list.params, from: list.params.from ? fromInputDateTime(list.params.from) : undefined, to: list.params.to ? fromInputDateTime(list.params.to) : undefined };
  const state = useAsync(() => api.get('/admin/audit-logs', params), [JSON.stringify(params)]);
  return (
    <>
      <PageHeader title="Audit logs" subtitle="Append-only record of important actions. Secrets are never stored." />
      <FilterBar>
        <Input label="Action starts with" placeholder="e.g. drive." value={list.params.action || ''} onChange={(e) => list.setFilter('action', e.target.value)} />
        <Input label="Entity type" placeholder="Application" value={list.params.entityType || ''} onChange={(e) => list.setFilter('entityType', e.target.value)} />
        <Input label="From" type="datetime-local" value={list.params.from || ''} onChange={(e) => list.setFilter('from', e.target.value)} />
        <Input label="To" type="datetime-local" value={list.params.to || ''} onChange={(e) => list.setFilter('to', e.target.value)} />
      </FilterBar>
      <Card pad={false}>
        <Async state={state} empty={<Empty title="No log entries match" />}>
          {(items, meta) => (
            <>
              <DataTable rows={items} columns={[
                { key: 't', header: 'Time', className: 'nowrap', render: (l) => dt(l.createdAt) }, { key: 'a', header: 'Actor', render: (l) => (l.actor ? `${l.actor.name} (${l.actor.role})` : l.actorRole || 'system') },
                { key: 'ac', header: 'Action', render: (l) => <code>{l.action}</code> }, { key: 'e', header: 'Entity', render: (l) => `${l.entityType || ''}${l.entityId ? ' …' + String(l.entityId).slice(-6) : ''}` },
                { key: 'ip', header: 'IP', render: (l) => l.ip || '—' }, { key: 'm', header: '', render: (l) => (l.metadata && Object.keys(l.metadata).length ? <Button size="sm" onClick={() => setView(l)}>Details</Button> : null) },
              ]} />
              <div style={{ padding: '0 1.1rem 1rem' }}><Pagination meta={meta} onPage={list.setPage} /></div>
            </>
          )}
        </Async>
      </Card>
      {view && <Modal wide title={view.action} onClose={() => setView(null)}><pre className="code">{JSON.stringify(view.metadata, null, 2)}</pre></Modal>}
    </>
  );
}
