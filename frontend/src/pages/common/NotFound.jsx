import { Link } from 'react-router-dom';
import { usePageTitle } from '../../lib/hooks.js';
export default function NotFound({ forbidden }) {
  usePageTitle(forbidden ? 'Access denied' : 'Page not found');
  return (
    <div className="auth-wrap"><div className="auth-card center stack">
      <h1>{forbidden ? 'Access denied' : 'Page not found'}</h1>
      <p className="muted">{forbidden ? 'Your account does not have permission to open this page.' : 'The page you are looking for does not exist or was moved.'}</p>
      <div><Link className="btn btn-primary" to="/">Go to home</Link></div>
    </div></div>
  );
}
