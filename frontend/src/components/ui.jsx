import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { label as fmtLabel } from '../lib/format.js';

/* ------------------------------------------------------------------ feedback */
export function Spinner({ size = 20, text }) {
  return (
    <span className="spinner-wrap" role="status" aria-live="polite">
      <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />
      {text ? <span>{text}</span> : <span className="sr-only">Loading…</span>}
    </span>
  );
}
export const PageLoader = ({ text = 'Loading…' }) => <div className="center-block"><Spinner size={28} text={text} /></div>;

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="alert alert-error" role="alert">
      <div><strong>{error.message || 'Something went wrong.'}</strong>{error.code ? <span className="muted small"> ({error.code})</span> : null}</div>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}
export const Alert = ({ kind = 'info', children, onClose }) => (
  <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
    <div>{children}</div>
    {onClose && <button className="icon-btn" aria-label="Dismiss" onClick={onClose}>×</button>}
  </div>
);
export const Empty = ({ title = 'Nothing here yet', children, action }) => (
  <div className="empty"><div className="empty-icon" aria-hidden="true">∅</div><h3>{title}</h3>{children && <p className="muted">{children}</p>}{action}</div>
);

/** Renders loading / error / content for a useAsync() result. */
export function Async({ state, children, empty }) {
  if (state.loading && state.data === undefined) return <PageLoader />;
  if (state.error && state.data === undefined) return <ErrorBox error={state.error} onRetry={state.reload} />;
  if (empty && (state.data == null || (Array.isArray(state.data) && !state.data.length))) return empty;
  return <>{state.error && <ErrorBox error={state.error} onRetry={state.reload} />}{children(state.data, state.meta)}</>;
}

/* ------------------------------------------------------------------ toasts */
const ToastCtx = createContext({ push: () => {} });
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, kind = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l.slice(-3), { id, message, kind }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);
  const api = { push, success: (m) => push(m, 'success'), error: (m) => push(m?.message || m, 'error'), info: (m) => push(m, 'info') };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>{t.message}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------------------------------------------ badges */
const TONE = {
  green: ['verified', 'approved', 'published', 'active', 'eligible', 'offer_accepted', 'accepted', 'passed', 'completed', 'resolved', 'selected', 'issued', 'open', 'success'],
  red: ['rejected', 'ineligible', 'failed', 'offer_declined', 'declined', 'suspended', 'cancelled', 'withdrawn_offer', 'no_show', 'deactivated', 'locked', 'expired', 'absent', 'failed_email'],
  amber: ['pending', 'pending_verification', 'submitted', 'under_review', 'in_progress', 'correction_required', 'changes_requested', 'on_hold', 'paused', 'queued', 'retrying', 'draft', 'further_evaluation', 'planned'],
  blue: ['applied', 'shortlisted', 'assessment', 'interview', 'offered', 'scheduled', 'rescheduled', 'tpo', 'recruiter', 'student', 'super_admin', 'closed'],
  gray: ['withdrawn', 'not_selected', 'superseded', 'inactive'],
};
export function toneOf(s) { const k = String(s || '').toLowerCase(); return Object.keys(TONE).find((t) => TONE[t].includes(k)) || 'gray'; }
export const Badge = ({ children, tone }) => <span className={`badge badge-${tone || 'gray'}`}>{children}</span>;
export const StatusBadge = ({ status }) => (status ? <Badge tone={toneOf(status)}>{fmtLabel(status)}</Badge> : <span className="muted">—</span>);

/* ------------------------------------------------------------------ layout bits */
export const Card = ({ title, actions, children, className = '', pad = true }) => (
  <section className={`card ${className}`}>
    {(title || actions) && <header className="card-head"><h2>{title}</h2><div className="row gap-sm">{actions}</div></header>}
    <div className={pad ? 'card-body' : ''}>{children}</div>
  </section>
);
export const PageHeader = ({ title, subtitle, actions, back }) => (
  <div className="page-head">
    <div>{back}<h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>
    {actions && <div className="row gap-sm wrap">{actions}</div>}
  </div>
);
export const Stat = ({ label, value, hint, tone, to }) => (
  <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
    <div className="stat-value">{value ?? '—'}</div><div className="stat-label">{label}</div>{hint && <div className="stat-hint">{hint}</div>}
  </div>
);
export const KV = ({ items }) => (
  <dl className="kv">{items.filter(Boolean).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v ?? '—'}</dd></div>)}</dl>
);
export function ProgressBar({ value, label }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="progress" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Progress'}>
      <div className="progress-track"><div className="progress-bar" style={{ width: `${v}%` }} /></div><span className="progress-text">{v}%</span>
    </div>
  );
}
export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} className={`tab ${value === t.key ? 'active' : ''}`} onClick={() => onChange(t.key)}>
          {t.label}{t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function Timeline({ events }) {
  if (!events?.length) return <p className="muted">No history yet.</p>;
  return (
    <ol className="timeline">
      {events.map((e, i) => (
        <li key={e._id || i}>
          <span className="tl-dot" />
          <div>
            <strong>{e.fromStatus ? `${fmtLabel(e.fromStatus)} → ` : ''}{fmtLabel(e.toStatus || e.status || e.title)}</strong>
            <div className="muted small">{e.createdAt ? new Date(e.createdAt).toLocaleString() : ''}{e.actorRole ? ` · ${fmtLabel(e.actorRole)}` : ''}</div>
            {e.reason && <div className="small">{e.reason}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ buttons */
export function Button({ loading, children, variant = 'default', size, className = '', ...rest }) {
  return (
    <button className={`btn btn-${variant} ${size ? `btn-${size}` : ''} ${className}`} disabled={loading || rest.disabled} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="spinner spinner-sm" aria-hidden="true" />}{children}
    </button>
  );
}

/* ------------------------------------------------------------------ forms */
export function Field({ label, error, hint, required, children, wide }) {
  const id = useId();
  const child = typeof children === 'function' ? children({ id, 'aria-invalid': !!error || undefined, 'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined }) : children;
  return (
    <div className={`field ${wide ? 'field-wide' : ''}`}>
      {label && <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true"> *</span>}</label>}
      {child}
      {hint && !error && <div id={`${id}-hint`} className="hint">{hint}</div>}
      {error && <div id={`${id}-err`} className="field-error" role="alert">{error}</div>}
    </div>
  );
}
export const Input = ({ label, error, hint, required, wide, type = 'text', ...props }) => (
  <Field label={label} error={error} hint={hint} required={required} wide={wide}>{(a) => <input type={type} required={required} {...a} {...props} />}</Field>
);
export const Textarea = ({ label, error, hint, required, wide = true, rows = 4, ...props }) => (
  <Field label={label} error={error} hint={hint} required={required} wide={wide}>{(a) => <textarea rows={rows} required={required} {...a} {...props} />}</Field>
);
export const Select = ({ label, error, hint, required, wide, options = [], placeholder, ...props }) => (
  <Field label={label} error={error} hint={hint} required={required} wide={wide}>
    {(a) => (
      <select required={required} {...a} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => { const v = typeof o === 'object' ? o.value : o; const l = typeof o === 'object' ? o.label : fmtLabel(o); return <option key={v} value={v}>{l}</option>; })}
      </select>
    )}
  </Field>
);
export const Checkbox = ({ label, ...props }) => <label className="check"><input type="checkbox" {...props} /> <span>{label}</span></label>;
export const FormGrid = ({ children }) => <div className="form-grid">{children}</div>;

/* ------------------------------------------------------------------ modal / confirm */
export function Modal({ title, onClose, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header className="modal-head"><h2>{title}</h2><button className="icon-btn" aria-label="Close dialog" onClick={onClose}>×</button></header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** Confirmation dialog with optional reason field. onConfirm(reason) may be async; errors are shown inside the dialog. */
export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, reasonLabel, reasonRequired, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    if (reasonLabel && reasonRequired && !reason.trim()) { setError({ message: `${reasonLabel} is required` }); return; }
    setBusy(true); setError(null);
    try { await onConfirm(reason.trim() || undefined); onClose(); } catch (e) { setError(e); setBusy(false); }
  };
  return (
    <Modal title={title} onClose={busy ? undefined : onClose} footer={<>
      <Button onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={submit}>{confirmLabel}</Button>
    </>}>
      {message && <p>{message}</p>}
      {reasonLabel && <Textarea label={reasonLabel} required={reasonRequired} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
      <ErrorBox error={error} />
    </Modal>
  );
}
/** Hook returning [element, ask(config)] for imperative confirmation dialogs. */
export function useConfirm() {
  const [cfg, setCfg] = useState(null);
  const el = cfg ? <ConfirmDialog {...cfg} onClose={() => setCfg(null)} /> : null;
  return [el, (c) => setCfg(c)];
}

/* ------------------------------------------------------------------ table + pagination */
export function Pagination({ meta, onPage }) {
  if (!meta || !meta.totalPages || meta.totalPages <= 1) return meta?.total != null ? <div className="pager muted small">{meta.total} record{meta.total === 1 ? '' : 's'}</div> : null;
  const { page, totalPages, total } = meta;
  return (
    <nav className="pager" aria-label="Pagination">
      <span className="muted small">{total} records · page {page} of {totalPages}</span>
      <div className="row gap-sm">
        <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Previous</Button>
        <Button size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next ›</Button>
      </div>
    </nav>
  );
}

/** columns: [{ key, header, render?(row), className?, sortable? }]. Wrapped for horizontal scroll on small screens. */
export function DataTable({ columns, rows, rowKey = '_id', onRowClick, selectable, selected, onSelect, empty, caption }) {
  if (!rows?.length) return empty || <Empty title="No records found">Try changing the filters.</Empty>;
  const allSelected = selectable && rows.every((r) => selected?.has(r[rowKey]));
  return (
    <div className="table-wrap">
      <table className="table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {selectable && <th className="cell-check"><input type="checkbox" aria-label="Select all rows" checked={!!allSelected} onChange={(e) => onSelect(new Set(e.target.checked ? rows.map((r) => r[rowKey]) : []))} /></th>}
            {columns.map((c) => <th key={c.key} className={c.className} scope="col">{c.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[rowKey]} className={onRowClick ? 'clickable' : ''} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {selectable && <td className="cell-check" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="Select row" checked={!!selected?.has(r[rowKey])} onChange={(e) => { const n = new Set(selected); e.target.checked ? n.add(r[rowKey]) : n.delete(r[rowKey]); onSelect(n); }} /></td>}
              {columns.map((c) => <td key={c.key} className={c.className} data-label={typeof c.header === 'string' ? c.header : undefined}>{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FilterBar({ children }) { return <div className="filter-bar">{children}</div>; }
export function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  return <input type="search" className="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
}

/** Horizontal bar chart (pure CSS, accessible). items: [{label, value, hint?}] */
export function BarList({ items, max, format = (v) => v }) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value || 0));
  return (
    <ul className="barlist">
      {items.map((i) => (
        <li key={i.label}>
          <span className="bl-label">{i.label}</span>
          <span className="bl-track" aria-hidden="true"><span className="bl-fill" style={{ width: `${Math.min(100, ((i.value || 0) / m) * 100)}%` }} /></span>
          <span className="bl-val">{format(i.value)}{i.hint ? <span className="muted small"> {i.hint}</span> : null}</span>
        </li>
      ))}
    </ul>
  );
}

/** Hook: server-paginated list state (page + filters) */
export function useListState(initial = {}) {
  const [params, setParams] = useState({ page: 1, limit: 20, ...initial });
  const setFilter = (k, v) => setParams((p) => ({ ...p, [k]: v, page: 1 }));
  return { params, setFilter, setPage: (page) => setParams((p) => ({ ...p, page })), setParams };
}
