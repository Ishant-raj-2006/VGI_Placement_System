import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useForm, usePageTitle } from '../../lib/hooks.js';
import { Alert, Button, Card, Checkbox, FormGrid, Input, KV, PageHeader, useToast } from '../../components/ui.jsx';
import { dt, label } from '../../lib/format.js';

export default function Settings() {
  usePageTitle('Account settings');
  const { user, profile, refresh } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [emailPref, setEmailPref] = useState(user.notificationPrefs?.email !== false);
  const [busy, setBusy] = useState(false);
  const pw = useForm({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwErr, setPwErr] = useState(null); const [pwBusy, setPwBusy] = useState(false);

  const saveProfile = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.put('/auth/me', { name, notificationPrefs: { email: emailPref } }); await refresh(); toast.success('Settings saved'); } catch (err) { toast.error(err); } finally { setBusy(false); }
  };
  const changePw = async (e) => {
    e.preventDefault(); setPwErr(null); pw.setErrors({});
    const v = pw.values;
    if (v.newPassword !== v.confirm) { pw.setErrors({ confirm: 'Passwords do not match' }); return; }
    setPwBusy(true);
    try { await api.post('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword }); toast.success('Password changed. Other sessions were signed out.'); pw.reset(); }
    catch (err) { setPwErr(err); pw.setErrors(err.fieldErrors); } finally { setPwBusy(false); }
  };
  return (
    <>
      <PageHeader title="Account settings" />
      <div className="grid grid-2">
        <Card title="Profile">
          <KV items={user.role === 'student'
            ? [['College ID', profile?.studentId], ['Role', label(user.role)], ['Last login', dt(user.lastLoginAt)]]
            : [['E-mail', user.email], ['Role', label(user.role)], ['Last login', dt(user.lastLoginAt)]]} />
          <form onSubmit={saveProfile} style={{ marginTop: '1rem' }}>
            <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
            {user.role !== 'student' && <div style={{ margin: '1rem 0' }}><Checkbox label="Also send important notifications by e-mail" checked={emailPref} onChange={(e) => setEmailPref(e.target.checked)} /></div>}
            <Button type="submit" variant="primary" loading={busy}>Save changes</Button>
          </form>
        </Card>
        <Card title="Change password">
          {pwErr && <Alert kind="error">{pwErr.message}</Alert>}
          <form onSubmit={changePw}><FormGrid>
            <Input label="Current password" type="password" autoComplete="current-password" required wide {...pw.bind('currentPassword')} />
            <Input label="New password" type="password" autoComplete="new-password" required wide hint="8+ characters with upper-case, lower-case and a digit" {...pw.bind('newPassword')} />
            <Input label="Confirm new password" type="password" autoComplete="new-password" required wide {...pw.bind('confirm')} />
          </FormGrid>
          <div className="form-actions"><Button type="submit" variant="primary" loading={pwBusy}>Change password</Button></div></form>
        </Card>
      </div>
    </>
  );
}
