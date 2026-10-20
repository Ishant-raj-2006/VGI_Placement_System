import { StatusBadge } from './ui.jsx';

const ICON = { pass: ['✓', 'check-pass'], fail: ['✕', 'check-fail'], pending: ['!', 'check-pending'], info: ['i', 'check-info'] };

/** Shows the eligibility decision with every individual check and its reason. */
export default function EligibilityPanel({ evaluation }) {
  if (!evaluation) return null;
  return (
    <div>
      <div className="row gap-sm wrap" style={{ marginBottom: '.75rem' }}>
        <strong>Your eligibility:</strong> <StatusBadge status={evaluation.result} />
        {evaluation.rulesVersion != null && <span className="muted small">Rules version {evaluation.rulesVersion}</span>}
      </div>
      {!evaluation.checks?.length && evaluation.reasons?.length > 0 && <ul>{evaluation.reasons.map((r) => <li key={r} className="small">{r}</li>)}</ul>}
      <ul className="checks">
        {(evaluation.checks || []).map((c) => {
          const [ico, cls] = ICON[c.status] || ICON.info;
          return (
            <li key={c.key} className="check-row">
              <span className={`check-ico ${cls}`} aria-hidden="true">{ico}</span>
              <div>
                <strong>{c.label}</strong> <span className="sr-only">{c.status}</span>
                <div className="small muted">{c.message}{c.expected != null && typeof c.expected !== 'object' && c.status !== 'info' ? ` (required: ${c.expected}${c.actual != null ? `, yours: ${c.actual}` : ''})` : ''}</div>
              </div>
            </li>
          );
        })}
      </ul>
      {evaluation.result === 'pending_verification' && <p className="small muted" style={{ marginTop: '.75rem' }}>Pending verification means the placement cell has not verified the data needed for this check yet. It is never treated as a pass.</p>}
    </div>
  );
}
