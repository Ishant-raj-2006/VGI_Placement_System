import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync, useDebounced, usePageTitle } from '../../lib/hooks.js';
import { useState } from 'react';
import { Async, Badge, Card, Empty, FilterBar, PageHeader, Pagination, SearchInput, Select, StatusBadge, useListState } from '../../components/ui.jsx';
import { compensationText, d, label, timeLeft } from '../../lib/format.js';

export default function Drives() {
  usePageTitle('Placement drives');
  const list = useListState({ limit: 12 });
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const params = { ...list.params, q: dq };
  const state = useAsync(() => api.get('/drives', params), [JSON.stringify(params)]);
  return (
    <>
      <PageHeader title="Placement drives" subtitle="Published drives from verified companies, with your eligibility for each." />
      <FilterBar>
        <SearchInput value={q} onChange={(v) => { setQ(v); list.setFilter('page', 1); }} placeholder="Search job title…" />
        <Select label="Eligibility" placeholder="All" options={['eligible', 'ineligible', 'pending_verification']} value={list.params.eligibility || ''} onChange={(e) => list.setFilter('eligibility', e.target.value)} />
        <Select label="Type" placeholder="All" options={['full_time', 'internship', 'internship_with_ppo', 'graduate_trainee']} value={list.params.employmentType || ''} onChange={(e) => list.setFilter('employmentType', e.target.value)} />
        <Select label="Applied" placeholder="All" options={[{ value: 'true', label: 'Already applied' }, { value: 'false', label: 'Not applied' }]} value={list.params.applied || ''} onChange={(e) => list.setFilter('applied', e.target.value)} />
      </FilterBar>
      <Async state={state} empty={<Card><Empty title="No drives match">Try different filters, or check back later.</Empty></Card>}>
        {(items, meta) => (
          <>
            <div className="grid grid-2">
              {items.map((x) => (
                <Card key={x._id} title={<Link to={`/student/drives/${x._id}`}>{x.jobTitle}</Link>} actions={<StatusBadge status={x.eligibility.result} />}>
                  <div className="muted">{x.company?.name}{x.company?.industry ? ` · ${x.company.industry}` : ''}</div>
                  <div className="row gap-sm wrap" style={{ margin: '.6rem 0' }}>
                    <Badge tone="blue">{label(x.employmentType)}</Badge>{x.workMode && <Badge>{label(x.workMode)}</Badge>}
                    {x.applied && <Badge tone="green">Applied · {label(x.applicationStatus)}</Badge>}
                  </div>
                  <div className="small">💰 {compensationText(x.compensation)}</div>
                  {x.locations?.length > 0 && <div className="small">📍 {x.locations.join(', ')}</div>}
                  <div className="small muted">Deadline {d(x.applicationDeadline)} · {x.open ? timeLeft(x.applicationDeadline) : label(x.openState)}</div>
                  {x.eligibility.result !== 'eligible' && x.eligibility.reasons?.length > 0 && <div className="small" style={{ marginTop: '.4rem', color: 'var(--muted)' }}>Why: {x.eligibility.reasons[0]}{x.eligibility.reasons.length > 1 ? ` (+${x.eligibility.reasons.length - 1} more)` : ''}</div>}
                </Card>
              ))}
            </div>
            <Pagination meta={meta} onPage={list.setPage} />
          </>
        )}
      </Async>
    </>
  );
}
