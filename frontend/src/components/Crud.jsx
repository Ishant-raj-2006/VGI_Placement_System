import { useState } from 'react';
import { Button, ConfirmDialog, Empty, ErrorBox, Modal, useToast } from './ui.jsx';

/** Generic add/edit modal around a form. renderFields(values, bind, errors) returns the inputs. */
export function EditModal({ title, initial, onSave, onClose, children, wide }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setValues((s) => ({ ...s, [k]: v }));
  const bind = (k) => ({ name: k, value: values[k] ?? '', onChange: (e) => set(k, e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e), error: errors[k] });
  const submit = async (e) => {
    e?.preventDefault(); setBusy(true); setError(null); setErrors({});
    try { await onSave(values); onClose(true); } catch (err) { setError(err); setErrors(err.fieldErrors || {}); setBusy(false); }
  };
  return (
    <Modal title={title} wide={wide} onClose={() => !busy && onClose(false)} footer={<><Button onClick={() => onClose(false)} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Save</Button></>}>
      <ErrorBox error={error} />
      <form onSubmit={submit}>{children({ values, set, bind, errors })}<button type="submit" hidden /></form>
    </Modal>
  );
}

/** Small helper for rows with Edit / Delete buttons. */
export function RowActions({ onEdit, onDelete, deleteMessage = 'This cannot be undone.' }) {
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  return (
    <div className="row gap-sm">
      {onEdit && <Button size="sm" onClick={onEdit}>Edit</Button>}
      {onDelete && <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>Delete</Button>}
      {confirm && <ConfirmDialog title="Delete this entry?" message={deleteMessage} danger confirmLabel="Delete" onClose={() => setConfirm(false)} onConfirm={async () => { await onDelete(); toast.success('Deleted'); }} />}
    </div>
  );
}
export { Empty };
