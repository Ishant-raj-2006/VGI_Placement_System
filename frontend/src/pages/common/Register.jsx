import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useForm, usePageTitle } from '../../lib/hooks.js';
import { Alert, Button, Card, FormGrid, Input, Select, Textarea } from '../../components/ui.jsx';
import { CURRENT_YEAR_OPTIONS, DEGREE_OPTIONS, getDepartmentOptions, getSemesterOptions } from '../../lib/academic-courses.js';

const MAX_GRADUATION_YEAR = new Date().getFullYear() + 4;

export default function Register() {
  usePageTitle('Register');
  const [sp, setSp] = useSearchParams();
  const role = sp.get('role') === 'recruiter' ? 'recruiter' : 'student';
  const nav = useNavigate();
  const f = useForm({ name: '', email: '', password: '', confirm: '', studentId: '', rollNumber: '', department: '', departmentOther: '', degree: 'B.Tech', degreeOther: '', currentYear: '', currentSemester: '', graduationYear: new Date().getFullYear() + 1, collegeName: '', companyName: '', website: '', industry: '', headquarters: '', description: '', contactPhone: '', joinCompanyId: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const v = f.values;
  const departmentOptions = getDepartmentOptions(v.degree);
  const semesterOptions = getSemesterOptions(v.currentYear);

  const submit = async (e) => {
    e.preventDefault(); setError(null); f.setErrors({});
    if (role === 'student' && Number(v.graduationYear) > MAX_GRADUATION_YEAR) {
      f.setErrors({ graduationYear: `Graduation year cannot be later than ${MAX_GRADUATION_YEAR}` });
      return;
    }
    if (role === 'student' && (!v.currentYear || !v.currentSemester)) {
      f.setErrors({
        ...(!v.currentYear ? { currentYear: 'Choose your current year' } : {}),
        ...(!v.currentSemester ? { currentSemester: 'Choose your current semester' } : {}),
      });
      return;
    }
    if (role === 'student' && (!v.degree || (v.degree === 'Other' && !v.degreeOther.trim()) || (v.department === 'OTHER' && !v.departmentOther.trim()))) {
      f.setErrors({
        ...(!v.degree || (v.degree === 'Other' && !v.degreeOther.trim()) ? { degree: 'Choose or enter a degree' } : {}),
        ...(v.department === 'OTHER' && !v.departmentOther.trim() ? { departmentOther: 'Enter your branch or specialization' } : {}),
      });
      return;
    }
    if (v.password !== v.confirm) { f.setErrors({ confirm: 'Passwords do not match' }); return; }
    setBusy(true);
    try {
      const body = role === 'student'
        ? { role, name: v.name, email: v.email, password: v.password, studentId: v.studentId, rollNumber: v.rollNumber, department: v.department === 'OTHER' ? v.departmentOther.trim() : v.department, degree: v.degree === 'Other' ? v.degreeOther.trim() : v.degree, currentSemester: Number(v.currentSemester), graduationYear: Number(v.graduationYear), collegeName: v.collegeName || undefined }
        : { role, name: v.name, email: v.email, password: v.password, ...(v.joinCompanyId ? { joinCompanyId: v.joinCompanyId } : { company: { name: v.companyName, website: v.website || undefined, industry: v.industry || undefined, headquarters: v.headquarters || undefined, description: v.description || undefined, contactPhone: v.contactPhone || undefined } }) };
      const { data } = await api.post('/auth/register', body);
      if (!data.requiresEmailVerification) nav('/login', { state: { registered: true } }); else setDone(data);
    } catch (err) { setError(err); f.setErrors(err.fieldErrors || {}); setBusy(false); }
  };

  if (done) return (
    <div className="auth-wrap"><div className="auth-card"><Card title="Check your e-mail">
      <p>{done.message}</p>
      {done.devVerificationToken && <Alert kind="warn">Development mode: <Link to={`/verify-email?token=${done.devVerificationToken}`}>verify now</Link></Alert>}
      <Link className="btn btn-primary" to="/login">Go to log in</Link>
    </Card></div></div>
  );

  return (
    <div className="auth-wrap">
      <div className="auth-card wide stack">
        <Link to="/" className="brand" style={{ color: 'var(--text)' }}><img className="brand-logo" src="/logo.png" alt="" /> CPMS</Link>
        <Card title="Create your account">
          <div className="role-toggle" role="group" aria-label="Account type">
            <button type="button" aria-pressed={role === 'student'} onClick={() => setSp({ role: 'student' })}>Student</button>
            <button type="button" aria-pressed={role === 'recruiter'} onClick={() => setSp({ role: 'recruiter' })}>Recruiter</button>
          </div>
          {error && <Alert kind="error">{error.message}</Alert>}
          <form onSubmit={submit} noValidate>
            <FormGrid>
              <Input label="Full name" required {...f.bind('name')} autoComplete="name" />
              <Input label="E-mail" type="email" required {...f.bind('email')} autoComplete="email" hint={role === 'student' ? 'Use your college e-mail address' : 'Use your company e-mail address'} />
              <Input label="Password" type="password" required {...f.bind('password')} autoComplete="new-password" hint="8+ characters with upper-case, lower-case and a digit" />
              <Input label="Confirm password" type="password" required {...f.bind('confirm')} autoComplete="new-password" />
              {role === 'student' ? <>
                <Input label="Student ID" required {...f.bind('studentId')} />
                <Input label="Roll number" required {...f.bind('rollNumber')} />
                <Select label="Degree" required placeholder="Select degree…" options={DEGREE_OPTIONS} {...f.bind('degree')} onChange={(e) => f.setValues({ ...v, degree: e.target.value, degreeOther: '', department: '', departmentOther: '' })} />
                {v.degree === 'Other' && <Input label="Enter degree" required maxLength="60" {...f.bind('degreeOther')} />}
                {v.degree === 'Other' ? <Input label="Department / Branch / Specialization" required maxLength="40" {...f.bind('departmentOther')} /> : <>
                  <Select label="Department / Branch" required placeholder={v.degree ? 'Select branch…' : 'Select a degree first'} disabled={!v.degree} options={departmentOptions} {...f.bind('department')} onChange={(e) => f.setValues({ ...v, department: e.target.value, departmentOther: '' })} />
                  {v.department === 'OTHER' && <Input label="Enter branch / specialization" required maxLength="40" {...f.bind('departmentOther')} />}
                </>}
                <Select label="Current year" required placeholder="Select year…" options={CURRENT_YEAR_OPTIONS} {...f.bind('currentYear')} onChange={(e) => f.setValues({ ...v, currentYear: e.target.value, currentSemester: '' })} />
                <Select label="Current semester" required placeholder={v.currentYear ? 'Select semester…' : 'Select a year first'} disabled={!v.currentYear} options={semesterOptions} {...f.bind('currentSemester')} />
                <Input label="Graduation year" type="number" required min="2000" max={MAX_GRADUATION_YEAR} {...f.bind('graduationYear')} />
                <Input label="College name" {...f.bind('collegeName')} />
              </> : <>
                <Input label="Join an existing company (company ID)" {...f.bind('joinCompanyId')} hint="Optional: leave empty to register a new company. Your access must be approved by the company owner." wide />
                {!v.joinCompanyId && <>
                  <Input label="Company name" required {...f.bind('companyName')} />
                  <Input label="Website" type="url" placeholder="https://" {...f.bind('website')} />
                  <Input label="Industry" {...f.bind('industry')} />
                  <Input label="Headquarters" {...f.bind('headquarters')} />
                  <Input label="Company contact phone" {...f.bind('contactPhone')} />
                  <Textarea label="About the company" rows={3} {...f.bind('description')} />
                </>}
              </>}
            </FormGrid>
            <div className="form-actions"><Button type="submit" variant="primary" loading={busy}>Create account</Button></div>
          </form>
          <p className="small muted">Already registered? <Link to="/login">Log in</Link>. {role === 'student' && 'Your academic details will be verified by the placement cell before you can apply to drives that need verified data.'}{role === 'recruiter' && 'Your company must be verified by the placement cell before you can publish drives.'}</p>
        </Card>
      </div>
    </div>
  );
}
