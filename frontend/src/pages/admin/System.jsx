import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Async, Card, KV, PageHeader, Stat, StatusBadge } from '../../components/ui.jsx';
import { PolicyList } from './Policies.jsx';

export default function System() {
  usePageTitle('System');
  const state = useAsync(() => api.get('/admin/system/health'), []);
  return (
    <>
      <PageHeader title="System health & settings" subtitle="Super admin only." />
      <Async state={state}>
        {(h) => (
          <div className="stats">
            <Stat label="Database" value={<StatusBadge status={h.database?.state === 'connected' || h.database === 'connected' ? 'active' : 'failed'} />} hint={typeof h.database === 'string' ? h.database : h.database?.state} />
            <Stat label="Uptime (min)" value={Math.round(h.uptimeSeconds / 60)} /><Stat label="Users" value={h.users} /><Stat label="Active sessions" value={h.activeSessions} />
            <Stat label="E-mails queued" value={h.emailQueue?.pending} tone={h.emailQueue?.pending ? 'warn' : undefined} /><Stat label="E-mails failed" value={h.emailQueue?.failed} tone={h.emailQueue?.failed ? 'bad' : undefined} /><Stat label="Audit entries" value={h.auditLogEntries} /><Stat label="Node" value={h.node} />
          </div>
        )}
      </Async>
      <Card title="Authentication & system settings" pad={false}><PolicyList category="system" /></Card>
    </>
  );
}
