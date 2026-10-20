import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAsync, useForm, usePageTitle } from '../../lib/hooks.js';
import { Alert, Async, Button, Card, FormGrid, Input, PageHeader, Select, Textarea, useToast } from '../../components/ui.jsx';
import { COMPENSATION_KINDS, DEPARTMENTS, EMPLOYMENT_TYPES, WORK_MODES } from '../../lib/constants.js';
import { csv, fromInputDateTime, toInputDateTime } from '../../lib/format.js';

const initial = { jobTitle: '', description: '', responsibilities: '', qualifications: '', requiredSkills: '', employmentType: 'full_time', workMode: 'onsite', locations: '', vacancies: 1,
  kind: 'annual_ctc', ctc: '', stipend: '', min: '', max: '', currency: 'INR', compNotes: '',
  minimumCgpa: '', minimumTenthPercentage: '', minimumTwelfthPercentage: '', maximumActiveBacklogs: '', maximumTotalBacklogs: '', degrees: '', additionalRequirements: '', allowedDepartments: '', graduationYears: '',
  applicationOpensAt: '', applicationDeadline: '', driveStartDate: '', selectionProcess: '' };

const num = (v) => (v === '' || v == null ? undefined : Number(v));

export default function DriveForm() {
  const { id } = useParams();
  const editing = !!id;
  usePageTitle(editing ? 'Edit drive' : 'New drive');
  const nav = useNavigate(); const toast = useToast();
  const existing = useAsync(() => (editing ? api.get(`/recruiter/drives/${id}`) : Promise.resolve({ data: null })), [id]);
  const f = useForm(initial);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const v = f.values;

  useEffect(() => {
    const dr = existing.data?.drive; if (!dr) return;
    const r = dr.eligibilityRules || {}; const c = dr.compensation || {};
    f.setValues({ ...initial, jobTitle: dr.jobTitle, description: dr.description, responsibilities: dr.responsibilities || '', qualifications: dr.qualifications || '', requiredSkills: (dr.requiredSkills || []).join(', '),
      employmentType: dr.employmentType, workMode: dr.workMode || 'onsite', locations: (dr.locations || []).join(', '), vacancies: dr.vacancies || 1,
      kind: c.kind, ctc: c.ctc ?? '', stipend: c.stipend ?? '', min: c.min ?? '', max: c.max ?? '', currency: c.currency || 'INR', compNotes: c.notes || '',
      minimumCgpa: r.minimumCgpa ?? '', minimumTenthPercentage: r.minimumTenthPercentage ?? '', minimumTwelfthPercentage: r.minimumTwelfthPercentage ?? '', maximumActiveBacklogs: r.maximumActiveBacklogs ?? '', maximumTotalBacklogs: r.maximumTotalBacklogs ?? '',
      degrees: (r.degrees || []).join(', '), additionalRequirements: r.additionalRequirements || '', allowedDepartments: (dr.allowedDepartments || []).join(', '), graduationYears: (dr.graduationYears || []).join(', '),
      applicationOpensAt: toInputDateTime(dr.applicationOpensAt), applicationDeadline: toInputDateTime(dr.applicationDeadline), driveStartDate: toInputDateTime(dr.driveStartDate),
      selectionProcess: (dr.selectionProcess || []).map((s) => s.name).join(', ') });
  }, [existing.data?.drive?._id]); // eslint-disable-line

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null); f.setErrors({});
    const body = {
      jobTitle: v.jobTitle, description: v.description, responsibilities: v.responsibilities || undefined, qualifications: v.qualifications || undefined,
      requiredSkills: csv(v.requiredSkills), employmentType: v.employmentType, workMode: v.workMode, locations: csv(v.locations), vacancies: num(v.vacancies) || 1,
      compensation: { kind: v.kind, currency: v.currency || 'INR', ...(v.kind === 'annual_ctc' ? { ctc: num(v.ctc) } : { stipend: num(v.stipend) }), min: num(v.min), max: num(v.max), notes: v.compNotes || undefined },
      eligibilityRules: { minimumCgpa: num(v.minimumCgpa), minimumTenthPercentage: num(v.minimumTenthPercentage), minimumTwelfthPercentage: num(v.minimumTwelfthPercentage), maximumActiveBacklogs: num(v.maximumActiveBacklogs), maximumTotalBacklogs: num(v.maximumTotalBacklogs), degrees: csv(v.degrees), additionalRequirements: v.additionalRequirements || undefined },
      allowedDepartments: csv(v.allowedDepartments).map((s) => s.toUpperCase()), graduationYears: csv(v.graduationYears).map(Number).filter(Boolean),
      applicationOpensAt: fromInputDateTime(v.applicationOpensAt), applicationDeadline: fromInputDateTime(v.applicationDeadline), driveStartDate: fromInputDateTime(v.driveStartDate),
      selectionProcess: csv(v.selectionProcess).map((name) => ({ name })),
    };
    // Optional numbers must be removed (undefined is dropped by JSON.stringify)
    try {
      if (editing) {
        const { data } = await api.put(`/recruiter/drives/${id}`, body);
        toast.success(data.rulesVersioned ? 'Saved. Eligibility rules changed, so a new rules version was created.' : 'Drive saved'); nav(`/recruiter/drives/${id}`);
      } else {
        const { data } = await api.post('/recruiter/drives', body); toast.success('Draft created'); nav(`/recruiter/drives/${data._id}`);
      }
    } catch (err) { setError(err); f.setErrors(err.fieldErrors); window.scrollTo({ top: 0, behavior: 'smooth' }); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader back={<Link className="back" to={editing ? `/recruiter/drives/${id}` : '/recruiter/drives'}>← Back</Link>} title={editing ? 'Edit drive' : 'Create a drive'} subtitle="Drives are saved as drafts, then submitted to the placement cell for approval." />
      <Async state={existing}>
        {() => (
          <form onSubmit={submit}>
            {error && <Alert kind="error">{error.message}{Object.entries(error.fieldErrors || {}).map(([k, m]) => <div key={k} className="small">{k}: {m}</div>)}</Alert>}
            {editing && existing.data?.drive?.approvalStatus === 'approved' && <Alert kind="warn">This drive is approved. Changing eligibility rules creates a new rules version; the placement cell may need to re-approve it depending on policy.</Alert>}
            <Card title="Job details">
              <FormGrid>
                <Input label="Job title" required wide {...f.bind('jobTitle')} />
                <Textarea label="Description" required rows={6} {...f.bind('description')} />
                <Textarea label="Responsibilities" rows={3} {...f.bind('responsibilities')} />
                <Textarea label="Qualifications" rows={3} {...f.bind('qualifications')} />
                <Select label="Employment type" required options={EMPLOYMENT_TYPES} {...f.bind('employmentType')} />
                <Select label="Work mode" options={WORK_MODES} {...f.bind('workMode')} />
                <Input label="Locations" hint="Comma separated" {...f.bind('locations')} />
                <Input label="Vacancies" type="number" min="1" {...f.bind('vacancies')} />
                <Input label="Required skills" hint="Comma separated" wide {...f.bind('requiredSkills')} />
                <Input label="Selection process" hint="Comma separated stage names, e.g. Aptitude, Technical interview, HR" wide {...f.bind('selectionProcess')} />
              </FormGrid>
            </Card>
            <Card title="Compensation">
              <Alert kind="info">Annual CTC and monthly stipend are different units and are never mixed in reports.</Alert>
              <FormGrid>
                <Select label="Type" required options={COMPENSATION_KINDS} {...f.bind('kind')} />
                <Input label="Currency" maxLength={3} {...f.bind('currency')} />
                {v.kind === 'annual_ctc' ? <Input label="CTC per year" type="number" min="0" {...f.bind('ctc')} /> : <Input label="Stipend per month" type="number" min="0" {...f.bind('stipend')} />}
                <Input label="Range minimum (optional)" type="number" min="0" {...f.bind('min')} />
                <Input label="Range maximum (optional)" type="number" min="0" {...f.bind('max')} />
                <Input label="Notes" {...f.bind('compNotes')} />
              </FormGrid>
            </Card>
            <Card title="Eligibility rules">
              <p className="muted small">Leave a field empty for “no restriction”. The system evaluates students from verified academic data; recruiters cannot override it.</p>
              <FormGrid>
                <Input label="Minimum CGPA" type="number" step="0.01" min="0" max="10" {...f.bind('minimumCgpa')} />
                <Input label="Maximum active backlogs" type="number" min="0" {...f.bind('maximumActiveBacklogs')} />
                <Input label="Maximum total backlogs" type="number" min="0" {...f.bind('maximumTotalBacklogs')} />
                <Input label="Minimum 10th %" type="number" step="0.01" min="0" max="100" {...f.bind('minimumTenthPercentage')} />
                <Input label="Minimum 12th / diploma %" type="number" step="0.01" min="0" max="100" {...f.bind('minimumTwelfthPercentage')} />
                <Input label="Allowed degrees" hint="Comma separated, e.g. B.Tech, M.Tech" {...f.bind('degrees')} />
                <Input label="Allowed departments" hint={`Comma separated, e.g. ${DEPARTMENTS.slice(0, 3).join(', ')} (empty = all)`} {...f.bind('allowedDepartments')} />
                <Input label="Graduation years" hint="Comma separated, e.g. 2027, 2028 (empty = all)" {...f.bind('graduationYears')} />
                <Textarea label="Additional requirements (informational)" rows={2} {...f.bind('additionalRequirements')} />
              </FormGrid>
            </Card>
            <Card title="Schedule">
              <FormGrid>
                <Input label="Applications open" type="datetime-local" required {...f.bind('applicationOpensAt')} />
                <Input label="Application deadline" type="datetime-local" required {...f.bind('applicationDeadline')} />
                <Input label="Drive start date" type="datetime-local" {...f.bind('driveStartDate')} />
              </FormGrid>
            </Card>
            <div className="form-actions"><Link className="btn" to={editing ? `/recruiter/drives/${id}` : '/recruiter/drives'}>Cancel</Link><Button type="submit" variant="primary" loading={busy}>{editing ? 'Save changes' : 'Save draft'}</Button></div>
          </form>
        )}
      </Async>
    </>
  );
}
