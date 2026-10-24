import { useEffect, useRef, useState } from 'react';
import { api, fetchBlob } from '../../lib/api.js';
import { useAsync, useForm, usePageTitle } from '../../lib/hooks.js';
import { useAuth } from '../../lib/auth.jsx';
import { Alert, Async, Button, Card, FormGrid, Input, PageHeader, ProgressBar, Select, useToast } from '../../components/ui.jsx';
import { toInputDate, label } from '../../lib/format.js';
import { CURRENT_YEAR_OPTIONS, DEGREE_OPTIONS, getDepartmentOptions, getSemesterOptions } from '../../lib/academic-courses.js';

const MAX_GRADUATION_YEAR = new Date().getFullYear() + 4;

function Photo({ profileId, has, onChange }) {
  const [src, setSrc] = useState(null);
  const input = useRef(null);
  const toast = useToast();
  useEffect(() => {
    let url; let live = true;
    if (has) fetchBlob(`/files/photos/${profileId}`).then(({ blob }) => { if (live) { url = URL.createObjectURL(blob); setSrc(url); } }).catch(() => {});
    else setSrc(null);
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [profileId, has]);
  const upload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try { await api.upload('/student/profile/photo', file); toast.success('Photo updated'); onChange(); } catch (err) { toast.error(err); }
    e.target.value = '';
  };
  const remove = async () => { try { await api.del('/student/profile/photo'); onChange(); } catch (err) { toast.error(err); } };
  return (
    <div className="row gap">
      {src ? <img src={src} alt="Your profile" width="88" height="88" style={{ borderRadius: '50%', objectFit: 'cover' }} /> : <span className="avatar" style={{ width: 88, height: 88, fontSize: '2rem' }} aria-hidden="true">📷</span>}
      <div className="stack-sm">
        <input ref={input} type="file" accept="image/png,image/jpeg" hidden onChange={upload} aria-label="Upload photo" />
        <Button size="sm" onClick={() => input.current.click()}>{has ? 'Change photo' : 'Upload photo'}</Button>
        {has && <Button size="sm" variant="ghost" onClick={remove}>Remove</Button>}
        <div className="hint">Optional. JPG or PNG, up to 1 MB.</div>
      </div>
    </div>
  );
}

export default function Profile() {
  usePageTitle('Personal details');
  const toast = useToast();
  const { refresh } = useAuth();
  const state = useAsync(() => api.get('/student/profile'), []);
  const f = useForm({});
  const [loadedId, setLoadedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [error, setError] = useState(null);
  const resumeInput = useRef(null);
  const d = state.data;
  const departmentOptions = getDepartmentOptions(f.values.degree);
  const degreeOptions = f.values.degree && !DEGREE_OPTIONS.some((option) => option.value === f.values.degree)
    ? [...DEGREE_OPTIONS, { value: f.values.degree, label: `${f.values.degree} (current)` }]
    : DEGREE_OPTIONS;
  const customDepartment = f.values.degree === 'Other' || (f.values.degree && departmentOptions.length === 0);
  const profileDepartmentOptions = f.values.department && !departmentOptions.some((option) => option.value === f.values.department)
    ? [{ value: f.values.department, label: `${f.values.department} (current)` }, ...departmentOptions]
    : departmentOptions;
  const semesterOptions = getSemesterOptions(f.values.currentYear);
  useEffect(() => {
    if (d && loadedId !== d.profile._id) {
      setLoadedId(d.profile._id);
      const currentSemester = d.profile.currentSemester ?? '';
      f.setValues({ name: d.user.name, rollNumber: d.profile.rollNumber?.startsWith('PENDING-') ? '' : d.profile.rollNumber || '', collegeName: d.profile.collegeName || '', degree: d.profile.degree || '', degreeOther: '', department: d.profile.department || '', departmentOther: '', currentYear: currentSemester ? String(Math.ceil(currentSemester / 2)) : '', currentSemester: currentSemester ? String(currentSemester) : '', graduationYear: d.profile.graduationYear || '', contactNumber: d.profile.personal?.contactNumber || '', dateOfBirth: toInputDate(d.profile.personal?.dateOfBirth), address: d.profile.personal?.address || '' });
    }
  }, [d]); // eslint-disable-line

  const save = async (e) => {
    e.preventDefault(); setError(null); f.setErrors({});
    const v = f.values;
    if (Number(v.graduationYear) > MAX_GRADUATION_YEAR) {
      f.setErrors({ graduationYear: `Graduation year cannot be later than ${MAX_GRADUATION_YEAR}` });
      return;
    }
    if ((v.currentYear && !v.currentSemester) || (!v.currentYear && v.currentSemester)) {
      f.setErrors({
        ...(!v.currentYear ? { currentYear: 'Choose your current year' } : {}),
        ...(!v.currentSemester ? { currentSemester: 'Choose your current semester' } : {}),
      });
      return;
    }
    if ((v.degree === 'Other' && !v.degreeOther.trim()) || ((customDepartment || v.department === 'OTHER') && !v.departmentOther.trim())) {
      f.setErrors({
        ...(v.degree === 'Other' && !v.degreeOther.trim() ? { degreeOther: 'Enter your degree' } : {}),
        ...(customDepartment && !v.departmentOther.trim() ? { departmentOther: 'Enter your branch or specialization' } : {}),
        ...(v.department === 'OTHER' && !v.departmentOther.trim() ? { departmentOther: 'Enter your branch or specialization' } : {}),
      });
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.put('/student/profile', { name: v.name, rollNumber: v.rollNumber, collegeName: v.collegeName, degree: v.degree === 'Other' ? v.degreeOther.trim() : v.degree, department: customDepartment || v.department === 'OTHER' ? v.departmentOther.trim() : v.department, currentSemester: v.currentSemester === '' ? null : Number(v.currentSemester), graduationYear: Number(v.graduationYear), personal: { contactNumber: v.contactNumber, dateOfBirth: v.dateOfBirth || null, address: v.address } });
      toast.success(data.verificationReset ? 'Saved. Academic changes need to be verified again.' : 'Profile saved');
      state.reload(); refresh();
    } catch (err) { setError(err); f.setErrors(err.fieldErrors); } finally { setBusy(false); }
  };
  const uploadResume = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeBusy(true);
    try {
      await api.upload('/student/resumes', file);
      toast.success('Resume uploaded');
      state.reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setResumeBusy(false);
      e.target.value = '';
    }
  };

  return (
    <>
      <PageHeader title="Personal details" subtitle="Keep your details accurate — recruiters and the placement cell rely on them." />
      <Async state={state}>
        {(data) => (
          <>
            <Card title="Profile completion"><ProgressBar value={data.completion.percentage} label="Profile completion" />{data.completion.missing.length > 0 && <p className="small muted" style={{ marginTop: '.5rem' }}>Missing: {data.completion.missing.map(label).join(', ')}</p>}</Card>
            <Card title="Photo"><Photo profileId={data.profile._id} has={data.hasPhoto} onChange={state.reload} /></Card>
            <Card title="Resume">
              <p className="muted">Upload a PDF or DOCX resume (up to 2 MB). The placement cell and recruiters for drives you apply to can access it.</p>
              <input ref={resumeInput} type="file" hidden accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={uploadResume} aria-label="Choose resume file" />
              {data.resumes?.length > 0 ? (
                <div className="stack-sm">
                  <p>{data.resumes.length} resume{data.resumes.length === 1 ? '' : 's'} uploaded. Most recent: <strong>{data.resumes[0].originalName}</strong></p>
                  <a className="btn" href="/student/resumes">Manage resumes</a>
                </div>
              ) : <p className="muted">No resume uploaded yet.</p>}
              {data.resumes?.length >= 5 && <p className="hint">You have reached the limit of 5 resumes. Manage existing resumes to make room for another.</p>}
              <div className="form-actions"><Button variant="primary" loading={resumeBusy} disabled={data.resumes?.length >= 5} onClick={() => resumeInput.current?.click()}>Upload resume</Button></div>
            </Card>
            <Card title="Details">
              {error && <Alert kind="error">{error.message}</Alert>}
              <Alert kind="info">College ID <strong>{data.profile.studentId}</strong> is your login ID and cannot be changed. Add your roll number below; once saved, only the placement cell can change it. Changing department or graduation year re-opens academic verification.</Alert>
              <form onSubmit={save}>
                <FormGrid>
                  <Input label="Full name" required {...f.bind('name')} />
                  <Input label="Roll number" required readOnly={!!data.profile.rollNumber && !data.profile.rollNumber.startsWith('PENDING-')} {...f.bind('rollNumber')} />
                  <Input label="Contact number" {...f.bind('contactNumber')} />
                  <Input label="Date of birth" type="date" {...f.bind('dateOfBirth')} />
                  <Input label="College" {...f.bind('collegeName')} />
                  <Select label="Degree" required options={degreeOptions} {...f.bind('degree')} onChange={(e) => f.setValues({ ...f.values, degree: e.target.value, degreeOther: '', department: '', departmentOther: '' })} />
                  {f.values.degree === 'Other' && <Input label="Enter degree" required maxLength="60" {...f.bind('degreeOther')} />}
                  {customDepartment ? <Input label="Department / Branch / Specialization" required maxLength="40" {...f.bind('departmentOther')} /> : <>
                    <Select label="Department / Branch" required options={profileDepartmentOptions} placeholder="Select branch…" {...f.bind('department')} onChange={(e) => f.setValues({ ...f.values, department: e.target.value, departmentOther: '' })} />
                    {f.values.department === 'OTHER' && <Input label="Enter branch / specialization" required maxLength="40" {...f.bind('departmentOther')} />}
                  </>}
                  <Select label="Current year" options={CURRENT_YEAR_OPTIONS} placeholder="Select year…" {...f.bind('currentYear')} onChange={(e) => f.setValues({ ...f.values, currentYear: e.target.value, currentSemester: '' })} />
                  <Select label="Current semester" options={semesterOptions} placeholder={f.values.currentYear ? 'Select semester…' : 'Select a year first'} disabled={!f.values.currentYear} {...f.bind('currentSemester')} />
                  <Input label="Graduation year" type="number" required min="2000" max={MAX_GRADUATION_YEAR} {...f.bind('graduationYear')} />
                  <Input label="Address" wide {...f.bind('address')} />
                </FormGrid>
                <div className="form-actions"><Button type="submit" variant="primary" loading={busy}>Save changes</Button></div>
              </form>
            </Card>
          </>
        )}
      </Async>
    </>
  );
}
