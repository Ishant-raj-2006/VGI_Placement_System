import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useForm, usePageTitle } from '../../lib/hooks.js';
import { Alert, Button, Card, Input, PageHeader } from '../../components/ui.jsx';

export default function AddStudent() {
  usePageTitle('Add student');
  const nav = useNavigate();
  const f = useForm({ name: '', studentId: '', dateOfBirth: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [createdStudent, setCreatedStudent] = useState(null);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    f.setErrors({});
    setBusy(true);
    try {
      const { data } = await api.post('/admin/students', f.values);
      setCreatedStudent(data.student);
    } catch (err) {
      setError(err);
      f.setErrors(err.fieldErrors || {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader back={<Link to="/admin/students">Back to students</Link>} title="Add student" subtitle="Create a student account using their college ID and date of birth." />
      <Card title={createdStudent ? 'Student account created' : 'Student details'}>
        {createdStudent ? (
          <div className="stack">
            <Alert kind="success">Student account created for {createdStudent.name}.</Alert>
            <p>Student login ID: <strong>{createdStudent.studentId}</strong></p>
            <p>Temporary password: the student's date of birth in <strong>YYYY-MM-DD</strong> format. The student must change it at first login, then complete their profile.</p>
            <div className="form-actions">
              <Button variant="primary" onClick={() => nav('/admin/students')}>Back to students</Button>
              <Button onClick={() => { setCreatedStudent(null); f.reset(); }}>Add another student</Button>
            </div>
          </div>
        ) : (
          <>
            {error && <Alert kind="error">{error.message}</Alert>}
            <Alert kind="info">The student will sign in with their college ID. Their date of birth is the temporary password and must be changed at first login.</Alert>
            <form onSubmit={submit} className="stack-sm">
              <Input label="Student name" required maxLength="120" autoComplete="name" {...f.bind('name')} />
              <Input label="College ID" required maxLength="40" {...f.bind('studentId')} />
              <Input label="Date of birth" type="date" required min="1900-01-01" max={today} {...f.bind('dateOfBirth')} />
              <div className="form-actions"><Button type="submit" variant="primary" loading={busy}>Create student account</Button></div>
            </form>
          </>
        )}
      </Card>
    </>
  );
}
