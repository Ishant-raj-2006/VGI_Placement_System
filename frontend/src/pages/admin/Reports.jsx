import { useState } from 'react';
import { api, downloadFile } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { Alert, Async, BarList, Button, Card, DataTable, Input, PageHeader, Select, Stat, Tabs, useToast } from '../../components/ui.jsx';
import { label, money, num } from '../../lib/format.js';

const EXPORTS = [['departments', 'Department-wise placement'], ['companies', 'Company-wise recruitment'], ['salary', 'Salary / compensation'], ['applications', 'Applications'], ['offers', 'Offers'], ['students', 'Students (placement status)']];

export default function Reports() {
  usePageTitle('Reports & analytics');
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [year, setYear] = useState('');
  const [scope, setScope] = useState('accepted');
  const overview = useAsync(() => api.get('/admin/analytics/placements'), []);
  const dept = useAsync(() => api.get('/admin/analytics/departments', { graduationYear: year }), [year]);
  const sal = useAsync(() => api.get('/admin/analytics/salary', { scope, normalize: 'annual' }), [scope]);
  const company = useAsync(() => api.get('/admin/analytics/companies'), []);
  const funnel = useAsync(() => api.get('/admin/analytics/funnel'), []);
  const exp = (type, format) => downloadFile(`/admin/reports/${type}`, `cpms_${type}.${format}`, { format, graduationYear: year, scope }).catch(toast.error);

  return (
    <>
      <PageHeader title="Reports & analytics" subtitle="Definitions are shown beside the numbers. Exports contain only the fields needed for reporting." />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'overview', label: 'Overview' }, { key: 'departments', label: 'Departments' }, { key: 'companies', label: 'Companies' }, { key: 'salary', label: 'Salary' }, { key: 'funnel', label: 'Funnel' }, { key: 'export', label: 'Export' }]} />
      {tab === 'overview' && <Async state={overview}>{({ totals: t, definitions }) => (<>
        <div className="stats"><Stat label="Students placed" value={t.studentsPlaced} tone="good" hint={definitions.studentsPlaced} /><Stat label="Offers issued" value={t.offersIssued} hint={definitions.offersIssued} /><Stat label="Offers accepted" value={t.offersAccepted} hint={definitions.offersAccepted} /><Stat label="Offers declined" value={t.offersDeclined} /><Stat label="Applications" value={t.totalApplications} /><Stat label="Shortlisted" value={t.shortlisted} hint={definitions.shortlisted} /></div>
        <Alert kind="info">“Students placed” counts each student once, even with several accepted offers, so it can be lower than “Offers accepted”.</Alert></>)}</Async>}
      {tab === 'departments' && <Card title="Department-wise placement" actions={<Input label="" aria-label="Graduation year" placeholder="Graduation year" type="number" value={year} onChange={(e) => setYear(e.target.value)} />}>
        <Async state={dept}>{(r) => (<><p className="small muted">{r.scope}. {r.denominator}</p>
          <DataTable rows={r.rows.map((x) => ({ ...x, _id: x.department }))} columns={[{ key: 'department', header: 'Department' }, { key: 'totalRegistered', header: 'Registered', className: 'num' }, { key: 'eligibleStudents', header: 'Eligible', className: 'num' }, { key: 'studentsApplied', header: 'Applied', className: 'num' }, { key: 'studentsPlaced', header: 'Placed', className: 'num' }, { key: 'offersIssued', header: 'Offers issued', className: 'num' }, { key: 'offersAccepted', header: 'Accepted', className: 'num' }, { key: 'placementPercentage', header: 'Placement %', className: 'num', render: (x) => `${num(x.placementPercentage, 1)}%` }]} />
          <h3 style={{ margin: '1rem 0 .5rem' }}>Placement % by department</h3><BarList max={100} items={r.rows.map((x) => ({ label: x.department, value: x.placementPercentage || 0 }))} format={(v) => `${num(v, 1)}%`} /></>)}</Async></Card>}
      {tab === 'companies' && <Card title="Company-wise recruitment" pad={false}><Async state={company}>{(r) => <DataTable rows={r.rows.map((x) => ({ ...x, _id: x.company }))} columns={[{ key: 'company', header: 'Company' }, { key: 'drives', header: 'Drives', className: 'num' }, { key: 'totalApplicants', header: 'Applicants', className: 'num' }, { key: 'shortlisted', header: 'Shortlisted', className: 'num' }, { key: 'interviewsConducted', header: 'Interviews', className: 'num' }, { key: 'selected', header: 'Selected', className: 'num' }, { key: 'offersIssued', header: 'Offers', className: 'num' }, { key: 'offersAccepted', header: 'Accepted', className: 'num' }]} />}</Async></Card>}
      {tab === 'salary' && <Card title="Compensation statistics" actions={<Select label="" aria-label="Scope" options={[{ value: 'accepted', label: 'Accepted offers' }, { value: 'issued', label: 'Issued offers' }]} value={scope} onChange={(e) => setScope(e.target.value)} />}>
        <Async state={sal}>{(r) => (<><Alert kind="info">{r.note}</Alert>
          {r.normalized && r.normalized.count > 0 && <p className="small muted">{r.normalized.label}: median {money(r.normalized.median)} across {r.normalized.count} offers.</p>}
          {r.groups.length ? r.groups.map((g) => (<div key={g.kind + g.currency} style={{ marginBottom: '1.25rem' }}><h3>{label(g.kind)} ({g.unit}, {g.currency})</h3>
            <div className="stats"><Stat label="Offers" value={g.count} /><Stat label="Minimum" value={money(g.min, g.currency)} /><Stat label="Median" value={money(g.median, g.currency)} /><Stat label="Average" value={money(g.average, g.currency)} /><Stat label="Maximum" value={money(g.max, g.currency)} /></div>
            {g.distribution?.some((b) => b.count) && <BarList items={g.distribution.map((b) => ({ label: b.label, value: b.count }))} />}</div>)) : <p className="muted">No data for this scope yet.</p>}</>)}</Async></Card>}
      {tab === 'funnel' && <Card title="Recruitment funnel"><Async state={funnel}>{(r) => (<><p className="small muted">{r.definition}</p><BarList items={r.stages.map((s) => ({ label: s.label, value: s.count, hint: s.conversionFromPrevious != null ? `(${num(s.conversionFromPrevious, 0)}% of previous)` : undefined }))} /></>)}</Async></Card>}
      {tab === 'export' && <Card title="Export reports"><p className="muted">CSV opens in any spreadsheet; XLSX keeps formatting. Spreadsheet formulas in text are neutralised.</p>
        {EXPORTS.map(([k, l]) => <div key={k} className="row between wrap" style={{ padding: '.5rem 0', borderBottom: '1px solid var(--border)' }}><span>{l}</span><span className="row gap-sm"><Button size="sm" onClick={() => exp(k, 'csv')}>CSV</Button><Button size="sm" onClick={() => exp(k, 'xlsx')}>Excel</Button></span></div>)}</Card>}
    </>
  );
}
