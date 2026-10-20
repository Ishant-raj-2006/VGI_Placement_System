export const dt = (v, opts) => (v ? new Date(v).toLocaleString(undefined, opts || { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const d = (v) => (v ? new Date(v).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');
export const label = (s) => (s ? String(s).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');
export const num = (v, digits = 0) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: digits }));
export function money(amount, currency = 'INR', kind) {
  if (amount === null || amount === undefined || amount === '') return '—';
  const f = Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const unit = kind === 'monthly_stipend' ? ' / month' : kind === 'annual_ctc' ? ' / year' : '';
  return `${currency === 'INR' ? '₹' : currency + ' '}${f}${unit}`;
}
export function compensationText(c) {
  if (!c) return '—';
  const amt = c.ctc ?? c.stipend ?? c.amount;
  if (amt != null) return money(amt, c.currency || 'INR', c.kind);
  if (c.min != null || c.max != null) return `${money(c.min, c.currency || 'INR')} – ${money(c.max, c.currency || 'INR', c.kind)}`;
  return label(c.kind);
}
export const toInputDateTime = (v) => { if (!v) return ''; const x = new Date(v); const p = (n) => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`; };
export const toInputDate = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');
export const fromInputDateTime = (v) => (v ? new Date(v).toISOString() : undefined);
export const csv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
export const clean = (obj) => { const o = {}; for (const [k, v] of Object.entries(obj)) if (v !== '' && v !== undefined && v !== null && !(Array.isArray(v) && !v.length)) o[k] = v; return o; };
export const timeLeft = (deadline) => {
  const ms = new Date(deadline) - Date.now();
  if (Number.isNaN(ms)) return '';
  if (ms <= 0) return 'Closed';
  const h = Math.floor(ms / 36e5);
  return h >= 48 ? `${Math.floor(h / 24)} days left` : h >= 1 ? `${h}h left` : `${Math.max(1, Math.floor(ms / 6e4))}m left`;
};
