import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useAsync, usePageTitle } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth.jsx';
import { Alert, Async, Badge, Button, Card, DataTable, FormGrid, Input, Modal, PageHeader, Select, Textarea, useToast } from '../../components/ui.jsx';
import { EditModal } from '../../components/Crud.jsx';
import { csv, dt, fromInputDateTime, label } from '../../lib/format.js';

export const POLICY_HELP = {
  offerPolicy: ['How many offers a student may hold', { single_offer: 'Only one active offer at a time', multiple_offers_one_accept: 'Can hold several offers but may accept only one', multiple_accept: 'Can accept several offers' }],
  blockApplicationsAfterAccept: ['Block new applications once a student has accepted an offer'],
  allowWithdrawal: ['Allow students to withdraw applications'],
  withdrawalDeadlineHoursBeforeApplicationClose: ['Hours before the deadline after which withdrawal is blocked (0 = until the deadline)'],
  allowReapplyAfterWithdraw: ['Allow re-applying after a withdrawal'],
  requireDriveApproval: ['Drives need placement-cell approval before students see them'],
  autoPublishOnApproval: ['Publish a drive automatically when approved'],
  requireReapprovalOnPublishedEdit: ['Require re-approval when eligibility rules of a published drive change'],
  allowApplyWhenPendingVerification: ['Let students apply while their academic data is unverified (marked “pending verification”)'],
  requireResumeForApplication: ['A resume is mandatory to apply'],
  requireAcademicVerification: ['Eligibility uses only verified academic data (recommended)'],
  maxActiveBacklogsGlobal: ['College-wide maximum active backlogs for any drive (empty = no cap)'],
  suspendedCompanyDrivePolicy: ['When a company is suspended, its published drives are…', { pause: 'Paused automatically', review: 'Left as is, for manual review' }],
  profileRequiredSections: ['Profile sections required for 100% completion (comma separated: personal, academic, skills, projects, resume)'],
  departments: ['Allowed departments list (comma separated; empty = free text)'],
  offerExpiryReminderHours: ['Remind students this many hours before an offer expires'],
  requireEmailVerification: ['Require e-mail verification before login'],
  allowedStudentEmailDomains: ['Allowed student e-mail domains, e.g. college.edu (comma separated; empty = any)'],
  sessionTtlHours: ['Session lifetime in hours (empty = server default)'],
  maxLoginAttempts: ['Failed logins before lockout (empty = server default)'],
  lockoutMinutes: ['Lockout duration in minutes (empty = server default)'],
  maintenanceMode: ['Maintenance mode — only staff can log in'],
};

function valueText(v) { if (Array.isArray(v)) return v.length ? v.join(', ') : '—'; if (v === null || v === undefined || v === '') return '—'; if (typeof v === 'boolean') return v ? 'Yes' : 'No'; return label(String(v)); }

function History({ k, onClose }) {
  const state = useAsync(() => api.get(`/admin/policies/${k}/history`), [k]);
  return (
    <Modal wide title={`History — ${label(k)}`} onClose={onClose}>
      <Async state={state} empty={<p className="muted">No changes recorded; the default applies.</p>}>
        {(rows) => <DataTable rows={rows} columns={[{ key: 'v', header: 'Value', render: (r) => valueText(r.value) }, { key: 'e', header: 'Effective from', render: (r) => dt(r.effectiveFrom) }, { key: 'b', header: 'Changed by', render: (r) => r.createdBy?.name || '—' }, { key: 'n', header: 'Note', render: (r) => r.note || '—' }]} />}
      </Async>
    </Modal>
  );
}

export function PolicyList({ category }) {
  const toast = useToast();
  const state = useAsync(() => api.get('/admin/policies'), []);
  const [edit, setEdit] = useState(null); const [hist, setHist] = useState(null);
  const save = async (v) => {
    const p = edit; const def = p.default;
    let value = v.value;
    if (typeof def === 'boolean') value = v.value === 'true';
    else if (Array.isArray(def)) value = csv(v.value);
    else if (typeof def === 'number' || def === null) value = v.value === '' ? null : Number.isNaN(Number(v.value)) ? v.value : Number(v.value);
    await api.put(`/admin/policies/${p.key}`, { value, note: v.note || undefined, effectiveFrom: v.effectiveFrom ? fromInputDateTime(v.effectiveFrom) : undefined });
    toast.success('Policy updated and audit-logged'); state.reload();
  };
  return (
    <Async state={state}>
      {(rows) => {
        const list = rows.filter((r) => r.category === category);
        return (
          <>
            <DataTable rows={list.map((r) => ({ ...r, _id: r.key }))} columns={[
              { key: 'k', header: 'Policy', render: (r) => <><strong>{label(r.key)}</strong><div className="small muted">{POLICY_HELP[r.key]?.[0]}</div></> },
              { key: 'v', header: 'Current value', render: (r) => <Badge tone="blue">{valueText(r.value)}</Badge> },
              { key: 'a', header: '', render: (r) => <div className="row gap-sm"><Button size="sm" variant="primary" onClick={() => setEdit(r)}>Change</Button><Button size="sm" onClick={() => setHist(r.key)}>History</Button></div> },
            ]} />
            {hist && <History k={hist} onClose={() => setHist(null)} />}
            {edit && (
              <EditModal title={`Change “${label(edit.key)}”`} initial={{ value: Array.isArray(edit.value) ? edit.value.join(', ') : edit.value ?? '', note: '', effectiveFrom: '' }} onSave={save} onClose={() => setEdit(null)} wide>
                {({ bind }) => <>
                  <Alert kind="info">{POLICY_HELP[edit.key]?.[0]}. Changes are versioned and apply from the effective time; earlier decisions are not rewritten.</Alert>
                  <FormGrid>
                    {typeof edit.default === 'boolean' ? <Select label="Value" options={[{ value: 'true', label: 'Yes / enabled' }, { value: 'false', label: 'No / disabled' }]} {...{ ...bind('value'), value: String(bind('value').value) }} />
                      : POLICY_HELP[edit.key]?.[1] ? <Select label="Value" options={Object.entries(POLICY_HELP[edit.key][1]).map(([value, l]) => ({ value, label: l }))} {...bind('value')} />
                        : <Input label="Value" wide {...bind('value')} />}
                    <Input label="Effective from (optional, default now)" type="datetime-local" {...bind('effectiveFrom')} />
                    <Textarea label="Reason / note" rows={2} {...bind('note')} />
                  </FormGrid>
                </>}
              </EditModal>
            )}
          </>
        );
      }}
    </Async>
  );
}

export default function Policies() {
  usePageTitle('Policies');
  return (
    <>
      <PageHeader title="Placement policies" subtitle="Rules that apply across all drives. Every change is versioned and audit-logged." />
      <Card pad={false}><PolicyList category="placement" /></Card>
    </>
  );
}
